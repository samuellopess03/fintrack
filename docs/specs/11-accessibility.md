# SPEC-11 — Acessibilidade (a11y)

## Filosofia

Acessibilidade não é um conjunto de regras para satisfazer auditores —
é a prática de construir interfaces que funcionam para o maior número
possível de pessoas. Um dashboard financeiro inacessível exclui usuários
com deficiência visual, motora ou cognitiva de controlarem suas próprias
finanças.

O FinTrack adota como referência o **WCAG 2.1 nível AA** (Web Content
Accessibility Guidelines), que é o padrão internacional e o exigido pela
legislação brasileira (Lei Brasileira de Inclusão, Art. 63).

---

## Os quatro princípios WCAG (POUR)

| Princípio      | O que significa para o FinTrack                                   |
|----------------|-------------------------------------------------------------------|
| **Perceptível** | Todo conteúdo visual tem equivalente textual; cores não são o único canal de informação |
| **Operável**    | Toda funcionalidade é acessível via teclado; nenhum limite de tempo sem aviso |
| **Compreensível**| Linguagem clara, erros de formulário explicados, comportamento previsível |
| **Robusto**     | HTML semântico que funciona com leitores de tela atuais e futuros |

---

## 1. Semântica HTML

### Use elementos nativos antes de criar componentes customizados

O HTML nativo já tem semântica, comportamento de teclado e suporte a
leitores de tela embutidos. Componentes customizados precisam replicar
tudo isso manualmente.

```tsx
// ✅ Correto — button nativo já é focável, acionável com Enter/Space, anunciado pelo leitor
<button onClick={handleDelete} type="button">
  Excluir transação
</button>

// ❌ Evitar — div precisa de role, tabIndex, onKeyDown e aria-label manualmente
<div onClick={handleDelete} className="btn">
  Excluir transação
</div>
```

### Estrutura de cabeçalhos reflete hierarquia

```tsx
// DashboardPage.tsx
<main>
  <h1>Dashboard</h1>            {/* único h1 por página */}

  <section aria-labelledby="resumo-heading">
    <h2 id="resumo-heading">Resumo do mês</h2>
    {/* cards de saldo */}
  </section>

  <section aria-labelledby="gastos-heading">
    <h2 id="gastos-heading">Gastos por categoria</h2>
    {/* gráfico de pizza */}
  </section>
</main>
```

### Landmarks para navegação por região

```tsx
<body>
  <header>          {/* region: banner */}
    <nav>           {/* region: navigation */}
      {/* menu lateral */}
    </nav>
  </header>

  <main>            {/* region: main */}
    {/* conteúdo da página */}
  </main>

  <aside>           {/* region: complementary */}
    {/* painel de resumo */}
  </aside>
</body>
```

Usuários de leitor de tela podem navegar diretamente entre landmarks
sem percorrer todo o conteúdo — especialmente importante em dashboards
com muitas informações.

---

## 2. Contraste de cores

O WCAG 2.1 AA exige:
- **4.5:1** para texto normal (abaixo de 18pt / 14pt bold).
- **3:1** para texto grande (18pt+ / 14pt+ bold) e componentes de UI.

### Paleta com contraste verificado

| Uso                    | Cor de fundo | Cor do texto | Ratio  | Aprovado |
|------------------------|--------------|--------------|--------|----------|
| Texto principal        | #FFFFFF      | #1E293B      | 16.1:1 | ✅ AAA  |
| Texto secundário       | #FFFFFF      | #64748B      | 4.6:1  | ✅ AA   |
| Badge verde (receita)  | #DCFCE7      | #166534      | 7.2:1  | ✅ AAA  |
| Badge vermelho (despesa)| #FEE2E2     | #991B1B      | 6.8:1  | ✅ AAA  |
| Botão primário         | #4F46E5      | #FFFFFF      | 5.9:1  | ✅ AA   |
| Texto desabilitado     | #FFFFFF      | #94A3B8      | 2.8:1  | ❌ —    |

**Nota sobre texto desabilitado:** WCAG isenta elementos desabilitados do
requisito de contraste, mas a boa prática é tornar óbvio o estado desabilitado
por múltiplos canais além da cor (cursor, ícone, texto explicativo).

### Informação nunca transmitida apenas por cor

```tsx
// ❌ Errado — só a cor diferencia receita de despesa
<span style={{ color: transaction.type === 'income' ? 'green' : 'red' }}>
  {formatBRL(transaction.amount)}
</span>

// ✅ Correto — ícone + cor + texto alternativo
<span className={transaction.type === 'income' ? 'text-green' : 'text-red'}>
  <ArrowUpIcon aria-hidden="true" />           {/* ícone decorativo */}
  <span className="sr-only">Receita:</span>    {/* texto só para leitores de tela */}
  {formatBRL(transaction.amount)}
</span>
```

---

## 3. Navegação por teclado

### Ordem de foco lógica

O foco segue a ordem visual da página (cima → baixo, esquerda → direita).
Nunca usar `tabIndex` maior que 0 — quebra a ordem natural de foco.

```tsx
// ✅ Ordem natural
<input type="text" />   // tabIndex=0 implícito
<select />              // tabIndex=0 implícito
<button>Salvar</button> // tabIndex=0 implícito

// ❌ Evitar — rompe a ordem esperada
<button tabIndex={2}>Salvar</button>
<input tabIndex={1} />
```

### Focus trap em modais

Quando um modal está aberto, o foco deve ficar preso dentro dele.
Pressionar Tab não deve alcançar elementos atrás do modal.

```tsx
// src/components/ui/Modal.tsx
import { useEffect, useRef } from 'react'

function Modal({ isOpen, onClose, children }) {
  const modalRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!isOpen) return

    // Move o foco para o modal ao abrir
    modalRef.current?.focus()

    // Restaura o foco ao elemento que abriu o modal ao fechar
    const triggerElement = document.activeElement as HTMLElement
    return () => triggerElement?.focus()
  }, [isOpen])

  if (!isOpen) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
      ref={modalRef}
      tabIndex={-1}       // focável programaticamente mas não via Tab
    >
      <h2 id="modal-title">{title}</h2>
      {children}
      <button onClick={onClose}>Fechar</button>
    </div>
  )
}
```

### Fechar com Escape

Modais, dropdowns e popovers devem fechar ao pressionar Escape:

```tsx
useEffect(() => {
  const handler = (e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose()
  }
  document.addEventListener('keydown', handler)
  return () => document.removeEventListener('keydown', handler)
}, [onClose])
```

---

## 4. Formulários acessíveis

### Todo input tem label associado

```tsx
// ✅ Correto — label explícito com htmlFor
<label htmlFor="amount">Valor (R$)</label>
<input id="amount" type="number" />

// ✅ Correto — label implícito (envolve o input)
<label>
  Valor (R$)
  <input type="number" />
</label>

// ❌ Errado — placeholder não substitui label
<input type="number" placeholder="Valor em R$" />
```

### Erros de validação associados ao campo

```tsx
function TransactionForm() {
  const { register, formState: { errors } } = useForm()

  return (
    <div>
      <label htmlFor="description">Descrição</label>
      <input
        id="description"
        aria-describedby={errors.description ? 'description-error' : undefined}
        aria-invalid={!!errors.description}
        {...register('description')}
      />
      {errors.description && (
        <p id="description-error" role="alert">
          {errors.description.message}
        </p>
      )}
    </div>
  )
}
```

O `role="alert"` garante que o leitor de tela anuncia o erro imediatamente
quando ele aparece, sem o usuário precisar mover o foco.

### Campos obrigatórios marcados semanticamente

```tsx
<label htmlFor="amount">
  Valor
  <span aria-hidden="true"> *</span>        {/* asterisco visual */}
  <span className="sr-only"> (obrigatório)</span>  {/* texto para leitores */}
</label>
<input
  id="amount"
  required
  aria-required="true"
  {...register('amount')}
/>
```

---

## 5. Gráficos e visualizações de dados

Gráficos são conteúdo visual puro — completamente inacessíveis sem alternativas.

### Tabela de dados como alternativa ao gráfico

```tsx
// ReportPieChart.tsx
function CategoryPieChart({ data }: { data: CategoryReport[] }) {
  return (
    <div>
      {/* Gráfico visual para usuários sem leitor de tela */}
      <div aria-hidden="true">
        <PieChart width={300} height={300}>
          <Pie data={data} dataKey="total" nameKey="categoryName" />
          <Tooltip />
        </PieChart>
      </div>

      {/* Tabela acessível com os mesmos dados */}
      <table>
        <caption>Distribuição de gastos por categoria</caption>
        <thead>
          <tr>
            <th scope="col">Categoria</th>
            <th scope="col">Total</th>
            <th scope="col">Percentual</th>
          </tr>
        </thead>
        <tbody>
          {data.map(row => (
            <tr key={row.categoryId}>
              <td>{row.categoryName}</td>
              <td>{formatBRL(row.total)}</td>
              <td>{row.percentage.toFixed(1)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
```

---

## 6. Feedback de estado assíncrono

### Loading states anunciados

```tsx
// ✅ O leitor de tela anuncia que está carregando e quando termina
<div aria-live="polite" aria-atomic="true">
  {isLoading && <span>Carregando transações...</span>}
</div>

// Para ações críticas (erros, confirmações): aria-live="assertive"
<div aria-live="assertive" role="alert">
  {error && <span>Erro ao salvar transação: {error.message}</span>}
</div>
```

### Status do job de importação

```tsx
function ImportStatus({ status, result }) {
  return (
    <div aria-live="polite" aria-atomic="true">
      {status === 'processing' && (
        <p>
          <span aria-hidden="true">⏳</span>
          Processando extrato...
        </p>
      )}
      {status === 'done' && (
        <p role="status">
          <span aria-hidden="true">✅</span>
          Importação concluída: {result.importedCount} transações importadas.
        </p>
      )}
      {status === 'failed' && (
        <p role="alert">
          <span aria-hidden="true">❌</span>
          Falha na importação: {result.errorMessage}
        </p>
      )}
    </div>
  )
}
```

---

## 7. Tabelas de dados acessíveis (extrato)

```tsx
<table>
  <caption className="sr-only">
    Extrato de transações — {account.name}
  </caption>
  <thead>
    <tr>
      <th scope="col">Data</th>
      <th scope="col">Descrição</th>
      <th scope="col">Categoria</th>
      <th scope="col" aria-label="Tipo (receita ou despesa)">Tipo</th>
      <th scope="col" className="text-right">Valor</th>
    </tr>
  </thead>
  <tbody>
    {transactions.map(tx => (
      <tr key={tx.id}>
        <td>{formatDate(tx.date)}</td>
        <td>{tx.description}</td>
        <td>{tx.categoryName ?? 'Não categorizado'}</td>
        <td>
          <span className="sr-only">
            {tx.type === 'income' ? 'Receita' : 'Despesa'}
          </span>
          <Badge type={tx.type} aria-hidden="true" />
        </td>
        <td className="text-right" aria-label={`${formatBRL(tx.amount)} (${tx.type === 'income' ? 'receita' : 'despesa'})`}>
          {formatBRL(tx.amount)}
        </td>
      </tr>
    ))}
  </tbody>
</table>
```

---

## 8. Redução de movimento

Alguns usuários têm sensibilidade a animações e movimento na tela
(vestibular disorders). A media query `prefers-reduced-motion` respeita
a preferência do sistema operacional:

```css
/* Respeita a preferência do usuário por menos movimento */
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

---

## 9. Textos alternativos para ícones

```tsx
// Ícone decorativo (apenas visual, contexto está no texto adjacente)
<TrashIcon aria-hidden="true" />
<span>Excluir</span>

// Ícone funcional sem texto (botão só com ícone)
<button aria-label="Excluir transação de supermercado R$ 150,00">
  <TrashIcon aria-hidden="true" />
</button>

// Ícone que transmite informação (status)
<CheckCircleIcon
  aria-label="Importação concluída com sucesso"
  role="img"
/>
```

---

## 10. Testes de acessibilidade

### Automatizados com jest-axe

```typescript
// src/components/__tests__/TransactionForm.a11y.test.tsx
import { render }    from '@testing-library/react'
import { axe, toHaveNoViolations } from 'jest-axe'
import { TransactionForm } from '../TransactionForm'

expect.extend(toHaveNoViolations)

describe('TransactionForm — acessibilidade', () => {
  it('não tem violações WCAG detectáveis automaticamente', async () => {
    const { container } = render(<TransactionForm />)
    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })
})
```

**Importante:** ferramentas automatizadas detectam apenas ~30% das violações
de acessibilidade. Testes manuais com teclado e leitor de tela são
insubstituíveis.

### Checklist de teste manual

- [ ] Navegar toda a aplicação usando apenas Tab, Shift+Tab, Enter e Escape.
- [ ] Abrir e fechar todos os modais com teclado.
- [ ] Preencher e submeter todos os formulários sem mouse.
- [ ] Testar com NVDA (Windows) ou VoiceOver (macOS/iOS).
- [ ] Verificar que todos os estados de loading/erro são anunciados.
- [ ] Verificar que gráficos têm alternativas textuais.
- [ ] Verificar a aplicação com zoom de 200% — layout não quebra.
- [ ] Verificar com modo de alto contraste do SO.
