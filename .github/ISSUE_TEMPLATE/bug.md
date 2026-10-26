---
name: "🐛 Bug Report"
about: "Comportamento incorreto ou diferente do especificado nos SPECs."
title: "[BUG] "
labels: ["type: bug"]
assignees: ""
---

## Descrição do problema

<!--
Descreva o comportamento incorreto em uma linha clara.
Formato: "[Módulo/rota] [o que acontece] ao invés de [o que deveria acontecer]"
-->

---

## Como reproduzir

<!--
Passos mínimos e precisos para reproduzir o problema.
Se envolver uma request HTTP, inclua o payload.
-->

1.
2.
3.

**Resultado atual:**

**Resultado esperado:**

---

## Contexto do ambiente

| Campo           | Valor |
|-----------------|-------|
| Ambiente        | `local / staging / production` |
| Branch          | `main / develop / feature/...` |
| Node.js         | `vX.X.X` |
| SO              | ` ` |

---

## Evidências

<!--
Logs de erro, stack trace, screenshot, resposta da API.
Cole aqui ou anexe arquivos.
-->

```
[cole logs aqui]
```

---

## Impacto

<!--
Qual a severidade? Está bloqueando alguma outra funcionalidade?
-->

- [ ] **Crítico** — sistema indisponível ou perda de dados
- [ ] **Alto** — funcionalidade principal quebrada, sem workaround
- [ ] **Médio** — funcionalidade quebrada, mas existe workaround
- [ ] **Baixo** — problema cosmético ou edge case raro

---

## Referência

**SPEC relacionado:** `SPEC-XX` _(se o comportamento correto estiver documentado)_
**ADR relacionado:** `ADR-XXX` _(se a decisão técnica for relevante)_
