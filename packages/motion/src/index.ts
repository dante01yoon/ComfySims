const STEADY_FRAME_SECONDS = 1 / 60
const ORBIT_DAMPING_SECONDS = 0.1
const ORBIT_STILL_CM_PER_S = 0.06
const ORBIT_SETTLED_CM_PER_S = 3

export type OrbitMotion = 'still' | 'slow' | 'moving'

/** Seconds a frame advances motion by: the real gap while motion continues, else one steady frame, as the gap after an idle canvas is not motion time. */
export function frameSeconds(gapMs: number, continuing: boolean): number {
  return continuing ? gapMs / 1000 : STEADY_FRAME_SECONDS
}

/** Share of the remaining orbit inertia the controls apply in a frame, so inertia decays at the same rate at any frame rate. */
export function orbitDampingFactor(seconds: number): number {
  return 1 - Math.exp(-seconds / ORBIT_DAMPING_SECONDS)
}

/** How fast the orbit camera moved in a frame, judged by speed so the verdict does not depend on frame rate. */
export function orbitMotion(stepCm: number, seconds: number): OrbitMotion {
  const speed = stepCm / Math.max(seconds, Number.EPSILON)
  return speed <= ORBIT_STILL_CM_PER_S ? 'still' : speed < ORBIT_SETTLED_CM_PER_S ? 'slow' : 'moving'
}

const WALKTHROUGH_FRAMES = 121
const WALKTHROUGH_PAN_DEG = 25
const WALKTHROUGH_DOLLY_CM = { longest: 160, shortest: 40, step: 10 }

type Point3 = { x: number; y: number; z: number }

/** A camera pose in centimeters: where the eye is and the point it looks at. */
export type WalkthroughPose = { position: Point3; target: Point3 }

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t)
}

function walkthroughPoses(start: WalkthroughPose, dollyCm: number): WalkthroughPose[] {
  const { position, target } = start
  const look = { x: target.x - position.x, y: target.y - position.y, z: target.z - position.z }
  const reach = Math.hypot(look.x, look.z)
  const forward = { x: look.x / reach, z: look.z / reach }
  return Array.from({ length: WALKTHROUGH_FRAMES }, (_, frame) => {
    if (frame === 0) return structuredClone(start)
    const eased = smoothstep(frame / (WALKTHROUGH_FRAMES - 1))
    const pan = (eased * WALKTHROUGH_PAN_DEG * Math.PI) / 180
    const travel = eased * dollyCm
    const eye = { x: position.x + forward.x * travel, y: position.y, z: position.z + forward.z * travel }
    const turned = { x: look.x * Math.cos(pan) + look.z * Math.sin(pan), z: look.z * Math.cos(pan) - look.x * Math.sin(pan) }
    return { position: eye, target: { x: eye.x + turned.x, y: eye.y + look.y, z: eye.z + turned.z } }
  })
}

/** The 121-frame walkthrough from a start pose: a smoothstep dolly along the view direction and a +25° pan at fixed height and pitch; the dolly shrinks in 10 cm steps until no eye is blocked, and is dropped below 40 cm. */
export function walkthroughPath(start: WalkthroughPose, blocked: (eye: { x: number; z: number }) => boolean): { poses: WalkthroughPose[]; dollyCm: number } {
  for (let dollyCm = WALKTHROUGH_DOLLY_CM.longest; dollyCm >= WALKTHROUGH_DOLLY_CM.shortest; dollyCm -= WALKTHROUGH_DOLLY_CM.step) {
    const poses = walkthroughPoses(start, dollyCm)
    if (!poses.some(({ position }) => blocked(position))) return { poses, dollyCm }
  }
  return { poses: walkthroughPoses(start, 0), dollyCm: 0 }
}
