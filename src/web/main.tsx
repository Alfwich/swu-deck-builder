import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './app/app.js'
import AgentAccessPage from './app/agent-access-page.js'
import LegalPage from './app/legal-page.js'
import { resolveApplicationPage } from './app/page-routing.js'
import './index.css'

const applicationPage = resolveApplicationPage(window.location.pathname)
const page = applicationPage === 'access'
  ? <AgentAccessPage />
  : applicationPage === 'privacy' || applicationPage === 'terms'
    ? <LegalPage document={applicationPage} />
    : <App />

const rootElement = document.getElementById('root')

if (!rootElement) {
  throw new Error('Application root element was not found.')
}

createRoot(rootElement).render(
  <StrictMode>
    {page}
  </StrictMode>,
)
