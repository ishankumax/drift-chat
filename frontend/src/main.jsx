import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Analytics } from "@vercel/analytics/react"
import './index.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  // Disabled StrictMode for development - it causes double-mounting which breaks WebSocket
  // TODO: Re-enable after WebRTC signaling is stable
  <App />
  // <StrictMode>
  //   <App />
  //   <Analytics />
  // </StrictMode>
,
)
