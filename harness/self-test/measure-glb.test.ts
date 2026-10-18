import { describe, expect, it } from 'vitest'

import { measureGlb } from '../tools/measure-glb.ts'

describe('AC-2 GLB measuring tool', () => {
  it.for([
    {
      file: 'fixtures/glb/generated-offset-box.glb',
      sizeCm: { width: 100, height: 42.5, depth: 45 },
      centerCm: { x: 30, y: 60, z: -20 }
    },
    {
      file: 'fixtures/glb/sofa-200x90x85-bottom-center.glb',
      sizeCm: { width: 200, height: 85, depth: 90 },
      centerCm: { x: 0, y: 42.5, z: 0 }
    }
  ])('AC-2 measures $file', async ({ file, sizeCm, centerCm }) => {
    const measured = await measureGlb(file)

    expect(measured.sizeCm).toEqual(sizeCm)
    expect(measured.centerCm).toEqual(centerCm)
  })
})
