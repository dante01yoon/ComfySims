import { Document, NodeIO } from '@gltf-transform/core'
import { fileURLToPath } from 'node:url'
import { deflateSync } from 'node:zlib'

const SEGMENTS = { around: 260, up: 230 }
const TEXTURE_PX = 2048
const RADIUS_M = 0.4

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
const crc32 = (bytes: Uint8Array) => {
  let c = 0xffffffff
  for (const byte of bytes) c = crcTable[(c ^ byte) & 0xff]! ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
const chunk = (type: string, data: Uint8Array) => {
  const body = new Uint8Array([...Buffer.from(type, 'ascii'), ...data])
  const out = Buffer.alloc(12 + data.length)
  out.writeUInt32BE(data.length, 0)
  out.set(body, 4)
  out.writeUInt32BE(crc32(body), 8 + data.length)
  return out
}

/** A size × size RGBA PNG whose pixels come from `pixel(x, y)`. */
export function png(size: number, pixel: (x: number, y: number) => [number, number, number, number]): Uint8Array {
  const raw = Buffer.alloc(size * (size * 4 + 1))
  for (let y = 0; y < size; y += 1) {
    const row = y * (size * 4 + 1)
    for (let x = 0; x < size; x += 1) raw.set(pixel(x, y), row + 1 + x * 4)
  }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(size, 0)
  header.writeUInt32BE(size, 4)
  header.set([8, 6, 0, 0, 0], 8)
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', header), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', new Uint8Array())])
}

/** A UV sphere as heavy as an image-to-3D output: ~120k triangles and three 2048² textures. */
export function heavyDocument(): Document {
  const positions: number[] = []
  const normals: number[] = []
  const uvs: number[] = []
  for (let j = 0; j <= SEGMENTS.up; j += 1) {
    const v = j / SEGMENTS.up
    const phi = v * Math.PI
    for (let i = 0; i <= SEGMENTS.around; i += 1) {
      const u = i / SEGMENTS.around
      const theta = u * Math.PI * 2
      const normal = [Math.sin(phi) * Math.cos(theta), Math.cos(phi), Math.sin(phi) * Math.sin(theta)]
      positions.push(...normal.map((component) => component * RADIUS_M))
      normals.push(...normal)
      uvs.push(u, v)
    }
  }
  const indices: number[] = []
  const row = SEGMENTS.around + 1
  for (let j = 0; j < SEGMENTS.up; j += 1) {
    for (let i = 0; i < SEGMENTS.around; i += 1) {
      const a = j * row + i
      indices.push(a, a + row, a + 1, a + 1, a + row, a + row + 1)
    }
  }
  const document = new Document()
  const buffer = document.createBuffer()
  const accessor = (type: 'VEC3' | 'VEC2' | 'SCALAR', array: Float32Array | Uint32Array) => document.createAccessor().setType(type).setArray(array).setBuffer(buffer)
  const texture = (name: string, pixel: (x: number, y: number) => [number, number, number, number]) =>
    document.createTexture(name).setMimeType('image/png').setImage(png(TEXTURE_PX, pixel))
  const material = document
    .createMaterial('heavy')
    .setBaseColorTexture(texture('baseColor', (x, y) => [128 + ((x >> 6) % 2) * 60, 90 + ((y >> 6) % 2) * 50, 70, 255]))
    .setNormalTexture(texture('normal', () => [128, 128, 255, 255]))
    .setMetallicRoughnessTexture(texture('metallicRoughness', (x) => [0, 140 + (x % 32), 0, 255]))
  const primitive = document
    .createPrimitive()
    .setAttribute('POSITION', accessor('VEC3', new Float32Array(positions)))
    .setAttribute('NORMAL', accessor('VEC3', new Float32Array(normals)))
    .setAttribute('TEXCOORD_0', accessor('VEC2', new Float32Array(uvs)))
    .setIndices(accessor('SCALAR', new Uint32Array(indices)))
    .setMaterial(material)
  document.getRoot().setDefaultScene(document.createScene().addChild(document.createNode().setMesh(document.createMesh().addPrimitive(primitive))))
  return document
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const target = fileURLToPath(new URL('../../fixtures/glb/heavy-generated.glb', import.meta.url))
  await new NodeIO().write(target, heavyDocument())
  console.log('wrote fixtures/glb/heavy-generated.glb')
}
