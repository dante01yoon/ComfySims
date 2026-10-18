import { createRoot } from 'react-dom/client'

import { App } from './App.tsx'
import { api } from './editor.ts'

window.roomfit = api

const root = document.getElementById('root')
if (root) createRoot(root).render(<App />)
