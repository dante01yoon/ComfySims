import { createRoot } from 'react-dom/client'

import { connectBridge } from './agent.ts'
import { App } from './App.tsx'
import { api } from './editor.ts'

window.roomfit = api
void connectBridge()

const root = document.getElementById('root')
if (root) createRoot(root).render(<App />)
