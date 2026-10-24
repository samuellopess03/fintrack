# ADR-010 — Arquitetura e organização do frontend

- **Status:** Aceito
- **Data:** 2025
- **Autores:** Time FinTrack

---

## Contexto

O frontend do FinTrack é uma SPA com múltiplas seções, formulários complexos,
gráficos, tabelas paginadas e polling de jobs assíncronos. Sem uma estrutura
deliberada, SPAs React tendem a acumular lógica de negócio em componentes,
misturar server state com client state e criar dependências circulares
entre arquivos.

As decisões de organização incluem: estrutura de pastas, separação de
server state vs client state, estratégia de formulários, e como acoplar
a camada de API ao React.

---

## Decisão

Adotamos uma **arquitetura em camadas explícitas** no frontend, com
separação clara entre UI, server state (TanStack Query), client state
(useState/Context), camada de API (fetch functions) e tipos compartilhados.

---

## Estrutura de camadas

```
UI (componentes React — apenas renderização e eventos)
    │
    ▼
Hooks de domínio (useTransactions, useImportJob — encapsulam TanStack Query)
    │
    ▼
Camada de API (transactionsApi, importsApi — funções fetch tipadas)
    │
    ▼
Backend REST
```

Cada camada tem uma responsabilidade única e depende apenas da camada abaixo.

---

## Justificativas

### Separação server state vs client state

**Server state** é qualquer dado que vem da API e precisa ser sincronizado
com o servidor: lista de transações, saldo das contas, resultado de relatórios.
Ele tem características únicas: pode ficar desatualizado, precisa de loading/error
states, pode ser cacheado e refetchado em background.

**Client state** é o estado puramente local da UI: modal aberto/fechado,
filtro ativo na listagem, valor do campo de busca antes do submit. Ele não
precisa ser sincronizado com nenhum servidor.

Misturar os dois em um store global (Redux, Zustand) é o anti-pattern que
gerou aplicações com `isLoading`, `error`, `data`, `lastFetched` gerenciados
manualmente. O TanStack Query resolve o server state; `useState` resolve o
client state. Cada ferramenta no papel para o qual foi projetada.

### Camada de API isolada (`src/api/`)

As funções de acesso à API vivem em arquivos separados (`transactionsApi.list()`,
`importsApi.upload()`), não dentro dos hooks ou componentes. Isso permite:

- Testar as funções de API de forma independente (mockar `fetch`).
- Reutilizar a mesma função em múltiplos hooks sem duplicar a lógica de URL,
  headers e tratamento de erro.
- Trocar a implementação de fetch (ex: para Axios) em um único lugar.

O cliente base (`src/api/client.ts`) centraliza: URL base, injeção do
token JWT no header, tratamento de 401 (redirect para login), e
deserialização do `ApiError` tipado.

### Hooks de domínio encapsulam TanStack Query

Os hooks (`useTransactions`, `useImportJob`, `useReports`) são a fronteira
entre TanStack Query e os componentes React. Os componentes não chamam
`useQuery` diretamente — eles chamam `useTransactions(filters)` e recebem
`{ data, isLoading, error }` com os tipos corretos para o domínio.

Isso tem dois benefícios:

1. Os detalhes do TanStack Query (queryKey, staleTime, refetchInterval) ficam
   encapsulados e não vazam para os componentes.
2. Trocar TanStack Query por outra solução no futuro é uma mudança nos hooks,
   não nos componentes.

> **Princípios por trás desta decisão:** este desenho é a aplicação do
> **Dependency Inversion (SOLID)** entre UI e state management — a fronteira
> dos hooks é a "abstração" da qual a UI depende. O mapa completo de
> princípios do projeto está no
> [Guia de Engenharia](../guides/engineering-principles.md).

### Estrutura de pastas: páginas + componentes globais

```
src/
├── pages/              ← uma pasta por rota de nível superior
│   └── transactions/
│       ├── TransactionsPage.tsx   ← componente raiz da rota
│       ├── components/            ← componentes exclusivos desta página
│       │   ├── TransactionRow.tsx
│       │   ├── TransactionFilters.tsx
│       │   └── TransactionForm.tsx
│       └── hooks/                 ← hooks exclusivos desta página (se houver)
│
└── components/         ← componentes reutilizados em 2+ páginas
    ├── ui/             ← primitivos: Button, Input, Modal, Badge, Spinner
    ├── layout/         ← Sidebar, Header, PageContainer
    └── charts/         ← wrappers Recharts com props tipadas
```

**Regra de promoção:** um componente nasce dentro de `pages/x/components/`.
Se uma segunda página precisar dele, ele é promovido para `components/`.
Isso evita criar componentes "globais" prematuramente.

### Formulários com React Hook Form + Zod

Formulários no FinTrack têm validação complexa (valor positivo, data não
futura, categoria obrigatória para despesas). React Hook Form gerencia o
estado do formulário sem re-renders por keystroke; o `zodResolver` conecta
o schema Zod diretamente à validação do formulário.

O schema Zod do formulário é definido no mesmo arquivo do componente, não
compartilhado com o backend — as validações de frontend e backend podem
divergir ligeiramente (ex: o frontend valida o formato da data antes de enviar,
o backend valida o conteúdo após parsear). Compartilhar schemas cria
acoplamento de build desnecessário na v1.

### Gerenciamento de estado global na v1

O único estado verdadeiramente global na v1 é o estado de autenticação:
token JWT e dados do usuário logado. Context API com `useReducer` é
suficiente para esse caso — sem biblioteca adicional.

**Critério para adotar Zustand no futuro:** quando dois ou mais componentes
sem ancestral comum precisarem compartilhar estado que muda com frequência.
Na v1, esse cenário não existe.

---

## Tipagem compartilhada com o backend

Os tipos de domínio são definidos em `src/types/api.types.ts` e espelham
os schemas do backend. Eles não são gerados automaticamente (ex: via OpenAPI)
na v1 — são mantidos manualmente. A adoção do monorepo
([ADR-013](ADR-013-monorepo.md)) não altera isso: não há pacote de tipos
compartilhado entre backend e frontend na v1.

```typescript
// src/types/api.types.ts

export interface Transaction {
  id: string;
  accountId: string;
  categoryId: string | null;
  description: string;
  amount: string; // string porque vem como NUMERIC do PostgreSQL
  type: "income" | "expense";
  date: string; // ISO date string
  createdAt: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    next_cursor: string | null;
    has_more: boolean;
    count: number;
  };
}
```

### Caminho preferido para v2: geração via OpenAPI, não pacote compartilhado

Para eliminar a manutenção manual de `api.types.ts`, duas abordagens foram
avaliadas:

1. **Geração via OpenAPI** (usando `openapi-typescript` a partir da spec que o
   backend já expõe via `@fastify/swagger` + `fastify-type-provider-zod`) —
   **caminho preferido**.
2. **Pacote de tipos compartilhado** (`@fintrack/shared`) importado por backend
   e frontend — rejeitado (ver "Alternativas rejeitadas" abaixo).

**Razões para a preferência:**

- **A fonte única de verdade é o contrato, não os tipos internos.** Com a
  geração via OpenAPI, quem manda são os schemas Zod do backend; os tipos do
  frontend passam a ser um artefato gerado. O backend não sabe que o frontend
  existe — não há acoplamento entre os pacotes, apenas um artefato alimentado
  pela spec.
- **Tipos internos do backend mentem sobre o wire format.** Na rede não existe
  `Date` (o `createdAt: z.date()` de `transactionResponse` chega como string
  ISO) e o `amount` chega como string (NUMERIC do PostgreSQL). Os tipos
  gerados a partir da spec OpenAPI descrevem o formato trafegado fielmente;
  tipos derivados das estruturas internas do backend não fazem isso.
- **Sem acoplamento de build entre pacotes.** Com pacote compartilhado, toda
  mudança de schema no backend quebra o build do frontend. Com geração, a
  mudança no backend só vira mudança no frontend quando o **contrato**
  realmente muda — e o drift é detectado em CI, comparando o artefato
  gerado com o commitado.

O custo é uma etapa a mais no pipeline de build (gerar tipos a partir da
spec). Candidato para v2, quando a API estiver estabilizada.

---

## Alternativas rejeitadas

### Redux Toolkit para todo o estado

- Overhead de boilerplate (slices, actions, selectors) para um projeto onde
  o server state (dominante) é melhor gerenciado pelo TanStack Query.
- Combinar Redux com TanStack Query cria dois sistemas de estado com
  responsabilidades sobrepostas.

### Next.js (App Router / SSR)

- O FinTrack é um dashboard privado atrás de autenticação — não há benefício
  de SEO ou First Contentful Paint para uma tela de login.
- Server Components e Server Actions adicionam complexidade de isomorfismo
  (código que roda no servidor e no cliente) que não trará benefício prático
  para um dashboard autenticado.
- Vite + React SPA é mais simples, mais rápido para iterar e suficiente para
  o caso de uso.

---

## Consequências

- **Positivo:** Separação clara de responsabilidades, componentes sem lógica de fetch, hooks como fronteira tipada, formulários performáticos.
- **Positivo:** Estrutura de pastas reflete o domínio de negócio — fácil de navegar para quem conhece o produto.
- **Negativo:** Tipos de API mantidos manualmente — risco de dessincronização com o backend.
- **Negativo:** Sem SSR — o bundle inicial da SPA é maior que em uma aplicação Next.js com streaming.
- **Risco mitigado:** A dessincronização de tipos é detectada em testes de integração (o frontend chama a API real nos testes E2E) e pelo TypeScript no build.
