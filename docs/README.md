# FinTrack — Documentação do Projeto

> Controle financeiro pessoal com processamento assíncrono de extratos bancários.

## Estrutura da documentação

```
docs/
├── README.md
│
├── guides/                                  ← como julgamos código (estratégia de engenharia)
│   ├── engineering-principles.md            ← mapa Clean Code/SOLID/padrões → ADRs, critérios de abstração
│   └── eslint-boundaries.md                 ← referência das regras de fronteira forçadas no ESLint
│
├── specs/                                   ← o quê construir e como estruturar
│   │
│   │  FUNDAÇÃO
│   ├── 00-overview.md                   ← visão geral, objetivos, escopo e fluxo principal
│   ├── 01-requirements.md               ← requisitos funcionais (RF) e não funcionais (RNF)
│   │
│   │  BACKEND
│   ├── 02-database.md                   ← schema PostgreSQL, Drizzle, índices, keyset pagination
│   ├── 03-backend.md                    ← arquitetura Fastify, módulos, endpoints, padrões
│   ├── 04-async-pipeline.md             ← RabbitMQ, worker, Strategy, Chain of Responsibility, Unit of Work
│   ├── 05-cache.md                      ← Redis, chaves, TTLs, invalidação, degradação graceful
│   │
│   │  FRONTEND
│   ├── 06-frontend.md                   ← React, TanStack Query, estrutura de pastas, polling
│   │
│   │  QUALIDADE
│   ├── 07-testing.md                    ← Jest, testes unitários, integração, fixtures
│   ├── 08-observability.md              ← Prometheus, Grafana, Pino, métricas, dashboards, alertas
│   │
│   │  INFRAESTRUTURA
│   ├── 09-infra.md                      ← Docker, Docker Compose, GitHub Actions CI/CD, Terraform
│   │
│   │  QUALIDADES TRANSVERSAIS
│   ├── 10-security.md                   ← autenticação, autorização, IDOR, XSS, CORS, rate limiting
│   ├── 11-accessibility.md              ← WCAG 2.1 AA, semântica, teclado, formulários, testes a11y
│   ├── 12-performance.md                ← SLOs, índices, pool, bundle splitting, virtualização, k6
│   ├── 13-error-handling.md             ← taxonomia de erros, circuit breaker, retry, graceful shutdown
│   ├── 14-i18n.md                       ← locale pt-BR, moeda, datas, fusos, encoding, parsing bancário
│   ├── 15-code-conventions.md           ← TypeScript strict, naming, commits, ESLint, code review
│   ├── 16-privacy-lgpd.md               ← LGPD, base legal, direitos do titular, retenção, incidentes
│   └── 17-api-design.md                 ← REST semântico, versionamento, envelopes, idempotência, OpenAPI
│
└── adr/                                 ← por que cada decisão foi tomada
    │
    │  ESCOLHA DE FERRAMENTAS
    ├── ADR-001-fastify.md               ← Fastify vs Express vs Hapi
    ├── ADR-002-drizzle.md               ← Drizzle vs Prisma vs TypeORM
    ├── ADR-003-rabbitmq.md              ← RabbitMQ vs BullMQ vs SQS
    ├── ADR-004-zod.md                   ← Zod vs Yup vs class-validator
    ├── ADR-005-jest-ts-jest.md          ← Jest+TS-Jest vs Vitest
    ├── ADR-006-react.md                 ← React vs Vue vs Angular
    ├── ADR-007-redis-cache.md           ← Redis vs Memcached vs in-process
    ├── ADR-008-observabilidade.md       ← Prometheus+Grafana, Loki, Tempo vs Datadog vs OTel+Jaeger
    │
    │  DECISÕES ARQUITETURAIS
    ├── ADR-009-backend-architecture.md  ← módulos por domínio vs camadas técnicas vs Clean Arch
    ├── ADR-010-frontend-architecture.md ← camadas, server/client state, organização de pastas
    ├── ADR-013-monorepo.md              ← monorepo npm workspaces vs polyrepo vs Turborepo
    │
    │  TÉCNICAS DE IMPLEMENTAÇÃO
    ├── ADR-011-backend-techniques.md    ← Keyset Pagination, Unit of Work, Fail-Fast de env
    └── ADR-012-frontend-techniques.md   ← TanStack Query, polling adaptativo, union types de UI
```

## Ordem de leitura recomendada

### Para iniciar o desenvolvimento

1. **SPEC-00** — Entenda o problema e o fluxo principal.
2. **SPEC-01** — Conheça todos os requisitos.
3. **Guia de engenharia** (`guides/engineering-principles.md`) — Os princípios e padrões que orientam o código e os critérios de abstração; releia antes de revisar PRs.
4. **SPEC-02** — Modele o banco de dados (fundação de tudo).
5. **SPEC-03** — Configure o backend.
6. **SPEC-04** — Pipeline assíncrono (peça mais complexa).
7. **SPEC-05** — Cache com invalidação correta.
8. **SPEC-06** — Frontend conectado à API.
9. **SPEC-07** — Testes ao longo do desenvolvimento.
10. **SPEC-08** → **SPEC-09** — Observabilidade e infraestrutura.

### Qualidades transversais

- **SPEC-10** — Segurança: leia para ter noção da segurança do sistema.
- **SPEC-11** — Acessibilidade: leia para entender como a acessibilidade foi aplicada aos componentes.
- **SPEC-12** — Performance: leia para conhecer as estratégias de performance adotadas.
- **SPEC-13** — Erros: leia para compreender como o tratamento de erros é estruturado no sistema.
- **SPEC-14** — i18n: leia para saber como localização e internacionalização foram tratadas.
- **SPEC-15** — Convenções: leia para se familiarizar com as convenções de código do projeto. O **guia de engenharia** (`guides/engineering-principles.md`) complementa esta spec com os princípios e padrões por trás das convenções.
- **SPEC-16** — LGPD: leia para entender as práticas de privacidade e adequação à LGPD.
- **SPEC-17** — API design: leia para conhecer os padrões de design de API do sistema.

## Stack completa

| Camada          | Tecnologia                             |
| --------------- | -------------------------------------- |
| Frontend        | React 19 + TypeScript + TanStack Query |
| Backend         | Fastify + Node.js + TypeScript         |
| Banco de dados  | PostgreSQL + Drizzle ORM               |
| Cache           | Redis (somente cache)                  |
| Mensageria      | RabbitMQ (AMQP)                        |
| Testes          | Jest + ts-jest                         |
| Validação       | Zod (backend e frontend)               |
| Observabilidade | Prometheus + Grafana + Pino            |
| Infra local     | Docker Compose                         |
| Infra cloud     | AWS (ECS Fargate, RDS, ElastiCache)    |
| IaC             | Terraform                              |
| CI/CD           | GitHub Actions                         |
| Repositório     | Monorepo com npm workspaces            |

## Iniciar o ambiente de desenvolvimento

```bash
cp .env.example .env
docker compose up -d
npm run db:migrate
npm run db:seed

# Acessar:
#   Frontend:    http://localhost:5173
#   API:         http://localhost:3000
#   API Docs:    http://localhost:3000/docs  (somente em desenvolvimento)
#   RabbitMQ UI: http://localhost:15672  (fintrack/fintrack)
#   Redis UI:    http://localhost:5540
#   Grafana:     http://localhost:3001   (admin/admin)
#   Prometheus:  http://localhost:9090
```
