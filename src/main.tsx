import { createRoot } from 'react-dom/client'
import App from '@/App'
import { restorePalette } from '@/styles/palettes'
import '@/styles/tokens.css'

// Before first paint, so a chosen palette does not flash the default first.
restorePalette()

createRoot(document.getElementById('root')!).render(<App />)
