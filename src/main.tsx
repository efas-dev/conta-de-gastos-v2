// ADR: see spec/mvp-vertical-nubank.adr.md
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

const rootElement = document.getElementById('root')
if (!rootElement) {
  throw new Error('Elemento #root não encontrado no DOM')
}

createRoot(rootElement).render(
  <StrictMode>
    <div>
      <h1>Conta de Gastos</h1>
      <p>MVP em construção.</p>
    </div>
  </StrictMode>,
)
