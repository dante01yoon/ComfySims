import type { ImportedProduct } from '../../spec/contracts/editor-api.ts'

type Axis = 'width' | 'depth' | 'height'
type Size = Record<Axis, number | null>

function sendToComfySims(origin: string): void {
  const CM_PER_UNIT: Record<string, number> = { in: 2.54, inch: 2.54, inches: 2.54, '"': 2.54, INH: 2.54, cm: 1, CMT: 1, mm: 0.1, MMT: 0.1, m: 100, MTR: 100 }
  const tenth = (cm: number) => Math.round(cm * 10) / 10
  const text = (selector: string) => document.querySelector(selector)?.textContent?.trim() || null
  const meta = (property: string) => document.querySelector(`meta[property="${property}"]`)?.getAttribute('content')?.trim() || null

  const amountOf = (written: string) => {
    const [whole = '', fraction] = written.trim().split(/\s+/)
    const [over, under] = (fraction ?? '').split('/').map(Number)
    return Number(whole) + (over !== undefined && under ? over / under : 0)
  }

  const cmOf = (value: unknown): number | null => {
    if (typeof value === 'number') return tenth(value)
    if (typeof value === 'object' && value !== null && 'value' in value) {
      const unit = 'unitCode' in value ? value.unitCode : 'unitText' in value ? value.unitText : 'cm'
      const amount = cmOf(value.value)
      return amount === null ? null : tenth(amount * (CM_PER_UNIT[String(unit)] ?? 1))
    }
    if (typeof value !== 'string') return null
    const written = /^\s*(\d+(?:\.\d+)?(?:\s+\d+\/\d+)?)\s*("|in\b|inch|inches|cm|mm|m\b)?/.exec(value)
    if (!written?.[1]) return null
    return tenth(amountOf(written[1]) * (CM_PER_UNIT[written[2] ?? 'cm'] ?? 1))
  }

  const nodesOf = (value: unknown): Record<string, unknown>[] => {
    if (Array.isArray(value)) return value.flatMap(nodesOf)
    if (typeof value !== 'object' || value === null) return []
    const node = value as Record<string, unknown>
    return [node, ...nodesOf(node['@graph'])]
  }
  const isType = (node: Record<string, unknown>, type: string) => [node['@type']].flat().includes(type)
  const linked = [...document.querySelectorAll('script[type="application/ld+json"]')].flatMap((script) => {
    try {
      return nodesOf(JSON.parse(script.textContent ?? ''))
    } catch {
      return []
    }
  })
  const product = linked.find((node) => isType(node, 'Product'))
  const model = linked.find((node) => isType(node, '3DModel'))

  const urlOf = (value: unknown): string | null => {
    const first: unknown = [value].flat()[0]
    if (typeof first === 'string') return first
    if (typeof first !== 'object' || first === null) return null
    const { contentUrl, url } = first as Record<string, unknown>
    return typeof contentUrl === 'string' ? contentUrl : typeof url === 'string' ? url : null
  }
  const brandOf = (value: unknown) => (typeof value === 'string' ? value : typeof value === 'object' && value !== null && 'name' in value && typeof value.name === 'string' ? value.name : null)

  const onAmazon = /(^|\.)amazon\./.test(location.hostname)
  const amazonBrand = () => text('#bylineInfo')?.replace(/^Brand:\s*/, '').replace(/^Visit the\s+(.*)\s+Store$/, '$1') || null
  const amazonSize = (): Size => {
    const label = [...document.querySelectorAll('th, td')].find((cell) => /D\s*x\s*W\s*x\s*H/i.test(cell.textContent ?? ''))
    const written = label?.nextElementSibling?.textContent ?? ''
    const size: Size = { width: null, depth: null, height: null }
    const axes: Record<string, Axis> = { D: 'depth', W: 'width', H: 'height' }
    for (const [, amount = '', unit, axis = ''] of written.matchAll(/(\d+(?:\.\d+)?)\s*("|cm|in)?\s*([DWH])\b/g)) {
      const name = axes[axis]
      if (name) size[name] = tenth(Number(amount) * (CM_PER_UNIT[unit ?? '"'] ?? 2.54))
    }
    return size
  }

  const linkedSize: Size = { width: cmOf(product?.['width']), depth: cmOf(product?.['depth']), height: cmOf(product?.['height']) }
  const hasSize = (size: Size | null): size is Size => size !== null && Object.values(size).some((cm) => cm !== null)
  const pageSize = onAmazon ? amazonSize() : null
  const imported: ImportedProduct = {
    url: location.origin + location.pathname,
    store: (onAmazon ? 'Amazon' : null) ?? meta('og:site_name') ?? location.hostname,
    name: (typeof product?.['name'] === 'string' ? product['name'] : null) ?? (onAmazon ? text('#productTitle') : null) ?? meta('og:title') ?? document.title,
    brand: brandOf(product?.['brand']) ?? (onAmazon ? amazonBrand() : null),
    image: urlOf(product?.['image']) ?? (onAmazon ? document.querySelector('#landingImage')?.getAttribute('data-old-hires') || null : null) ?? meta('og:image'),
    dimensions: hasSize(linkedSize) || !hasSize(pageSize) ? linkedSize : pageSize,
    model3d: urlOf(model?.['encoding'])
  }
  window.open(`${origin}/#import=${encodeURIComponent(JSON.stringify(imported))}`, '_blank')
}

/** A `javascript:` URL that sends the product on the current store page to the editor at `origin`. */
export function bookmarkletFor(origin: string): string {
  return `javascript:${encodeURIComponent(`(${sendToComfySims.toString()})(${JSON.stringify(origin)})`)}`
}
