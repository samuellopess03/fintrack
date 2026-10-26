# Guia de contribuição — FinTrack

## Estrutura de artefatos

Antes de criar qualquer issue ou PR, entenda onde cada tipo de informação vive:

| Artefato | Onde | Responde a |
|---|---|---|
| SPEC | Wiki do repositório | O quê o sistema faz e como é estruturado |
| ADR | `docs/adrs/` | Por que cada decisão técnica foi tomada |
| Issue / PRD | GitHub Issues | O que construir agora e como verificar que está pronto |
| PR | GitHub Pull Requests | A prova de que o critério de aceite foi atendido |
| Tag / Release | Git tags + GitHub Releases | Um ponto estável e rastreável do sistema |

**Regra de ouro:** issues referenciam SPECs, não os duplicam. Se você se pegar copiando parágrafos de um SPEC para dentro de uma issue, está fazendo errado — coloque apenas a referência (`SPEC-05, seção Cache Warming`) e os critérios de aceite específicos daquela issue.

---

## Criando uma issue

### 1. Escolha o template correto

| Tipo | Quando usar |
|---|---|
| ✨ Feature | Nova funcionalidade descrita em um SPEC |
| 🐛 Bug | Comportamento diferente do especificado |
| 🔬 Spike | Precisa de pesquisa técnica antes de implementar |
| 🔧 Chore | Manutenção, refactor, dependências, infra |
| 🏛️ ADR | Decisão técnica nova que precisa ser avaliada |

### 2. Aplique os labels obrigatórios

Toda issue deve ter ao menos um label de cada categoria obrigatória:

```
[type: X] + [module: X] + [priority: X]
```

O label `[status: needs-spec]` é aplicado automaticamente pelos templates de feature e ADR — remova-o somente quando os critérios de aceite estiverem escritos e a issue estiver pronta para ser pega.

### 3. Associe ao milestone correto

Toda issue deve pertencer a um milestone de versão. Se não souber qual versão, use o milestone da próxima versão planejada ou deixe sem milestone até a priorização.

### 4. Escreva critérios de aceite verificáveis

O campo mais importante da issue de feature. Cada AC deve ser:

- **Verificável:** tem um resultado observável claro
- **Binário:** passa ou não passa — sem "quase"
- **Comportamental:** descreve o que acontece, não como implementar

```
❌ AC ruim:  "O cache deve funcionar corretamente"
✅ AC bom:   "GET /reports/monthly retorna em menos de 50ms quando o
              resultado está cacheado (verificado via header X-Cache: HIT)"

❌ AC ruim:  "Implementar a invalidação do cache"
✅ AC bom:   "Criar uma transação manual invalida o cache do relatório do
              mês correspondente — verificado ao chamar GET /reports/monthly
              imediatamente após o POST /transactions"
```

---

## Fluxo de trabalho de uma issue

```
Backlog
  │  issue criada mas sem ACs — status: needs-spec
  ▼
Especificado
  │  ACs escritos, sem bloqueios — status: ready
  ▼
Em progresso
  │  branch criada — status: in-progress
  ▼
Em revisão
  │  PR aberto — status: needs-review
  ▼
Concluído
    PR mergeado, issue fechada via "Closes #XX"
```

---

## Criando um Pull Request

### Nome da branch

Formato: `[type]/[issue-number]-[slug-descritivo]`

```bash
feature/42-keyset-pagination-transactions
fix/47-cache-not-invalidated-on-delete
chore/update-drizzle-0-30
docs/add-wiki-setup-guide
spike/55-open-finance-feasibility
```

### Mensagem de commit (Conventional Commits)

```
feat(transactions): implement keyset pagination on GET /transactions

Uses composite cursor (date, id) to avoid OFFSET performance issues.
Query validated with EXPLAIN ANALYZE to confirm Index Scan usage.

Closes #42
Refs: SPEC-02 (keyset pagination), ADR-011 (backend techniques)
```

**Tipos válidos:**

| Tipo | Quando usar |
|---|---|
| `feat` | Nova funcionalidade |
| `fix` | Correção de bug |
| `docs` | Documentação |
| `refactor` | Refactoring sem mudança de comportamento |
| `test` | Testes |
| `chore` | Manutenção, dependências, infra |
| `perf` | Melhoria de performance |
| `security` | Correção de vulnerabilidade |

**Escopos válidos:** `auth` · `accounts` · `transactions` · `imports` · `reports` · `rules` · `categories` · `worker` · `cache` · `db` · `frontend` · `infra` · `observability`

### Tamanho do PR

| Tamanho | Linhas alteradas | Ação |
|---|---|---|
| Ideal | < 200 linhas | Revisar diretamente |
| Aceitável | 200 – 400 linhas | Revisar com atenção extra |
| Grande | > 400 linhas | Dividir em PRs menores |

---

## Checklist de revisão de PR

### Segurança
- [ ] Toda nova rota verifica `userId` do JWT no service (não no controller)?
- [ ] Inputs validados com Zod antes de qualquer processamento?
- [ ] Nenhum dado sensível em logs (senha, token, email, valor financeiro)?
- [ ] Nenhuma variável de ambiente hardcoded?

### Qualidade
- [ ] Lógica de negócio está no service, não no route handler?
- [ ] Erros são tipados (`AppError` e subclasses), não strings soltas?
- [ ] Nenhum `any` sem comentário justificando?
- [ ] Novos comportamentos têm testes correspondentes?

### Banco de dados
- [ ] Novas queries têm índice correspondente no schema?
- [ ] Sem queries dentro de loops (N+1)?
- [ ] Migrations são reversíveis?

### Documentação
- [ ] SPEC na Wiki atualizado se o comportamento mudou?
- [ ] ADR criado em `docs/adrs/` se houver nova decisão arquitetural?

---

## GitHub Projects — colunas do board

| Coluna | Critério de entrada | Critério de saída |
|---|---|---|
| **Backlog** | Issue criada | ACs escritos |
| **Especificado** | ACs escritos, sem bloqueios | Desenvolvimento iniciado |
| **Em progresso** | Branch criada | PR aberto |
| **Em revisão** | PR aberto | PR aprovado e mergeado |
| **Concluído** | Issue fechada via PR | — |

---

## Versionamento e releases

O FinTrack usa **Semantic Versioning 2.0.0** com tags Git anotadas.

```
v MAJOR . MINOR . PATCH
  │        │       └── Correção de bug — sem mudança de comportamento
  │        └────────── Nova funcionalidade — retrocompatível
  └─────────────────── Quebra de compatibilidade (API, schema, auth)
```

### Mapa de versões

| Versão | Escopo |
|---|---|
| `v0.1.0` | Fundação: auth, contas, transações manuais, schema |
| `v0.2.0` | Importação: pipeline RabbitMQ, worker, parsers CSV/OFX |
| `v0.3.0` | Relatórios: dashboard, cache Redis, paginação cursor |
| `v0.4.0` | Observabilidade: Prometheus, Grafana, logs estruturados |
| `v0.5.0` | Infra: Docker Compose, CI/CD, Terraform |
| `v1.0.0` | MVP: todos os requisitos do SPEC-01 implementados e testados |
| `v1.1.0` | Recorrência: transações recorrentes, parcelas, calendário |
| `v1.2.0` | Inteligência: score de saúde, anomalias, tendências |
| `v2.0.0` | Open Finance: OAuth2 com APIs do Banco Central |

### Nomenclatura de tags

```bash
v1.0.0          # release estável
v1.1.1          # patch de bug sobre v1.1.0
v1.0.0-alpha.1  # work in progress
v1.0.0-beta.1   # feature-complete, em testes
v1.0.0-rc.1     # release candidate — só bug fixes
```

### O que constitui cada tipo de versão

**MAJOR** — quebra compatibilidade:
remoção de campo da API, mudança de tipo de campo existente, remoção de endpoint, mudança de schema sem migration de compatibilidade.

**MINOR** — retrocompatível:
novo endpoint, novo campo opcional na resposta, novo módulo de domínio, nova funcionalidade no worker ou frontend.

**PATCH** — correção:
bug fix sem mudança de interface, melhoria de performance, atualização de dependência sem mudança de comportamento.

### Fluxo de release passo a passo

```bash
# 1. Partir da develop atualizada
git checkout develop && git pull origin develop
npm test --workspaces   # todos os testes precisam passar

# 2. Criar branch de release
git checkout -b release/v1.0.0
npm version 1.0.0 --workspaces --no-git-tag-version
# → atualizar CHANGELOG.md: mover [Não lançado] para [1.0.0] com a data

# 3. Mergear na main e criar tag anotada
git checkout main
git merge release/v1.0.0 --no-ff -m "chore(release): v1.0.0"

git tag -a v1.0.0 -m "Release v1.0.0 — MVP completo

Inclui:
- Autenticação JWT com refresh token
- Pipeline de importação CSV/OFX com RabbitMQ
- Dashboard com score de saúde financeira
- Relatórios com cache Redis

Refs: milestone v1.0.0"

git push origin main
git push origin v1.0.0

# 4. Sincronizar develop
git checkout develop
git merge main --no-ff
git push origin develop

# 5. Criar a Release no GitHub
gh release create v1.0.0 \
  --title "v1.0.0 — MVP completo" \
  --notes-file CHANGELOG.md \
  --latest
```

### Regra de ouro do release

> A tag de release só é criada quando o Milestone correspondente no GitHub tem **0 issues abertas**.

---

## Referência rápida

```bash
# Criar branch para uma feature
git checkout -b feature/42-nome-da-feature develop

# Verificações locais antes de abrir PR
npm run typecheck --workspaces
npm run lint --workspaces
npm test --workspaces

# Abrir PR via CLI
gh pr create --assignee @me

# Verificar checks do PR
gh pr checks

# Aplicar labels no repositório (rodar uma única vez após criar o repo)
chmod +x .github/scripts/sync-labels.sh
./.github/scripts/sync-labels.sh scalecraft-systems/fintrack
```
