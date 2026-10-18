import { NodeIO, getBounds } from '@gltf-transform/core'

export type GlbMeasurement = {
  sizeCm: { width: number; height: number; depth: number }
  minCm: { x: number; y: number; z: number }
  maxCm: { x: number; y: number; z: number }
  centerCm: { x: number; y: number; z: number }
}

const toCm = (meters: number) => Math.round(meters * 100 * 1000) / 1000

export async function measureGlb(path: string): Promise<GlbMeasurement> {
  const document = await new NodeIO().read(path)
  const scene = document.getRoot().getDefaultScene() ?? document.getRoot().listScenes()[0]
  if (!scene) throw new Error(`${path} has no scene`)
  const { min, max } = getBounds(scene)
  const [minX, minY, minZ] = min.map(toCm) as [number, number, number]
  const [maxX, maxY, maxZ] = max.map(toCm) as [number, number, number]
  return {
    sizeCm: { width: toCm((max[0] - min[0])), height: toCm(max[1] - min[1]), depth: toCm(max[2] - min[2]) },
    minCm: { x: minX, y: minY, z: minZ },
    maxCm: { x: maxX, y: maxY, z: maxZ },
    centerCm: {
      x: toCm((min[0] + max[0]) / 2),
      y: toCm((min[1] + max[1]) / 2),
      z: toCm((min[2] + max[2]) / 2)
    }
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const path = process.argv[2]
  if (!path) {
    console.error('usage: tsx harness/tools/measure-glb.ts <file.glb>')
    process.exit(2)
  }
  console.log(JSON.stringify(await measureGlb(path), null, 2))
}
