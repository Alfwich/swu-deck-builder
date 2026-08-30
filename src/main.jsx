import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import AgentAccessPage from './AgentAccessPage.jsx'
import LegalPage from './LegalPage.jsx'
import { resolveApplicationPage } from './page-routing.js'
import './index.css'

const applicationPage = resolveApplicationPage(window.location.pathname)
const page = applicationPage === 'access'
  ? <AgentAccessPage />
  : applicationPage === 'privacy' || applicationPage === 'terms'
    ? <LegalPage document={applicationPage} />
    : <App />

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {page}
  </StrictMode>,
)
