import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { APP_TITLE } from '@/lib/branding'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// The tab title, from lib/branding rather than from index.html. index.html
// carries a placeholder for the frame before this runs; the product is named
// in exactly one file.
document.title = APP_TITLE
