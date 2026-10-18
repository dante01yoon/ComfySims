import { snapPosition, snapRotation } from '../../packages/placement/src/index.ts'
import type { PlacedItem, RoomLayout } from '../../packages/schema/src/index.ts'

function editItem(layout: RoomLayout, id: string, edit: (item: PlacedItem) => PlacedItem): RoomLayout {
  if (!layout.items.some((item) => item.id === id)) return layout
  return { ...layout, items: layout.items.map((item) => (item.id === id ? edit(item) : item)) }
}

export function moveItem(layout: RoomLayout, id: string, { x, z }: { x: number; z: number }): RoomLayout {
  if (!Number.isFinite(x) || !Number.isFinite(z)) return layout
  return editItem(layout, id, (item) => ({ ...item, position: snapPosition({ x, y: item.position.y, z }) }))
}

export function rotateItem(layout: RoomLayout, id: string, rotationY: number): RoomLayout {
  if (!Number.isFinite(rotationY)) return layout
  return editItem(layout, id, (item) => ({ ...item, rotationY: snapRotation(rotationY) }))
}

export function removeItem(layout: RoomLayout, id: string): RoomLayout {
  const items = layout.items.filter((item) => item.id !== id)
  return items.length === layout.items.length ? layout : { ...layout, items }
}
