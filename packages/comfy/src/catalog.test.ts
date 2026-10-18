import { describe, expect, it } from 'vitest'

import { missingFromCatalog } from './index.ts'

const workflow = {
  '1': { class_type: 'LoadImage', inputs: { image: 'roomfit-depth.png' } },
  '2': { class_type: 'ControlNetLoader', inputs: { control_net_name: 'depth.safetensors' } },
  '3': { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: 'sdxl.safetensors' } },
  '4': { class_type: 'MoGeInference', inputs: { model: ['3', 0] } }
}

describe('missingFromCatalog', () => {
  it('names absent classes and model files, in both combo formats, and ignores upload inputs', () => {
    const catalog = {
      LoadImage: { input: { required: { image: [['other.png'], { image_upload: true }] } } },
      ControlNetLoader: { input: { required: { control_net_name: [['canny.safetensors']] } } },
      CheckpointLoaderSimple: { input: { required: { ckpt_name: ['COMBO', { options: ['flux.safetensors'] }] } } }
    }
    expect(missingFromCatalog(workflow, catalog, 'local')).toEqual(['depth.safetensors', 'sdxl.safetensors', 'MoGeInference'])
  })

  it('names files from empty option lists in both combo formats and accepts installed files', () => {
    const catalog = {
      LoadImage: { input: { required: { image: [[], { image_upload: true }] } } },
      ControlNetLoader: { input: { required: { control_net_name: [[]] } } },
      CheckpointLoaderSimple: { input: { required: { ckpt_name: ['COMBO', { options: [] }] } } },
      MoGeInference: {}
    }
    expect(missingFromCatalog(workflow, catalog, 'local')).toEqual(['depth.safetensors', 'sdxl.safetensors'])
    expect(missingFromCatalog(workflow, { ...catalog, CheckpointLoaderSimple: { input: { required: { ckpt_name: [['sdxl.safetensors']] } } } }, 'local')).toEqual(['depth.safetensors'])
  })

  it('on Cloud names only absent classes, never model files', () => {
    const catalog = { LoadImage: {}, ControlNetLoader: { input: { required: { control_net_name: [[]] } } }, CheckpointLoaderSimple: {} }
    expect(missingFromCatalog(workflow, catalog, 'cloud')).toEqual(['MoGeInference'])
  })
})
