import {
  Color,
  FloatType,
  Mesh,
  MeshBasicMaterial,
  MeshNormalMaterial,
  PerspectiveCamera,
  ShaderMaterial,
  WebGLRenderTarget,
  type Camera,
  type Material,
  type Object3D,
  type Scene,
  type WebGLRenderer
} from 'three'

import type { RenderPasses } from '../../spec/contracts/editor-api.ts'

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

export function isItemPart(object: Object3D | null): boolean {
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

function depthToGray(depth: Float32Array): Uint8ClampedArray {
  const covered = (pixel: number) => depth[pixel * 4 + 3]! > 0
  const pixelCount = depth.length / 4
  let near = Infinity
  let far = -Infinity
  for (let pixel = 0; pixel < pixelCount; pixel++) {
    if (!covered(pixel)) continue
    near = Math.min(near, depth[pixel * 4]!)
    far = Math.max(far, depth[pixel * 4]!)
  }
  const range = far - near || 1
  const gray = new Uint8ClampedArray(depth.length)
  for (let pixel = 0; pixel < pixelCount; pixel++) {
    const value = covered(pixel) ? (255 * (far - depth[pixel * 4]!)) / range : 0
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

/** Renders depth, camera-space normal and item mask PNGs from the given camera at the requested size. */
export function exportPasses(renderer: WebGLRenderer, scene: Scene, camera: Camera, size: Size): RenderPasses {
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
    return { depth: toPng(depthToGray(depth), size), normal: toPng(normal, size), mask: toPng(mask, size) }
  } finally {
    renderer.setRenderTarget(previous.target)
    renderer.setClearColor(previous.clearColor, previous.clearAlpha)
    scene.background = previous.background
    colorTarget.dispose()
    floatTarget.dispose()
  }
}
