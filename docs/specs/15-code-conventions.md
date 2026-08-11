# SPEC-15 — Convenções de Código e Padrões de Desenvolvimento

## Filosofia

Convenções de código existem para que qualquer pessoa que conheça o projeto
possa ler qualquer arquivo e entender o que está acontecendo sem precisar
decifrar o estilo individual de quem escreveu. Consistência reduz carga cognitiva.

Este documento é a fonte de verdade para naming, estrutura de commits,
padrões de TypeScript e convenções de revisão de código.

---

## TypeScript — configuração strict

Ambos os projetos (backend e frontend) usam TypeScript em modo strict.
Nenhuma exceção é permitida sem comentário explicando o motivo.

```json
// tsconfig.json (base compartilhada)
{
  "compilerOptions": {
    "strict":                     true,
    "noImplicitAny":              true,
    "strictNullChecks":           true,
    "noImplicitReturns":          true,
    "noFallthroughCasesInSwitch": true,
    "noUncheckedIndexedAccess":   true,   // array[i] retorna T | undefined
    "exactOptionalPropertyTypes": true,   // diferencia undefined de ausente
    "noImplicitOverride":         true,
    "forceConsistentCasingInFileNames": true
  }
}
```

### Por que `noUncheckedIndexedAccess`?

```typescript
const items = ['a', 'b', 'c']

// Sem noUncheckedIndexedAccess — TypeScript acha que items[99] é string
const item = items[99]
item.toUpperCase()  // runtime error silencioso

// Com noUncheckedIndexedAccess — TypeScript força o tratamento
const item = items[99]  // tipo: string | undefined
item?.toUpperCase()     // obrigado a verificar
```

---

## Convenções de nomenclatura

### Arquivos e pastas

| Contexto                   | Convenção         | Exemplo                         |
|----------------------------|-------------------|---------------------------------|
| Componentes React          | PascalCase        | `TransactionRow.tsx`            |
| Hooks React                | camelCase + "use" | `useTransactions.ts`            |
| Services, utils, configs   | camelCase         | `auth.service.ts`, `currency.ts`|
| Schemas Zod                | camelCase         | `transaction.schema.ts`         |
| Types de domínio do módulo | camelCase         | `transaction.types.ts`          |
| Testes                     | mesmo nome + test | `auth.service.test.ts`          |
| Testes de a11y             | mesmo nome + a11y | `TransactionForm.a11y.test.tsx` |
| Constantes                 | SCREAMING_SNAKE   | `MAX_FILE_SIZE_MB`              |
| Enums                      | PascalCase        | `TransactionType`               |

### Variáveis e funções

```typescript
// ✅ Nomes descritivos — o que faz, não como funciona
const userMonthlyExpenses = await getMonthlyExpenses(userId, month)

// ❌ Abreviações não óbvias
const uME = await getME(uid, m)

// ✅ Funções com verbo no nome
async function fetchTransactions() {}
async function calculateMonthlyBalance() {}
async function validateImportFile() {}

// ✅ Predicados booleanos com is/has/can/should
function isValidDate(date: string): boolean {}
function hasExceededBudget(spent: number, limit: number): boolean {}
function canDeleteTransaction(tx: Transaction, userId: string): boolean {}

// ✅ Handlers de evento com "handle" + evento
function handleFormSubmit() {}
function handleFileSelected() {}
function handleModalClose() {}
```

### Tipos e interfaces TypeScript

```typescript
// DTOs de entrada (dados que chegam da request) — sufixo Dto
interface CreateTransactionDto {
  description: string
  amount:      number
}

// Tipos de domínio (como está no banco) — sem sufixo
interface Transaction {
  id:        string
  userId:    string
  amount:    string
}

// Tipos de resposta da API — sufixo Response
interface TransactionResponse extends Transaction {
  categoryName: string | null
  accountName:  string
}

// Props de componentes React — sufixo Props
interface TransactionRowProps {
  transaction: TransactionResponse
  onEdit:      (id: string) => void
}
```

---

## Convenções de imports

### Ordem de imports (aplicada automaticamente pelo ESLint)

```typescript
// 1. Módulos built-in do Node.js
import path from 'path'
import crypto from 'crypto'

// 2. Dependências externas (node_modules)
import { z } from 'zod'
import { eq } from 'drizzle-orm'

// 3. Imports internos com alias (@/)
import { db } from '@/db/client'
import { transactions } from '@/db/schema'

// 4. Imports relativos
import { formatBRL } from '../../utils/currency'
import { TransactionRow } from './TransactionRow'

// Linha em branco entre cada grupo
```

### Alias de paths

```json
// tsconfig.json
{
  "compilerOptions": {
    "paths": {
      "@/*": ["./src/*"]
    }
  }
}
```

Imports internos sempre usam o alias `@/` em vez de caminhos relativos
longos como `../../../../shared/errors`. A exceção são imports no mesmo
diretório: `./TransactionRow` é preferível a `@/pages/transactions/components/TransactionRow`.

---

## Convenções de commits (Conventional Commits)

O projeto usa o padrão [Conventional Commits](https://www.conventionalcommits.org/)
para mensagens de commit. Isso permite geração automática de changelogs
e rastreabilidade entre commits e features.

### Formato

```
<type>(<scope>): <description>

[optional body]

[optional footer]
```

### Tipos permitidos

| Tipo       | Quando usar                                               |
|------------|-----------------------------------------------------------|
| `feat`     | Nova funcionalidade                                       |
| `fix`      | Correção de bug                                           |
| `docs`     | Documentação (specs, ADRs, READMEs)                       |
| `style`    | Formatação, espaços — sem mudança de comportamento        |
| `refactor` | Refatoração — sem nova feature e sem correção de bug      |
| `test`     | Adição ou correção de testes                              |
| `chore`    | Tarefas de build, CI, dependências                        |
| `perf`     | Melhoria de performance                                   |
| `security` | Correção de vulnerabilidade                               |

### Escopos do projeto

| Escopo        | O que cobre                                   |
|---------------|-----------------------------------------------|
| `auth`        | Autenticação e autorização                    |
| `accounts`    | Módulo de contas                              |
| `transactions`| Módulo de transações                          |
| `imports`     | Pipeline de importação de extratos            |
| `reports`     | Relatórios e dashboard                        |
| `rules`       | Regras de categorização                       |
| `worker`      | Worker assíncrono                             |
| `cache`       | Camada de cache Redis                         |
| `db`          | Schema, migrations, seeds                     |
| `infra`       | Docker, CI/CD, Terraform                      |
| `docs`        | Especificações e ADRs                         |

### Exemplos

```
feat(imports): add OFX file parser using Strategy pattern

fix(auth): refresh token not invalidated on logout

docs(adr): add ADR-007 for Redis cache decision

refactor(reports): extract cache invalidation to separate service

test(categorization): add edge cases for amount_range rule type

chore(deps): update drizzle-orm to 0.30.0

security(auth): increase bcrypt rounds from 10 to 12
```

---

## ESLint — regras principais

```javascript
// eslint.config.js
export default [
  {
    rules: {
      // TypeScript
      '@typescript-eslint/no-explicit-any':           'error',
      '@typescript-eslint/no-non-null-assertion':     'warn',
      '@typescript-eslint/explicit-function-return-type': 'off',  // inferência é suficiente
      '@typescript-eslint/consistent-type-imports':   'error',    // type imports separados

      // Geral
      'no-console':          'error',   // use o logger (Pino), nunca console.log
      'no-debugger':         'error',
      'prefer-const':        'error',
      'no-var':              'error',
      'eqeqeq':              ['error', 'always'],

      // React (apenas no frontend)
      'react/no-danger':     'error',   // proibido dangerouslySetInnerHTML
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',

      // Imports
      'import/order': ['error', {
        groups: ['builtin', 'external', 'internal', 'parent', 'sibling'],
        'newlines-between': 'always',
      }],
      'import/no-cycle': 'error',  // detecta dependências circulares
    }
  }
]
```

### Por que `no-console` é error?

`console.log` em produção:
- Não tem `level` (info, warn, error) — impossível filtrar por severidade.
- Não é estruturado (JSON) — impossível indexar e buscar no agregador de logs.
- Pode vazar dados sensíveis sem o redact automático do Pino.
- Não tem `requestId` — impossível correlacionar com a request que gerou.

O linter garante que nenhum `console.log` chega ao código de produção.

---

## Prettier — formatação automática

```json
// .prettierrc
{
  "semi":           false,
  "singleQuote":    true,
  "trailingComma":  "all",
  "printWidth":     100,
  "tabWidth":       2,
  "bracketSpacing": true,
  "arrowParens":    "always"
}
```

A formatação é aplicada automaticamente no pre-commit hook via Husky + lint-staged:

```json
// package.json
{
  "lint-staged": {
    "**/*.{ts,tsx}": ["eslint --fix", "prettier --write"],
    "**/*.{json,md,yml}": ["prettier --write"]
  }
}
```

---

## Padrões de revisão de código (Code Review)

### O que verificar em um PR

**Segurança**
- [ ] Toda nova rota verifica `userId` do token JWT?
- [ ] Inputs são validados com Zod antes de qualquer uso?
- [ ] Nenhuma variável de ambiente hardcoded?
- [ ] Nenhum dado sensível em logs?

**Qualidade**
- [ ] Lógica de negócio está no service, não no route handler?
- [ ] Novos comportamentos têm testes correspondentes?
- [ ] Erros são tipados com `AppError` e suas subclasses?
- [ ] Nenhum `any` sem justificativa?

**Performance**
- [ ] Novas queries têm índice correspondente?
- [ ] Sem queries dentro de loops (N+1)?
- [ ] Cache invalidado corretamente após mutations?

**Documentação**
- [ ] Decisão arquitetural relevante tem ADR correspondente?
- [ ] Nova feature tem requisito em SPEC-01?
- [ ] Arquivo de spec atualizado se o comportamento mudou?

### Tamanho de PRs

PRs grandes são difíceis de revisar e introduzem mais bugs. O limite
esperado é de **400 linhas por PR** (excluindo arquivos de lock e gerados).
PRs maiores devem ser divididos em menores com feature flags se necessário.

---

## Git workflow

```
main          ← código em produção; protegido, requer PR com aprovação
  │
  └── develop ← integração; PRs de features vão aqui primeiro
        │
        └── feature/TASK-123-nome-da-feature
        └── fix/TASK-456-descricao-do-bug
        └── docs/ADR-014-nova-decisao
```

Branches de feature são criadas a partir de `develop` e mergeadas de volta
via PR. `develop` é mergeado em `main` para cada release.

**Nomes de branch:**
```
feature/add-ofx-parser
fix/correct-balance-calculation-on-delete
docs/add-security-spec
refactor/extract-categorization-chain
chore/update-drizzle-to-0-30
```
