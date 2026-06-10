# FinTrack — Documentação do Projeto

> Controle financeiro pessoal com processamento assíncrono de extratos bancários.

## Estrutura da documentação

```
docs/
├── README.md                      ← este arquivo
│
├── spec/
│   ├── 00-overview.md             ← visão geral, objetivos, escopo e fluxo principal
│   ├── 01-requirements.md         ← requisitos funcionais (RF) e não funcionais (RNF)
│   ├── 02-database.md             ← modelagem PostgreSQL, Drizzle schema, índices, paginação
│   ├── 03-backend.md              ← arquitetura Fastify, módulos, endpoints, padrões
│   ├── 04-async-pipeline.md       ← RabbitMQ, worker, Strategy, Chain of Responsibility, Unit of Work
│   ├── 05-cache.md                ← Redis, chaves, TTLs, invalidação, degradação graceful
│   ├── 06-frontend.md             ← React, TanStack Query, estrutura de pastas, polling
│   ├── 07-testing.md              ← Jest, testes unitários, integração, fixtures
│   ├── 08-observability.md        ← Prometheus, Grafana, Pino, métricas, dashboards, alertas
│   └── 09-infra.md                ← Docker, Docker Compose, GitHub Actions CI/CD, Terraform
│
└── adr/
    ├── ADR-001-fastify.md          ← Fastify vs Express vs Hapi
    ├── ADR-002-drizzle.md          ← Drizzle vs Prisma vs TypeORM
    ├── ADR-003-rabbitmq.md         ← RabbitMQ vs BullMQ vs SQS
    ├── ADR-004-zod.md              ← Zod vs Yup vs class-validator
    ├── ADR-005-jest-swc.md         ← Jest+SWC vs Vitest
    ├── ADR-006-react.md            ← React vs Vue vs Angular
    ├── ADR-007-redis-cache.md      ← Redis vs Memcached vs cache in-process
    ├── ADR-008-prometheus-grafana.md ← Prometheus+Grafana vs Datadog vs OTel+Jaeger
    ├── ADR-009-backend-architecture.md ← módulos por domínio vs camadas técnicas vs Clean Architecture
    ├── ADR-010-frontend-architecture.md ← camadas, server/client state, organização de pastas
    ├── ADR-011-backend-techniques.md ← Keyset Pagination, Unit of Work, Fail-Fast de env
    ├── ADR-012-frontend-techniques.md ← TanStack Query, polling adaptativo, union types de UI state
    └── ADR-013-monorepo.md         ← monorepo npm workspaces vs polyrepo vs Turborepo
```

## Ordem de leitura recomendada

Para quem está iniciando o desenvolvimento, leia os documentos nesta ordem:

1. **SPEC-00** — Entenda o problema, o escopo e o fluxo principal do sistema.
2. **SPEC-01** — Conheça todos os requisitos antes de escrever qualquer linha de código.
3. **SPEC-02** — Modele o banco de dados; é a fundação de tudo.
4. **SPEC-03** — Configure o backend e entenda a separação de responsabilidades.
5. **SPEC-04** — Implemente o pipeline assíncrono (a peça mais complexa do sistema).
6. **SPEC-05** — Adicione a camada de cache com invalidação correta.
7. **SPEC-06** — Construa o frontend conectado à API.
8. **SPEC-07** — Escreva os testes à medida que constrói cada módulo.
9. **SPEC-08** — Instrumente métricas e configure os dashboards.
10. **SPEC-09** — Finalize com Docker Compose, CI/CD e Terraform.

Os ADRs podem ser lidos em qualquer ordem — cada um é independente e
documenta o raciocínio por trás de uma decisão técnica específica.

## Mapa dos ADRs por categoria

### Escolha de ferramentas e bibliotecas
| ADR | Decisão | Alternativas analisadas |
|-----|---------|------------------------|
| ADR-001 | Fastify como framework HTTP | Express, Hapi |
| ADR-002 | Drizzle como ORM | Prisma, TypeORM |
| ADR-003 | RabbitMQ como message broker | BullMQ, SQS |
| ADR-004 | Zod como validação | Yup, class-validator |
| ADR-005 | Jest + @swc/jest para testes | Vitest |
| ADR-006 | React como biblioteca de UI | Vue.js, Angular |
| ADR-007 | Redis exclusivo para cache | Memcached, in-process |
| ADR-008 | Prometheus + Grafana para observabilidade | Datadog, OTel+Jaeger |

### Decisões arquiteturais
| ADR | Decisão | Alternativas analisadas |
|-----|---------|------------------------|
| ADR-009 | Backend organizado por domínio (módulos verticais) | Camadas técnicas, Clean Architecture |
| ADR-010 | Frontend em camadas explícitas com separação server/client state | Redux, Next.js, monorepo de tipos |
| ADR-013 | Monorepo com npm workspaces | Polyrepo, Turborepo |

### Técnicas de implementação
| ADR | Técnica | Problema resolvido |
|-----|---------|-------------------|
| ADR-011 | Keyset Pagination, Unit of Work, Fail-Fast de env | Performance de listagem, atomicidade, erros de config |
| ADR-012 | TanStack Query, polling adaptativo, union types de UI | Server state, feedback de jobs, estados impossíveis |

## Stack completa

| Camada           | Tecnologia                                  |
|------------------|---------------------------------------------|
| Frontend         | React 18 + TypeScript + TanStack Query      |
| Backend          | Fastify + Node.js + TypeScript              |
| Banco de dados   | PostgreSQL + Drizzle ORM                    |
| Cache            | Redis (somente cache — sem fila)            |
| Mensageria       | RabbitMQ (AMQP — somente fila)              |
| Testes           | Jest + @swc/jest                            |
| Validação        | Zod (backend e frontend)                    |
| Observabilidade  | Prometheus + Grafana + Pino                 |
| Infra local      | Docker Compose                              |
| Infra cloud      | AWS (ECS Fargate, RDS, ElastiCache)         |
| IaC              | Terraform                                   |
| CI/CD            | GitHub Actions                              |
| Repositório      | Monorepo com npm workspaces                 |

## Iniciar o ambiente de desenvolvimento

```bash
# 1. Copiar variáveis de ambiente
cp .env.example .env

# 2. Subir todos os serviços
docker compose up -d

# 3. Aplicar migrations e seed
npm run db:migrate
npm run db:seed

# 4. Acessar
#   Frontend:          http://localhost:5173
#   API:               http://localhost:3000
#   RabbitMQ UI:       http://localhost:15672  (fintrack/fintrack)
#   Grafana:           http://localhost:3001   (admin/admin)
#   Prometheus:        http://localhost:9090
```
