import { useSyncExternalStore } from 'react'

import { api, snapshot, subscribe, walkthroughFileName } from './editor.ts'
import { useEscapeCloses } from './workspace.tsx'

function download(url: string, fileName: string): void {
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.click()
}

/** The full-window walkthrough viewer: the clip plays muted and looping, with Download and Close. */
export function WalkthroughViewer() {
  useSyncExternalStore(subscribe, snapshot)
  const viewer = api.state().walkthroughViewer
  const video = snapshot().jobs.find(({ id }) => id === viewer?.jobId)?.result?.video
  useEscapeCloses(viewer !== null ? api.closeWalkthrough : null)
  if (!viewer || !video) return null

  return (
    <div role="dialog" aria-modal="true" aria-label="Walkthrough" className="photo-viewer">
      <video className="walkthrough-clip" src={video} autoPlay muted loop controls />
      <div className="photo-back button-row">
        <button onClick={api.closeWalkthrough}>Close</button>
        <button onClick={() => download(video, walkthroughFileName(viewer.jobId))}>Download</button>
      </div>
      {viewer.stale && <div className="photo-caption problem">Layout changed since this video</div>}
    </div>
  )
}
