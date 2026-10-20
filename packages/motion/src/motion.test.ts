import { describe, expect, it } from 'vitest'

import { frameSeconds, orbitDampingFactor, orbitMotion } from './index.ts'

function secondsToSettle(inertiaCm: number, frameGapMs: number): number {
  let remaining = inertiaCm
  let elapsed = 0
  while (elapsed < 10) {
    const seconds = frameSeconds(frameGapMs, true)
    const step = remaining * orbitDampingFactor(seconds)
    remaining -= step
    elapsed += seconds
    if (orbitMotion(step, seconds) !== 'moving') return elapsed
  }
  return Infinity
}

describe('orbit inertia', () => {
  it.each([3, 10, 30, 60, 144])('settles within 1.5 s of release at %i fps', (fps) => {
    for (const inertiaCm of [5, 500, 5000]) expect(secondsToSettle(inertiaCm, 1000 / fps)).toBeLessThanOrEqual(1.5)
  })

  it('coasts for more than one frame after a real release at every frame rate', () => {
    expect(secondsToSettle(500, 1000 / 3)).toBeGreaterThan(1 / 3)
    expect(secondsToSettle(500, 1000 / 60)).toBeGreaterThan(0.3)
  })

  it('judges the same speed alike whether frames are fast or slow', () => {
    expect(orbitMotion(0.1, 1 / 60)).toBe('moving')
    expect(orbitMotion(2, 1 / 3)).toBe('moving')
    expect(orbitMotion(0.025, 1 / 60)).toBe('slow')
    expect(orbitMotion(0.5, 1 / 3)).toBe('slow')
    expect(orbitMotion(0, 1 / 3)).toBe('still')
  })
})

describe('frame seconds', () => {
  it('uses the real gap of a slow frame while motion continues', () => {
    expect(frameSeconds(333, true)).toBeCloseTo(0.333)
  })

  it('counts the first frame after an idle canvas as one steady frame', () => {
    expect(frameSeconds(5000, false)).toBeCloseTo(1 / 60)
  })
})
