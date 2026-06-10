# ADR-006 — React como biblioteca de UI do frontend

- **Status:** Aceito
- **Data:** 2025
- **Autores:** Time FinTrack

---

## Contexto

O FinTrack precisa de uma interface de usuário que suporte:
- Dashboards com gráficos atualizados em tempo real (relatórios, saldos).
- Polling de status de jobs de importação sem recarregar a página.
- Formulários complexos com validação (transações, regras de categorização).
- Navegação entre múltiplas seções sem recarregamento (SPA).
- Tabelas grandes com scroll infinito (extrato paginado).

As opções avaliadas foram React, Vue.js e Angular.

---

## Decisão

Adotamos o **React 18** com **TypeScript** como biblioteca de UI do frontend.

---

## Justificativas

### Modelo mental de componentes e composição
O React introduz um modelo de UI declarativo baseado em componentes puros:
dado um estado `S`, a UI é sempre `f(S)`. Isso torna o comportamento
previsível e testável — especialmente importante para o dashboard financeiro,
onde múltiplos indicadores precisam refletir o mesmo estado de dados de forma
coerente.

A composição de componentes no React é explícita (props, children) e sem
mágica — o que vai onde é rastreável pelo compilador TypeScript sem necessidade
de conhecer convenções específicas do framework.

### Ecossistema para casos de uso do projeto
Os casos de uso do FinTrack mapeiam diretamente para bibliotecas maduras do
ecossistema React:

- **TanStack Query:** server state, cache, polling e mutations — exatamente o
  que o sistema de importação assíncrona precisa.
- **React Hook Form + Zod:** formulários performáticos com validação tipada —
  os formulários de transação e regras de categorização são complexos o suficiente
  para justificar uma solução dedicada.
- **Recharts:** gráficos de pizza, barra e linha baseados em D3, com API React.
- **React Router v7:** roteamento SPA com suporte a loaders tipados.

### TypeScript como cidadão de primeira classe
O React tem suporte TypeScript nativo e sem fricção. Os tipos de `useState`,
`useEffect`, `useRef` e props de componentes são inferidos automaticamente
na maioria dos casos. Isso é importante porque o frontend compartilha os
mesmos tipos de domínio do backend (via `api.types.ts`), e essa sincronia
precisa ser mantida pelo compilador.

### React 18 — Concurrent Features
O React 18 introduz `useTransition` e `useDeferredValue`, que permitem
marcar atualizações de estado como não urgentes. Para o FinTrack, isso
é relevante ao filtrar o extrato com centenas de transações: a digitação
no campo de busca permanece fluida enquanto a lista é atualizada em background.

### Separação entre server state e client state
O React por si só não dita como gerenciar estado. Essa flexibilidade permite
a separação clara que o projeto adota:
- **Server state** (dados que vêm da API): gerenciado pelo TanStack Query.
- **Client state** (UI local: modal aberto, filtros ativos): `useState` e
  Context API — sem biblioteca adicional na v1.

Essa separação evita o anti-pattern de colocar dados da API no Redux/Zustand
e sincronizá-los manualmente, que foi o erro padrão de gerenciamento de estado
da geração anterior de SPAs.

---

## Alternativas rejeitadas

### Vue.js 3
- Composition API é conceitualmente similar ao React Hooks — a diferença de
  produtividade é marginal para um desenvolvedor que conhece ambos.
- O ecossistema de componentes de gráficos (Vue equivalente ao Recharts) é
  menos maduro.
- Menos exemplos de integração com TanStack Query (que tem suporte oficial
  para React, Vue e Solid, mas a documentação React é mais completa).
- **Não é tecnicamente inferior** — é uma preferência de ecossistema e
  familiaridade da equipe.

### Angular
- Framework full-stack com opinionated structure — inclui HTTP client, forms,
  DI container e router embutidos. Para o FinTrack, onde cada uma dessas
  responsabilidades já tem uma biblioteca dedicada escolhida (TanStack Query,
  React Hook Form, React Router), o Angular empacotaria soluções que seriam
  substituídas ou ignoradas.
- TypeScript estrito por padrão é positivo, mas a verbosidade de decorators
  e injeção de dependência adiciona cerimônia para um projeto de escopo pessoal.
- Bundle size maior que React para as funcionalidades usadas.

---

## Consequências

- **Positivo:** Ecossistema rico e alinhado com os casos de uso do projeto, TypeScript nativo, modelo declarativo previsível.
- **Positivo:** TanStack Query resolve o problema de polling de jobs e cache de server state sem código extra.
- **Negativo:** React sozinho não resolve gerenciamento de estado global — é necessário decidir entre Context, Zustand ou Jotai à medida que o estado cresce.
- **Decisão derivada:** Na v1, Context API é suficiente para o estado de autenticação (único estado verdadeiramente global). Zustand pode ser adotado em uma decisão futura se o estado cliente se tornar mais complexo.
