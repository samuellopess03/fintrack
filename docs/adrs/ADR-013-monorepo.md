# ADR-013 — Organização do repositório: monorepo com workspaces npm

- **Status:** Aceito
- **Data:** 2025
- **Autores:** Time FinTrack

---

## Contexto

O FinTrack tem três partes de código distintas — backend (API), backend
(Worker) e frontend — mais a infraestrutura como código (Docker, Terraform,
configurações de CI/CD). A questão é: como organizar essas partes em
repositórios Git?

As opções avaliadas foram repositório único (monorepo), repositórios
separados por serviço (polyrepo) e monorepo gerenciado com Turborepo/Nx.

---

## Decisão

Adotamos um **monorepo único com npm workspaces**, sem ferramenta de
orquestração de build (sem Turborepo ou Nx na v1).

---

## Estrutura do repositório

```
fintrack/                          ← raiz do repositório
├── package.json                   ← workspace root (scripts globais)
│
├── backend/                       ← API + Worker (mesmo processo de build)
│   ├── src/
│   │   ├── app.ts
│   │   ├── server.ts              ← entrypoint da API
│   │   ├── config/
│   │   ├── db/
│   │   ├── modules/
│   │   ├── shared/
│   │   └── worker/
│   │       └── worker.ts          ← entrypoint do Worker
│   ├── package.json
│   ├── tsconfig.json
│   ├── drizzle.config.ts
│   └── jest.config.ts
│
├── frontend/                      ← SPA React
│   ├── src/
│   ├── package.json
│   ├── tsconfig.json
│   └── vite.config.ts
│
├── docs/                          ← specs e ADRs (este repositório)
│   ├── README.md
│   ├── spec/
│   └── adr/
│
├── infra/                         ← infraestrutura como código
│   ├── docker/
│   ├── prometheus/
│   ├── grafana/
│   └── terraform/
│
├── .github/
│   └── workflows/
│       ├── ci.yml
│       └── deploy.yml
│
├── docker-compose.yml
├── docker-compose.test.yml
├── .env.example
├── .gitignore
└── README.md
```

---

## Justificativas

### API e Worker no mesmo pacote `backend/`

O Worker compartilha código significativo com a API:
- Schema Drizzle (acesso ao banco).
- Tipos de domínio (`Transaction`, `ImportJob`).
- `CacheService` (invalida cache após processamento).
- Configuração de ambiente (`env.ts`).
- Métricas Prometheus.

Separar Worker em um pacote próprio exigiria extrair esse código compartilhado
para um terceiro pacote (`@fintrack/shared`), adicionar gerenciamento de
dependências entre pacotes e aumentar a complexidade de build. O benefício —
deploys independentes — não justifica esse custo na v1, onde API e Worker
são deployados juntos (mesmo Dockerfile base, diferente `CMD`).

**Isolamento em produção** é mantido sem separação de pacotes: são dois
containers Docker diferentes (`api.Dockerfile` e `worker.Dockerfile`), cada
um com seu entrypoint, rodando como serviços independentes no ECS.

### Monorepo vs Polyrepo

**Monorepo:**
- Um único `git clone` para trabalhar no projeto inteiro.
- Mudanças que afetam backend e frontend são um único commit e um único PR.
- CI/CD pode usar path filters para rodar apenas os testes do que mudou.
- Configurações compartilhadas (`.gitignore`, `.editorconfig`, convenções
  de commit) ficam em um lugar.

**Polyrepo:**
- Independência de deploy por repositório — mudanças no frontend não
  disparam build do backend.
- Para um time grande com ownership separado por serviço, faz sentido.
- Para um projeto pessoal ou time pequeno, o overhead de múltiplos
  repositórios (issues, PRs, versões, tokens) não traz benefício real.

A escolha pelo monorepo é pragmática: um desenvolvedor trabalhando no
projeto inteiro quer um único contexto de trabalho.

### npm workspaces sem Turborepo/Nx

npm workspaces permitem:
```json
// package.json raiz
{
  "workspaces": ["backend", "frontend"],
  "scripts": {
    "test":   "npm run test --workspaces",
    "lint":   "npm run lint --workspaces",
    "build":  "npm run build --workspaces"
  }
}
```

**Por que não Turborepo:**
Turborepo adiciona cache de build (não re-executa tasks que não mudaram) e
pipeline de dependências entre tarefas. O benefício é real em monorepos
com muitos pacotes. Para dois pacotes (`backend` e `frontend`), o overhead
de configuração do Turborepo supera o benefício na v1.

**Critério para adotar Turborepo:** quando o tempo de CI ultrapassar 10
minutos e o cache de build fizer diferença mensurável. Na v1 com dois
workspaces, o CI completo roda em menos de 5 minutos.

---

## Configuração do workspace raiz

```json
// package.json (raiz)
{
  "name": "fintrack",
  "private": true,
  "workspaces": ["backend", "frontend"],
  "scripts": {
    "dev":           "docker compose up -d",
    "test":          "npm run test -w backend",
    "test:unit":     "npm run test:unit -w backend",
    "test:int":      "npm run test:integration -w backend",
    "lint":          "npm run lint --workspaces --if-present",
    "typecheck":     "npm run typecheck --workspaces --if-present",
    "db:migrate":    "npm run db:migrate -w backend",
    "db:seed":       "npm run db:seed -w backend",
    "db:studio":     "npm run db:studio -w backend"
  },
  "engines": {
    "node": ">=20.0.0",
    "npm":  ">=10.0.0"
  }
}
```

### Convenções de scripts por workspace

Cada workspace expõe os mesmos scripts padrão para que o workspace root
possa orquestrá-los sem conhecer os detalhes internos:

| Script        | backend                        | frontend               |
|---------------|--------------------------------|------------------------|
| `build`       | `tsc --outDir dist`            | `vite build`           |
| `dev`         | `ts-node-dev src/server.ts`    | `vite`                 |
| `test`        | `jest`                         | `vitest` (futuro)      |
| `lint`        | `eslint src/`                  | `eslint src/`          |
| `typecheck`   | `tsc --noEmit`                 | `tsc --noEmit`         |

---

## .gitignore e arquivos de ambiente

```gitignore
# .gitignore (raiz)

# Dependências
node_modules/
*/node_modules/

# Builds
backend/dist/
frontend/dist/

# Ambiente — NUNCA commitar
.env
.env.local
backend/.env
frontend/.env

# Uploads locais
backend/uploads/

# Terraform state (gerenciado remotamente no S3)
infra/terraform/.terraform/
infra/terraform/*.tfstate
infra/terraform/*.tfstate.backup

# Logs
*.log
```

O arquivo `.env.example` na raiz documenta todas as variáveis necessárias
com valores de exemplo (sem dados reais):

```bash
# .env.example
DATABASE_URL=postgres://fintrack:fintrack@localhost:5432/fintrack
REDIS_URL=redis://localhost:6379
RABBITMQ_URL=amqp://fintrack:fintrack@localhost:5672
JWT_SECRET=change-me-to-a-32-character-minimum-secret
PORT=3000
NODE_ENV=development
UPLOAD_DIR=./uploads
LOG_LEVEL=info
VITE_API_URL=http://localhost:3000
```

---

## Consequências

- **Positivo:** Contexto unificado de trabalho, mudanças cross-service em um único commit, configuração compartilhada centralizada.
- **Positivo:** API e Worker compartilham código sem pacote intermediário.
- **Negativo:** CI/CD sem cache de build — toda mudança re-executa os testes de todos os workspaces (mitigado por path filters no GitHub Actions).
- **Negativo:** Sem isolamento de versões entre workspaces — uma breaking change em uma dependência compartilhada afeta ambos simultaneamente.
- **Decisão futura:** Se o CI ultrapassar 10 minutos ou um terceiro serviço for adicionado, adotar Turborepo para cache de build e pipeline de tarefas.
