# ADR-005 — Jest + ts-jest (diagnostics off) como framework de testes

- **Status:** Aceito
- **Data:** 2025 (atualizado em 2026)
- **Autores:** Time FinTrack

---

## Contexto

O FinTrack precisa de um framework de testes para dois contextos principais:
testes unitários das regras de categorização (lógica pura de domínio) e
testes de integração do pipeline de importação (do parse ao banco de dados).

O backend é Node.js + TypeScript, rodando no ambiente de execução Node —
não há bundler Vite nem ambiente de browser envolvido. A escolha do framework
de testes deve refletir esse contexto.

As opções avaliadas foram Jest (com ts-jest ou @swc/jest) e Vitest.

---

## Decisão

Adotamos o **Jest** com **ts-jest** (diagnostics desabilitado) como compilador
TypeScript nos testes do backend.

---

## Justificativas

### Ecossistema de mocks mais maduro
O Jest tem o ecossistema de mocks mais completo e estável do Node.js:
`jest.mock()`, `jest.spyOn()`, `jest.fn()`, `jest.useFakeTimers()` —
todos battle-tested em projetos de produção por anos. Para o FinTrack,
isso é crítico em dois cenários:

- **Testes unitários de categorização:** mockar o banco para testar a
  Chain of Responsibility sem nenhum I/O.
- **Testes do worker:** mockar o canal RabbitMQ para testar o comportamento
  de retry e dead letter sem broker real.

O sistema de módulos mock do Jest (`jest.mock('amqplib')`) é mais granular
e previsível do que as alternativas equivalentes no Vitest para módulos
CommonJS/ESM mistos — que ainda é um ponto de fricção no ecossistema Node.js.

### ts-jest com diagnostics desabilitado = mesma performance do SWC
O `ts-jest` compila TypeScript usando o compilador oficial `tsc`. Por padrão,
ele faz type checking em cada arquivo de teste, o que é lento para suites
grandes. Com a opção `diagnostics: false`, o type checking é **desabilitado**
durante a execução dos testes — o `ts-jest` passa a fazer apenas transpilação,
com performance equivalente ao `@swc/jest`.

O type check continua sendo feito pelo `tsc --noEmit` como etapa separada
no CI, garantindo segurança de tipos sem penalizar a velocidade dos testes.

### Consolidação com o ecossistema Node.js/backend
O Jest é o padrão de fato para testes de backend Node.js. A documentação,
os exemplos e as integrações (Fastify `inject`, Supertest, testcontainers)
são todos escritos com Jest como referência. Isso reduz o atrito ao buscar
soluções para casos específicos.

### Isolamento por padrão
O Jest roda cada arquivo de teste em um worker Node.js separado, com módulos
completamente isolados. Para testes de integração que modificam estado no banco,
esse isolamento evita interferências entre suites rodando em paralelo.

---

## Por que não @swc/jest

O `@swc/jest` foi avaliado como substituto do `ts-jest` por sua compilação
mais rápida (escrita em Rust). No entanto, ele **não suporta hoisting de
`jest.mock()`** — um recurso fundamental para o padrão de mocks adotado
no projeto.

Sem o hoisting, as chamadas `jest.mock()` não são movidas para antes dos
imports, fazendo com que os módulos sejam carregados antes de serem
mockados. Isso quebra todos os testes que dependem de `jest.mock()`,
que são a maioria dos testes unitários do backend.

Para usar `@swc/jest`, seria necessário reescrever todos os testes para
usar `jest.unstable_mockModule()` + dynamic imports — uma refatoração
significativa que não se justifica dada a diferença marginal de performance
para o tamanho atual da suíte de testes.

---

## Por que não Vitest

O Vitest é uma excelente escolha para projetos que já usam Vite — especialmente
para testes de componentes React no frontend, onde a integração com Vite é um
diferencial real. No frontend do FinTrack, o Vitest seria igualmente válido.

Para o **backend**, porém:

- O Vitest é otimizado para o ambiente Vite/ESM. O Node.js backend do FinTrack
  usa CommonJS em alguns módulos de sistema (amqplib, csv-parse) e a interação
  ESM/CJS ainda tem edge cases no Vitest.
- O sistema de mocks do Vitest (`vi.mock`) tem comportamento ligeiramente
  diferente do Jest em módulos com efeitos colaterais na inicialização — algo
  relevante ao mockar conexões com banco e RabbitMQ.
- A maioria dos exemplos de integração Fastify + testes usa Jest como referência.

**Nota:** O frontend React pode adotar Vitest para testes de componentes
em uma decisão futura, sem conflito com o uso de Jest no backend.

---

## Alternativas rejeitadas

### Jest + @swc/jest
- Não suporta hoisting de `jest.mock()` — exige reescrita de todos os
  testes para `jest.unstable_mockModule()`.
- Performance marginalmente superior ao `ts-jest` com `diagnostics: false`,
  sem ganho real para o tamanho atual da suíte.
- A configuração de ESM com `@swc/jest` adiciona complexidade sem
  benefício prático mensurável.

### Vitest (no backend)
- Melhor para projetos Vite-first; edge cases ESM/CJS no Node.js backend.
- Mocks com comportamento menos previsível para módulos de infraestrutura.
- Menos exemplos de integração com Fastify e testcontainers.

---

## Consequências

- **Positivo:** Mocks maduros e previsíveis com `jest.mock()`, ecossistema robusto para backend Node.js.
- **Positivo:** Type checking separado do teste — CI roda `tsc` e `jest` em paralelo.
- **Positivo:** Compilação rápida via `diagnostics: false` — mesma performance do SWC sem abrir mão do `jest.mock()`.
- **Negativo:** Dois frameworks de teste se o frontend adotar Vitest futuramente — custo de contexto switching.
