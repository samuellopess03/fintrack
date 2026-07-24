# SPEC-10 — Segurança

## Filosofia

Segurança não é uma feature adicionada no fim — é uma propriedade que
precisa ser considerada em cada camada do sistema desde o início. O FinTrack
lida com dados financeiros pessoais: extratos bancários, saldos, hábitos de
gasto. Uma vulnerabilidade nesse contexto não é apenas um bug técnico — é
uma violação de confiança do usuário.

Este documento cobre as ameaças relevantes para o perfil do projeto e as
contramedidas aplicadas em cada camada.

---

## Modelo de ameaças (Threat Model)

Antes de definir contramedidas, é necessário identificar o que se está
protegendo e de quem.

### Ativos a proteger
- Dados financeiros dos usuários (transações, saldos, extratos).
- Credenciais de acesso (email, senha, tokens JWT).
- Infraestrutura (banco de dados, servidores, filas).

### Superfícies de ataque
- API REST exposta na internet.
- Formulários e inputs do frontend.
- Arquivos CSV/OFX enviados pelo usuário.
- Variáveis de ambiente e secrets em CI/CD.
- Dependências de terceiros (supply chain).

### Adversários considerados
- **Atacante externo não autenticado:** tenta acessar dados de outros usuários,
  derrubar o serviço ou injetar dados maliciosos.
- **Usuário autenticado mal-intencionado:** tenta acessar dados de outros usuários
  explorando falhas de autorização.
- **Atacante via supply chain:** dependência comprometida que executa código malicioso.

---

## Camada 1 — Autenticação

### JWT com rotação de refresh token

O sistema usa dois tokens com ciclos de vida distintos:

```
Access Token:   duração curta (24 horas)  — enviado em toda request
Refresh Token:  duração longa  (7 dias)     — usado apenas para renovar o access token
```

O access token de curta duração limita a janela de exploração em caso de vazamento.
O refresh token é armazenado em cookie `HttpOnly` + `Secure` + `SameSite=Strict`
— inacessível ao JavaScript da página, protegendo contra XSS.

```typescript
// src/modules/auth/auth.service.ts

function generateTokens(userId: string) {
  const accessToken = jwt.sign(
    { sub: userId, type: 'access' },
    env.JWT_SECRET,
    { expiresIn: '24h', algorithm: 'HS256' }
  )

  const refreshToken = jwt.sign(
    { sub: userId, type: 'refresh', nonce: crypto.randomUUID() },
    env.JWT_SECRET,
    { expiresIn: '7d', algorithm: 'HS256' }
  )

  return { accessToken, refreshToken }
}
```

### Armazenamento de senhas com bcrypt

Senhas nunca são armazenadas em texto puro ou com hash reversível.
O bcrypt aplica um work factor de custo 12 — suficientemente lento para
dificultar brute force, suficientemente rápido para não impactar o login.

```typescript
import bcrypt from 'bcryptjs'

const BCRYPT_ROUNDS = 12

async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_ROUNDS)
}

async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash)
}
```

### Política de senha

Validada via Zod no registro e na alteração de senha:

```typescript
const passwordSchema = z.string()
  .min(8,  'Senha deve ter no mínimo 8 caracteres')
  .regex(/[A-Z]/, 'Senha deve conter ao menos uma letra maiúscula')
  .regex(/[0-9]/, 'Senha deve conter ao menos um número')
  .max(128, 'Senha muito longa')
```

### Invalidação de refresh token (logout)

Refresh tokens são armazenados por hash e marcados como revogados quando o
usuário faz logout. Mesmo que o JWT ainda não tenha expirado, o token deixa
de ser aceito porque o hash correspondente passa a estar revogado.

```sql
CREATE TABLE refresh_tokens (
  id          UUID PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  TEXT NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL,
  revoked_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_refresh_tokens_user_id ON refresh_tokens(user_id);
```

---

## Camada 2 — Autorização

### Verificação de ownership em toda operação

Toda query que acessa um recurso do usuário inclui `userId` como condição
explícita. É impossível acessar dados de outro usuário por manipulação de ID.

```typescript
// CORRETO — sempre filtra pelo userId do token JWT
async getTransaction(userId: string, transactionId: string) {
  const [tx] = await db
    .select()
    .from(transactions)
    .where(and(
      eq(transactions.id, userId),       // ← verifica ownership
      eq(transactions.id, transactionId)
    ))

  if (!tx) throw new NotFoundError('Transaction')
  return tx
}

// ERRADO — vulnerável a IDOR (Insecure Direct Object Reference)
async getTransaction(transactionId: string) {
  return db.select().from(transactions).where(eq(transactions.id, transactionId))
  // ↑ qualquer usuário autenticado pode ver qualquer transação
}
```

### IDOR (Insecure Direct Object Reference) — prevenção sistemática

IDOR é a vulnerabilidade mais comum em APIs REST: o atacante substitui o ID
de um recurso na URL por um ID de outro usuário. A contramedida é sempre
incluir `user_id` na query — nunca confiar apenas no ID do recurso.

Todos os services do FinTrack recebem `userId` extraído do JWT (nunca do
body da request) como primeiro parâmetro de qualquer operação:

```typescript
// O userId vem do token JWT decodificado — não pode ser forjado pelo cliente
app.get('/transactions/:id', async (request) => {
  const userId = request.user.sub  // extraído do JWT pelo plugin de auth
  const { id }  = request.params

  return transactionsService.getById(userId, id)  // userId sempre incluído
})
```

---

## Camada 3 — Proteção de inputs

### Rate limiting

```typescript
// src/shared/plugins/rate-limit.plugin.ts
import rateLimit from '@fastify/rate-limit'

await app.register(rateLimit, {
  max:         60,           // 60 requisições
  timeWindow:  '1 minute',  // por minuto
  keyGenerator: (req) => req.ip,

  // Endpoints sensíveis têm limite mais restrito
  // Configurado por rota com override
})

// Override para endpoints de auth (mais restritivo)
app.post('/auth/login', {
  config: { rateLimit: { max: 10, timeWindow: '15 minutes' } }
}, loginHandler)

app.post('/auth/register', {
  config: { rateLimit: { max: 5, timeWindow: '1 hour' } }
}, registerHandler)
```

### Validação e sanitização de inputs com Zod

Todo input que chega na API passa por um schema Zod antes de qualquer
processamento. Campos de texto têm tamanho máximo definido; números têm
intervalos válidos; datas são validadas como ISO strings.

```typescript
const CreateTransactionSchema = z.object({
  description: z.string().min(1).max(255).trim(),
  amount:      z.number().positive().max(999_999_999.99),
  date:        z.string().date(),  // YYYY-MM-DD — rejeita datas inválidas
  type:        z.enum(['income', 'expense']),
  accountId:   z.string().uuid(),
  categoryId:  z.string().uuid().optional(),
  notes:       z.string().max(1000).trim().optional(),
})
```

### Validação de arquivos de upload

Upload de extrato tem múltiplas camadas de validação:

```typescript
// 1. Tamanho máximo: 10MB (configurado no Fastify)
await app.register(multipart, {
  limits: { fileSize: 10 * 1024 * 1024 }
})

// 2. Extensão permitida
const allowedExtensions = ['.csv', '.ofx']
const ext = path.extname(file.filename).toLowerCase()
if (!allowedExtensions.includes(ext)) {
  throw new ValidationError('Formato de arquivo não suportado')
}

// 3. MIME type verificado (não apenas a extensão)
const allowedMimeTypes = ['text/csv', 'application/vnd.ofx', 'text/plain']
if (!allowedMimeTypes.includes(file.mimetype)) {
  throw new ValidationError('Tipo de arquivo inválido')
}

// 4. Arquivo salvo fora do diretório público (nunca em /public)
const safeName = `${crypto.randomUUID()}${ext}`
const filePath = path.join(env.UPLOAD_DIR, userId, safeName)
// ↑ nome aleatório impede path traversal e sobrescrita
```

### SQL Injection — prevenção via Drizzle

O Drizzle usa queries parametrizadas por padrão — valores nunca são
interpolados em strings SQL. SQL injection é estruturalmente impossível
com Drizzle, desde que `sql` template literals sejam usados corretamente
para queries dinâmicas:

```typescript
// SEGURO — Drizzle parametriza automaticamente
db.select().from(transactions).where(eq(transactions.description, userInput))

// SEGURO — sql template literal com parâmetros
sql`SELECT * FROM transactions WHERE description = ${userInput}`

// INSEGURO — interpolação manual (nunca faça isso)
sql.raw(`SELECT * FROM transactions WHERE description = '${userInput}'`)
```

---

## Camada 4 — Proteção HTTP

### Headers de segurança com @fastify/helmet

```typescript
await app.register(helmet, {
  contentSecurityPolicy: {
    directives: {
      defaultSrc:  ["'self'"],
      scriptSrc:   ["'self'"],
      styleSrc:    ["'self'", "'unsafe-inline'"],  // necessário para CSS-in-JS
      imgSrc:      ["'self'", 'data:'],
      connectSrc:  ["'self'"],
      fontSrc:     ["'self'"],
      objectSrc:   ["'none'"],
      upgradeInsecureRequests: [],
    }
  },
  crossOriginEmbedderPolicy: false,  // necessário para alguns recursos
})
```

Headers aplicados automaticamente:
- `X-Content-Type-Options: nosniff` — impede MIME sniffing.
- `X-Frame-Options: DENY` — impede clickjacking via iframe.
- `Strict-Transport-Security` — força HTTPS após primeiro acesso.
- `X-XSS-Protection: 0` — desativa o filtro XSS do browser (depreciado e perigoso).

### CORS configurado explicitamente

```typescript
await app.register(cors, {
  origin:      env.ALLOWED_ORIGINS.split(','),  // ex: 'https://fintrack.app'
  methods:     ['GET', 'POST', 'PATCH', 'DELETE'],
  credentials: true,   // necessário para cookies de refresh token
  maxAge:      86400,  // cache do preflight por 24h
})
```

Em desenvolvimento: `origin: 'http://localhost:5173'`.
Em produção: apenas o domínio real do frontend.

### Proteção contra XSS no frontend

O React escapa automaticamente o conteúdo renderizado via JSX — valores
de usuário inseridos como `{value}` nunca são interpretados como HTML.
`dangerouslySetInnerHTML` é proibido no projeto (regra ESLint: `react/no-danger`).

---

## Camada 5 — Segurança de dados

### Dados sensíveis nunca em logs

```typescript
// Plugin Pino com redação de campos sensíveis
const pinoConfig = {
  redact: {
    paths: [
      'req.headers.authorization',  // token JWT
      'req.body.password',           // senha em texto puro
      'req.body.passwordHash',
    ],
    censor: '[REDACTED]'
  }
}
```

### Variáveis de ambiente sensíveis via Secret Manager

Em produção, segredos (`JWT_SECRET`, `DATABASE_URL`, senhas) são armazenados
no AWS SSM Parameter Store com criptografia em repouso, nunca como variáveis
de ambiente em texto puro no container ou no repositório.

### Criptografia em trânsito

Toda comunicação entre cliente e servidor é via HTTPS — configurado no
load balancer (ALB) com certificado gerenciado pelo AWS Certificate Manager.
A comunicação interna entre containers (API ↔ PostgreSQL, API ↔ Redis,
API ↔ RabbitMQ) ocorre dentro da VPC privada, sem exposição à internet.

---

## Camada 6 — Segurança de dependências

### Auditoria automática no CI

```yaml
# .github/workflows/ci.yml
- name: Audit dependencies
  run: npm audit --audit-level=high
  working-directory: backend
```

O pipeline falha se houver vulnerabilidades de severidade `high` ou `critical`
em qualquer dependência.

### Dependabot para atualizações automáticas

```yaml
# .github/dependabot.yml
version: 2
updates:
  - package-ecosystem: npm
    directory: /backend
    schedule: { interval: weekly }
    groups:
      production-dependencies:
        dependency-type: production

  - package-ecosystem: npm
    directory: /frontend
    schedule: { interval: weekly }

  - package-ecosystem: docker
    directory: /
    schedule: { interval: weekly }

  - package-ecosystem: terraform
    directory: /infra/terraform
    schedule: { interval: monthly }
```

---

## Checklist de segurança por ambiente

### Desenvolvimento
- [ ] `.env` listado no `.gitignore` e nunca commitado.
- [ ] `JWT_SECRET` com mínimo 32 caracteres mesmo em dev.
- [ ] Banco de dados não exposto na internet (apenas localhost via Docker).

### Pull Request
- [ ] `npm audit` passa sem vulnerabilidades high/critical.
- [ ] Nenhuma variável de ambiente hardcoded no código.
- [ ] Nenhum `console.log` com dados de usuário.
- [ ] Toda nova rota tem verificação de `userId` no service.

### Produção
- [ ] HTTPS obrigatório com HSTS habilitado.
- [ ] Secrets no SSM Parameter Store, não em variáveis de ambiente de texto puro.
- [ ] Rate limiting ativo com limites mais restritivos que em dev.
- [ ] Logs com redação de campos sensíveis confirmada.
- [ ] Backup automático do banco habilitado (7 dias no RDS).
- [ ] `deletion_protection = true` no RDS via Terraform.
