# SPEC-09 — Infraestrutura

## Visão geral

A infraestrutura do FinTrack é organizada em três camadas:

1. **Desenvolvimento local** — Docker Compose orquestra todos os serviços.
2. **CI/CD** — GitHub Actions executa lint, testes e build a cada push.
3. **Provisionamento de cloud** — Terraform define a infraestrutura como código.

---

## Estrutura de pastas

```
infra/
├── docker/
│   ├── api.Dockerfile
│   ├── worker.Dockerfile
│   └── frontend.Dockerfile
│
├── prometheus/
│   └── prometheus.yml
│
├── grafana/
│   ├── provisioning/
│   │   ├── datasources/prometheus.yml
│   │   └── dashboards/fintrack.json
│   └── dashboards/
│
├── terraform/
│   ├── main.tf
│   ├── variables.tf
│   ├── outputs.tf
│   └── modules/
│       ├── networking/
│       ├── compute/
│       └── database/
│
docker-compose.yml
docker-compose.test.yml
.env.example
```

---

## Docker — Dockerfiles

### API (`infra/docker/api.Dockerfile`)

```dockerfile
# ── Stage 1: dependências ──────────────────────────────────────
FROM node:20-alpine AS deps
WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

# ── Stage 2: build TypeScript ──────────────────────────────────
FROM node:20-alpine AS build
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build          # tsc → dist/
RUN npm run db:migrate     # aplica migrations pendentes (apenas em prod)

# ── Stage 3: imagem final (mínima) ─────────────────────────────
FROM node:20-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production

# Apenas o necessário para rodar
COPY --from=deps   /app/node_modules ./node_modules
COPY --from=build  /app/dist         ./dist
COPY --from=build  /app/package.json ./

# Usuário não-root por segurança
RUN addgroup -S fintrack && adduser -S fintrack -G fintrack
USER fintrack

EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1

CMD ["node", "dist/server.js"]
```

### Worker (`infra/docker/worker.Dockerfile`)

Idêntico ao da API, mas o `CMD` aponta para o entrypoint do worker:

```dockerfile
# ... (mesmo multi-stage que a API) ...
CMD ["node", "dist/worker/worker.js"]
```

### Frontend (`infra/docker/frontend.Dockerfile`)

```dockerfile
# ── Stage 1: build Vite ────────────────────────────────────────
FROM node:20-alpine AS build
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
ARG VITE_API_URL
RUN npm run build   # vite build → dist/

# ── Stage 2: servir com Nginx ──────────────────────────────────
FROM nginx:alpine AS runtime

COPY --from=build /app/dist /usr/share/nginx/html
COPY infra/docker/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
```

```nginx
# infra/docker/nginx.conf — SPA routing
server {
  listen 80;
  root /usr/share/nginx/html;
  index index.html;

  # Rota todas as URLs para index.html (necessário para React Router)
  location / {
    try_files $uri $uri/ /index.html;
  }

  # Cache de assets com hash no nome (imutáveis)
  location ~* \.(js|css|png|jpg|svg|ico)$ {
    expires 1y;
    add_header Cache-Control "public, immutable";
  }
}
```

---

## Docker Compose — Desenvolvimento local

```yaml
# docker-compose.yml
name: fintrack

services:

  # ── Banco de dados ─────────────────────────────────────────────
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB:       fintrack
      POSTGRES_USER:     fintrack
      POSTGRES_PASSWORD: fintrack
    volumes:
      - postgres_data:/var/lib/postgresql/data
    ports:
      - "5432:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U fintrack"]
      interval: 5s
      timeout: 5s
      retries: 5

  # ── Cache ──────────────────────────────────────────────────────
  redis:
    image: redis:7-alpine
    command: redis-server --appendonly yes
    volumes:
      - redis_data:/data
    ports:
      - "6379:6379"
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s

  # ── Message broker ─────────────────────────────────────────────
  rabbitmq:
    image: rabbitmq:3-management-alpine
    environment:
      RABBITMQ_DEFAULT_USER: fintrack
      RABBITMQ_DEFAULT_PASS: fintrack
    ports:
      - "5672:5672"    # AMQP
      - "15672:15672"  # Management UI
    volumes:
      - rabbitmq_data:/var/lib/rabbitmq
    healthcheck:
      test: ["CMD", "rabbitmq-diagnostics", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5

  # ── API Backend ────────────────────────────────────────────────
  api:
    build:
      context: ./backend
      dockerfile: ../infra/docker/api.Dockerfile
      target: build   # usa o stage de build em dev (com devDeps + ts-node)
    environment:
      NODE_ENV:       development
      DATABASE_URL:   postgres://fintrack:fintrack@postgres:5432/fintrack
      REDIS_URL:      redis://redis:6379
      RABBITMQ_URL:   amqp://fintrack:fintrack@rabbitmq:5672
      JWT_SECRET:     dev-secret-32-characters-minimum!!
      UPLOAD_DIR:     /app/uploads
    volumes:
      - ./backend/src:/app/src   # hot reload em desenvolvimento
      - uploads_data:/app/uploads
    ports:
      - "3000:3000"
    depends_on:
      postgres:  { condition: service_healthy }
      redis:     { condition: service_healthy }
      rabbitmq:  { condition: service_healthy }

  # ── Worker ─────────────────────────────────────────────────────
  worker:
    build:
      context: ./backend
      dockerfile: ../infra/docker/worker.Dockerfile
      target: build
    environment:
      NODE_ENV:     development
      DATABASE_URL: postgres://fintrack:fintrack@postgres:5432/fintrack
      REDIS_URL:    redis://redis:6379
      RABBITMQ_URL: amqp://fintrack:fintrack@rabbitmq:5672
      UPLOAD_DIR:   /app/uploads
    volumes:
      - ./backend/src:/app/src
      - uploads_data:/app/uploads
    depends_on:
      postgres:  { condition: service_healthy }
      rabbitmq:  { condition: service_healthy }

  # ── Frontend ───────────────────────────────────────────────────
  frontend:
    build:
      context: ./frontend
      dockerfile: ../infra/docker/frontend.Dockerfile
      target: build
    environment:
      VITE_API_URL: http://localhost:3000
    volumes:
      - ./frontend/src:/app/src
    ports:
      - "5173:5173"
    depends_on:
      - api

  # ── Observabilidade ────────────────────────────────────────────
  prometheus:
    image: prom/prometheus:latest
    volumes:
      - ./backend/infra/prometheus/prometheus.yml:/etc/prometheus/prometheus.yml
    ports:
      - "9090:9090"
    depends_on:
      - api

  grafana:
    image: grafana/grafana:latest
    environment:
      GF_SECURITY_ADMIN_PASSWORD: admin
      GF_USERS_ALLOW_SIGN_UP:     false
    volumes:
      - ./backend/infra/grafana/provisioning:/etc/grafana/provisioning
      - grafana_data:/var/lib/grafana
    ports:
      - "3001:3000"
    depends_on:
      - prometheus

volumes:
  postgres_data:
  redis_data:
  rabbitmq_data:
  uploads_data:
  grafana_data:
```

### Docker Compose para testes de integração

```yaml
# docker-compose.test.yml
# Sobe apenas os serviços necessários para testes de integração
# Uso: docker compose -f docker-compose.test.yml up -d

name: fintrack-test

services:
  postgres-test:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB:       fintrack_test
      POSTGRES_USER:     fintrack
      POSTGRES_PASSWORD: fintrack
    ports:
      - "5433:5432"  # porta diferente para não conflitar com dev
    tmpfs:
      - /var/lib/postgresql/data  # banco em memória — mais rápido

  redis-test:
    image: redis:7-alpine
    ports:
      - "6380:6379"
```

---

## CI/CD — GitHub Actions

### Pipeline principal (`.github/workflows/ci.yml`)

```yaml
name: CI

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:

  # ── Qualidade de código ───────────────────────────────────────
  lint:
    name: Lint & Type Check
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
          cache-dependency-path: backend/package-lock.json

      - run: npm ci
        working-directory: backend

      - run: npm run lint          # ESLint
        working-directory: backend

      - run: npm run typecheck     # tsc --noEmit (sem compilar)
        working-directory: backend

  # ── Testes unitários ──────────────────────────────────────────
  test-unit:
    name: Unit Tests
    runs-on: ubuntu-latest
    needs: lint
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20', cache: 'npm', cache-dependency-path: backend/package-lock.json }

      - run: npm ci
        working-directory: backend

      - run: npm run test:unit -- --coverage
        working-directory: backend

      - uses: codecov/codecov-action@v4
        with:
          directory: backend/coverage

  # ── Testes de integração ──────────────────────────────────────
  test-integration:
    name: Integration Tests
    runs-on: ubuntu-latest
    needs: lint

    services:
      postgres:
        image: postgres:16-alpine
        env:
          POSTGRES_DB:       fintrack_test
          POSTGRES_USER:     fintrack
          POSTGRES_PASSWORD: fintrack
        ports: ['5432:5432']
        options: >-
          --health-cmd pg_isready
          --health-interval 5s
          --health-timeout 5s
          --health-retries 5

      redis:
        image: redis:7-alpine
        ports: ['6379:6379']

    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20', cache: 'npm', cache-dependency-path: backend/package-lock.json }

      - run: npm ci
        working-directory: backend

      - name: Run migrations on test DB
        run: npm run db:migrate
        working-directory: backend
        env:
          DATABASE_URL: postgres://fintrack:fintrack@localhost:5432/fintrack_test

      - run: npm run test:integration
        working-directory: backend
        env:
          TEST_DATABASE_URL: postgres://fintrack:fintrack@localhost:5432/fintrack_test
          REDIS_URL:         redis://localhost:6379

  # ── Build das imagens Docker ───────────────────────────────────
  build:
    name: Build Docker Images
    runs-on: ubuntu-latest
    needs: [test-unit, test-integration]
    if: github.ref == 'refs/heads/main'

    steps:
      - uses: actions/checkout@v4

      - name: Log in to GitHub Container Registry
        uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Build and push API image
        uses: docker/build-push-action@v5
        with:
          context: ./backend
          file: ./infra/docker/api.Dockerfile
          push: true
          tags: ghcr.io/${{ github.repository }}/api:${{ github.sha }}

      - name: Build and push Worker image
        uses: docker/build-push-action@v5
        with:
          context: ./backend
          file: ./infra/docker/worker.Dockerfile
          push: true
          tags: ghcr.io/${{ github.repository }}/worker:${{ github.sha }}

      - name: Build and push Frontend image
        uses: docker/build-push-action@v5
        with:
          context: ./frontend
          file: ./infra/docker/frontend.Dockerfile
          push: true
          build-args: VITE_API_URL=${{ vars.API_URL }}
          tags: ghcr.io/${{ github.repository }}/frontend:${{ github.sha }}
```

### Pipeline de deploy (`.github/workflows/deploy.yml`)

```yaml
name: Deploy

on:
  workflow_run:
    workflows: [CI]
    types: [completed]
    branches: [main]

jobs:
  deploy:
    name: Deploy to Production
    runs-on: ubuntu-latest
    if: ${{ github.event.workflow_run.conclusion == 'success' }}
    environment: production

    steps:
      - uses: actions/checkout@v4

      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          aws-access-key-id:     ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region:            us-east-1

      - name: Deploy via Terraform
        run: |
          cd infra/terraform
          terraform init
          terraform apply -auto-approve \
            -var="api_image_tag=${{ github.sha }}" \
            -var="worker_image_tag=${{ github.sha }}" \
            -var="frontend_image_tag=${{ github.sha }}"
        env:
          TF_VAR_db_password: ${{ secrets.DB_PASSWORD }}
          TF_VAR_jwt_secret:  ${{ secrets.JWT_SECRET }}
```

---

## Terraform — Infraestrutura como código

O Terraform provisiona a infraestrutura na AWS. Cada componente é um módulo
separado para facilitar reutilização e isolamento.

### Organização

```hcl
# infra/terraform/main.tf

terraform {
  required_version = ">= 1.6"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  # Estado remoto — evita conflitos quando múltiplas pessoas aplicam
  backend "s3" {
    bucket         = "fintrack-terraform-state"
    key            = "production/terraform.tfstate"
    region         = "us-east-1"
    encrypt        = true
    dynamodb_table = "fintrack-terraform-locks"
  }
}

provider "aws" {
  region = var.aws_region
}

module "networking" {
  source = "./modules/networking"
  env    = var.env
}

module "database" {
  source             = "./modules/database"
  env                = var.env
  vpc_id             = module.networking.vpc_id
  private_subnet_ids = module.networking.private_subnet_ids
  db_password        = var.db_password
}

module "compute" {
  source             = "./modules/compute"
  env                = var.env
  vpc_id             = module.networking.vpc_id
  public_subnet_ids  = module.networking.public_subnet_ids
  private_subnet_ids = module.networking.private_subnet_ids
  database_url       = module.database.connection_url
  api_image_tag      = var.api_image_tag
  worker_image_tag   = var.worker_image_tag
  frontend_image_tag = var.frontend_image_tag
  jwt_secret         = var.jwt_secret
}
```

### Módulo de rede (`modules/networking/`)

```hcl
# modules/networking/main.tf

resource "aws_vpc" "main" {
  cidr_block           = "10.0.0.0/16"
  enable_dns_hostnames = true
  tags = { Name = "fintrack-${var.env}" }
}

resource "aws_subnet" "public" {
  count             = 2
  vpc_id            = aws_vpc.main.id
  cidr_block        = "10.0.${count.index}.0/24"
  availability_zone = data.aws_availability_zones.available.names[count.index]
  map_public_ip_on_launch = true
  tags = { Name = "fintrack-public-${count.index}-${var.env}" }
}

resource "aws_subnet" "private" {
  count             = 2
  vpc_id            = aws_vpc.main.id
  cidr_block        = "10.0.${count.index + 10}.0/24"
  availability_zone = data.aws_availability_zones.available.names[count.index]
  tags = { Name = "fintrack-private-${count.index}-${var.env}" }
}

resource "aws_internet_gateway" "main" {
  vpc_id = aws_vpc.main.id
}
```

### Módulo de banco de dados (`modules/database/`)

```hcl
# modules/database/main.tf

# RDS PostgreSQL — banco gerenciado
resource "aws_db_instance" "postgres" {
  identifier        = "fintrack-${var.env}"
  engine            = "postgres"
  engine_version    = "16"
  instance_class    = "db.t3.micro"
  allocated_storage = 20

  db_name  = "fintrack"
  username = "fintrack"
  password = var.db_password

  vpc_security_group_ids = [aws_security_group.postgres.id]
  db_subnet_group_name   = aws_db_subnet_group.main.name

  backup_retention_period = 7       # 7 dias de backup automático
  skip_final_snapshot     = false   # snapshot antes de destruir
  deletion_protection     = true    # proteção contra delete acidental

  tags = { Name = "fintrack-postgres-${var.env}" }
}

# ElastiCache Redis
resource "aws_elasticache_cluster" "redis" {
  cluster_id      = "fintrack-${var.env}"
  engine          = "redis"
  node_type       = "cache.t3.micro"
  num_cache_nodes = 1
  port            = 6379

  subnet_group_name  = aws_elasticache_subnet_group.main.name
  security_group_ids = [aws_security_group.redis.id]
}
```

### Módulo de compute (`modules/compute/`)

```hcl
# modules/compute/main.tf

# ECS Cluster — orquestra os containers
resource "aws_ecs_cluster" "main" {
  name = "fintrack-${var.env}"
}

# Task Definition da API
resource "aws_ecs_task_definition" "api" {
  family                   = "fintrack-api-${var.env}"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = "256"
  memory                   = "512"

  container_definitions = jsonencode([{
    name  = "api"
    image = "ghcr.io/fintrack/api:${var.api_image_tag}"
    portMappings = [{ containerPort = 3000, protocol = "tcp" }]
    environment = [
      { name = "NODE_ENV",     value = "production" },
      { name = "DATABASE_URL", value = var.database_url },
    ]
    secrets = [
      { name = "JWT_SECRET", valueFrom = aws_ssm_parameter.jwt_secret.arn }
    ]
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        "awslogs-group"  = "/ecs/fintrack-api"
        "awslogs-region" = var.aws_region
      }
    }
  }])
}

# Serviço ECS da API com Auto Scaling
resource "aws_ecs_service" "api" {
  name            = "fintrack-api"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.api.arn
  desired_count   = 2   # 2 instâncias por padrão
  launch_type     = "FARGATE"

  network_configuration {
    subnets         = var.private_subnet_ids
    security_groups = [aws_security_group.api.id]
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.api.arn
    container_name   = "api"
    container_port   = 3000
  }
}

# Application Load Balancer
resource "aws_lb" "main" {
  name               = "fintrack-${var.env}"
  internal           = false
  load_balancer_type = "application"
  subnets            = var.public_subnet_ids
  security_groups    = [aws_security_group.alb.id]
}
```

---

## Variáveis e secrets

```hcl
# infra/terraform/variables.tf

variable "env"              { default = "production" }
variable "aws_region"       { default = "us-east-1" }
variable "db_password"      { sensitive = true }
variable "jwt_secret"       { sensitive = true }
variable "api_image_tag"    {}
variable "worker_image_tag" {}
variable "frontend_image_tag" {}
```

Variáveis sensíveis (`db_password`, `jwt_secret`) são passadas via:
- **CI/CD:** GitHub Actions Secrets (`${{ secrets.DB_PASSWORD }}`).
- **Runtime:** AWS SSM Parameter Store (referenciado na task definition ECS).
- **Local:** arquivo `.env` (nunca commitado — listado no `.gitignore`).

---

## Comandos úteis

```bash
# Subir ambiente de desenvolvimento completo
docker compose up -d

# Subir apenas os serviços de dados (sem API/Worker — para rodar local com ts-node)
docker compose up -d postgres redis rabbitmq

# Subir ambiente de testes de integração
docker compose -f docker-compose.test.yml up -d

# Aplicar migrations
npm run db:migrate --workspace=backend

# Inicializar Terraform (primeira vez)
cd infra/terraform && terraform init

# Ver o que o Terraform vai criar antes de aplicar
terraform plan

# Aplicar mudanças de infraestrutura
terraform apply

# Destruir toda a infraestrutura (cuidado!)
terraform destroy
```
