import { createRoot } from 'react-dom/client'

import { connectBridge } from './agent.ts'
import { App } from './App.tsx'
import { api, takeImport } from './editor.ts'

window.roomfit = api
takeImport()
void connectBridge()
void api.checkBackend()

const root = document.getElementById('root')
if (root) createRoot(root).render(<App />)
