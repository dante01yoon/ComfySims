import { CanvasTexture, Color, RepeatWrapping, SRGBColorSpace } from 'three'

import type { FloorMaterial } from '../../packages/schema/src/index.ts'

const TEXTURE_PIXELS = 512

type Painter = { tileCm: number; paint: (context: CanvasRenderingContext2D, random: () => number) => void }

/** Deterministic pseudo-random numbers in [0, 1). */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function shade(base: string, amount: number): string {
  const color = new Color(base)
  return `#${color.offsetHSL(0, 0, amount).getHexString()}`
}

function speckle(context: CanvasRenderingContext2D, random: () => number, color: string, count: number, alpha: number): void {
  context.fillStyle = color
  for (let i = 0; i < count; i++) {
    context.globalAlpha = alpha * random()
    context.fillRect(random() * TEXTURE_PIXELS, random() * TEXTURE_PIXELS, 1 + random() * 2, 1 + random() * 2)
  }
  context.globalAlpha = 1
}

function planks(base: string, rows: number): Painter['paint'] {
  return (context, random) => {
    const rowHeight = TEXTURE_PIXELS / rows
    for (let row = 0; row < rows; row++) {
      let x = -random() * TEXTURE_PIXELS * 0.6
      while (x < TEXTURE_PIXELS) {
        const length = TEXTURE_PIXELS * (0.35 + random() * 0.4)
        context.fillStyle = shade(base, (random() - 0.5) * 0.08)
        context.fillRect(x, row * rowHeight, length, rowHeight)
        context.strokeStyle = shade(base, -0.06)
        context.globalAlpha = 0.35
        for (let grain = 0; grain < 5; grain++) {
          const y = row * rowHeight + random() * rowHeight
          context.beginPath()
          context.moveTo(x, y)
          context.bezierCurveTo(x + length / 3, y + (random() - 0.5) * 6, x + (2 * length) / 3, y + (random() - 0.5) * 6, x + length, y)
          context.stroke()
        }
        context.globalAlpha = 1
        context.fillStyle = shade(base, -0.16)
        context.fillRect(x, row * rowHeight, 1.5, rowHeight)
        x += length
      }
      context.fillStyle = shade(base, -0.16)
      context.fillRect(0, row * rowHeight, TEXTURE_PIXELS, 1.5)
    }
  }
}

function tiles(base: string, grout: string, perSide: number): Painter['paint'] {
  return (context, random) => {
    const size = TEXTURE_PIXELS / perSide
    context.fillStyle = grout
    context.fillRect(0, 0, TEXTURE_PIXELS, TEXTURE_PIXELS)
    for (let row = 0; row < perSide; row++) {
      for (let column = 0; column < perSide; column++) {
        context.fillStyle = shade(base, (random() - 0.5) * 0.025)
        context.fillRect(column * size + 2, row * size + 2, size - 4, size - 4)
      }
    }
    speckle(context, random, '#ffffff', 900, 0.25)
  }
}

function concrete(base: string): Painter['paint'] {
  return (context, random) => {
    context.fillStyle = base
    context.fillRect(0, 0, TEXTURE_PIXELS, TEXTURE_PIXELS)
    speckle(context, random, shade(base, -0.12), 5000, 0.5)
    speckle(context, random, shade(base, 0.1), 3000, 0.4)
    context.fillStyle = shade(base, -0.15)
    context.fillRect(0, 0, TEXTURE_PIXELS, 2)
    context.fillRect(0, 0, 2, TEXTURE_PIXELS)
  }
}

function fibres(base: string): Painter['paint'] {
  return (context, random) => {
    context.fillStyle = base
    context.fillRect(0, 0, TEXTURE_PIXELS, TEXTURE_PIXELS)
    speckle(context, random, shade(base, -0.1), 12000, 0.5)
  }
}

const PAINTERS: Record<FloorMaterial, Painter> = {
  oak: { tileCm: 180, paint: planks('#c99f68', 9) },
  walnut: { tileCm: 180, paint: planks('#6e4a30', 9) },
  tile: { tileCm: 120, paint: tiles('#e6e2da', '#c4beb3', 2) },
  concrete: { tileCm: 300, paint: concrete('#a8a49d') },
  carpet: { tileCm: 100, paint: fibres('#b9ad9a') }
}

const cache = new Map<FloorMaterial, CanvasTexture>()

/** A procedural floor texture whose UVs are centimeters, so one repeat covers `tileCm`. */
export function floorTexture(floor: FloorMaterial): CanvasTexture {
  const cached = cache.get(floor)
  if (cached) return cached
  const { tileCm, paint } = PAINTERS[floor]
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = TEXTURE_PIXELS
  paint(canvas.getContext('2d')!, seededRandom(floor.length * 7919))
  const texture = new CanvasTexture(canvas)
  texture.wrapS = texture.wrapT = RepeatWrapping
  texture.repeat.set(1 / tileCm, 1 / tileCm)
  texture.colorSpace = SRGBColorSpace
  texture.anisotropy = 8
  cache.set(floor, texture)
  return texture
}
