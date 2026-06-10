# ADR-004 — Zod como biblioteca de validação e inferência de tipos

- **Status:** Aceito
- **Data:** 2025
- **Autores:** Time FinTrack

---

## Contexto

O FinTrack precisa validar dados em múltiplos pontos do sistema:
requests HTTP recebidas pela API, variáveis de ambiente na inicialização,
linhas de CSV durante o parse de extratos, e payloads de formulários no frontend.

O objetivo é ter uma única abordagem de validação que funcione em todos
esses contextos e que gere tipos TypeScript automaticamente — eliminando a
necessidade de manter schemas de validação e interfaces TypeScript em sincronia
manualmente.

As opções avaliadas foram Zod, Yup e class-validator.

---

## Decisão

Adotamos o **Zod** como biblioteca de validação em todo o projeto (backend e frontend).

---

## Justificativas

### Schema como fonte única de verdade para tipos
O Zod infere tipos TypeScript diretamente do schema via `z.infer<typeof Schema>`.
Isso significa que o schema é definido uma única vez e serve tanto para
validação em runtime quanto para a tipagem estática em tempo de compilação.
Manter uma interface TypeScript separada de um schema de validação é um anti-pattern
— são dois artefatos que descrevem a mesma coisa e podem desincronizar.

### Funciona em todos os contextos do projeto
- **Fastify:** integrado via `fastify-type-provider-zod` — schemas Zod nas rotas
  geram automaticamente a validação de request e a tipagem do handler.
- **Variáveis de ambiente:** `envSchema.parse(process.env)` valida e tipifica
  toda a configuração na inicialização. Se uma env está errada, o processo
  termina com mensagem legível antes de qualquer dano.
- **CSV parsing:** cada linha do extrato é parseada com `RowSchema.safeParse(row)`,
  retornando erros tipados por campo sem exceções.
- **Frontend:** integrado ao React Hook Form via `zodResolver` — validação de
  formulários com a mesma linguagem usada no backend.

### API de erros estruturada
`schema.safeParse(data)` retorna `{ success: true, data }` ou
`{ success: false, error: ZodError }` — sem try/catch. O `ZodError` contém
o caminho exato do campo que falhou e a mensagem de erro correspondente,
facilitando a construção de respostas de erro detalhadas na API.

### Zero dependências e runtime mínimo
O Zod não tem dependências externas e tem bundle size pequeno — relevante
para o frontend onde bundle size importa.

### Composabilidade
Schemas Zod são composáveis: `.extend()`, `.merge()`, `.pick()`, `.omit()`.
Os DTOs de criação e atualização de recursos são derivados do schema base
sem duplicação:

```typescript
const CreateTransactionSchema = TransactionSchema.omit({ id: true, createdAt: true })
const UpdateTransactionSchema = CreateTransactionSchema.partial()
```

---

## Alternativas rejeitadas

### Yup
- API assíncrona por padrão (`schema.validate()` retorna Promise) —
  desnecessário para validações síncronas e adiciona overhead.
- Inferência de tipos TypeScript menos precisa em casos de união e discriminated unions.
- Menos adoção recente no ecossistema TypeScript moderno.

### class-validator
- Baseado em decorators experimentais — adiciona complexidade ao `tsconfig`.
- Requer instâncias de classe (`plainToClass`) em vez de objetos simples.
- Não funciona bem com o React Hook Form e contextos de frontend.
- Menos ergonômico para validação de variáveis de ambiente.

---

## Consequências

- **Positivo:** Schema como fonte única de verdade, inferência automática de tipos, zero duplicação entre validação e tipagem.
- **Positivo:** Mesma biblioteca no frontend e backend — equipe aprende uma vez, usa em todo lugar.
- **Positivo:** Erros estruturados por campo, sem try/catch em validações.
- **Negativo:** Mensagens de erro padrão do Zod são em inglês — precisam ser customizadas para exibição ao usuário final em português.
- **Risco mitigado:** A customização de mensagens é simples via `.refine()` e o mapa de mensagens do `zodResolver`.
