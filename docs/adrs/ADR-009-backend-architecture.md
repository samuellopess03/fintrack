# ADR-009 — Arquitetura modular por domínio no backend

- **Status:** Aceito
- **Data:** 2025
- **Autores:** Time FinTrack

---

## Contexto

O backend do FinTrack precisa ser organizado de uma forma que:
- Permita encontrar qualquer arquivo relacionado a um domínio (ex: transações)
  em um único lugar.
- Evite acoplamento entre domínios — mudar a lógica de contas não deve exigir
  mudanças no módulo de relatórios.
- Escale sem se tornar um monólito de arquivos soltos e difícil de navegar.
- Facilite testes isolados — cada módulo deve ser testável de forma independente.

As abordagens avaliadas foram organização por camada técnica (horizontal),
organização por domínio/módulo (vertical) e Clean Architecture.

---

## Decisão

Adotamos **organização por domínio (módulos verticais)** no backend,
onde cada domínio de negócio agrupa todas as suas camadas técnicas.

---

## O que isso significa na prática

### Organização por camada técnica (rejeitada)
Agrupa todos os arquivos de um mesmo tipo técnico juntos, independente do domínio:

```
src/
├── controllers/
│   ├── accounts.controller.ts
│   ├── transactions.controller.ts
│   └── imports.controller.ts
├── services/
│   ├── accounts.service.ts
│   ├── transactions.service.ts
│   └── imports.service.ts
└── repositories/
    ├── accounts.repository.ts
    └── transactions.repository.ts
```

**Problema:** para trabalhar em "importação de extratos", você navega entre
três pastas diferentes. Qualquer mudança no domínio de imports implica abrir
arquivos em `controllers/`, `services/` e `repositories/` — o contexto mental
é fragmentado.

### Organização por domínio/módulo (adotada)
Cada domínio é uma pasta vertical que contém todas as suas camadas:

```
src/
└── modules/
    ├── accounts/
    │   ├── accounts.routes.ts      ← HTTP handlers
    │   ├── accounts.service.ts     ← lógica de negócio
    │   ├── accounts.repository.ts  ← queries Drizzle
    │   ├── accounts.schema.ts      ← schemas Zod
    │   └── accounts.test.ts        ← testes do módulo
    │
    ├── transactions/
    │   ├── transactions.routes.ts
    │   ├── transactions.service.ts
    │   └── ...
    │
    └── imports/
        ├── imports.routes.ts
        ├── imports.service.ts
        └── ...
```

**Benefício:** para trabalhar em "importação de extratos", você entra em
`modules/imports/` e tudo está lá. O contexto mental é coeso.

---

## Justificativas

### Coesão por domínio, não por tipo técnico
A organização por módulo espelha o vocabulário do negócio, não a taxonomia
técnica. Um desenvolvedor novo no projeto entende a estrutura lendo os nomes
das pastas (`accounts`, `transactions`, `imports`) antes mesmo de abrir
qualquer arquivo. Organizado por camada técnica, os nomes (`controllers`,
`services`) não dizem nada sobre o que o sistema faz.

### Limite natural de dependência
Cada módulo exporta apenas sua interface pública (tipicamente o service).
O módulo de `reports` pode importar `TransactionsService`, mas nunca acessa
diretamente queries do módulo de transações. Isso cria limites de dependência
explícitos que o TypeScript verifica em tempo de compilação.

### Facilita extração futura para microsserviços
Se no futuro o módulo de `imports` crescer o suficiente para justificar um
serviço separado, a extração é cirúrgica — o módulo já é uma unidade coesa
com suas próprias dependências mapeadas. Com organização por camada técnica,
extrair um domínio exigiria caçar arquivos espalhados em múltiplas pastas.

### Testes colocados ao lado do código
Os arquivos de teste vivem dentro da pasta do módulo (`accounts.test.ts`
ao lado de `accounts.service.ts`). Isso evita a duplicação de estrutura
de pastas em um diretório `__tests__/` separado e torna óbvio quando um
módulo não tem testes — a ausência do arquivo é visível imediatamente.

---

## Camada `shared/` — o que vai lá

Código que é genuinamente compartilhado entre múltiplos módulos vive em `shared/`:

```
src/shared/
├── errors/         ← AppError, NotFoundError, ValidationError
├── plugins/        ← plugins Fastify: db, redis, rabbitmq, auth
├── middlewares/    ← autenticação JWT, rate limiting
├── cache/          ← CacheService
├── metrics/        ← contadores e histogramas Prometheus
└── utils/          ← funções puras utilitárias
```

**Regra:** se apenas um módulo usa aquele código, ele fica dentro do módulo.
Só vai para `shared/` quando dois ou mais módulos precisam do mesmo artefato.
Isso evita o anti-pattern de `shared/` virar uma gaveta de tudo.

---

## Separação de responsabilidades dentro de um módulo

Cada arquivo dentro de um módulo tem uma responsabilidade única e clara:

| Arquivo              | Responsabilidade                                                     | Pode importar         |
|----------------------|----------------------------------------------------------------------|-----------------------|
| `*.routes.ts`        | Definir rotas, validar input com Zod, chamar o service, serializar response | Apenas o service     |
| `*.service.ts`       | Lógica de negócio, orquestração de repositório + cache + fila        | Repository, Cache, Queue |
| `*.repository.ts`    | Queries Drizzle ao banco de dados                                    | Apenas Drizzle client |
| `*.schema.ts`        | Schemas Zod de request/response                                      | Apenas Zod            |

**Regra de dependência:** a seta de dependência aponta sempre para baixo
(`routes → service → repository`). Nenhuma camada importa de uma camada
acima dela. O service nunca importa `FastifyRequest`. O repository nunca
chama o cache.

---

## Worker — estrutura paralela

O worker segue a mesma filosofia de coesão por domínio:

```
src/worker/
├── worker.ts              ← entrypoint: conecta ao RabbitMQ e registra consumers
├── processors/
│   └── import.processor.ts ← orquestra parser + categorização + banco
├── parsers/               ← Strategy: uma pasta, um parser por formato
│   ├── types.ts
│   ├── csv.parser.ts
│   └── ofx.parser.ts
└── categorization/        ← Chain of Responsibility
    ├── handlers/
    ├── chain.builder.ts
    └── types.ts
```

---

## Alternativas rejeitadas

### Organização por camada técnica (MVC clássico)
- Fragmenta o contexto de trabalho por domínio.
- Cresce de forma difícil de navegar: `services/` com 15 arquivos não diz
  quais domínios existem no sistema sem ler todos os nomes.
- Acoplamento implícito entre camadas de domínios diferentes é mais difícil
  de detectar.

### Clean Architecture (ports & adapters)
- Introduz muitas abstrações (use cases, entities, repositories como interfaces
  com implementações separadas) que adicionam cerimônia para um projeto de
  escopo pessoal.
- O benefício principal da Clean Architecture — trocar o banco de dados ou
  o framework HTTP sem mudar a lógica de negócio — é irrelevante para o
  FinTrack, onde as escolhas de PostgreSQL + Fastify são fixas.
- **Válida como evolução futura** se o projeto crescer para um time maior
  e a lógica de negócio precisar ser testada completamente isolada de
  infraestrutura.

---

## Consequências

- **Positivo:** Contexto de trabalho coeso por domínio, limite de dependência claro, testes ao lado do código, fácil extração futura.
- **Positivo:** Estrutura legível por nome de pasta — o vocabulário do negócio é visível na estrutura de arquivos.
- **Negativo:** Pode gerar dúvidas sobre o que vai em `modules/` vs `shared/` — resolvido pela regra "dois ou mais módulos".
- **Negativo:** Sem uma interface de repositório explícita, mockar o banco nos testes de service requer `jest.mock` no módulo Drizzle — aceitável para a v1.
