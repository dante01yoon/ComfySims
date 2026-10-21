import { describe, expect, it } from 'vitest'

import { walkthroughPath } from '../packages/motion/src/index.ts'

type Pose = { position: { x: number; y: number; z: number }; target: { x: number; y: number; z: number } }

const start: Pose = { position: { x: 0, y: 160, z: 0 }, target: { x: 0, y: 150, z: 300 } }
const yawDeg = ({ position, target }: Pose) => (Math.atan2(target.x - position.x, target.z - position.z) * 180) / Math.PI
const travelledCm = ({ position }: Pose) => Math.hypot(position.x - start.position.x, position.z - start.position.z)
const reach = ({ position, target }: Pose) => Math.hypot(target.x - position.x, target.z - position.z)
const open = () => false

describe('AC-136 walkthrough camera path', () => {
  it('AC-136 an open room: 121 poses from the start, a 160 cm smoothstep dolly and a +25° pan at fixed height and pitch', () => {
    const path = walkthroughPath(start, open)

    expect(path.poses).toHaveLength(121)
    expect(path.dollyCm).toBe(160)
    expect(path.poses[0]).toEqual(start)
    expect(travelledCm(path.poses[120]!)).toBeCloseTo(160, 5)
    expect(travelledCm(path.poses[60]!)).toBeCloseTo(80, 5)
    expect(travelledCm(path.poses[30]!)).toBeCloseTo(160 * (0.25 * 0.25 * (3 - 2 * 0.25)), 5)
    expect(yawDeg(path.poses[120]!) - yawDeg(start)).toBeCloseTo(25, 5)
    for (const pose of path.poses) {
      expect(pose.position.y).toBe(160)
      expect(pose.target.y - pose.position.y).toBeCloseTo(-10, 5)
      expect(reach(pose)).toBeCloseTo(300, 5)
    }
    const travel = path.poses.map(travelledCm)
    expect(travel.every((value, index) => index === 0 || value >= travel[index - 1]! - 1e-9)).toBe(true)
  })

  it('AC-136 a wall ahead shortens the dolly in 10 cm steps until every eye is clear', () => {
    const wallAt125 = (eye: { x: number; z: number }) => eye.z > 125
    const path = walkthroughPath(start, wallAt125)

    expect(path.dollyCm).toBe(120)
    expect(path.poses).toHaveLength(121)
    expect(path.poses.every((pose) => !wallAt125(pose.position))).toBe(true)
    expect(travelledCm(path.poses[120]!)).toBeCloseTo(120, 5)
  })

  it('AC-136 below 40 cm of room the path only pans', () => {
    const path = walkthroughPath(start, (eye) => eye.z > 35)

    expect(path.dollyCm).toBe(0)
    expect(path.poses.every((pose) => travelledCm(pose) === 0)).toBe(true)
    expect(yawDeg(path.poses[120]!) - yawDeg(start)).toBeCloseTo(25, 5)
  })
})
