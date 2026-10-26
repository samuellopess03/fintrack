## O que este PR faz

<!--
Uma linha clara descrevendo a mudança.
Formato: "[Verbo no presente] [o quê] [para quê / por quê]"
Exemplos:
  "Implementa paginação por cursor no endpoint GET /transactions"
  "Corrige invalidação de cache após exclusão de transação manual"
  "Adiciona parser OFX ao pipeline de importação de extratos"
-->

---

## Issue relacionada

<!--
Obrigatório. Todo PR deve fechar ou referenciar uma issue.
Use "Closes" para fechar automaticamente ao mergear.
Use "Refs" para referência sem fechar.
-->

Closes #
<!-- Refs # -->

---

## Tipo de mudança

- [ ] ✨ Feature — nova funcionalidade
- [ ] 🐛 Bug fix — corrige comportamento incorreto
- [ ] ♻️ Refactor — sem mudança de comportamento
- [ ] 🔧 Chore — manutenção, dependências, configuração
- [ ] 📖 Docs — documentação (SPECs, ADRs, READMEs)
- [ ] 🔒 Security — correção de vulnerabilidade
- [ ] ⚡ Performance — melhoria mensurável de desempenho

---

## Checklist antes de abrir para revisão

### Qualidade de código
- [ ] Sem erros de TypeScript (`npm run typecheck`)
- [ ] Sem erros de lint (`npm run lint`)
- [ ] Sem `console.log` introduzidos — use o logger (Pino)
- [ ] Sem `any` sem comentário justificando

### Testes
- [ ] Testes unitários adicionados / atualizados para lógica nova
- [ ] Testes de integração adicionados / atualizados para endpoints novos
- [ ] Todos os testes passando localmente (`npm test`)
- [ ] Cobertura de testes não regrediu

### Segurança e dados
- [ ] Toda nova rota verifica `userId` do token JWT no service
- [ ] Nenhum dado sensível em logs (senha, token, email, valores financeiros)
- [ ] Inputs validados com Zod antes de qualquer processamento
- [ ] Migrações de banco são reversíveis

### Documentação
- [ ] SPEC atualizado se o comportamento mudou em relação ao documentado
- [ ] ADR criado se houver decisão arquitetural nova
- [ ] Mensagem de commit segue Conventional Commits

---

## Critérios de aceite verificados

<!--
Copie os ACs da issue e marque os que estão cobertos por este PR.
Se o PR cobre apenas parte da issue, deixe claro o que ficou fora.
-->

- [ ] AC-01:
- [ ] AC-02:
- [ ] AC-03:

---

## Como testar localmente

<!--
Passos mínimos para o revisor verificar a mudança.
Se for trivial ("rode npm test"), pode omitir.
Se envolver setup específico, seja preciso.
-->

```bash
# 1.
# 2.
# 3.
```

**Resultado esperado:**

---

## Screenshots / evidências

<!--
Para mudanças de frontend: antes e depois obrigatórios.
Para mudanças de API: exemplo de request/response.
Para performance: número antes e depois.
Delete esta seção se não houver evidência visual relevante.
-->

---

## Notas para o revisor

<!--
Pontos específicos que merecem atenção na revisão.
Decisões tomadas que poderiam ter sido diferentes.
Áreas de incerteza.
Delete se não houver.
-->
