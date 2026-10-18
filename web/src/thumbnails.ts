import { AmbientLight, Box3, DirectionalLight, PerspectiveCamera, Scene, Vector3, WebGLRenderer, type Object3D } from 'three'

const THUMBNAIL_PX = 64
const FIELD_OF_VIEW_DEG = 35
const VIEW_DIRECTION = new Vector3(1, 0.8, 1.4).normalize()
const thumbnails = new WeakMap<Object3D, string>()
let renderer: WebGLRenderer | null = null

function thumbnailRenderer(): WebGLRenderer {
  if (!renderer) {
    renderer = new WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true })
    renderer.setSize(THUMBNAIL_PX, THUMBNAIL_PX, false)
  }
  return renderer
}

function framingCamera(model: Object3D): PerspectiveCamera {
  const bounds = new Box3().setFromObject(model)
  const center = bounds.getCenter(new Vector3())
  const radius = bounds.getSize(new Vector3()).length() / 2 || 1
  const distance = radius / Math.sin((FIELD_OF_VIEW_DEG * Math.PI) / 360)
  const camera = new PerspectiveCamera(FIELD_OF_VIEW_DEG, 1, distance / 100, distance * 10)
  camera.position.copy(center).addScaledVector(VIEW_DIRECTION, distance)
  camera.lookAt(center)
  return camera
}

/** A 64 px picture of a model, rendered locally once per model. */
export function thumbnailOf(model: Object3D): string {
  const cached = thumbnails.get(model)
  if (cached) return cached
  const copy = model.clone()
  const sun = new DirectionalLight('#ffffff', 2)
  sun.position.set(1, 2, 1.5)
  const scene = new Scene().add(copy, new AmbientLight('#ffffff', 1.2), sun)
  const gl = thumbnailRenderer()
  gl.render(scene, framingCamera(copy))
  const picture = gl.domElement.toDataURL('image/png')
  thumbnails.set(model, picture)
  return picture
}
