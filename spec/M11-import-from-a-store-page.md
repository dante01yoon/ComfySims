# M11 — Import a product from the store page you are looking at

| | |
| --- | --- |
| Status | Approved (2026-10-19) |
| Date | 2026-10-19 |
| Owner | Dante |
| Decisions | — |

## 1. Why

**Adding a real product means retyping it.** M7 keeps a product's link, brand, store and photo, but the user fills them in by hand, plus the listed size. Dante's pitch (2026-10-19): "원하는 제품을 링크로 넣으면 그걸 기반으로 집에 인테리어" — give a product link and furnish with it; then "진행해".

### Feasibility (2026-10-19)

- **Fetching store pages from a server does not work.** From the dev server: Amazon answered a bot-check page, Wayfair 429, West Elm 403. Scraping is also against many stores' terms.
- **The page the user already has open has the data.** In a normal browser: IKEA product pages carry JSON-LD `Product` with name, brand, image and width/depth/height in inches (KIVIK sofa → 228 × 94.9 × 82.9 cm), even a `3DModel`; Amazon pages expose title, brand, a high-resolution image and "D x W x H" in the product table.

So the import runs **in the user's browser, on the page they are viewing**, through a bookmarklet, and hands the data to the local editor.

## 2. Goals and non-goals

Goals
- A **"Send to ComfySims"** bookmarklet: on a product page it reads name, brand, store, link, photo and listed size (schema.org JSON-LD first, then Amazon's page, then Open Graph) and opens the editor with the add-product form filled in.
- The user checks the size (always shown, never trusted blindly) and generates as usual.
- Agents can pass an image URL to `add_product`.

Non-goals (M11)
- Fetching store pages from the server.
- Using the store's own 3D model (IKEA's `3DModel`): needs Draco decoding and a licence check — follow-up.
- Prices, variants, colours.

## 3. Scenarios

1. Dante is on an IKEA sofa page, clicks his "Send to ComfySims" bookmark. The editor opens on a new tab with the form filled: "TESTVIK Sofa - Tibbleby beige/gray", IKEA · IKEA, the link, the photo, 228 × 94.9 × 82.9 cm, and "Imported from IKEA — check the size". He clicks Generate 3D.
2. On Amazon the same works from the product table.
3. A shop with no size on the page: the form is filled except the size, with "Imported from Lamp Shop — the page has no size; enter it from the listing".

## 4. Screens and states

- Library section: a link **"Send to ComfySims"** (drag it to the bookmarks bar) with one line of help.
- The add-product form (editor view) opens with the imported fields and a status line **"Imported from <store> — check the size"** or **"Imported from <store> — the page has no size; enter it from the listing"**. A photo that cannot be fetched leaves the photo empty with **"Could not fetch the photo — add it by hand"**.

## 5. Behaviour rules

- `bookmarklet()` returns a `javascript:` URL with the editor's origin baked in. Run on a page, it extracts and opens `<origin>/#import=<encodeURIComponent(JSON)>` with `{ url (without query), store, name, brand, image, dimensions: { width, depth, height } (cm, 0.1), model3d }`.
- Extraction order: JSON-LD `Product` (`name`, `brand.name` or `brand`, first `image` (URL or `ImageObject.contentUrl`/`url`), `width`/`depth`/`height` as cm, inches (`89 3/4 "` → 228.0) or `QuantitativeValue`); on `amazon.*` hosts `#productTitle` (trimmed), `#bylineInfo` without "Visit the … Store"/"Brand:", `#landingImage[data-old-hires]`, a table row "D x W x H" (`33"D x 84"W x 30"H` → width 213.4, depth 83.8, height 76.2), store "Amazon"; then `og:title`, `og:image`, `og:site_name` (else the host).
- The editor reads `#import=` once on load, clears the hash, switches to the editor view and fills the form; nothing is generated until the user clicks Generate 3D.
- Photo: the editor asks the dev server `GET /__roomfit/fetch-image?url=` — same-origin requests only (403 otherwise), http(s) only (400), responses that are `image/*` only (415), at most 15 MB (413). The fetched photo becomes the form's photo.
- MCP `add_product` image may be `{ url }` (fetched the same way).

## 6. Contract and data changes

- Editor API: `bookmarklet(): string`; `state().pendingImport: ImportedProduct | null` (cleared when the product is generated or the form is reset). `ImportedProduct` in `spec/contracts/editor-api.ts`.
- Dev server: `/__roomfit/fetch-image`.
- MCP: `add_product.image` accepts `{ url }`.
- Fixtures: `fixtures/pages/*.html` — hand-made pages with the structures seen on real stores (no store content copied).

## 8. Acceptance criteria

| AC | Status | Criterion |
| --- | --- | --- |
| AC-104 | active | On a page with JSON-LD Product, the bookmarklet extracts name, brand, store, link, photo and the size in cm (inch fractions converted) and opens the editor with them |
| AC-105 | active | On an Amazon product page it uses the title, brand (without "Visit the … Store"), high-resolution image and the D x W x H row |
| AC-106 | active | Opened with an import, the editor fills the add-product form (fields, size, photo) with the "check the size" note, or leaves the size empty with the "no size" note; generating keeps link, brand and store |
| AC-107 | active | `/__roomfit/fetch-image` refuses other origins, non-http(s) URLs and non-images, and returns images |
| AC-108 | active | MCP `add_product` accepts an image URL |
| AC-109 | manual | Recording: a real store page in a real browser → bookmarklet → the product generated on Comfy Cloud and placed |

## 9. Test plan

AC-104 ~ AC-107 e2e: Playwright serves the fixture pages at store-like URLs (`page.route`), runs the bookmarklet, follows the opened editor tab; photos come from the fake ComfyUI storage. AC-108 e2e via the MCP SDK client. AC-109 manual.

## Change log

- 2026-10-19 Written and approved after the feasibility check (server fetches blocked; in-browser extraction works on IKEA and Amazon).
