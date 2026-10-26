---
name: "✨ Feature — PRD"
about: "Nova funcionalidade ou melhoria planejada. Use para tudo que esteja referenciado em um SPEC."
title: "[FEATURE] "
labels: ["type: feature", "status: needs-spec"]
assignees: ""
---

## Contexto

<!--
Por que essa funcionalidade existe? Qual problema do usuário ela resolve?
Seja direto — uma ou duas frases basta. Não copie o SPEC aqui, apenas referencie.
-->

**Referência:** `SPEC-XX — nome-do-spec`, seção Y

---

## Comportamento esperado

<!--
Descrição em prosa do que deve acontecer do ponto de vista do usuário,
não da implementação. Escreva como se estivesse descrevendo para alguém
que nunca viu o código.
-->

---

## Critérios de aceite

<!--
Cada AC deve ser verificável, binário (passa ou não passa) e escrito
na perspectiva do comportamento observável — nunca da implementação.

Formato: AC-NN: [sujeito] [verbo] [condição mensurável]

❌ "funciona corretamente"
✅ "retorna 202 Accepted em menos de 200ms após o upload"
-->

- [ ] **AC-01:**
- [ ] **AC-02:**
- [ ] **AC-03:**

---

## Fora do escopo

<!--
O que deliberadamente NÃO será feito nesta issue.
Isso evita scope creep e deixa claro o que fica para uma issue futura.
-->

- Não inclui:
- Não inclui:

---

## Notas técnicas

<!--
Pontos de atenção de implementação, decisões relevantes, links para
código existente ou outras issues que precisam ser fechadas antes.
Deixe em branco se não houver.
-->

**Dependências de outras issues:** _(nenhuma / #XX)_
**Módulos afetados:** _(backend / frontend / worker / infra)_

---

## Definição de pronto

- [ ] Código implementado e funcionando localmente
- [ ] Testes unitários e/ou de integração cobrindo os ACs
- [ ] SPEC atualizado se o comportamento mudou em relação ao documentado
- [ ] Sem warnings de TypeScript ou ESLint introduzidos
- [ ] PR aberto com referência a esta issue
