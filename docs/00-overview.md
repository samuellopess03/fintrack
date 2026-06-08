# SPEC-00 — Visão Geral do Projeto

## Problema

A maioria das pessoas não tem visibilidade real sobre para onde vai seu dinheiro.
Aplicativos como Mobills e Organizze resolvem parcialmente o problema, mas impõem
limitações importantes: não permitem importação automática de extratos, não oferecem
controle sobre a estrutura dos dados e não são extensíveis.

O FinTrack é um sistema próprio de controle financeiro pessoal que resolve esses
problemas com uma arquitetura técnica deliberada — servindo também como plataforma
de aprendizado para padrões de engenharia de software modernos.

## Objetivos do projeto

### Objetivo primário
Permitir que o usuário tenha controle total sobre suas finanças pessoais: contas,
transações, categorias e metas de gasto — com suporte a importação de extratos
bancários brasileiros nos formatos CSV e OFX.

### Objetivos técnicos
- Implementar processamento assíncrono real com mensageria (RabbitMQ).
- Aplicar cache de resultados agregados com invalidação controlada (Redis).
- Demonstrar padrões de design aplicados a um domínio de negócio concreto.
- Construir uma base de testes confiável com cobertura de lógica de domínio.
- Expor métricas de observabilidade mensuráveis (Prometheus + Grafana).

## Escopo do sistema (v1)

### Incluído
- Cadastro e gerenciamento de contas bancárias.
- Cadastro e gerenciamento de categorias de gastos.
- Lançamento manual de transações (receitas e despesas).
- Importação de extratos nos formatos CSV e OFX.
- Categorização automática por regras configuráveis.
- Relatórios de gastos por período e por categoria.
- Alertas quando uma meta de gasto mensal é ultrapassada.
- Paginação eficiente do extrato (keyset/cursor-based).
- Dashboard com resumo financeiro do mês corrente.

### Fora do escopo (v1)
- Integração direta com APIs de bancos (Open Finance).
- Aplicativo mobile nativo.
- Múltiplos usuários / modo multi-tenant.
- Conciliação bancária automática.
- Exportação de relatórios em PDF.

## Domínio do negócio — glossário

| Termo              | Definição                                                                 |
|--------------------|---------------------------------------------------------------------------|
| **Conta**          | Representa uma conta bancária, carteira ou cartão do usuário.             |
| **Transação**      | Um movimento financeiro: receita (positivo) ou despesa (negativo).        |
| **Categoria**      | Classificação de uma transação (ex: Alimentação, Transporte, Saúde).      |
| **Regra**          | Condição configurável para categorização automática (ex: descrição contém "UBER" → Transporte). |
| **Meta**           | Limite de gasto mensal definido pelo usuário para uma categoria.          |
| **Extrato**        | Arquivo CSV ou OFX exportado de um banco, contendo múltiplas transações.  |
| **Import Job**     | Job assíncrono criado quando o usuário faz upload de um extrato.          |
| **Import Status**  | Estado do job: `pending`, `processing`, `done`, `failed`.                 |

## Fluxo principal do sistema

```
Usuário faz upload de extrato
        │
        ▼
API valida o arquivo e salva em disco
        │
        ▼
API publica Import Job na fila do RabbitMQ
        │
        ▼
API retorna 202 Accepted + job_id para o cliente
        │
        ▼
Worker consome o job da fila
        │
        ├─ Faz parse do arquivo (Strategy: CsvParser | OfxParser)
        │
        ├─ Para cada transação, aplica Chain of Responsibility de categorização
        │
        ├─ Persiste todas as transações em uma única transação de banco (Unit of Work)
        │
        ├─ Invalida o cache Redis dos relatórios afetados
        │
        └─ Notifica o usuário (atualiza status do job → cliente faz polling)
```

## Arquitetura de alto nível

```
┌─────────────────────────────────────────────────────────────────┐
│  Frontend (React + TypeScript)                                  │
│  TanStack Query · React Router v7 · Recharts                    │
└─────────────────────────┬───────────────────────────────────────┘
                          │ REST / JSON
┌─────────────────────────▼───────────────────────────────────────┐
│  API (Fastify + TypeScript)                                     │
│  Zod · Drizzle ORM · Pino Logger                                │
└──────┬──────────────────┬──────────────────────────────────────┘
       │                  │
       │ AMQP             │ SQL
┌──────▼──────┐    ┌──────▼──────┐    ┌─────────────┐
│  RabbitMQ   │    │ PostgreSQL  │    │    Redis     │
│  (filas)    │    │  (dados)    │    │   (cache)    │
└──────┬──────┘    └─────────────┘    └──────▲───────┘
       │                                     │
┌──────▼──────────────────────────────────────────────┐
│  Worker (Node.js + TypeScript)                      │
│  Consome fila · Parseia extrato · Categoriza        │
│  Invalida cache Redis · Atualiza status do job      │
└─────────────────────────────────────────────────────┘
```

## Convenções gerais do projeto

- Todo código é escrito em **TypeScript strict** — `noImplicitAny`, `strictNullChecks`.
- Nenhuma lógica de negócio vive dentro de controllers ou rotas — apenas nos services.
- Erros são tipados com classes próprias (ex: `ImportJobNotFoundError`), nunca strings soltas.
- Variáveis de ambiente são validadas na inicialização via Zod — o sistema não sobe com env inválida.
- Toda operação assíncrona tem timeout e tratamento de erro explícito.
- Logs são estruturados em JSON (Pino) — nunca `console.log` em produção.
