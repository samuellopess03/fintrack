# ESLint Boundaries — referência da configuração de fronteiras

- **Pasta:** `backend/eslint.config.mjs`
- **Plugin:** [`eslint-plugin-boundaries`](https://www.jsboundaries.dev/)
- **Comando:** `npm run lint -w backend`

Este documento é a referência da configuração que transforma as regras de
dependência do [ADR-009](../adrs/ADR-009-backend-architecture.md) em
**erros de lint**, em vez de recomendações. O contexto e os critérios de
abstração estão no [guia de engenharia](engineering-principles.md); aqui
registra-se apenas o que está configurado e como modificá-lo.

---

## Elementos e categorias

### Elementos (`boundaries/elements`)

| Elemento | Padrão | Domínio capturado |
|---|---|---|
| `modules` | `src/modules/*/**` | `domain` = `accounts`, `auth`, `categories`, `transactions`, ... |
| `shared` | `src/shared/**` | — |
| `entrypoints` | `src/*` | — (`app.ts`, `server.ts`) |

### Categorias de arquivo (`boundaries/files`)

Categorias descrevem **tipos de arquivo** dentro dos módulos — permitem
expressar a pirâmide de dependência por arquivo, complementando o domínio
capturado pelo elemento:

| Categoria | Padrão |
|---|---|
| `service` | `src/modules/*/*.service.ts` |
| `routes` | `src/modules/*/*.routes.ts` |
| `contracts` | `src/modules/*/*.schema.ts`, `*.types.ts` |
| `repository` | `src/modules/*/*.repository.ts` |
| `test` | `**/*.test.ts` |

**Nota:** é a tabela de responsabilidade do ADR-009 convertida em configuração.

---

## Políticas de dependência (`boundaries/dependencies`)

`default: disallow` — toda dependência não permitida por uma das políticas
abaixo é erro.

| # | De | Para | Efeito |
|---|---|---|---|
| 1 | qualquer | origem `external` ou `core` | Dependências externas/nativas do Node permitidas para todos |
| 2 | categoria `test` | qualquer módulo local | Testes podem tocar internos (repository etc.) |
| 3 | elemento `entrypoints` | `shared` e `routes` dos módulos | `server.ts`/`app.ts` montam o app |
| 4 | elementos `modules` ou `entrypoints` | elemento `shared` | Shared é dependência, não dependente |
| 4b | elemento `shared` | elemento `shared` | Imports internos da própria camada (index reexporta irmãos, plugins importando helpers) |
| 5 | `modules`, mesmo `domain` (capturado) | `routes`, `service`, `repository`, `contracts` do mesmo domínio | Pirâmide interna: `routes → service → repository`; bloqueia `routes → repository` e `repository → service` |
| 6 | `modules`, domínio A | `service` ou `contracts` do domínio B | Interface pública entre módulos: apenas service e schemas |

### Dependências internas: `checkInternals: true`

O plugin ignora por padrão dependências **internas** — quando origem e destino
pertencem à mesma ocorrência de elemento (ex.: dois arquivos do mesmo domínio
em `modules`, ou dois arquivos de `shared`). Como toda a pirâmide
`routes → service → repository` e a organização de `shared/` vivem
**dentro** de um elemento, a opção `checkInternals: true` é **obrigatória**
na regra — sem ela, a config inteira vira no-op para a pirâmide interna e
deixaria de bloquear `routes → repository`. Com ela ativada:

- A pirâmide interna do módulo é verificada (política 5).
- Os imports internos de `shared/` precisam do allow explícito da política 4b.
- `entrypoints → entrypoints` (`server.ts` → `@/app`) é permitido — os
  entrypoints são a montagem da aplicação.

### Arquivo de módulo sem categoria: fail-closed

Todo arquivo `src/modules/<domain>` que **não casa com nenhuma categoria**
(ex.: um `index.ts` barrel) tem imports locais **bloqueados** — o
`default: disallow` exige origem e destino categorizados. Isso é
intencional: a superfície de um módulo são os arquivos categorizados; ao
introduzir um tipo novo de arquivo (ex.: `*.presenter.ts`), cadastre a
categoria antes de usá-lo (seção "Como evoluir").

Com isso ficam bloqueados, por exemplo:

- `transactions.service.ts` importando `accounts.repository` — precisa do
  `accounts.service`.
- `transactions.routes.ts` importando o próprio `transactions.repository`.
- `accounts.repository.ts` importando `transactions.service` (inversão).
- `shared/*` importando qualquer módulo.
- Importar `repository`/`types` internos de outro domínio.

---

## Regras gerais além das fronteiras

Além do plugin `boundaries`, a configuração aplica (na mesma linguagem da
[SPEC-15](https://github.com/samuellopess03/fintrack/wiki/15-code-conventions)):

- **TypeScript:** `no-explicit-any` (error), `consistent-type-imports`
  (error), `no-non-null-assertion` (warn).
- **Geral:** `no-console` (error — o logger é o Pino), `no-debugger`,
  `prefer-const`, `no-var`, `eqeqeq`.
- **Imports:** `import/order` (builtin → external → internal → parent →
  sibling, com linha em branco entre grupos), `import/no-cycle` (error).

## Resolução de paths (alias `@/`)

O backend usa o alias `@/*` → `./src/*` do `tsconfig.json`. O ESLint resolve
o alias via `eslint-import-resolver-typescript` (configurado em
`settings["import/resolver"].typescript`), e o plugin `boundaries` usa a
mesma resolução para classificar imports locais.

## Como evoluir

- **Módulo novo** (ex: `imports`, `reports`): nada a mudar — o `domain` é
  capturado dinamicamente do path.
- **Novo tipo de arquivo em módulo** (ex: `*.presenter.ts`): adicione a
  categoria em `boundaries/files` e as políticas pertinentes no `from`/`to`.
- **Exceção justificada:** melhor que um `eslint-disable` inline é ajustar a
  política com comentário apontando para o ADR que justifica. Exceções
  invisíveis de linter morrem silenciosamente.
