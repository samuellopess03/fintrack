# ADR-011 — Técnicas de backend: Keyset Pagination, Unit of Work e Fail-Fast de configuração

- **Status:** Aceito
- **Data:** 2025
- **Autores:** Time FinTrack

---

## Contexto

Este ADR documenta três decisões técnicas de implementação do backend que
impactam performance, consistência de dados e operabilidade do sistema.
Cada uma poderia ter sido implementada de forma mais simples — a decisão
pelo approach mais robusto precisa ser registrada com justificativa.

---

## Decisão 1 — Keyset Pagination para o extrato de transações

### O problema com OFFSET/LIMIT

A paginação clássica (`LIMIT 50 OFFSET 200`) tem um problema de performance
que se manifesta em tabelas grandes:

```sql
-- O banco precisa ler e descartar 200 linhas para retornar as próximas 50
SELECT * FROM transactions
ORDER BY date DESC
LIMIT 50 OFFSET 200;
```

Em uma tabela com 10.000 transações, `OFFSET 9950` faz o banco varrer quase
a tabela inteira só para descartar os primeiros resultados. A query fica mais
lenta à medida que o usuário avança nas páginas — exatamente o oposto do que
se espera.

Há também um problema de **consistência**: se uma transação é inserida enquanto
o usuário está paginando, os resultados das páginas seguintes ficam deslocados
— linhas são puladas ou repetidas.

### A solução: Keyset Pagination (cursor-based)

```sql
-- Usa o par (date, id) do último item visto como ponto de partida
SELECT * FROM transactions
WHERE user_id = $1
  AND (date, id) < ($lastDate, $lastId)   -- cursor composto
ORDER BY date DESC, id DESC
LIMIT 50;
```

O banco usa o índice `(date DESC, id DESC)` diretamente — não há varredura
de linhas anteriores. A performance é constante independentemente da página.

**Por que cursor composto `(date, id)` e não apenas `date`?**
Múltiplas transações podem ter a mesma data. Um cursor baseado apenas em
`date` seria ambíguo — linhas com a mesma data poderiam ser puladas ou
repetidas entre páginas. O par `(date, id)` é único e garante paginação
estável mesmo com datas repetidas.

**Formato do cursor na resposta:**
```json
{
  "data": [...],
  "pagination": {
    "next_cursor": "2024-05-15_018f3a2b-c4d5-...",
    "has_more": true
  }
}
```

O cursor é codificado como string opaca — o cliente não precisa conhecer
sua estrutura interna, apenas passá-lo de volta na próxima requisição.

### Trade-off aceito
Keyset pagination não suporta pular diretamente para uma página arbitrária
(ex: "ir para a página 10"). Para o caso de uso do extrato financeiro —
scroll contínuo ou navegação sequencial — isso não é uma limitação prática.

---

## Decisão 2 — Unit of Work para processamento atômico de extratos

### O problema sem Unit of Work

O processamento de um CSV de 500 transações sem transação de banco:

```
Transação 1 → salva ✓
Transação 2 → salva ✓
...
Transação 247 → falha por constraint violation ✗
Transações 248–500 → não processadas
```

O banco fica em estado inconsistente: 246 transações salvas de um arquivo que
"falhou". O usuário não sabe que parte do extrato foi importada. Re-importar
o arquivo duplicaria as 246 transações que já foram salvas.

### A solução: Unit of Work (transação de banco)

Todo o processamento de um arquivo ocorre dentro de uma única transação
PostgreSQL. O Drizzle expõe isso diretamente:

```typescript
await db.transaction(async (tx) => {
  // 1. Atualiza status do job
  // 2. Parseia o arquivo
  // 3. Insere todas as transações
  // 4. Atualiza resultado final do job
  //
  // Se qualquer operação falhar → ROLLBACK automático
  // Nada é salvo parcialmente
})
```

**Garantia:** ou todas as transações do arquivo são persistidas, ou nenhuma.
O job fica com status `failed` e o usuário pode re-tentar com segurança.

### O que fica fora da transação

A invalidação do cache Redis e a publicação de métricas ocorrem **fora** da
transação de banco, após o `COMMIT`. Isso é intencional:

- Se a invalidação do Redis falhar, o banco já foi comitado — os dados estão
  corretos, apenas o cache está desatualizado. O TTL garante que o dado antigo
  expire em no máximo 5 minutos.
- Incluir operações Redis dentro de uma transação de banco não é possível
  (são sistemas diferentes) e não deve ser simulado — são domínios de
  consistência separados.

### Idempotência via ON CONFLICT DO NOTHING

Dentro da transação, cada transação financeira é inserida com:

```sql
INSERT INTO transactions (...)
VALUES (...)
ON CONFLICT (account_id, date, amount, description)
DO NOTHING;
```

Isso garante que re-importar o mesmo arquivo é seguro — duplicatas são
silenciosamente ignoradas e contabilizadas em `skipped_count`. O job
pode ser re-executado sem efeitos colaterais.

---

## Decisão 3 — Fail-Fast na validação de variáveis de ambiente

### O problema sem validação de env

```typescript
// Sem validação: o erro aparece em runtime, tarde demais
const port = parseInt(process.env.PORT)  // NaN se PORT não estiver definida
app.listen(port)  // falha silenciosa ou comportamento inesperado

const dbUrl = process.env.DATABASE_URL   // undefined
db.connect(dbUrl)  // ConnectionError depois de subir a aplicação
```

Sem validação, a aplicação sobe parcialmente e falha de formas imprevisíveis
quando o código que usa a variável é chamado — que pode ser minutos depois do
start, durante o primeiro request.

### A solução: Fail-Fast com Zod na inicialização

```typescript
// src/config/env.ts
const envSchema = z.object({
  DATABASE_URL:   z.string().url(),
  REDIS_URL:      z.string().url(),
  RABBITMQ_URL:   z.string().url(),
  JWT_SECRET:     z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  PORT:           z.coerce.number().default(3000),
  NODE_ENV:       z.enum(['development', 'test', 'production']),
  UPLOAD_DIR:     z.string().default('./uploads'),
  LOG_LEVEL:      z.enum(['trace','debug','info','warn','error']).default('info'),
})

export const env = envSchema.parse(process.env)
// Se parse() falhar → ZodError com mensagem clara → process.exit(1) imediato
```

**Resultado:** se `DATABASE_URL` estiver ausente, a aplicação recusa-se a
subir com a mensagem exata do campo faltante — visível imediatamente nos logs
do container, não descoberta durante uma request de usuário.

### Benefícios adicionais

- **Tipos automáticos:** `env.PORT` é `number` (não `string | undefined`),
  `env.NODE_ENV` é `'development' | 'test' | 'production'`. O TypeScript
  sabe os tipos de todas as variáveis de ambiente em todo o codebase.
- **Valores padrão documentados:** `z.string().default('./uploads')` documenta
  no próprio schema qual é o valor padrão, sem comentários externos.
- **Coerção explícita:** `z.coerce.number()` para `PORT` documenta que a
  variável de ambiente é string mas deve ser usada como número — a coerção
  não é silenciosa.

---

## Consequências combinadas

| Técnica              | Problema resolvido                              | Trade-off aceito                     |
|----------------------|-------------------------------------------------|--------------------------------------|
| Keyset Pagination    | Performance constante no extrato, sem pulos     | Sem navegação para página arbitrária |
| Unit of Work         | Atomicidade no processamento de CSV             | Transação longa pode segurar locks   |
| Fail-Fast de env     | Erros de configuração visíveis no boot          | Nenhum — custo zero, benefício alto  |

O trade-off da transação longa é mitigado pelo `prefetch(5)` no worker —
no máximo 5 arquivos processados em paralelo, cada um com sua transação
independente. Um arquivo grande não bloqueia o processamento de outros.
