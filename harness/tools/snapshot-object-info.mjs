import { readFileSync, writeFileSync } from 'node:fs'

const [fullPath] = process.argv.slice(2)
if (!fullPath) {
  console.error('usage: node harness/tools/snapshot-object-info.mjs <object_info.json from a running ComfyUI>')
  process.exit(2)
}

const DETAILED = [
  'LoadImage', 'ImageOnlyCheckpointLoader', 'CLIPVisionEncode', 'Hunyuan3Dv2Conditioning', 'EmptyLatentHunyuan3Dv2',
  'ModelSamplingAuraFlow', 'KSampler', 'VAEDecodeHunyuan3D', 'VoxelToMesh', 'SaveGLB',
  'CheckpointLoaderSimple', 'CLIPTextEncode', 'ControlNetLoader', 'ControlNetApplyAdvanced', 'EmptyLatentImage',
  'VAEDecode', 'SaveImage', 'ImageScale'
]
const contractNodes = JSON.parse(readFileSync('spec/contracts/roomfit-nodes.json', 'utf8'))
const full = JSON.parse(readFileSync(fullPath, 'utf8'))
const pick = ({ input, input_order, output, output_name }) => ({ input, input_order, output, output_name })

const snapshot = {
  source: 'ComfyUI /object_info, local checkout, --cpu, no custom nodes; Roomfit nodes from spec/contracts/roomfit-nodes.json',
  classes: [...new Set([...Object.keys(full), ...Object.keys(contractNodes)])].sort(),
  nodes: {
    ...Object.fromEntries(DETAILED.map((name) => {
      if (!full[name]) throw new Error(`${name} missing from ${fullPath}`)
      return [name, pick(full[name])]
    })),
    ...contractNodes
  }
}
writeFileSync('spec/contracts/comfyui-object-info.json', `${JSON.stringify(snapshot, null, 1)}\n`)
console.log(`snapshot: ${snapshot.classes.length} classes, ${Object.keys(snapshot.nodes).length} detailed`)
