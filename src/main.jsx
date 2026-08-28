import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import AgentAccessPage from './AgentAccessPage.jsx'
import './index.css'

const page = /^\/enable\/?$/.test(window.location.pathname)
  ? <AgentAccessPage />
  : <App />

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {page}
  </StrictMode>,
)
