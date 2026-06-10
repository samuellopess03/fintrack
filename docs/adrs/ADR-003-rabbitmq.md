# ADR-003 — RabbitMQ como message broker

- **Status:** Aceito
- **Data:** 2025
- **Autores:** Time FinTrack

---

## Contexto

O FinTrack precisa de um mecanismo de processamento assíncrono para importação
de extratos bancários. Quando um usuário faz upload de um arquivo CSV ou OFX,
o processamento não pode ocorrer dentro da requisição HTTP — ele precisa ser
delegado a um worker em background com suporte a retry, dead letter e
monitoramento de fila.

O sistema já usa Redis para cache de relatórios. A questão é: usar o próprio
Redis como backend de fila (via BullMQ) ou adotar um message broker dedicado?

As opções avaliadas foram BullMQ (sobre Redis), RabbitMQ e Amazon SQS.

---

## Decisão

Adotamos o **RabbitMQ** como message broker para o pipeline assíncrono de importação.

---

## Justificativas

### Separação de responsabilidades por ferramenta
Redis foi projetado como store de estruturas de dados em memória — ideal para
cache, sessões e contadores. Usá-lo como backend de fila via BullMQ mistura
dois papéis distintos na mesma instância, tornando a operação mais complexa:
monitorar o Redis por problemas de fila vs problemas de cache, calibrar memória
para dois padrões de uso completamente diferentes, e razonar sobre TTLs de cache
convivendo com mensagens persistentes de fila.

O RabbitMQ foi construído especificamente para mensageria — com protocolo AMQP,
garantias de entrega, roteamento flexível e interface de administração dedicada.
Cada ferramenta faz uma coisa bem.

### Protocolo AMQP e garantias de entrega
O RabbitMQ implementa AMQP (Advanced Message Queuing Protocol), que oferece:
- **Acknowledgment explícito:** o worker confirma que processou o job com sucesso.
  Se o processo morrer no meio do processamento, o RabbitMQ redistribui a mensagem.
- **Persistência real:** mensagens marcadas como `persistent: true` são escritas
  em disco antes do ACK ao publisher, sobrevivendo a restarts do broker.
- **Prefetch:** controle preciso de quantos jobs o worker processa em paralelo
  (`channel.prefetch(5)`), evitando sobrecarga.

### Dead Letter Queue nativa
O RabbitMQ tem suporte nativo a Dead Letter Exchange (DLX): após N rejeições,
a mensagem é roteada automaticamente para uma fila de análise sem nenhum código
adicional no worker — apenas configuração de topologia. No BullMQ, a DLQ é
uma abstração da biblioteca que depende de scripts Lua no Redis.

### Topologia de roteamento para evolução futura
A arquitetura de Exchange → Binding → Queue permite rotear por tipo de arquivo
(`import.csv` vs `import.ofx`) sem alterar código dos publishers ou workers.
No futuro, é possível adicionar workers especializados por tipo, ou fanout para
múltiplos consumidores, sem mudar a API de publicação.

### Interface de administração
O RabbitMQ Management Plugin oferece uma UI web para inspecionar filas, ver
mensagens pendentes, monitorar throughput e reprocessar mensagens da DLQ
manualmente — essencial em produção.

---

## Alternativas rejeitadas

### BullMQ (sobre Redis)
- Mistura o papel de cache (Redis) com mensageria na mesma instância.
- Sem protocolo de mensageria dedicado — abstração construída sobre `BRPOP`/`LPUSH`.
- DLQ como abstração de biblioteca, não garantia do protocolo.
- Menos visibilidade operacional sem ferramentas externas.
- **Mantido como opção válida** para projetos que precisam minimizar serviços
  e já têm Redis — não é tecnicamente inferior, apenas conceitualmente menos
  apropriado para este projeto.

### Amazon SQS
- Dependência de cloud (AWS) — remove a possibilidade de rodar 100% local.
- Latência de polling (long polling mínimo de 1s).
- Sem roteamento por exchange — uma fila por tipo de mensagem.
- Custo por mensagem em produção.

---

## Consequências

- **Positivo:** Separação clara de responsabilidades, garantias de entrega pelo protocolo, DLQ nativa, roteamento flexível, UI de administração.
- **Positivo:** Redis fica dedicado exclusivamente ao cache — mais fácil de operar e monitorar.
- **Negativo:** Um serviço a mais no Docker Compose e na infraestrutura.
- **Negativo:** Curva de aprendizado dos conceitos AMQP (exchange, binding, routing key) para quem não conhece.
- **Risco mitigado:** A topologia do FinTrack é simples (direct exchange, duas filas). O overhead operacional é baixo.
