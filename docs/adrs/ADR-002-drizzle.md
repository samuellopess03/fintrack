# ADR-002 — Drizzle ORM como camada de acesso ao banco

- **Status:** Aceito
- **Data:** 2025
- **Autores:** Time FinTrack

---

## Contexto

O FinTrack precisa de uma camada de acesso ao PostgreSQL que seja:
- Tipada de ponta a ponta (TypeScript).
- Transparente sobre o SQL gerado (essencial para queries de relatório com `GROUP BY` e `SUM`).
- Sem geração de código em runtime (evita complexidade de build).
- Com suporte robusto a migrations versionadas.

As opções avaliadas foram Prisma, Drizzle e TypeORM.

---

## Decisão

Adotamos o **Drizzle ORM** como camada de acesso ao banco de dados.

---

## Justificativas

### Transparência sobre o SQL
O Drizzle é fundamentalmente um query builder tipado, não um ORM que abstrai
o SQL. A query gerada é previsível e legível — o que é produzido em TypeScript
mapeia diretamente para o SQL executado no banco. Isso é crítico para as
queries de relatório do FinTrack (GROUP BY, SUM, índices parciais) onde
otimizações de query precisam ser explícitas.

### Schema como fonte de verdade
No Drizzle, o schema TypeScript é a definição autoritária do banco. Os tipos
de retorno de queries são inferidos diretamente dele — sem `prisma generate`,
sem cliente gerado separadamente. Isso simplifica o pipeline de build e
elimina a janela de dessincronização entre schema e tipos.

### Sem abstração de runtime
O Prisma roda um processo separado (`prisma query engine`) em algumas
configurações. O Drizzle é puro JavaScript/TypeScript executado diretamente
no processo da aplicação, sem processos filhos ou binários nativos.

### Transactions explícitas
O Drizzle expõe `db.transaction(async (tx) => { ... })` de forma direta,
essencial para o padrão Unit of Work no processamento de CSVs.

### Migrations como SQL puro
As migrations do Drizzle são arquivos `.sql` legíveis e versionados no
repositório. É possível inspecionar exatamente o que cada migration faz,
aplicar manualmente se necessário, e fazer rollback com SQL invertido.

---

## Alternativas rejeitadas

### Prisma
- Geração de cliente em `node_modules/.prisma` que precisa ser regenerado após
  qualquer mudança de schema — adiciona etapa ao processo de build e deploy.
- Abstrai demais o SQL — queries complexas com `$queryRaw` perdem a tipagem.
- Prisma Client tem overhead de inicialização em cold starts.
- Schema em linguagem proprietária (`.prisma`) em vez de TypeScript.

### TypeORM
- Decorators experimentais no TypeScript — geram ruído de configuração.
- Tipagem inconsistente em queries complexas.
- Migrations menos previsíveis em alguns edge cases.
- Projeto com manutenção irregular nos últimos anos.

---

## Consequências

- **Positivo:** SQL transparente, tipagem forte sem geração de código, migrations como SQL puro, Unit of Work simples.
- **Negativo:** Curva de aprendizado ligeiramente maior que Prisma para quem vem do ORM clássico.
- **Negativo:** Menos "magia" — queries precisam ser escritas explicitamente (isso é também uma vantagem de previsibilidade).
- **Risco mitigado:** A documentação do Drizzle é clara e os exemplos com PostgreSQL são abundantes.
