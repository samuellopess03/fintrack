# FinTrack — Documentação do Projeto

> Controle financeiro pessoal com processamento assíncrono de extratos bancários.

## Estrutura da documentação

A documentação do FinTrack vive em **dois lugares**, conforme a natureza do conteúdo:

| Local | Conteúdo | Por que ali |
|---|---|---|
| **[Wiki do projeto](https://github.com/samuellopess03/fintrack/wiki)** | **SPECs 00–17** — *o quê* o sistema faz e *como* cada parte é estruturada; setup e referência da API | Documentação de referência, mantida fora do fluxo de commits do código |
| **Este repositório** | **ADRs e Guias** — *por que* cada decisão foi tomada e *como julgamos* o código | Versionados junto com o código: o PR que muda uma decisão atualiza o ADR correspondente no mesmo commit |

```
docs/
├── README.md
│
├── guides/                                  ← como julgamos código (estratégia de engenharia)
│   ├── engineering-principles.md            ← mapa Clean Code/SOLID/padrões → ADRs, critérios de abstração
│   └── eslint-boundaries.md                 ← referência das regras de fronteira forçadas no ESLint
│
└── adrs/                                    ← por que cada decisão foi tomada
    │
    │  ESCOLHA DE FERRAMENTAS
    ├── ADR-001-fastify.md               ← Fastify vs Express vs Hapi
    ├── ADR-002-drizzle.md               ← Drizzle vs Prisma vs TypeORM
    ├── ADR-003-rabbitmq.md              ← RabbitMQ vs BullMQ vs SQS
    ├── ADR-004-zod.md                   ← Zod vs Yup vs class-validator
    ├── ADR-005-jest.md                  ← Jest+ts-jest vs Vitest
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

> Os SPECs estão na [Wiki do projeto](https://github.com/samuellopess03/fintrack/wiki).

### Para iniciar o desenvolvimento

1. **[SPEC-00](https://github.com/samuellopess03/fintrack/wiki/00-overview)** — Entenda o problema e o fluxo principal.
2. **[SPEC-01](https://github.com/samuellopess03/fintrack/wiki/01-requirements)** — Conheça todos os requisitos.
3. **Guia de engenharia** (`guides/engineering-principles.md`) — Os princípios e padrões que orientam o código e os critérios de abstração; releia antes de revisar PRs.
4. **[SPEC-02](https://github.com/samuellopess03/fintrack/wiki/02-database)** — Modele o banco de dados (fundação de tudo).
5. **[SPEC-03](https://github.com/samuellopess03/fintrack/wiki/03-backend)** — Configure o backend.
6. **[SPEC-04](https://github.com/samuellopess03/fintrack/wiki/04-async-pipeline)** — Pipeline assíncrono (peça mais complexa).
7. **[SPEC-05](https://github.com/samuellopess03/fintrack/wiki/05-cache)** — Cache com invalidação correta.
8. **[SPEC-06](https://github.com/samuellopess03/fintrack/wiki/06-frontend)** — Frontend conectado à API.
9. **[SPEC-07](https://github.com/samuellopess03/fintrack/wiki/07-testing)** — Testes ao longo do desenvolvimento.
10. **[SPEC-08](https://github.com/samuellopess03/fintrack/wiki/08-observability)** → **[SPEC-09](https://github.com/samuellopess03/fintrack/wiki/09-infra)** — Observabilidade e infraestrutura.

### Qualidades transversais

- **[SPEC-10](https://github.com/samuellopess03/fintrack/wiki/10-security)** — Segurança: leia para ter noção da segurança do sistema.
- **[SPEC-11](https://github.com/samuellopess03/fintrack/wiki/11-accessibility)** — Acessibilidade: leia para entender como a acessibilidade foi aplicada aos componentes.
- **[SPEC-12](https://github.com/samuellopess03/fintrack/wiki/12-performance)** — Performance: leia para conhecer as estratégias de performance adotadas.
- **[SPEC-13](https://github.com/samuellopess03/fintrack/wiki/13-error-handling)** — Erros: leia para compreender como o tratamento de erros é estruturado no sistema.
- **[SPEC-14](https://github.com/samuellopess03/fintrack/wiki/14-i18n)** — i18n: leia para saber como localização e internacionalização foram tratadas.
- **[SPEC-15](https://github.com/samuellopess03/fintrack/wiki/15-code-conventions)** — Convenções: leia para se familiarizar com as convenções de código do projeto. O **guia de engenharia** (`guides/engineering-principles.md`) complementa esta spec com os princípios e padrões por trás das convenções.
- **[SPEC-16](https://github.com/samuellopess03/fintrack/wiki/16-privacy-lgpd)** — LGPD: leia para entender as práticas de privacidade e adequação à LGPD.
- **[SPEC-17](https://github.com/samuellopess03/fintrack/wiki/17-api-design)** — API design: leia para conhecer os padrões de design de API do sistema.

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
