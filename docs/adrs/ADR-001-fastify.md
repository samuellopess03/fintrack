# ADR-001 — Fastify como framework HTTP

- **Status:** Aceito
- **Data:** 2025
- **Autores:** Time FinTrack

---

## Contexto

O backend do FinTrack precisa de um framework HTTP Node.js capaz de lidar com
uploads de arquivos, validação de schemas, sistema de plugins extensível e boa
performance para suportar o processamento de jobs e polling de status.

As opções avaliadas foram Express, Fastify e Hapi.

---

## Decisão

Adotamos o **Fastify** como framework HTTP do backend.

---

## Justificativas

### Performance
Fastify é consistentemente 2–3x mais rápido que Express em benchmarks de
requisições por segundo no Node.js. Para um sistema onde workers fazem polling
e clientes consultam status de jobs com frequência, isso tem impacto real.

### Validação nativa por schema
Fastify valida e serializa requests/responses via JSON Schema de forma
built-in e integrada ao ciclo de vida da request — não como middleware externo.
Integrado ao Zod via `fastify-type-provider-zod`, cada rota tem tipagem
TypeScript automática a partir dos schemas, sem repetição de código.

### Sistema de plugins encapsulado
O modelo de plugins do Fastify usa encapsulamento de escopo via `fastify-plugin`.
Cada módulo de domínio registra suas rotas, decorators e hooks de forma isolada,
sem poluir o escopo global da aplicação. Isso favorece a organização em módulos
independentes que o projeto adota.

### Logging estruturado embutido
Fastify usa o **Pino** como logger padrão — estruturado em JSON, com `requestId`
automático por requisição, sem configuração adicional. Essencial para o requisito
de observabilidade (RNF-05).

---

## Alternativas rejeitadas

### Express
- Middleware sem tipagem nativa — require type assertions manuais.
- Sem validação de schema built-in.
- Logging não estruturado por padrão.
- Mais lento que Fastify.
- Mantido em modo de manutenção pela comunidade para novos projetos.

### Hapi
- API mais verbosa e configuração mais complexa.
- Ecossistema menor e menos ativo.
- Overhead maior para casos simples.

---

## Consequências

- **Positivo:** Performance superior, tipagem automática via Zod, plugins encapsulados, logging sem configuração.
- **Negativo:** Menor base de tutoriais e exemplos do que Express.
- **Risco mitigado:** A documentação oficial do Fastify é excelente; o risco de aprendizado é baixo.
