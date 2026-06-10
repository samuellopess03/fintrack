# ADR-007 — Redis como camada de cache

- **Status:** Aceito
- **Data:** 2025
- **Autores:** Time FinTrack

---

## Contexto

O FinTrack gera relatórios financeiros que envolvem queries agregadas pesadas
no PostgreSQL (`GROUP BY`, `SUM`, filtros por período). Essas queries precisam
ser cacheadas para que o dashboard e os relatórios respondam em tempo aceitável
sem sobrecarregar o banco a cada requisição.

Os requisitos para a camada de cache são:
- Armazenamento em memória para latência mínima de leitura.
- TTL (Time To Live) configurável por chave.
- Suporte a deleção de chaves individuais e por padrão (invalidação).
- Operação independente: a API deve funcionar normalmente se o cache estiver fora do ar.
- Compatível com ambiente multi-instância (múltiplas réplicas da API compartilham o mesmo cache).

As opções avaliadas foram Redis, Memcached e cache em memória local (in-process).

---

## Decisão

Adotamos o **Redis** como camada de cache distribuído da aplicação.

---

## Justificativas

### Cache compartilhado entre múltiplas instâncias da API
Cache em memória local (um Map JavaScript dentro do processo da API) seria
mais simples, mas não funciona em ambiente com múltiplas réplicas — cada
instância teria seu próprio cache inconsistente com as demais. Com Redis,
todas as instâncias da API compartilham o mesmo cache centralizado.

### Estruturas de dados nativas
O Redis não é apenas um key-value store de strings. Ele oferece tipos nativos
(hashes, sets, sorted sets, listas) que podem ser usados em evoluções futuras
do sistema sem trocar de ferramenta:
- **Sorted sets:** ranking de categorias por gasto total.
- **Pub/Sub:** notificação em tempo real quando um job termina (alternativa ao polling).
- **Streams:** log de eventos de importação para auditoria.

Na v1 usamos apenas strings JSON com TTL, mas a fundação está prosta.

### TTL nativo e atomicidade
O Redis suporta `SET key value EX seconds` de forma atômica — uma única
operação define o valor e a expiração. Operações de cache como
`GET → check → SET` são executadas via scripts Lua quando necessário,
garantindo atomicidade sem race conditions.

### Comandos de invalidação por padrão
O comando `KEYS pattern` (ou `SCAN` para produção) permite invalidar
todas as chaves de um usuário de uma vez após uma importação:
`KEYS report:monthly:userId:*`. Isso é necessário porque um extrato
pode conter transações de múltiplos meses, e seria trabalhoso invalidar
cada mês individualmente.

### Degradação graceful documentada
O Redis é um componente opcional no fluxo de leitura — se estiver fora
do ar, a API busca diretamente no banco. Isso é explícito no `CacheService`:
todas as operações têm try/catch silencioso. O sistema não tem dependência
forte do Redis para funcionar corretamente — apenas para ser rápido.

### Maturidade e operabilidade
Redis é uma das tecnologias de infraestrutura mais maduras e operadas do
mundo, com documentação excelente, clientes estáveis para Node.js (`ioredis`),
e serviços gerenciados disponíveis em todas as clouds (ElastiCache na AWS,
Redis Cloud, Upstash para serverless).

---

## Papel exclusivo do Redis no FinTrack

Uma decisão explícita foi tomada: **Redis é usado exclusivamente para cache**.
Ele não serve como backend de fila (responsabilidade do RabbitMQ) nem como
store de sessões (responsabilidade do JWT stateless). Essa separação de papéis
é documentada no ADR-003 (RabbitMQ) e facilita a operação — problemas de
memória no Redis são problemas de cache, não de mensageria.

---

## Alternativas rejeitadas

### Memcached
- Sem suporte a estruturas de dados além de strings.
- Sem persistência opcional (Redis tem AOF/RDB para casos onde persistir
  o cache entre restarts é útil).
- Sem Pub/Sub ou Streams para evoluções futuras.
- Não oferece vantagens relevantes sobre Redis para o caso de uso do projeto.

### Cache em memória local (in-process Map)
- Não compartilhado entre réplicas da API — cada instância tem cache diferente.
- Sem TTL nativo — requer implementação manual de expiração.
- Sem visibilidade operacional — impossível inspecionar o que está cacheado
  sem instrumentação adicional.
- **Válido apenas para desenvolvimento local com instância única** — não
  escala para produção.

### Cache no próprio PostgreSQL (materialized views)
- Materialized views do PostgreSQL são uma alternativa legítima para
  relatórios pré-calculados, mas exigem `REFRESH MATERIALIZED VIEW` para
  atualizar — operação mais custosa que deletar uma chave Redis.
- Acoplamento da estratégia de cache ao banco de dados — harder to invalidate
  on-demand sem triggers ou jobs de refresh.

---

## Consequências

- **Positivo:** Latência de leitura de relatórios < 5ms (vs 50–200ms no banco), compartilhado entre réplicas, TTL nativo, invalidação flexível por padrão.
- **Positivo:** Papel exclusivo e bem definido — não há confusão entre cache e mensageria.
- **Negativo:** Um serviço a mais para operar (mitigado pelo ElastiCache gerenciado em produção).
- **Negativo:** Dados em memória — cache é perdido em restart sem persistência habilitada (aceitável, pois é regenerável a partir do banco).
- **Risco mitigado:** A degradação graceful garante que Redis indisponível não derruba a aplicação.
