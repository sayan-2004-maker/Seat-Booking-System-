import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './App.css'
import './admin-portal.css'
import AdminPortal from './AdminPortal.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AdminPortal />
  </StrictMode>,
)
