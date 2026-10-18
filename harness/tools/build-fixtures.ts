import { Document, NodeIO } from '@gltf-transform/core'
import { fileURLToPath } from 'node:url'

type Box = { size: [number, number, number]; center: [number, number, number]; yawDegrees?: number }

function boxDocument({ size, center, yawDegrees = 0 }: Box): Document {
  const yaw = (yawDegrees * Math.PI) / 180
  const [sx, sy, sz] = size.map((value) => value / 2) as [number, number, number]
  const [cx, cy, cz] = center
  const corners = [
    [-sx, -sy, -sz], [sx, -sy, -sz], [sx, sy, -sz], [-sx, sy, -sz],
    [-sx, -sy, sz], [sx, -sy, sz], [sx, sy, sz], [-sx, sy, sz]
  ].flatMap(([x, y, z]) => [x! * Math.cos(yaw) + z! * Math.sin(yaw) + cx, y! + cy, -x! * Math.sin(yaw) + z! * Math.cos(yaw) + cz])
  const inwardFaces = [0, 1, 2, 0, 2, 3, 4, 6, 5, 4, 7, 6, 0, 4, 5, 0, 5, 1, 3, 2, 6, 3, 6, 7, 0, 3, 7, 0, 7, 4, 1, 5, 6, 1, 6, 2]
  const faces = inwardFaces.map((_, index) => inwardFaces[index - (index % 3) + [0, 2, 1][index % 3]!]!)

  const document = new Document()
  const buffer = document.createBuffer()
  const position = document.createAccessor().setType('VEC3').setArray(new Float32Array(corners)).setBuffer(buffer)
  const indices = document.createAccessor().setType('SCALAR').setArray(new Uint16Array(faces)).setBuffer(buffer)
  const mesh = document.createMesh().addPrimitive(
    document.createPrimitive().setAttribute('POSITION', position).setIndices(indices)
  )
  const scene = document.createScene().addChild(document.createNode().setMesh(mesh))
  document.getRoot().setDefaultScene(scene)
  return document
}

export const fixtureBoxes = {
  'generated-offset-box.glb': { size: [1, 0.425, 0.45], center: [0.3, 0.6, -0.2] },
  'generated-squashed-box.glb': { size: [1, 0.3, 0.45], center: [-0.1, 0.05, 0.4] },
  'generated-flat-plane.glb': { size: [1, 0, 0.45], center: [0, 0, 0] },
  'generated-yawed-box.glb': { size: [1, 0.425, 0.45], center: [0.1, 0.3, 0.2], yawDegrees: 35 },
  'generated-yawed-deep-box.glb': { size: [0.45, 0.425, 1], center: [0, 0.3, 0], yawDegrees: -20 },
  'sofa-200x90x85-bottom-center.glb': { size: [2, 0.85, 0.9], center: [0, 0.425, 0] }
} satisfies Record<string, Box>

const io = new NodeIO()
for (const [name, box] of Object.entries(fixtureBoxes)) {
  const target = fileURLToPath(new URL(`../../fixtures/glb/${name}`, import.meta.url))
  await io.write(target, boxDocument(box))
  console.log(`wrote fixtures/glb/${name}`)
}

function cameraSpacePlane(): Document {
  const document = new Document()
  const buffer = document.createBuffer()
  const corners = [-2, -1.5, -4, 2, -1.5, -4, 2, 1.5, -4, -2, 1.5, -4]
  const position = document.createAccessor().setType('VEC3').setArray(new Float32Array(corners)).setBuffer(buffer)
  const indices = document.createAccessor().setType('SCALAR').setArray(new Uint16Array([0, 1, 2, 0, 2, 3])).setBuffer(buffer)
  const mesh = document.createMesh().addPrimitive(document.createPrimitive().setAttribute('POSITION', position).setIndices(indices))
  document.getRoot().setDefaultScene(document.createScene().addChild(document.createNode().setMesh(mesh)))
  return document
}

await io.write(fileURLToPath(new URL('../../fixtures/glb/photo3d-plane.glb', import.meta.url)), cameraSpacePlane())
console.log('wrote fixtures/glb/photo3d-plane.glb')

const sceneless = new Document()
sceneless.createBuffer()
sceneless.createMesh()
await io.write(fileURLToPath(new URL('../../fixtures/glb/no-scene.glb', import.meta.url)), sceneless)
console.log('wrote fixtures/glb/no-scene.glb')
