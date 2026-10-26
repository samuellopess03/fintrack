---
name: "🔬 Spike — Pesquisa técnica"
about: "Investigação com timebox definido para responder uma pergunta técnica antes de implementar."
title: "[SPIKE] "
labels: ["type: spike", "status: in-progress"]
assignees: ""
---

## Pergunta a responder

<!--
Uma pergunta clara e objetiva. O spike existe para responder exatamente isso.
Um spike com mais de uma pergunta principal provavelmente deveria ser dividido.

Exemplos:
- "O Open Finance do Banco Central suporta extrato em tempo real ou apenas D-1?"
- "O Drizzle ORM suporta keyset pagination nativa ou precisa de sql raw?"
- "Vale adicionar MongoDB para o audit trail ou JSONB no Postgres resolve?"
-->

---

## Por que precisamos saber isso agora

<!--
Qual decisão de implementação ou arquitetura depende desta resposta?
Que issue ou feature está bloqueada até esse spike ser concluído?
-->

**Bloqueia:** #XX _(issue bloqueada, se houver)_

---

## Timebox

| Campo     | Valor            |
|-----------|------------------|
| Máximo    | `X horas / dias` |
| Prazo     | `YYYY-MM-DD`     |

<!--
Spikes sem timebox viram rabbit holes. Se o tempo acabar sem resposta definitiva,
documente o que foi descoberto e tome uma decisão com o que há disponível.
-->

---

## Abordagem da investigação

<!--
O que será testado, lido ou prototipado para responder a pergunta.
Não precisa ser exaustivo — é um plano, não um spec.
-->

- [ ] Leitura de documentação oficial
- [ ] Prototipagem de código
- [ ] Benchmark / teste de performance
- [ ] Outro:

---

## Resultado esperado

<!--
O que este spike deve produzir ao final?
Marque o que se aplica.
-->

- [ ] Resposta objetiva à pergunta (sim/não/depende + justificativa)
- [ ] Rascunho de ADR com a decisão tomada
- [ ] Proof of concept em `/spikes/nome-do-spike/`
- [ ] Issue de feature criada com base nas conclusões

---

## Conclusões

<!--
Preencha APÓS a conclusão do spike.
O que foi descoberto? Qual a resposta à pergunta original?
O que ficou em aberto?
-->

**Resposta:** _(preencher após conclusão)_

**Decisão tomada:** _(preencher após conclusão)_

**Próximos passos:** _(issue criada / ADR escrito / descartado — e por quê)_
