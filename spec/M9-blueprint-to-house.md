# M9 — From a blueprint to a house on its site, rendered

| | |
| --- | --- |
| Status | Draft |
| Date | 2026-10-18 |
| Owner | Dante |
| Decisions | — |

## 1. Why

**Houses are hand-written JSON.** The demo house (`fixtures/layouts/demo-house.json`) was typed wall by wall. Nobody will do that for their own home. Dante asked (2026-10-18): "집 블루프린트 주면 그거 기반으로 땅이랑 설계 렌더링하는것도 넣고" — give roomfit a floor plan and get the house, its plot of land, and design renders.

**Reading a plan is a vision task an agent already does well** (spike below). roomfit's job is what comes after: validate the plan, show it over the original image so a person can check it, place the house on a site, and render it.

**The site is decoration today.** The studio draws grass, a path and trees around any house; there is no lot, no ground material, no orientation, and the depth passes ignore it, so exterior renders have nothing to stand on.

### Spike (2026-10-18)

- A floor-plan image drawn from the demo house (walls 15 cm, doors with swings, windows in blue, room names with sizes, overall 14 × 10 m): `docs/spikes/m9/synthetic-blueprint.png`.
- A separate Claude agent saw only the image and the room schema and wrote `docs/spikes/m9/extracted-room.json` (75 s): it calibrated 0.9 px/cm from the printed 14.00 m and 10.00 m dimension lines and scanned wall colours for openings.
- Against the truth: 9/9 walls, 16/16 openings (kind, centre, width) and 6/6 zones **exact (0 cm error)**.
- Limit: this plan is clean, printed with dimensions, and drawn from the same model. Scans, hand drawings and real-estate plans (furniture symbols, hatching, skew, no dimensions) will be harder — hence the review underlay and a measurable diff tool.

## 2. Goals and non-goals

Goals
- An agent turns a blueprint image into the house: `set_house_plan` (MCP) validates and applies walls, openings and rooms.
- The blueprint stays visible under the plan in the editor, aligned, so a person sees every mismatch.
- The house sits on a **site**: lot outline, ground material, house position and rotation on the lot, north, trees and a path. The studio draws it and the depth passes include it.
- **Exterior renders**: "Render exterior" from an aerial three-quarter view and from the street, through Comfy Cloud.
- A diff tool that scores an extracted plan against a reference, so extraction quality is a number.

Non-goals (M9)
- Reading blueprints inside the app without an agent (see open question 1).
- Multi-storey houses, stairs, roofs beyond a simple flat/gable massing for renders.
- Terrain height (the lot is flat).

## 3. Scenarios

1. **My flat from a floor plan.** Dante gives Claude Code a floor-plan image: "이 도면으로 집 만들어줘". The agent reads it, calls `set_house_plan`, then `screenshot`. The editor shows the new walls over the blueprint underlay; the agent checks its own overlay and fixes a misplaced door with a second call.
2. **On its land.** "대지는 20 × 16 m, 남향, 마당은 잔디" → `set_site({ lot, ground: 'grass', rotationDeg, … })`. The studio shows the lot edge, grass, path to the front door and trees.
3. **Design renders.** "Render exterior" → two jobs (aerial, street) on Comfy Cloud; the cards open the renders.
4. **Furniture survives.** Items whose room still exists stay; items now outside every room go back to the library and the tool reports them.

## 4. Screens and states

- Editor view: **"Blueprint"** section in the sidebar — "Upload blueprint" (image), **"Opacity"** slider (0–100 %, default 50), **"Scale (cm per pixel)"** and **"Origin"** fields filled by the agent or the user, **"Hide"**. The image draws under the walls in plan view.
- Studio: the lot outline, ground material and trees from the site; **"Render exterior"** next to "Render this view" (disabled with a reason when the backend cannot render).
- Job cards: "Exterior render · Aerial", "Exterior render · Street".

## 5. Behaviour rules

- `set_house_plan(room)` accepts the `PlanRoom` schema; invalid plans are rejected with the schema issues (nothing changes). Applying is one undo step labelled `mcp:set_house_plan`.
- After a plan change, an item stays when its footprint centre is inside a zone of the new plan; otherwise it is removed from the house (its asset stays in the library) and listed in the result as `movedToLibrary`.
- Site: lot polygon in cm in the same coordinates as the house, ground `grass | gravel | paving | soil`, `houseRotationDeg`, optional `trees` (positions) and `path` (polyline), `northDeg`. The house footprint must lie inside the lot. Default site when none is set: house bounds + 5 m on each side, grass, a path from the front door to the lot edge, deterministic trees.
- Exterior views: aerial = 45° pitch from the south-east at a distance that frames the lot; street = eye height 160 cm from the lot edge facing the front door. Depth passes include the ground and trees.
- Blueprint underlay: stored in the layout as `blueprint: { image (data URL ≤ 2 MB), cmPerPixel, origin: { x, z } }` so a reload keeps it.

## 6. Contract and data changes

- `packages/schema`: `Site`, `Blueprint`; `RoomLayout.site?`, `RoomLayout.blueprint?`.
- Editor API: `setHousePlan(room)`, `setSite(site)`, `setBlueprint(blueprint | null)`, `renderExterior(view)`; `state().blueprintOpacity`.
- MCP: `set_house_plan`, `set_site`, `set_blueprint({ path, cmPerPixel, origin })`, `render_exterior({ view })`.
- Harness: `pnpm plan-diff <a.json> <b.json>` — wall endpoint, opening (kind, centre, width) and zone errors in cm.

## 7. ComfyUI workflows

Exterior renders reuse `render-from-depth` with an exterior prompt (house, materials, ground, sky). Spike needed before approval: one aerial and one street render of the demo house on the default site to confirm the depth-conditioned look (≈ 2 Cloud renders).

## 8. Acceptance criteria

| AC | Status | Criterion |
| --- | --- | --- |
| AC-83 | planned | The layout schema accepts a site and a blueprint, rejects a house outside its lot, and defaults a site from the house bounds |
| AC-84 | planned | `set_house_plan` applies a valid plan undoably, rejects an invalid one with its issues, keeps items inside new rooms and reports the rest as moved to the library |
| AC-85 | planned | The studio draws the lot, ground and trees from the site; depth passes include the ground |
| AC-86 | planned | The blueprint underlay draws aligned under the plan (a known pixel lands on its cm position) with adjustable opacity, and survives save/load |
| AC-87 | planned | "Render exterior" queues aerial and street renders with exterior prompts and the site in the depth pass |
| AC-88 | planned | `pnpm plan-diff` reports 0 for identical plans and the right per-element errors for shifted walls and openings |
| AC-89 | manual | Recording: Claude Code gets a floor-plan image, builds the house through the roomfit MCP, sets the site, and renders aerial and street views on Comfy Cloud |

## 9. Test plan

| AC | Level |
| --- | --- |
| AC-83, AC-88 | vitest |
| AC-84 | e2e via the MCP SDK client |
| AC-85 ~ AC-87 | e2e with the fake ComfyUI |
| AC-89 | manual recording (real blueprint, real Cloud) |

## 10. Risks and open questions

Risks
- Real blueprints are messier than the spike's; the underlay and `plan-diff` make errors visible and measurable, and the agent can correct with another call.
- Exterior renders of a cut-away low-poly house may look like a model; the spike decides whether a simple roof massing is needed.

Open questions (recommended answers in bold)
1. Who reads the blueprint: **an agent through the roomfit MCP** (no extra cost, works today) vs inside the app through a Comfy Cloud vision LLM node (paid API node, works without an agent).
2. Furniture after a plan change: **keep items inside rooms, move the rest to the library** vs clear the house.
3. Site source: **from the user/agent, else a default of house + 5 m** vs require a site.
4. Exterior views: **aerial three-quarter + street** vs aerial only.

## Change log

- 2026-10-18 Draft, from Dante's request (blueprint → house, land and design renders); spike on a synthetic blueprint: exact extraction.
