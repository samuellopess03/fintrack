# SPEC-16 — Gestão de Dados e Privacidade (LGPD)

## Contexto

O FinTrack coleta e processa dados financeiros pessoais sensíveis — extratos
bancários, histórico de gastos, hábitos de consumo. No Brasil, esses dados
são protegidos pela **Lei Geral de Proteção de Dados Pessoais (LGPD —
Lei nº 13.709/2018)**, que entrou em vigor em setembro de 2020.

Além da obrigação legal, a transparência sobre como os dados são usados
é um elemento de confiança — especialmente crítico para um app que lida
com finanças pessoais.

---

## Base legal para tratamento dos dados

A LGPD exige que todo tratamento de dado pessoal tenha uma base legal.
Para o FinTrack:

| Dado coletado              | Base legal (Art. 7º LGPD)                              |
|----------------------------|---------------------------------------------------------|
| Email e senha              | Execução de contrato (Art. 7º, V) — necessário para autenticação |
| Transações e extratos      | Execução de contrato (Art. 7º, V) — é o serviço contratado      |
| Dados de uso (logs de acesso) | Legítimo interesse (Art. 7º, IX) — segurança e operação do serviço |
| Métricas de performance    | Legítimo interesse (Art. 7º, IX) — melhoria do serviço           |

O FinTrack **não** coleta dados para publicidade, não compartilha dados com
terceiros para fins comerciais e não realiza profiling para fins além do
serviço contratado.

---

## Direitos do titular dos dados

A LGPD garante ao usuário os seguintes direitos (Art. 18), todos implementados:

### 1. Direito de acesso — `GET /me/data`

O usuário pode baixar todos os seus dados em formato JSON ou CSV:

```typescript
// src/modules/privacy/privacy.routes.ts

app.get('/me/data', { onRequest: [authenticate] }, async (request, reply) => {
  const userId = request.user.sub

  const [user, accounts, categories, transactions, rules, imports] = await Promise.all([
    db.select().from(users).where(eq(users.id, userId)),
    db.select().from(accounts).where(eq(accounts.userId, userId)),
    db.select().from(categories).where(eq(categories.userId, userId)),
    db.select().from(transactions).where(eq(transactions.userId, userId)),
    db.select().from(categorizationRules).where(eq(categorizationRules.userId, userId)),
    db.select().from(importJobs).where(eq(importJobs.userId, userId)),
  ])

  const export = {
    exportedAt:  new Date().toISOString(),
    user:        user[0],
    accounts,
    categories,
    transactions,
    rules,
    imports,
  }

  reply
    .header('Content-Disposition', 'attachment; filename="meus-dados-fintrack.json"')
    .send(export)
})
```

### 2. Direito de exclusão — `DELETE /me`

O usuário pode excluir permanentemente sua conta e todos os dados associados.
O `ON DELETE CASCADE` nas foreign keys garante exclusão em cascata de todos
os dados relacionados.

```typescript
app.delete('/me', { onRequest: [authenticate] }, async (request, reply) => {
  const userId = request.user.sub

  // Confirmação obrigatória (senha atual)
  const { password } = DeleteAccountSchema.parse(request.body)
  await authService.verifyPassword(userId, password)

  // Exclusão em cascata via FK (accounts → transactions, etc.)
  await db.delete(users).where(eq(users.id, userId))

  // Invalida todos os tokens do usuário
  await db.delete(refreshTokens).where(eq(refreshTokens.userId, userId))
  await cache.delPattern(`*:${userId}:*`)

  reply.status(204).send()
})
```

**Retenção após exclusão:** dados são permanentemente removidos do banco
principal imediatamente. Backups do RDS retêm os dados por mais 7 dias
(período de retenção de backup) antes da exclusão definitiva. O usuário
é informado disso na tela de exclusão de conta.

### 3. Direito de retificação — endpoints de edição existentes

O usuário pode editar qualquer dado pessoal (nome, email) e qualquer
transação através dos endpoints padrão de edição da aplicação.

### 4. Direito de portabilidade — `GET /me/data`

O endpoint de exportação de dados (item 1) atende também ao direito de
portabilidade — os dados são exportados em formato JSON estruturado
e legível por máquina.

---

## Minimização de dados coletados

A LGPD exige coletar apenas dados necessários para a finalidade declarada.
O FinTrack não coleta:

- ❌ Número de documentos (CPF, RG) — não necessário para o serviço.
- ❌ Data de nascimento — não necessário para o serviço.
- ❌ Localização geográfica — não necessário para o serviço.
- ❌ Dados do dispositivo além do IP para rate limiting.
- ❌ Cookies de rastreamento ou analytics de terceiros.

---

## Política de retenção de dados

| Dado                      | Retenção                                          | Motivo                        |
|---------------------------|---------------------------------------------------|-------------------------------|
| Dados da conta (usuário)  | Enquanto a conta existir + 7 dias (backup RDS)    | Operação do serviço           |
| Transações e extratos     | Enquanto a conta existir + 7 dias (backup RDS)    | Operação do serviço           |
| Logs de acesso (Pino)     | 30 dias em produção                               | Segurança e debugging         |
| Métricas Prometheus       | 15 dias (retenção padrão)                         | Monitoramento operacional     |
| Arquivos de upload (CSV/OFX) | Excluídos após processamento bem-sucedido do job | Minimização de dados       |

### Exclusão automática de arquivos de upload

```typescript
// src/worker/processors/import.processor.ts

// Após processamento bem-sucedido, exclui o arquivo do disco
async function cleanup(filePath: string) {
  try {
    await fs.unlink(filePath)
    logger.info({ filePath }, 'Import file deleted after processing')
  } catch (error) {
    logger.warn({ filePath, error }, 'Failed to delete import file — manual cleanup may be needed')
  }
}
```

---

## Logs e dados pessoais

Logs são dados operacionais — não devem conter dados pessoais além do
mínimo necessário para rastrear um incidente.

### O que pode estar em logs

```typescript
// ✅ OK — ID anônimo, sem dados pessoais
logger.info({ userId: 'abc-123', jobId: 'xyz-456' }, 'Import job completed')

// ✅ OK — ação e resultado, sem conteúdo pessoal
logger.info({ userId, transactionCount: 47 }, 'Transactions imported')

// ❌ Não — dados financeiros em logs
logger.info({ userId, amount: 1500, description: 'Salário empresa X' }, 'Transaction created')

// ❌ Não — email ou nome em logs
logger.info({ email: 'joao@email.com' }, 'User logged in')  // use userId
```

### Configuração de redact no Pino

```typescript
const logger = pino({
  redact: {
    paths: [
      'req.body.password',
      'req.body.email',          // não logar email nas requisições
      'req.body.description',    // descrição de transação pode conter dados sensíveis
      'req.headers.authorization',
      '*.amount',                // valores financeiros não vão para logs
    ],
    censor: '[DADOS_PESSOAIS]'
  }
})
```

---

## Aviso de privacidade (Privacy Notice)

O usuário deve ser informado sobre o tratamento de dados **antes** de
se cadastrar. A tela de registro inclui link para a Política de Privacidade
e exige confirmação de leitura:

```tsx
// src/pages/auth/RegisterPage.tsx

<label className="flex items-start gap-2">
  <input
    type="checkbox"
    required
    aria-required="true"
    {...register('privacyAccepted', { required: 'Você precisa aceitar a Política de Privacidade' })}
  />
  <span>
    Li e concordo com a{' '}
    <a href="/privacy" target="_blank" rel="noopener noreferrer">
      Política de Privacidade
    </a>
    {' '}e os{' '}
    <a href="/terms" target="_blank" rel="noopener noreferrer">
      Termos de Uso
    </a>
  </span>
</label>
```

A data e hora de aceite é registrada no banco:

```sql
ALTER TABLE users ADD COLUMN privacy_accepted_at TIMESTAMPTZ;
```

---

## Incidentes de segurança (Data Breach)

A LGPD exige notificação à ANPD e aos titulares afetados em caso de
incidente de segurança que possa acarretar risco relevante aos titulares.

### Procedimento interno

1. **Detecção:** monitoramento Grafana detecta acesso anômalo ou vazamento.
2. **Contenção imediata:** invalidar todos os tokens JWT ativos; rotacionar
   credenciais comprometidas; isolar o serviço afetado.
3. **Avaliação:** determinar quais dados foram expostos, quantos usuários
   afetados e qual a janela de exposição.
4. **Notificação ANPD:** em até 72 horas após a confirmação do incidente
   (conforme Resolução CD/ANPD nº 02/2022).
5. **Notificação aos usuários:** email para todos os usuários afetados
   descrevendo o incidente, os dados envolvidos e as ações tomadas.
6. **Post-mortem:** documentar o incidente, a causa raiz e as correções
   implementadas.

---

## Checklist de conformidade LGPD

- [ ] Base legal documentada para cada tipo de dado coletado.
- [ ] Política de Privacidade disponível e atualizada.
- [ ] Aceite explícito no cadastro com registro de data/hora.
- [ ] Endpoint de exportação de dados funcional (`GET /me/data`).
- [ ] Endpoint de exclusão de conta funcional (`DELETE /me`).
- [ ] Logs sem dados pessoais além do ID do usuário.
- [ ] Arquivos de upload excluídos após processamento.
- [ ] Política de retenção de backups documentada e implementada.
- [ ] Procedimento de resposta a incidentes documentado.
- [ ] DPO (Data Protection Officer) designado ou justificativa de dispensa.
