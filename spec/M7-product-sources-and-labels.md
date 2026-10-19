# M7 — Every piece of furniture knows its product: photo, store link, and labels

| | |
| --- | --- |
| Status | Approved (2026-10-18) |
| Date | 2026-10-18 |
| Owner | Dante |
| Decisions | — |

## 1. Why

**A placed sofa has lost where it came from.** roomfit starts from a product photo and its listed size, but the layout keeps only the 3D model: `Asset` has `name`, `uri`, `dimensions`, `source: { kind: 'generated', workflow, productUrl? }`. `productUrl` exists in the schema and is never set or shown; the product photo is uploaded to ComfyUI and then forgotten. Dante asked (2026-10-18): "에셋 같은거 제품 사진이랑 링크 넣고 만든 제품들은 어디 제품이고 어디 제품 링크였는지 가서 바로 이동 가능하게, 그리고 라벨링 할 수 있게."

**The point of roomfit is buying decisions.** "Does this 200 cm sofa fit?" ends with "go buy it". The library and the house should answer "which product is this, from where, at what link" in one click, and let the user group candidates ("shortlist", "living room", "under 1M won").

**Library grows; it needs labels.** The demo house has 17 assets; comparing three candidate sofas for one wall needs tags and a filter.

## 2. Goals and non-goals

Goals
- Each asset keeps its **product photo** (thumbnail), **product link**, **brand** and **store**, and free-form **labels**.
- Library rows and the selected item show them; the link opens the product page in a new tab.
- Labels can be added/removed in the library and on the selected item; the library filters by label.
- Agents can set and read them (MCP).

Non-goals (M7)
- Importing a product from a link (scraping name, photo, size from the store page) — sites differ and many forbid scraping; see open question 1.
- Prices, stock, currency, or affiliate links.
- Labels on rooms or placed items (labels belong to the asset; every copy shares them).

## 3. Scenarios

1. **Add with a link.** Dante adds a sofa: photo, 200 × 90 × 85 cm, product link `https://www.ikea.com/kr/ko/p/…`, brand "IKEA", store "IKEA Korea", labels "living", "shortlist". The library row shows the product photo, "IKEA · IKEA Korea", the labels, and an "Open product page" link.
2. **Jump from the house.** In the studio he clicks the sofa; the selection panel shows the same product card; "Open product page" opens the store in a new tab.
3. **Label and filter.** He labels three sofas "living-wall candidates" and filters the library by that label; only those three show. Placing one and removing another keeps the labels on the assets.
4. **Agent.** "Add this armchair from <link>, label it shortlist" → `add_product({ image, name, width, depth, height, productUrl, brand, labels })`; `list_assets` returns the product fields.
5. **AI-made photos.** Assets made from a generated product photo (the demo house, the agent's reading corner) show "AI-generated photo · no store" instead of a link.

## 4. Screens and states

- Add-product form: new fields **"Product link"** (URL), **"Brand"**, **"Store"**, **"Labels"** (Enter or comma adds the typed label). Invalid link (not http/https) → inline "Enter a web address starting with https://", Generate disabled.
- Library row: product photo thumbnail (falls back to the model thumbnail), name, size, "<brand> · <store>" or "AI-generated photo · no store", label chips, **"Open product page"** (link, `target=_blank`, `rel=noopener noreferrer`), **"Edit labels"**.
- Library header: **"Filter by label"** select (All + every label in use, with counts).
- Selection panel, when an item is selected: in the studio a small panel named **"Selected item"** over the scene; in the editor the existing **"Selected"** section. Both show the asset's product card (same content as the library row) and **"Edit labels"**.
- Edit labels: an inline chip editor with a field labelled **"Add label"** (Enter adds) and a **"Remove label <label>"** button per chip; Esc closes the editor.

## 5. Behaviour rules

- Product link: `http:` or `https:` only; stored as given (trimmed); shown with its host ("ikea.com"). Never fetched by roomfit.
- Product photo: when a product job is created, the editor keeps a 256 px JPEG thumbnail of the photo in the asset (data URL, ≤ 40 KB) and the Comfy input name it was uploaded as. The full photo is not stored in the layout.
- Labels: trimmed, case-insensitive unique per asset, 1–32 characters, at most 12 per asset. Display order = insertion order.
- Label and product-field edits are undoable (one undo step per edit, labelled `editor` or `mcp:<tool>`).
- Filter: shows assets that have the label; placing from a filtered list works as usual; the filter resets to All when its label disappears.
- Layout files written before M7 load unchanged (all new fields optional).

## 6. Contract and data changes

- `packages/schema` `Asset` gains optional `product: { photo?: { thumbnail, comfyInputName? }, url?, brand?, store?, generatedPhoto? }` and `labels?: string[]`. The unused `AssetSource.generated.productUrl` is removed (no file or code ever set it); `product.url` replaces it. The demo house fixture marks its assets `product.generatedPhoto: true`.
- `ProductRequest` gains `productUrl?`, `brand?`, `store?`, `labels?`.
- Editor API: `setAssetLabels(assetId, labels)`, `setAssetProduct(assetId, { url?, brand?, store? })` (null clears), `setLibraryFilter(label | null)`, `selectItem(itemId | null)`, `state().libraryFilter`.
- MCP: `add_product` gains `productUrl`, `brand`, `store`, `labels`; new `set_asset_labels({ assetId, labels })`; `list_assets` rows gain `product` and `labels`.

## 7. ComfyUI workflows

None.

## 8. Acceptance criteria

| AC | Status | Criterion |
| --- | --- | --- |
| AC-77 | active | The layout schema accepts assets with product fields and labels, rejects non-http(s) links and over-long/duplicate labels, and loads pre-M7 files unchanged |
| AC-78 | active | Adding a product with link, brand, store and labels stores them and a ≤ 40 KB photo thumbnail on the asset |
| AC-79 | active | The library row and the selected item's panel show the product photo, brand · store and an "Open product page" link that opens the URL in a new tab with noopener |
| AC-80 | active | Labels can be added and removed (undoably) from the library and the selection panel; the library filter shows only assets with the chosen label |
| AC-81 | active | MCP: `add_product` accepts the product fields, `set_asset_labels` changes labels with an `mcp:` undo label, `list_assets` returns product and labels |
| AC-82 | manual | Recording: three real sofas from store links, labelled and filtered, one placed, then opened from the house (evidence 2026-10-18: `docs/recordings/demo-ac82-store-products.md`) |

## 9. Test plan

| AC | Level |
| --- | --- |
| AC-77 | vitest on the zod schema |
| AC-78 ~ AC-80 | e2e with the fake ComfyUI |
| AC-81 | e2e via the MCP SDK client |
| AC-82 | manual recording (real product pages, real Cloud) |

## 10. Risks and open questions

Risks
- Store photos are copyrighted; roomfit keeps only a small thumbnail locally and never republishes it. The README will say so.
- Links rot; we show the host so a dead link is still recognisable.

Open questions — settled 2026-10-18 on the recommended answers (Dante: "Approve M7 on the recommended answers and implement it"):
1. Import from a link: not in M7; a separate spike later.
2. Labels: free tags with suggestions from labels in use.
3. Brand and store: two free text fields.
4. Demo house: the 17 demo assets are marked as AI-generated photos.

## Change log

- 2026-10-18 Draft, from Dante's request for product photos, links, sources and labels on assets.
- 2026-10-18 Approved on the recommended answers.
- 2026-10-18 Spec session: schema, contracts (incl. `selectItem`), demo fixture marked AI-generated, AC-77~81 tests; ACs active.
- 2026-10-18 Implemented (impl-22); AC-77~81 pass. Screen check: `docs/recordings/media/m7-library-and-selected.jpg`. AC-82 recorded with three Amazon sofas Claude picked at Dante's request; video published as an example (Dante: "비디오는 예시로 넣어줘").
