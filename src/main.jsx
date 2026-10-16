import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.jsx'
import { privateEntryRedirect } from './content/privateEntry.mjs'

const canonicalEntry = privateEntryRedirect(window.location.href)
if (canonicalEntry) window.location.replace(canonicalEntry)
else createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
