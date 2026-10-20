import { useFrame, useThree } from '@react-three/fiber'
import { useEffect } from 'react'

import { advanceCamera, settleOrbit, zoomBy } from './camera.ts'
import { advanceWalk, api, holdWalkKey, isWalkKey, releaseWalkKeys, snapshot, subscribe } from './editor.ts'

const LOOK_DEG_PER_PIXEL = 0.25

function typingIn(target: EventTarget | null): boolean {
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement
}

function useWalkKeys(): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!snapshot().walking || typingIn(event.target)) return
      if (event.key === 'Escape') return api.stopWalking()
      if (!isWalkKey(event.code)) return
      event.preventDefault()
      if (!event.repeat) holdWalkKey(event.code, true)
    }
    const onKeyUp = (event: KeyboardEvent) => {
      if (isWalkKey(event.code)) holdWalkKey(event.code, false)
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', releaseWalkKeys)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', releaseWalkKeys)
    }
  }, [])
}

function useDragToLook(canvas: HTMLCanvasElement): void {
  useEffect(() => {
    let last: { x: number; y: number } | null = null
    const onPointerDown = (event: PointerEvent) => {
      if (snapshot().walking) last = { x: event.clientX, y: event.clientY }
    }
    const onPointerMove = (event: PointerEvent) => {
      if (!last) return
      api.look({ yawDeg: -(event.clientX - last.x) * LOOK_DEG_PER_PIXEL, pitchDeg: -(event.clientY - last.y) * LOOK_DEG_PER_PIXEL })
      last = { x: event.clientX, y: event.clientY }
    }
    const onPointerUp = () => {
      last = null
    }
    canvas.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
    return () => {
      canvas.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
    }
  }, [canvas])
}

function useSmoothZoom(source: HTMLElement): void {
  useEffect(() => {
    const onWheel = (event: WheelEvent) => {
      event.preventDefault()
      zoomBy(event.deltaY)
    }
    source.addEventListener('wheel', onWheel, { passive: false })
    return () => source.removeEventListener('wheel', onWheel)
  }, [source])
}

function eventSourceOf(connected: unknown, canvas: HTMLCanvasElement): HTMLElement {
  return connected instanceof HTMLElement ? connected : canvas
}

/** Drives the main camera each frame (glides, walking, smooth zoom, inertia) and renders a frame whenever the editor changes. */
export function CameraRig() {
  const canvas = useThree((three) => three.gl.domElement)
  const invalidate = useThree((three) => three.invalidate)
  useEffect(() => subscribe(invalidate), [invalidate])
  useWalkKeys()
  useDragToLook(canvas)
  const connected: unknown = useThree((three) => three.events.connected)
  useSmoothZoom(eventSourceOf(connected, canvas))
  useFrame(() => {
    const now = performance.now()
    advanceWalk(now)
    advanceCamera(now)
  }, -2)
  useFrame(settleOrbit)
  return null
}
