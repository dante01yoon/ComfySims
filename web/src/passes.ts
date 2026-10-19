import { Color, FloatType, Mesh, MeshBasicMaterial, MeshNormalMaterial, PerspectiveCamera, ShaderMaterial, Vector3, WebGLRenderTarget } from 'three'
import type { Camera, Material, Object3D, Scene, WebGLRenderer } from 'three'

import type { RenderPasses, Vec3 } from '../../spec/contracts/editor-api.ts'

type Size = { width: number; height: number }
type Pixels = Uint8Array | Float32Array

const normalMaterial = new MeshNormalMaterial()
const itemMaskMaterial = new MeshBasicMaterial({ color: 0xffffff })
const backgroundMaskMaterial = new MeshBasicMaterial({ color: 0x000000 })
const viewDepthMaterial = new ShaderMaterial({
  vertexShader: `
    varying float vViewDepth;
    void main() {
      vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
      vViewDepth = -viewPosition.z;
      gl_Position = projectionMatrix * viewPosition;
    }`,
  fragmentShader: `
    varying float vViewDepth;
    void main() { gl_FragColor = vec4(vViewDepth, 0.0, 0.0, 1.0); }`
})

const distanceMaterial = new ShaderMaterial({
  vertexShader: `
    varying vec3 vViewPosition;
    void main() {
      vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
      vViewPosition = viewPosition.xyz;
      gl_Position = projectionMatrix * viewPosition;
    }`,
  fragmentShader: `
    varying vec3 vViewPosition;
    void main() { gl_FragColor = vec4(length(vViewPosition), 0.0, 0.0, 1.0); }`
})

function isItemPart(object: Object3D | null): boolean {
  return object !== null && (typeof object.userData.itemId === 'string' || isItemPart(object.parent))
}

const sidedOverrides = new Map<string, Material>()

function onSideOf(override: Material, original: Mesh['material']): Material {
  const side = [original].flat()[0]?.side ?? override.side
  if (side === override.side) return override
  const key = `${override.uuid}:${side}`
  const cached = sidedOverrides.get(key)
  if (cached) return cached
  const sided = override.clone()
  sided.side = side
  sidedOverrides.set(key, sided)
  return sided
}

function passCamera(camera: Camera, size: Size): Camera {
  if (!(camera instanceof PerspectiveCamera)) return camera
  const copy = camera.clone()
  copy.aspect = size.width / size.height
  copy.updateProjectionMatrix()
  return copy
}

function renderPass<T extends Pixels>(
  renderer: WebGLRenderer,
  scene: Scene,
  camera: Camera,
  target: WebGLRenderTarget,
  pixels: T,
  materialFor: (mesh: Mesh) => Material
): T {
  const originals = new Map<Mesh, Mesh['material']>()
  scene.traverse((object) => {
    if (!(object instanceof Mesh)) return
    originals.set(object, object.material)
    object.material = onSideOf(materialFor(object), object.material)
  })
  renderer.setRenderTarget(target)
  renderer.clear()
  renderer.render(scene, camera)
  renderer.readRenderTargetPixels(target, 0, 0, target.width, target.height, pixels)
  originals.forEach((material, mesh) => {
    mesh.material = material
  })
  return pixels
}

/** A fixed depth range in cm; anything farther renders black. */
export type DepthRange = { nearCm: number; farCm: number }

function coveredRange(depth: Float32Array, covered: (pixel: number) => boolean): DepthRange {
  let nearCm = Infinity
  let farCm = -Infinity
  for (let pixel = 0; pixel < depth.length / 4; pixel++) {
    if (!covered(pixel)) continue
    nearCm = Math.min(nearCm, depth[pixel * 4]!)
    farCm = Math.max(farCm, depth[pixel * 4]!)
  }
  return { nearCm, farCm }
}

function depthToGray(depth: Float32Array, fixed?: DepthRange): Uint8ClampedArray {
  const covered = (pixel: number) => depth[pixel * 4 + 3]! > 0
  const pixelCount = depth.length / 4
  const { nearCm: near, farCm: far } = fixed ?? coveredRange(depth, covered)
  const range = far - near || 1
  const gray = new Uint8ClampedArray(depth.length)
  for (let pixel = 0; pixel < pixelCount; pixel++) {
    const value = covered(pixel) && depth[pixel * 4]! <= far ? (255 * (far - depth[pixel * 4]!)) / range : 0
    gray.set([value, value, value, 255], pixel * 4)
  }
  return gray
}

function toPng(pixels: Uint8Array | Uint8ClampedArray, { width, height }: Size): string {
  const rowBytes = width * 4
  const image = new ImageData(width, height)
  for (let row = 0; row < height; row++) {
    image.data.set(pixels.subarray(row * rowBytes, (row + 1) * rowBytes), (height - 1 - row) * rowBytes)
  }
  for (let alpha = 3; alpha < image.data.length; alpha += 4) image.data[alpha] = 255
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  canvas.getContext('2d')!.putImageData(image, 0, 0)
  return canvas.toDataURL('image/png')
}

/** Renders depth (over the covered range, or a fixed one), camera-space normal and item mask PNGs from the given camera at the requested size. */
export function exportPasses(renderer: WebGLRenderer, scene: Scene, camera: Camera, size: Size, depthRange?: DepthRange): RenderPasses {
  const view = passCamera(camera, size)
  const colorTarget = new WebGLRenderTarget(size.width, size.height)
  const floatTarget = new WebGLRenderTarget(size.width, size.height, { type: FloatType })
  const pixelCount = size.width * size.height * 4
  const previous = { target: renderer.getRenderTarget(), clearColor: renderer.getClearColor(new Color()), clearAlpha: renderer.getClearAlpha(), background: scene.background }
  renderer.setClearColor(0x000000, 0)
  scene.background = null
  try {
    const depth = renderPass(renderer, scene, view, floatTarget, new Float32Array(pixelCount), () => viewDepthMaterial)
    const normal = renderPass(renderer, scene, view, colorTarget, new Uint8Array(pixelCount), () => normalMaterial)
    const mask = renderPass(renderer, scene, view, colorTarget, new Uint8Array(pixelCount), (mesh) =>
      isItemPart(mesh) ? itemMaskMaterial : backgroundMaskMaterial
    )
    return { depth: toPng(depthToGray(depth, depthRange), size), normal: toPng(normal, size), mask: toPng(mask, size) }
  } finally {
    renderer.setRenderTarget(previous.target)
    renderer.setClearColor(previous.clearColor, previous.clearAlpha)
    scene.background = previous.background
    colorTarget.dispose()
    floatTarget.dispose()
  }
}

const CUBE_FACE_SIZE = 1024
const NEAREST_CM = 40
const DEPTH_RANGE_CM = 560
const CUBE_FACES: { look: Vec3; up: Vec3 }[] = [
  { look: { x: 1, y: 0, z: 0 }, up: { x: 0, y: 1, z: 0 } },
  { look: { x: -1, y: 0, z: 0 }, up: { x: 0, y: 1, z: 0 } },
  { look: { x: 0, y: 1, z: 0 }, up: { x: 0, y: 0, z: 1 } },
  { look: { x: 0, y: -1, z: 0 }, up: { x: 0, y: 0, z: 1 } },
  { look: { x: 0, y: 0, z: 1 }, up: { x: 0, y: 1, z: 0 } },
  { look: { x: 0, y: 0, z: -1 }, up: { x: 0, y: 1, z: 0 } }
]

/** A ceiling the scene does not draw: its height and whether a floor-plan point lies under it. */
export type Ceiling = { heightCm: number; covers: (point: { x: number; z: number }) => boolean }

type Directions = { x: Float32Array; y: Float32Array; z: Float32Array }

function equirectangularDirections({ width, height }: Size): Directions {
  const directions = { x: new Float32Array(width * height), y: new Float32Array(width * height), z: new Float32Array(width * height) }
  for (let row = 0; row < height; row++) {
    const pitch = Math.PI / 2 - ((row + 0.5) / height) * Math.PI
    for (let column = 0; column < width; column++) {
      const yaw = ((column + 0.5) / width) * 2 * Math.PI - Math.PI
      const pixel = row * width + column
      directions.x[pixel] = Math.sin(yaw) * Math.cos(pitch)
      directions.y[pixel] = Math.sin(pitch)
      directions.z[pixel] = Math.cos(yaw) * Math.cos(pitch)
    }
  }
  return directions
}

function faceOf({ x, y, z }: Directions, pixel: number): number {
  const [ax, ay, az] = [Math.abs(x[pixel]!), Math.abs(y[pixel]!), Math.abs(z[pixel]!)]
  if (ax >= ay && ax >= az) return x[pixel]! > 0 ? 0 : 1
  if (ay >= az) return y[pixel]! > 0 ? 2 : 3
  return z[pixel]! > 0 ? 4 : 5
}

function faceCamera(eye: Vec3, { look, up }: { look: Vec3; up: Vec3 }): PerspectiveCamera {
  const camera = new PerspectiveCamera(90, 1, 1, 20000)
  camera.position.set(eye.x, eye.y, eye.z)
  camera.up.set(up.x, up.y, up.z)
  camera.lookAt(eye.x + look.x, eye.y + look.y, eye.z + look.z)
  camera.updateMatrixWorld()
  return camera
}

function sampleFace(distances: Float32Array, face: Float32Array, camera: PerspectiveCamera, directions: Directions, faces: Uint8Array, index: number): void {
  const view = new Vector3()
  const last = CUBE_FACE_SIZE - 1
  const texel = (ndc: number) => Math.min(last, Math.max(0, Math.floor(((ndc + 1) / 2) * CUBE_FACE_SIZE)))
  for (let pixel = 0; pixel < faces.length; pixel++) {
    if (faces[pixel] !== index) continue
    view.set(directions.x[pixel]!, directions.y[pixel]!, directions.z[pixel]!).transformDirection(camera.matrixWorldInverse)
    const sample = (texel(view.y / -view.z) * CUBE_FACE_SIZE + texel(view.x / -view.z)) * 4
    distances[pixel] = face[sample + 3]! > 0 ? face[sample]! : Infinity
  }
}

function underCeiling(distances: Float32Array, directions: Directions, eye: Vec3, { heightCm, covers }: Ceiling): void {
  for (let pixel = 0; pixel < distances.length; pixel++) {
    const up = directions.y[pixel]!
    if (up <= 0) continue
    const distance = (heightCm - eye.y) / up
    if (distance < distances[pixel]! && covers({ x: eye.x + directions.x[pixel]! * distance, z: eye.z + directions.z[pixel]! * distance })) distances[pixel] = distance
  }
}

function nearIsLight(distances: Float32Array, size: Size): string {
  const image = new ImageData(size.width, size.height)
  distances.forEach((distance, pixel) => {
    const gray = 255 * Math.min(1, Math.max(0, 1 - (distance - NEAREST_CM) / DEPTH_RANGE_CM))
    image.data.set([gray, gray, gray, 255], pixel * 4)
  })
  const canvas = document.createElement('canvas')
  canvas.width = size.width
  canvas.height = size.height
  canvas.getContext('2d')!.putImageData(image, 0, 0)
  return canvas.toDataURL('image/png')
}

/** Renders an equirectangular depth PNG from the eye through six cube faces: 40 cm is white, 6 m and anything not hit black. */
export function exportDepthPanorama(renderer: WebGLRenderer, scene: Scene, eye: Vec3, ceiling: Ceiling, size: Size): string {
  const target = new WebGLRenderTarget(CUBE_FACE_SIZE, CUBE_FACE_SIZE, { type: FloatType })
  const previous = { target: renderer.getRenderTarget(), clearColor: renderer.getClearColor(new Color()), clearAlpha: renderer.getClearAlpha(), background: scene.background }
  const directions = equirectangularDirections(size)
  const faces = Uint8Array.from({ length: size.width * size.height }, (_, pixel) => faceOf(directions, pixel))
  const distances = new Float32Array(size.width * size.height)
  const face = new Float32Array(CUBE_FACE_SIZE * CUBE_FACE_SIZE * 4)
  renderer.setClearColor(0x000000, 0)
  scene.background = null
  try {
    CUBE_FACES.forEach((orientation, index) => {
      const camera = faceCamera(eye, orientation)
      renderPass(renderer, scene, camera, target, face, () => distanceMaterial)
      sampleFace(distances, face, camera, directions, faces, index)
    })
  } finally {
    renderer.setRenderTarget(previous.target)
    renderer.setClearColor(previous.clearColor, previous.clearAlpha)
    scene.background = previous.background
    target.dispose()
  }
  underCeiling(distances, directions, eye, ceiling)
  return nearIsLight(distances, size)
}
