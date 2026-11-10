import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { loadAnalytics } from './analytics'

createRoot(document.getElementById('root')!).render(<App />)
loadAnalytics()
