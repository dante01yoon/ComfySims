import type { Collision, FitMode, FitReport, OutOfBoundsReason, FindSpotOutcome, JobKind, BackendKind, AssetProduct, RoomLayout, Site } from '../packages/schema/src/index.ts'
import type { EditorState, ProductRequest, RoomfitEditorApi, Viewer360, BackendState, WorkflowChoice, ImportedProduct } from '../spec/contracts/editor-api.ts'
import type { fitGlbBytes } from '../packages/fit/src/index.ts'
import type { collisions, outOfBounds, findSpot, itemsInZone, defaultSite } from '../packages/placement/src/index.ts'
import type { expectedSeconds, scenePrompt } from '../packages/comfy/src/index.ts'

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

export type FindSpotCheck = Assert<Equal<ReturnType<typeof findSpot>, FindSpotOutcome>>

export type M3Checks = [
  Assert<Equal<Parameters<typeof expectedSeconds>[1], JobKind>>,
  Assert<Equal<ReturnType<typeof expectedSeconds>, number>>,
  Assert<Equal<ReturnType<typeof itemsInZone>, string[]>>
]

export type M4Checks = [
  Assert<Equal<EditorState['undoLabels'], string[]>>,
  Assert<Equal<EditorState['agentConnected'], boolean>>
]

export type M5Checks = [
  Assert<Equal<EditorState['viewer360'], Viewer360 | null>>,
  Assert<Equal<Extract<JobKind, 'pano360'>, 'pano360'>>
]

export type M6Checks = [
  Assert<Equal<EditorState['backend'], BackendState>>,
  Assert<Equal<BackendState['kind'], BackendKind>>
]

export type M7Checks = [
  Assert<Equal<EditorState['libraryFilter'], string | null>>,
  Assert<Equal<NonNullable<RoomLayout['assets'][number]['product']>, AssetProduct>>
]

export type M9Checks = [
  Assert<Equal<ReturnType<typeof defaultSite>, Site>>,
  Assert<Equal<EditorState['site'], Site>>
]

export type M10Checks = [
  Assert<Equal<WorkflowChoice['kind'], JobKind>>,
  Assert<Equal<NonNullable<RoomLayout['generation']>, Partial<Record<JobKind, { workflow: string; models?: Record<string, string> }>>>>
]

export type M13Checks = [
  Assert<Equal<ReturnType<typeof scenePrompt>, { positive: string; negative: string }>>,
  Assert<Equal<EditorState['renderStyle'], 'lived-in' | 'as-built'>>
]

export type M11Checks = [Assert<Equal<EditorState['pendingImport'], ImportedProduct | null>>]
