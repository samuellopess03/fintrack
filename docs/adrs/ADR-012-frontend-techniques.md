# ADR-012 — Técnicas de frontend: TanStack Query, Polling Adaptativo e Máquinas de Estado de UI

- **Status:** Aceito
- **Data:** 2025
- **Autores:** Time FinTrack

---

## Contexto

O frontend do FinTrack tem três desafios técnicos que exigem decisões de
implementação deliberadas:

1. **Sincronização de server state:** dados que vêm da API precisam ser
   cacheados, atualizados em background e invalidados quando o usuário
   muda algo.
2. **Feedback de jobs assíncronos:** o usuário precisa saber quando uma
   importação terminou sem recarregar a página manualmente.
3. **Estados de UI complexos:** o fluxo de upload tem múltiplas fases
   que precisam ser representadas de forma que impeça estados impossíveis
   (ex: botão de upload ativo enquanto está processando).

---

## Decisão 1 — TanStack Query para gerenciamento de server state

### Por que não fetch + useState

O padrão ingênuo de buscar dados em componentes React:

```typescript
// Anti-pattern: fetch dentro de componente
function TransactionsPage() {
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    setLoading(true)
    fetch('/transactions')
      .then(r => r.json())
      .then(setData)
      .catch(setError)
      .finally(() => setLoading(false))
  }, [])
}
```

Esse padrão tem problemas sérios: sem cache (cada render re-busca), sem
deduplicação (dois componentes buscando os mesmos dados fazem duas requests),
sem background refresh, sem stale-while-revalidate, sem retry automático.
E o código de `loading`/`error`/`data` se repete em todo componente.

### TanStack Query resolve tudo isso declarativamente

```typescript
function TransactionsPage() {
  const { data, isLoading, error } = useTransactions(filters)
  // cache automático, deduplicação, background refresh, retry, stale-while-revalidate
}
```

**Conceitos chave adotados:**

**`queryKey` como identidade do dado:**
A chave `['transactions', filters]` identifica unicamente o dado cacheado.
Mudar qualquer filtro muda a chave e dispara um novo fetch automaticamente.
O cache da query anterior permanece disponível enquanto o novo fetch carrega
(stale-while-revalidate — o usuário vê dados enquanto aguarda a atualização).

**`staleTime` por tipo de dado:**
```typescript
// Relatórios: podem ficar 5 minutos sem refetch (cache Redis no backend)
useQuery({ queryKey: ['reports', month], staleTime: 1000 * 60 * 5 })

// Saldo da conta: refetch a cada 1 minuto
useQuery({ queryKey: ['accounts'], staleTime: 1000 * 60 })

// Status de job: refetch a cada 2 segundos enquanto pendente
useQuery({ queryKey: ['job', id], staleTime: 0, refetchInterval: 2000 })
```

**Invalidação de cache após mutations:**
```typescript
const createTransaction = useMutation({
  mutationFn: transactionsApi.create,
  onSuccess: () => {
    // Marca como stale → próximo acesso refetch automaticamente
    queryClient.invalidateQueries({ queryKey: ['transactions'] })
    queryClient.invalidateQueries({ queryKey: ['reports'] })
    queryClient.invalidateQueries({ queryKey: ['accounts'] })
  }
})
```

---

## Decisão 2 — Polling adaptativo para status de jobs

### O problema

Após o upload de um extrato, o usuário precisa de feedback quando o
processamento termina. As alternativas são:

| Abordagem      | Prós                              | Contras                                    |
|----------------|-----------------------------------|--------------------------------------------|
| Polling fixo   | Simples de implementar            | Requests desnecessários após conclusão     |
| WebSocket      | Feedback instantâneo              | Conexão persistente, mais complexo de escalar |
| SSE (Server-Sent Events) | Push server → client  | Requer suporte específico no backend       |
| Polling adaptativo | Simples, sem conexão persistente | Latência máxima = intervalo de polling |

### Polling adaptativo com TanStack Query

O `refetchInterval` do TanStack Query aceita uma função que recebe o estado
atual da query. Isso permite parar o polling automaticamente quando o job
chega em um estado terminal:

```typescript
export function useImportJob(jobId: string | null) {
  return useQuery({
    queryKey: ['import-job', jobId],
    queryFn:  () => importsApi.getJob(jobId!),
    enabled:  !!jobId,

    refetchInterval: (query) => {
      const status = query.state.data?.status
      // Para o polling quando o job termina
      if (status === 'done' || status === 'failed') return false
      // Poll a cada 2 segundos enquanto pendente ou processando
      return 2000
    },

    // Nunca considera o status como "fresh" — sempre refetch quando habilitado
    staleTime: 0,
  })
}
```

**Por que 2 segundos?** O worker processa um CSV de 500 linhas em menos de
10 segundos (RNF-01.3). Com polling a cada 2 segundos, o usuário espera no
máximo 2 segundos após a conclusão para ver o resultado — aceitável para
uma operação que leva vários segundos de qualquer forma.

**Invalidação em cascata após conclusão:**
```typescript
// No hook, quando o job muda para 'done':
useEffect(() => {
  if (job?.status === 'done') {
    queryClient.invalidateQueries({ queryKey: ['transactions'] })
    queryClient.invalidateQueries({ queryKey: ['reports'] })
    queryClient.invalidateQueries({ queryKey: ['accounts'] })
  }
}, [job?.status])
```

---

## Decisão 3 — Máquina de estados finitos para fluxos de UI complexos

### O problema com boolean flags

O fluxo de upload tem múltiplas fases. O approach ingênuo usa flags booleanas:

```typescript
// Anti-pattern: múltiplas flags booleanas
const [isUploading, setIsUploading] = useState(false)
const [isProcessing, setIsProcessing] = useState(false)
const [isDone, setIsDone] = useState(false)
const [hasError, setHasError] = useState(false)
const [jobId, setJobId] = useState<string | null>(null)
const [errorMessage, setErrorMessage] = useState<string | null>(null)
```

Isso cria **2^N estados possíveis** para N flags. Com 4 flags booleanas,
são 16 combinações — a maioria impossível ou inválida (ex: `isUploading=true`
e `isDone=true` ao mesmo tempo). O código que usa essas flags precisa
verificar múltiplas condições simultâneas e pode entrar em estados impossíveis
por um bug de transição.

### Máquina de estados com union types TypeScript

Uma union type discriminada representa os estados possíveis — e apenas eles:

```typescript
// Apenas 5 estados válidos; nenhum estado impossível pode ser representado
type UploadState =
  | { phase: 'idle' }
  | { phase: 'uploading' }
  | { phase: 'polling'; jobId: string }
  | { phase: 'done';    result: ImportJobResult }
  | { phase: 'error';   message: string }

const [uploadState, setUploadState] = useState<UploadState>({ phase: 'idle' })
```

**Transições explícitas:**
```typescript
// Cada transição é uma função com nome semântico
const handleFileSelected = async (file: File) => {
  setUploadState({ phase: 'uploading' })

  try {
    const { jobId } = await importsApi.upload(file, selectedAccountId)
    setUploadState({ phase: 'polling', jobId })
  } catch (err) {
    setUploadState({ phase: 'error', message: err.message })
  }
}

// Quando o polling detecta conclusão:
const handleJobCompleted = (result: ImportJobResult) => {
  setUploadState({ phase: 'done', result })
}
```

**Renderização sem ambiguidade:**
```typescript
function UploadStatus({ state }: { state: UploadState }) {
  switch (state.phase) {
    case 'idle':      return <DropZone />
    case 'uploading': return <ProgressBar indeterminate />
    case 'polling':   return <JobProgress jobId={state.jobId} onComplete={handleJobCompleted} />
    case 'done':      return <ImportResult result={state.result} />
    case 'error':     return <ErrorMessage message={state.message} />
  }
}
```

O TypeScript garante em tempo de compilação que todos os casos estão cobertos
(`switch` exhaustivo via `never`). Um estado impossível literalmente não pode
ser representado no tipo.

### Aplicação do mesmo padrão em outros fluxos

O padrão de union types para estados de UI é aplicado em qualquer fluxo com
múltiplas fases no FinTrack:

```typescript
// Formulário de transação
type FormState =
  | { mode: 'creating' }
  | { mode: 'editing'; transactionId: string }
  | { mode: 'submitting' }
  | { mode: 'success'; transaction: Transaction }

// Confirmação de exclusão
type DeleteState =
  | { status: 'idle' }
  | { status: 'confirming'; itemId: string; itemName: string }
  | { status: 'deleting'; itemId: string }
```

---

## Consequências combinadas

| Técnica                    | Problema resolvido                                         | Custo                               |
|----------------------------|------------------------------------------------------------|-------------------------------------|
| TanStack Query             | Cache, deduplicação, background refresh, retry automáticos | Curva de aprendizado dos conceitos  |
| Polling adaptativo         | Feedback de jobs sem WebSocket ou SSE                      | Latência máxima = intervalo de poll |
| Union types para UI state  | Estados impossíveis impossíveis de representar             | Mais verbose que boolean flags      |

O custo das union types é justificado: a verbosidade é mínima e o benefício
— o TypeScript rejeitar estados impossíveis em tempo de compilação — vale muito
mais do que a economia de algumas linhas de código.
