# M8 — Polish found by recordings, and adding to the library only

| | |
| --- | --- |
| Status | Approved (2026-10-18) |
| Date | 2026-10-18 |
| Owner | Dante |
| Decisions | — |

## 1. Why

Four defects and gaps came out of the M6/M7 recordings and the placement demo (tests were green each time):

1. **The backend menu stays open** after a choice, does not close on Esc or a click elsewhere, and sits over the job cards: the AC-76 recording's click on "View as 3D photo" was intercepted (`docs/recordings/demo-ac76-local-cloud.md`).
2. **The Workflow dialog is taller than the window**; its title (file · backend) scrolls out of view (same recording).
3. **A new product is always placed.** Comparing three store sofas needed the garage as a staging area (`docs/recordings/demo-ac82-store-products.md`).
4. **An eye-level render can miss the piece you just placed.** The camera stands in the corner farthest from the largest item and looks at the room centre; a chair dragged next to the sofa was outside the frame (placement demo, 2026-10-18).

Dante, after the list of follow-ups: "진행해".

## 2. Goals and non-goals

Goals: fix 1–4 with behaviour a test can check.
Non-goals: a general dialog system; choosing render angles by hand (the studio's own camera is "Render this view" without a focused room).

## 3. Scenarios

1. Dante opens the backend chip, picks Local; the menu closes. He opens it again and presses Esc, or clicks the scene: it closes. Job card buttons are always clickable.
2. He opens a Workflow dialog for a 3D model job (40+ nodes); the title stays at the top, the node table scrolls, the buttons stay at the bottom.
3. He unticks **"Place in the house"**, generates three sofas: they appear in the library only. Later he places one with "Place in".
4. He selects the chair he just placed and clicks "Render this view": the chair is in the photo.

## 4. Screens and states

- Backend menu: closes after "Use Cloud"/"Use Local", on Esc, and on a pointer-down outside it. It opens below the chip without covering the Jobs list (the jobs list moves down or the menu is a popover above other rail content but never captures clicks outside its own box).
- Workflow dialog: max height = the window minus 48 px; header (file · backend) and footer (Download JSON, Open in ComfyUI, Close) fixed; the middle scrolls.
- Add-product form: checkbox **"Place in the house"**, checked by default.

## 5. Behaviour rules

- `ProductRequest.place` (default `true`). With `place: false` the asset is added to the library and no item is created; the result's `itemId` is `null`. The job card's "Show" becomes "Place in" for library-only products.
- Every successful product result also returns the new `assetId`.
- Eye-level render framing: when the selected item is inside the focused room, the camera stands in the room corner farthest from that item (inset 40 cm, eye 150 cm) and aims at the midpoint between the item and the room centre. Otherwise the existing rule (largest item) applies.
- MCP `add_product` gains `place` (boolean) and returns `assetId`.

## 6. Contract and data changes

- `ProductRequest.place?: boolean`; `addProductFromPhoto` result `{ ok: true; jobId; itemId: string | null; assetId; report }`.
- `spec/contracts/mcp-tools.json`: `add_product.place` (boolean).

## 7. ComfyUI workflows

None.

## 8. Acceptance criteria

| AC | Status | Criterion |
| --- | --- | --- |
| AC-90 | active | The backend menu closes after a choice, on Esc and on a click outside it, and while open it does not block the job cards' buttons |
| AC-91 | active | The Workflow dialog fits the window: its title and its buttons are in view, and the node list scrolls |
| AC-92 | active | With "Place in the house" unticked (or `place: false`), a product goes to the library only; the result has `itemId: null` and the new `assetId`; MCP `add_product` accepts `place` |
| AC-93 | active | With an item selected in the focused room, the eye-level render camera looks within 25° of that item |

## 9. Test plan

| AC | Level |
| --- | --- |
| AC-90 ~ AC-93 | e2e with the fake ComfyUI (AC-92's MCP part via the MCP SDK client) |

## 10. Risks and open questions

None open; scope taken from the recordings.

## Change log

- 2026-10-18 Written and approved in one step on Dante's "진행해" for the recording follow-ups; ACs active with their tests.
