# M13 — Renders that look like a real home

| | |
| --- | --- |
| Status | Approved (2026-10-19) |
| Date | 2026-10-19 |
| Owner | Dante |
| Decisions | — |

## 1. Why

**Renders and 360° views come out white and empty.** Dante (2026-10-19): "360도 뷰나 사진 보니까 되게 하얗고 해서 실제 집이랑 안 비슷해 보이는 경향". The cause is the prompt, not the model: every render asks for "the living of **a bright modern home**, … natural materials", and the 360° view for "equirectangular 360 image, <room>". Nothing the layout knows reaches the model — not the walnut floor, not the sofa and armchair, not that people live there — so it paints white walls around the depth's empty planes. The large wardrobe that came out as a smudge in AC-69 was never named either.

### Spike (2026-10-19, Comfy Cloud, same depth and seed; `docs/spikes/m13/`)

Living room of the furnished demo house, evening, seed 21:

| Variant | Result |
| --- | --- |
| A current prompt, depth strength 1.0 | follows the layout; white walls, bright, empty — a showroom |
| **B layout-aware prompt** (room, floor material, the room's furniture by name, lived-in details, a negative against "white walls, sterile, showroom, CGI"), strength 1.0 | **reads as a real home**: walnut floor, rug, curtains, lamps, plants, prints; small inventions (a TV on another wall) |
| C as B, strength 0.7 | most lived-in, drifts further from the layout |
| D as B + img2img from the studio's colour view (denoise 0.7, strength 0.6) | keeps floor and furniture colours, needs a colour pass; not better than B for its cost |

360° bedroom with B's approach: walnut floor, greige walls, curtains, rug, warm lamps; **the wardrobe is a wardrobe** (was a smudge); layout kept (`docs/spikes/m13/pano-before-after.jpg`, job 4241bcc7).

Decision: B as the default, a "faithful" style that keeps the old minimal prompt, D left for later.

## 2. Goals and non-goals

Goals: room renders and 360° views get a prompt built from the layout; a "Render style" choice between lived-in (default) and as built; agents get the same prompt unless they pass their own.

Non-goals: img2img from a colour pass (variant D); wall colours or materials per room as layout data (the prompt uses a warm neutral); exterior renders (M9 keeps its own prompt).

## 3. Scenarios

1. Dante clicks "Render this view" in the living room: the photo shows his sofa and armchair on a walnut floor with a rug, curtains and lamps.
2. He wants to judge only the layout: "Render style: As built" gives the plain prompt.
3. "360° view" of the bedroom names the bed, nightstand, wardrobe, armchair and lamp, so none of them turn into smudges.

## 4. Screens and states

Studio bottom bar: a select **"Render style"** with **"Lived-in"** (default) and **"As built"**. The choice is saved with the layout.

## 5. Behaviour rules

- `scenePrompt(layout, zoneId | null, preset, style)` in `packages/comfy` returns `{ positive, negative }`.
- Lived-in positive: "Photograph of a lived-in <room name, lower case> in the <preset words>: <furniture>, <floor words>, warm greige painted walls, <details>, realistic interior photography, natural imperfections". Furniture = names of the assets of the items whose position lies inside the zone, in layout order, without duplicates, at most 8 (lower case). No zone: "home" and every item. Floor words: oak → "oak wood floor", walnut → "walnut wood floor", tile → "ceramic tile floor", concrete → "polished concrete floor", carpet → "wool carpet".
- Details by room name (case-insensitive contains): living → "wool rug, linen curtains, houseplants, framed prints, table lamp, books"; bed → "linen bedding, linen curtains, bedside lamp, framed prints, houseplant, rug"; kitchen or dining → "fruit bowl, cookbooks, pendant lights, plants"; bath → "folded towels, plant, toiletries"; office or study → "books, desk lamp, plants, pinboard"; otherwise → "rug, plants, framed prints".
- Lived-in negative: "empty room, white walls, sterile, showroom, CGI, 3d render, cartoon, blurry, distorted, low quality, text".
- As built: the M3 prompt (`studioPrompt`) and negative "blurry, distorted".
- Preset words: reading → "warm reading light", work → "bright daylight", movie → "dim evening light", evening → "warm evening light".
- "Render this view" and the 360° view use `scenePrompt` for the focused room (360° adds its equirectangular prefix). A caller that passes its own prompt (API, MCP `prompt`) still wins; the negative follows the style.

## 6. Contract and data changes

- `RoomLayout.renderStyle?: 'lived-in' | 'as-built'`; editor `setRenderStyle(style)`, `state().renderStyle`.
- `scenePrompt` exported from `packages/comfy`.
- Fake ComfyUI `/__prompts` reports each prompt's `negative` too.

## 8. Acceptance criteria

| AC | Status | Criterion |
| --- | --- | --- |
| AC-100 | active | `scenePrompt` names the room, its floor, only its own furniture, the preset light and the room's lived-in details, with the anti-white negative; "as built" gives the plain prompt |
| AC-101 | active | "Render this view" and the 360° view send the layout-aware positive and negative prompts to ComfyUI |
| AC-102 | active | The studio's "Render style" select switches lived-in / as built, is saved with the layout, and changes the next prompt |
| AC-103 | manual | Recording on real Comfy Cloud: the same room and the same 360° view, as built and lived-in |

## 9. Test plan

AC-100 vitest; AC-101, AC-102 e2e with the fake ComfyUI; AC-103 recording.

## Change log

- 2026-10-19 Written and approved after Dante's note that renders look white and unlike real homes; spike B chosen.
