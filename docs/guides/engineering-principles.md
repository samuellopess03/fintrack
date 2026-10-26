# Guia de Engenharia — Clean Code, SOLID e Design Patterns no FinTrack

- **Tipo:** Guia (não é ADR, não é spec)
- **Público:** qualquer pessoa escrevendo ou revisando código no FinTrack

---

## Por que este guia existe (e por que não é um ADR)

Os ADRs documentam **decisões** — escolhas entre alternativas reais, com
alternativa rejeitada e consequências verificáveis. "Adotamos SOLID e Clean
Code" não é uma decisão nesse sentido: não existe a alternativa "código sujo
e acoplado". Por isso os princípios não ganham ADR próprio — eles ganham
**este guia**, que faz três coisas:

1. Mapeia onde cada princípio **já se materializa** no projeto (ADRs, specs,
   código real) — evitando a ilusão de que é preciso criar algo novo.
2. Resume as regras de dependência que o ESLint **força mecanicamente**.
3. Estabelece critérios de quando **adotar/evitar** abstrações — o lado que
   mais protege manutenibilidade no longo prazo.

Convenções de estilo (naming, imports, commits, formatação) ficam na
[SPEC-15 — Convenções de Código](https://github.com/samuellopess03/fintrack/wiki/15-code-conventions). Este guia
não repete esse conteúdo.

---

## Mapa: princípio → onde já se aplica

| Princípio / Padrão | Onde se materializa | Referência |
|---|---|---|
| **SRP** — uma razão para mudar | `routes → service → repository`: cada arquivo tem uma responsabilidade única e delimitada | [ADR-009](../adrs/ADR-009-backend-architecture.md) — "Separação de responsabilidades" |
| **OCP** — extensível sem editar o que existe | Parsers novos entram como mais um arquivo em `parsers/`; regras de categorização entram como mais um handler na chain — sem editar os existentes | [ADR-009](../adrs/ADR-009-backend-architecture.md) — "Worker — estrutura paralela" |
| **LSP / ISP** | Sem classes com hierarquias para violar; a preferência por funções e módulos com superfícies de exportação pequenas mantém substituição e coesão triviais | — |
| **DIP** — depender de abstrações | Frontend: hooks de domínio fazem a UI depender do domínio, não da biblioteca (TanStack Query pode ser trocado sem tocar componentes). Backend: módulos consomem a *interface pública* (service) de outro módulo, nunca o repository dele | [ADR-010](../adrs/ADR-010-frontend-architecture.md) — "Hooks de domínio" e [ADR-009](../adrs/ADR-009-backend-architecture.md) — "Limite natural de dependência" |
| **Clean Code** (leitura) | Naming por vocabulário de domínio, predicados booleanos, handlers de evento | [SPEC-15](https://github.com/samuellopess03/fintrack/wiki/15-code-conventions) — "Convenções de nomenclatura" |
| **Clean Code** (consistência) | "Código novo lê como código existente" — siga os módulos existentes antes de inventar conceito | Este guia — "Critérios de abstração" |
| **Repository** | `*.repository.ts` — a única camada que fala com Drizzle/PostgreSQL | [ADR-009](../adrs/ADR-009-backend-architecture.md) |
| **Service Layer** | `*.service.ts` — orquestra repository + cache + fila; lógica de negócio mora aqui | [ADR-009](../adrs/ADR-009-backend-architecture.md) |
| **Strategy** | Parsers por formato de extrato (csv, ofx): uma pasta, um parser por formato | [ADR-009](../adrs/ADR-009-backend-architecture.md) — "Worker" |
| **Chain of Responsibility** | Categorização por regras com handlers em cadeia | [ADR-009](../adrs/ADR-009-backend-architecture.md) — "Worker" |
| **Unit of Work** (Fowler, PoEAA) | Processamento de extrato dentro de uma transação PostgreSQL — tudo ou nada | [ADR-011](../adrs/ADR-011-backend-techniques.md) — "Decisão 2" |
| **Fail-Fast** | Validação de env com Zod na inicialização — a aplicação nunca sobe inválida | [ADR-011](../adrs/ADR-011-backend-techniques.md) — "Decisão 3" |
| **DTO / view do contrato** | `api.types.ts` (frontend) espelha o contrato, não os tipos internos do backend | [ADR-010](../adrs/ADR-010-frontend-architecture.md) — "Tipagem compartilhada" |

**Leitura-chave:** esses padrões não estão no projeto *porque são famosos*;
estão lá porque cada um resolve um problema concreto, com a alternativa
rejeitada registrada no ADR correspondente.

---

## Regra de dependência (resumo operacional)

O diagrama completo e a justificativa estão no ADR-009. Resumo operacional
para revisão de código:

```
 Dentro de um módulo:              Entre módulos:                Raiz e shared:

 schema ←─ types                    outro domínio só pode         server/app → qualquer módulo
            │                        ser acessado via              shared ← usado por todos
 repo → schema                     o service dele                shared ↛ módulos (nunca)
            ↑                       (ou schema dele)              entrypoint → plugins
 service ─────────┘
            ↑
 routes (apenas service + schema)
```

- **Routes** chamam apenas o service do próprio módulo (e schemas para
  validação/serialização). Nunca repository.
- **Service** pode usar repository *do próprio módulo*; de outro módulo,
  apenas o service ou o schema dele.
- **Repository** nunca importa service (inversão) e nunca importam de
  outro módulo.
- **Shared** não importa módulos (é dependência deles, nunca o contrário) e
  usa a regra dos dois módulos para novos artefatos — artefato que fecha
  num único módulo não vai para `shared/`.

### Enforçamento: `backend/eslint.config.mjs`

As regras acima **não dependem de disciplina manual**. A configuração de
fronteiras, descrita em detalhe no
[documento de referência do ESLint Boundaries](eslint-boundaries.md), define
os elementos do backend (`shared`, `modules` por domínio, entrypoints) e as
categorias de arquivo (`service`, `repository`, `schema`, `types`, `routes`,
`contracts`, `test`) com políticas de dependência equivalentes ao resumo
anterior:

- Mesmo domínio → permitido conforme o diagrama (bloqueia, por exemplo,
  `routes → repository` dentro do próprio módulo).
- Domínio diferente → apenas o `service` (ou `schema`) do alvo.
- Violação → erro no `npm run lint`, não em revisão manual.

As convenções gerais de ESLint (no-console, eqeqeq, import/order,
import/no-cycle) continuam especificadas na [SPEC-15](https://github.com/samuellopess03/fintrack/wiki/15-code-conventions).

---

## Critérios de abstração (quando o padrão vira over-engineering)

Esses critérios fundamentaram a rejeição da Clean Architecture no ADR-009 —
e valem de forma simétrica para *adotar* qualquer padrão novo: **não** adote
um padrão sem problema concreto que o exija.

1. **Existe a duplicação?** Extraia comportamento depois da segunda ou
   terceira ocorrência real (a "regra dos dois módulos" para `shared/`).
2. **Existe a variação?** Strategy/Chain of Responsibility só valem quando
   existem (ou existe exigência real de) mais de uma implementação plausível.
3. **A troca é uma decisão registrada?** "Trocar X por Y" só é um plano se
   tem ADR com alternativa e critério de reversão. Abstração para futuro sem
   prazo é custo sem juros.
4. **Legibilidade primeiro:** se a abstração obriga o revisor a percorrer
   camadas de indireção para entender uma função cuja versão concreta seria
   legível, o concreto vence — refatorar para abstração depois, com
   justificativa, é mais barato que vivo.

Lembretes operacionais de Clean Code que sobrevivem a todo code review:

- **Código novo lê como código existente.** Siga os padrões dos módulos
  existentes antes de inventar conceito novo.
- **Comentários explicam o porquê, não o o quê.** Se um comentário
  explica *o que o código faz*, o problema é o nome das variáveis, não a
  falta do comentário.
- **Fronteira desconfia:** `fail-fast` e coerção explícita (o mesmo espírito
  do ADR-011) se aplicam a toda entrada — de request, de env ou de arquivo
  importado. Nunca confie em dado de fora da sua camada.

---

## Evoluindo os padrões

Padrões novos entram no projeto como toda decisão, seguindo o modelo dos ADRs:

1. Formule o **problema concreto** em uma frase (não a solução).
2. Encontre uma **alternativa plausível** e registre por que ela foi
   descartada — padrão sem alternativa discutida não é decisão.
3. Registre em ADR — novo, ou agrupado como decisão dentro de um ADR de
   técnicas existente (como o [ADR-011](../adrs/ADR-011-backend-techniques.md)
   agrupa três técnicas).
4. Atualize a tabela "Mapa: princípio → onde já se aplica" no início deste
   guia — ela é o ponto de entrada de quem chega agora.

**Estado atual:** a única arquitetura de referência explicitamente rejeitada
e condicionalmente válida é a Clean Architecture (ports & adapters) — ADR-009
registra o motivo e o critério de retorno. Nenhum outro padrão listado neste
guia foi rejeitado; todos estão em vigor.
