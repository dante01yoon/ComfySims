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
