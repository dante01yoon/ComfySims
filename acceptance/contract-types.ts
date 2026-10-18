import type { Collision, FitMode, FitReport, OutOfBoundsReason } from '../packages/schema/src/index.ts'
import type { EditorState, ProductRequest, RoomfitEditorApi } from '../spec/contracts/editor-api.ts'
import type { fitGlbBytes } from '../packages/fit/src/index.ts'
import type { collisions, outOfBounds } from '../packages/placement/src/index.ts'

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false
type Assert<T extends true> = T
type FitReportOf<T> = T extends { ok: true; report: infer R } ? R : never
type ProductReportOf<T> = T extends { ok: true; report: infer R } ? R : never

export type ContractChecks = [
  Assert<Equal<ReturnType<typeof outOfBounds>[number]['reason'], OutOfBoundsReason>>,
  Assert<Equal<EditorState['outOfBounds'][number]['reason'], OutOfBoundsReason>>,
  Assert<Equal<ReturnType<typeof collisions>[number], Collision>>,
  Assert<Equal<EditorState['collisions'][number], Collision>>,
  Assert<Equal<FitReportOf<Awaited<ReturnType<typeof fitGlbBytes>>>, FitReport>>,
  Assert<Equal<Parameters<typeof fitGlbBytes>[2], FitMode | undefined>>,
  Assert<Equal<NonNullable<ProductRequest['mode']>, FitMode>>,
  Assert<Equal<ProductReportOf<Awaited<ReturnType<RoomfitEditorApi['addProductFromPhoto']>>>, Omit<FitReport, 'scale'>>>
]
