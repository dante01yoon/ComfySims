# M9 — From a blueprint to a house on its site, rendered

| | |
| --- | --- |
| Status | Approved (2026-10-18) |
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
- Site: lot polygon in cm in the same coordinates as the house, ground `grass | gravel | paving | soil`, `houseRotationDeg`, optional `trees` (positions) and `path` (polyline), `northDeg`. Every wall end must lie inside (or on) the lot.
- Default site (`defaultSite(room)` in `packages/placement`, used when the layout has none, and shown as `state().site`): the walls' bounding box + 500 cm on each side, `grass`, a path from the centre of the front door — the first door in the openings list on the outer wall with the largest z — straight to the lot edge, and trees placed deterministically inside the lot and at least 100 cm outside the house's bounding box.
- The studio draws the lot (scene item `site-lot`, bounds = lot bounds), the ground material, and one tree per site tree (`site-tree-<index>`).
- Exterior shots (`exteriorShot(view)`), revised 2026-10-19 after the AC-89 run (below):
  - a flat roof slab over the walls' bounding box with its top at wall height + 20 cm;
  - aerial: pitch 25–35° from the south-east (revised from 40–50° after the real-Cloud check below), looking at the house centre, at the distance where the house's bounding box (floor to roof) fills 50–80 % of the frame's width or height;
  - street: eye 160 cm, standing on the lot at the corner diagonal to the front door's wall (outside both the house's x and z extents), looking at the house centre, so two façades show;
  - depth range: far = the farthest lot corner from the camera, anything beyond (sky, ground past the lot) black; near = the nearest house point for the aerial view, and for the street view the ground 1 m in front of the camera (revised: with near at the house, the lawn in front clipped to flat white and the model lost the scale — see the storeys spike below);
  - trees are left out of exterior depth passes (`trees: false`); the prompt asks for them instead.
  - the shot reports its camera's `fovDeg` and `aspect` so the framing can be checked.
- "Render exterior" queues two render jobs, "Exterior render · Aerial" and "Exterior render · Street", through `render-from-depth` with a prompt that starts with "Exterior architectural photograph".
- Blueprint underlay: stored in the layout as `blueprint: { image (data URL ≤ 2 MB), cmPerPixel, origin: { x, z } }` so a reload keeps it.

## 6. Contract and data changes

- `packages/schema`: `Site`, `Blueprint`; `RoomLayout.site?`, `RoomLayout.blueprint?`.
- Editor API: `setHousePlan(room)`, `setSite(site | null)`, `setBlueprint(blueprint | null)`, `setBlueprintOpacity(percent)`, `exteriorShot(view)`, `renderExterior(view)`; `state().site` (effective), `state().blueprintOpacity` (default 50). The underlay is the scene item `blueprint`.
- MCP: `set_house_plan({ room })` → `{ movedToLibrary }`, `set_site({ site })`, `set_blueprint({ path, cmPerPixel, originX, originZ })`, `render_exterior({ view })` → image + saved path.
- Harness: `pnpm plan-diff <a.json> <b.json>` — wall endpoint, opening (kind, centre, width) and zone errors in cm.

## 7. ComfyUI workflows

Exterior renders reuse `render-from-depth` with an exterior prompt (house, materials, ground, sky).

### Spike result (2026-10-18)

Demo house, no site yet, studio camera set by hand; Comfy Cloud, seed 7, 1024 × 576 (`demo/spike-exterior.mjs`, `docs/spikes/m9/exterior-spike.png`).

| View | Time | Result |
| --- | --- | --- |
| aerial | 16.7 s | the house renders open-topped — the depth has no roof, so interior walls show from above |
| street | 11.4 s | convincing: the model invents a roof and cladding over the walls |

Both: the studio's low-poly trees come out as black polyhedra. Hence two rules in §5: a flat roof slab in exterior shots, and smooth tree canopies in exterior depth passes.

### Found in the AC-89 agent run (2026-10-19)

The agent read a new blueprint exactly (plan-diff 0 cm after aligning its origin), but all three exterior renders failed: a three-storey façade with a floating rhombus (aerial), a gabled two-storey house with glass bubbles (aerial, with trees), one wall with the door drawn as a window (street). The depth passes sent (captured with `demo/capture-exterior-depth.mjs`, `docs/spikes/m9/agent-run-depth.png`) were geometrically right but: the house filled a small part of the aerial frame and its depth was barely darker than the lawn (range ran to the horizon); the canopies' trunks were too thin, so the spheres read as floating balls; the street camera stood 5.5 m square-on to one wall because the lot leaves 5 m. Hence the revised rules above.

After those rules (impl-25), a real Comfy Cloud check of the AC-89 house (`docs/spikes/m9/exterior-after-impl25.png`): the street view became a convincing single-storey flat-roofed house with two façades; the aerial view at 45° still drew the roof slab as a floating board — from that pitch the featureless roof covers most of the house's outline. Aerial pitch lowered to 25–35° so the façades carry the shape.

Clean AC-89 re-run (take 2, 2 min 22 s, $1.05): plan exact again (plan-diff 0); aerial now a single-storey flat-roofed house; the street view drew two storeys. Storeys spike on that street depth (`demo/spike-storeys.ts`, `docs/spikes/m9/street-storeys-spike.png`, Cloud jobs 8485a5a0, 1ce80fdb, 637553c5): a "single-storey bungalow" prompt with a "second floor" negative still drew two storeys at two seeds. The depth showed why: the lawn between camera and house was clipped to flat white (near = nearest house point), so nothing told the model how far away, and so how tall, the house is. Street near plane moved to the ground in front of the camera.

## 8. Acceptance criteria

| AC | Status | Criterion |
| --- | --- | --- |
| AC-83 | active | The layout schema accepts a site and a blueprint, rejects a house outside its lot, and defaults a site from the house bounds |
| AC-84 | active | `set_house_plan` applies a valid plan undoably, rejects an invalid one with its issues, keeps items inside new rooms and reports the rest as moved to the library |
| AC-85 | active | The studio draws the lot and trees from the site (default when none): `site-lot` and `site-tree-<i>` in the scene at their positions; an invalid site is rejected and changes nothing |
| AC-86 | active | The blueprint underlay draws aligned under the plan (a known pixel lands on its cm position) with adjustable opacity, and survives save/load |
| AC-87 | active | Exterior shots carry a roof slab at wall height + 20 cm; the aerial camera (25–35° pitch) frames the house at 50–80 %; the street camera (160 cm, on the lot) stands diagonal to the house so two façades show; the depth range ends at the farthest lot corner; trees are left out; "Render exterior" queues both renders with exterior prompts |
| AC-88 | active | `pnpm plan-diff` reports 0 for identical plans and the right per-element errors for shifted walls and openings |
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

Open questions — settled 2026-10-18 on the recommended answers (Dante: "Approve M9 on the recommended answers and implement it, including the exterior render spike"):
1. An agent reads the blueprint through the roomfit MCP.
2. After a plan change, items inside rooms stay; the rest go to the library.
3. The site comes from the user or agent, else a default of house bounds + 5 m.
4. Exterior views: aerial three-quarter and street.

## Change log

- 2026-10-18 Draft, from Dante's request (blueprint → house, land and design renders); spike on a synthetic blueprint: exact extraction.
- 2026-10-18 Approved on the recommended answers.
- 2026-10-19 AC-89 take 2: street view two storeys; prompt spike did not help; street depth now starts at the ground in front of the camera.
- 2026-10-19 Real-Cloud check after impl-25: street fixed, aerial still a floating board → aerial pitch 25–35°.
- 2026-10-19 AC-89 agent run: plan exact, exterior renders failed → exterior rules revised (framing, depth range, no trees, diagonal street view).
- 2026-10-18 Exterior spike (roofless aerial, polyhedral trees → roof slab and smooth canopies); spec session: schema (`Site`, `Blueprint`), contracts, `plan-diff`, blueprint fixture, AC-83~88 tests; ACs active.
