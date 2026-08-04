import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import './index.css'
import App from './App.tsx'
import { startCustomBankSync } from './lib/customBank'

startCustomBankSync(); // مزامنة بنك أسئلة المقدم منذ تشغيل التطبيق

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
