# ADR-0011: The project is called ComfySims; code identifiers keep "roomfit" for now

Date: 2026-10-19

## Status

Accepted

## Context

Dante renamed the project (2026-10-19): "ComfySims" — ComfyUI + a Sims-style home builder — after the house, land, furniture and agent features outgrew "roomfit" (one sofa, one room). Before deciding, Claude pointed out that "The Sims" is an Electronic Arts trademark and that a public repository and posts using it carry a risk of a trademark complaint or a forced rename; Dante chose the name with that risk known.

## Decision

- The product, the GitHub repository (`dante01yoon/ComfySims`, renamed from `roomfit`; GitHub redirects the old URL) and the npm package name (`comfysims`) are ComfySims. README, CONTRIBUTING, AGENTS.md, the harness guide, the lecture notes and the demo videos' title cards use it.
- The editor's browser tab title is "ComfySims".
- Code identifiers stay: `window.roomfit` (the editor API), the MCP server and tool prefix `roomfit`, workflow input tags `roomfit:*`, the ComfyUI node class `RoomfitFitMesh` and node pack folder `nodes/roomfit`, env vars `ROOMFIT_*`, the editor path `/roomfit/` in ComfyUI, and media file names `roomfit-*.mp4`.

## Alternatives rejected

- Rename every identifier at once: touches the editor API contract, the MCP tool contract, every workflow file and the node class that saved ComfyUI graphs reference; it would break existing layouts, workflows and agent configs in one step, with no user-visible benefit.
- Keep "roomfit": the owner's call was to rename.

## Consequences

- Docs mention both names until identifiers move; README says so in its second line.
- If the trademark becomes a problem, only the brand layer (repo name, docs, title cards) has to change again.
- Moving identifiers to `comfysims` later is its own spec (contract version bump and an alias period for `window.roomfit` and `roomfit:` tags).
