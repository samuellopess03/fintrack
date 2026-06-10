# SPEC-01 — Requisitos da Aplicação

## Requisitos Funcionais

Requisitos funcionais descrevem **o que o sistema deve fazer** — comportamentos
observáveis e funcionalidades entregues ao usuário.

---

### RF-01 — Gerenciamento de Contas

| ID       | Descrição                                                                 | Prioridade |
|----------|---------------------------------------------------------------------------|------------|
| RF-01.1  | O usuário pode criar uma conta bancária com nome, tipo e saldo inicial.   | Alta       |
| RF-01.2  | O usuário pode editar o nome e o tipo de uma conta existente.             | Alta       |
| RF-01.3  | O usuário pode arquivar uma conta (soft delete — dados preservados).      | Média      |
| RF-01.4  | O sistema exibe o saldo atual de cada conta (calculado a partir das transações). | Alta |
| RF-01.5  | Tipos de conta suportados: `corrente`, `poupança`, `carteira`, `cartão`.  | Alta       |

---

### RF-02 — Gerenciamento de Categorias

| ID       | Descrição                                                                 | Prioridade |
|----------|---------------------------------------------------------------------------|------------|
| RF-02.1  | O usuário pode criar categorias personalizadas com nome e cor.            | Alta       |
| RF-02.2  | O sistema oferece categorias padrão pré-cadastradas na criação da conta.  | Média      |
| RF-02.3  | O usuário pode editar e excluir categorias (exceto as padrão do sistema). | Média      |
| RF-02.4  | Uma categoria pode ter uma meta de gasto mensal associada.                | Alta       |

---

### RF-03 — Transações Manuais

| ID       | Descrição                                                                 | Prioridade |
|----------|---------------------------------------------------------------------------|------------|
| RF-03.1  | O usuário pode lançar uma transação manual informando: conta, valor, descrição, data, categoria e tipo (receita/despesa). | Alta |
| RF-03.2  | O usuário pode editar qualquer campo de uma transação manual.             | Alta       |
| RF-03.3  | O usuário pode excluir uma transação manual.                              | Alta       |
| RF-03.4  | O sistema recalcula o saldo da conta afetada após cada operação.          | Alta       |
| RF-03.5  | O sistema invalida o cache do relatório do mês afetado após cada operação.| Alta       |

---

### RF-04 — Importação de Extratos

| ID       | Descrição                                                                 | Prioridade |
|----------|---------------------------------------------------------------------------|------------|
| RF-04.1  | O usuário pode fazer upload de um extrato em formato CSV.                 | Alta       |
| RF-04.2  | O usuário pode fazer upload de um extrato em formato OFX.                 | Alta       |
| RF-04.3  | O sistema aceita o arquivo e retorna imediatamente um `job_id` com status `pending`. | Alta |
| RF-04.4  | O processamento ocorre em background (worker assíncrono).                 | Alta       |
| RF-04.5  | O cliente pode consultar o status do job via polling no endpoint `GET /imports/:jobId`. | Alta |
| RF-04.6  | Ao concluir, o job exibe o número de transações importadas e quantas falharam na categorização. | Média |
| RF-04.7  | Transações duplicadas (mesma conta + data + valor + descrição) são ignoradas na importação. | Alta |
| RF-04.8  | O usuário pode visualizar o histórico de importações realizadas.          | Média      |

---

### RF-05 — Categorização Automática

| ID       | Descrição                                                                 | Prioridade |
|----------|---------------------------------------------------------------------------|------------|
| RF-05.1  | O sistema aplica regras de categorização automática durante a importação. | Alta       |
| RF-05.2  | O usuário pode criar regras do tipo: `descrição contém [texto]` → categoria. | Alta    |
| RF-05.3  | O usuário pode criar regras do tipo: `valor entre [min] e [max]` → categoria. | Média  |
| RF-05.4  | Regras têm prioridade configurável — a de maior prioridade é testada primeiro. | Alta  |
| RF-05.5  | Transações que não casam com nenhuma regra recebem a categoria `Não categorizado`. | Alta |
| RF-05.6  | O usuário pode recategorizar manualmente uma transação importada.         | Alta       |

---

### RF-06 — Relatórios e Dashboard

| ID       | Descrição                                                                 | Prioridade |
|----------|---------------------------------------------------------------------------|------------|
| RF-06.1  | O sistema gera relatório de gastos por categoria em um período selecionado.| Alta      |
| RF-06.2  | O sistema gera relatório de evolução de gastos mês a mês.                 | Alta       |
| RF-06.3  | O dashboard exibe: saldo total, receitas do mês, despesas do mês e saldo do mês. | Alta |
| RF-06.4  | O dashboard exibe um gráfico de pizza com distribuição de gastos por categoria no mês. | Alta |
| RF-06.5  | Relatórios são servidos a partir do cache Redis quando disponíveis.       | Alta       |
| RF-06.6  | O período padrão dos relatórios é o mês corrente.                         | Média      |

---

### RF-07 — Alertas de Meta

| ID       | Descrição                                                                 | Prioridade |
|----------|---------------------------------------------------------------------------|------------|
| RF-07.1  | Quando o gasto acumulado de uma categoria ultrapassa a meta mensal, o sistema registra um alerta. | Alta |
| RF-07.2  | O dashboard exibe um indicador visual para categorias que ultrapassaram a meta. | Alta |
| RF-07.3  | Alertas são verificados ao final de cada processamento de job e após transações manuais. | Alta |

---

### RF-08 — Extrato Paginado

| ID       | Descrição                                                                 | Prioridade |
|----------|---------------------------------------------------------------------------|------------|
| RF-08.1  | O endpoint de listagem de transações suporta paginação por cursor (keyset). | Alta     |
| RF-08.2  | O tamanho padrão de página é 50 transações; máximo de 100.                | Alta       |
| RF-08.3  | A resposta inclui um `next_cursor` para buscar a próxima página.          | Alta       |
| RF-08.4  | O extrato pode ser filtrado por: conta, categoria, tipo, período e texto. | Alta       |

---

## Requisitos Não Funcionais

Requisitos não funcionais descrevem **como o sistema deve se comportar** — qualidade,
desempenho, segurança e operabilidade.

---

### RNF-01 — Desempenho

| ID        | Descrição                                                                | Meta          |
|-----------|--------------------------------------------------------------------------|---------------|
| RNF-01.1  | Endpoints de leitura simples (saldo, listagem paginada) devem responder em menos de 200ms no P95. | < 200ms |
| RNF-01.2  | Relatórios servidos do cache Redis devem responder em menos de 50ms.     | < 50ms        |
| RNF-01.3  | O worker deve processar um CSV de 500 transações em menos de 10 segundos.| < 10s         |
| RNF-01.4  | A API deve suportar pelo menos 100 requisições simultâneas sem degradação.| 100 req/s    |

---

### RNF-02 — Confiabilidade

| ID        | Descrição                                                                |
|-----------|--------------------------------------------------------------------------|
| RNF-02.1  | Um job de importação que falha deve ser retentado até 3 vezes com backoff exponencial antes de ir para a Dead Letter Queue. |
| RNF-02.2  | O processamento de um extrato deve ser atômico: ou todas as transações do arquivo são persistidas, ou nenhuma. |
| RNF-02.3  | A aplicação deve continuar operando normalmente se o Redis estiver indisponível (cache miss silencioso, queries diretas ao banco). |
| RNF-02.4  | Nenhuma transação do usuário deve ser perdida em caso de falha do worker durante o processamento. |

---

### RNF-03 — Segurança

| ID        | Descrição                                                                |
|-----------|--------------------------------------------------------------------------|
| RNF-03.1  | Todas as rotas (exceto health check) exigem autenticação via JWT.        |
| RNF-03.2  | Tokens JWT expiram em 24 horas; refresh tokens expiram em 7 dias.        |
| RNF-03.3  | Uploads de arquivo são limitados a 10MB por requisição.                  |
| RNF-03.4  | Apenas extensões `.csv` e `.ofx` são aceitas no upload.                  |
| RNF-03.5  | Variáveis de ambiente sensíveis (credenciais de banco, secrets) nunca são logadas. |
| RNF-03.6  | O sistema aplica rate limiting: 60 requisições por minuto por IP.        |

---

### RNF-04 — Manutenibilidade

| ID        | Descrição                                                                |
|-----------|--------------------------------------------------------------------------|
| RNF-04.1  | Cobertura mínima de testes unitários nas regras de categorização: 90%.   |
| RNF-04.2  | Cobertura mínima de testes de integração no pipeline de importação: 80%. |
| RNF-04.3  | Toda decisão arquitetural relevante deve ter um ADR correspondente.      |
| RNF-04.4  | O projeto deve ser inicializável com um único comando (`docker compose up`). |
| RNF-04.5  | Migrations de banco devem ser versionadas e reversíveis.                 |

---

### RNF-05 — Observabilidade

| ID        | Descrição                                                                |
|-----------|--------------------------------------------------------------------------|
| RNF-05.1  | A API expõe métricas no endpoint `GET /metrics` no formato Prometheus.   |
| RNF-05.2  | As seguintes métricas devem estar disponíveis: tempo de resposta por rota, jobs pendentes na fila, tempo médio de processamento de CSV, taxa de erro de categorização. |
| RNF-05.3  | Todos os logs devem ser estruturados em JSON com os campos: `timestamp`, `level`, `requestId`, `message`, `context`. |
| RNF-05.4  | Cada requisição HTTP recebe um `requestId` único propagado em todos os logs daquela requisição. |

---

### RNF-06 — Portabilidade

| ID        | Descrição                                                                |
|-----------|--------------------------------------------------------------------------|
| RNF-06.1  | O ambiente de desenvolvimento completo deve rodar via Docker Compose sem instalações manuais além do Docker. |
| RNF-06.2  | O sistema deve funcionar em qualquer ambiente Linux/macOS com Node.js 20+.|
