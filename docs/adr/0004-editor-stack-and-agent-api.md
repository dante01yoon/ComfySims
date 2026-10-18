# ADR-0004: React + react-three-fiber editor with one programmatic API for UI, bridge, tests and agents

Date: 2026-10-18

## Status

Accepted

## Context

The editor is the part most people see, and it is hard for an agent to check: a WebGL canvas gives no DOM to query, and mouse drags on a canvas make flaky tests. The same editor must also hand render passes to ComfyUI.

## Decision

- Stack: Vite + React + react-three-fiber + drei. R3F has the largest pool of 3D web examples and contributors; that matters more for an open-source launch than the owner's Vue background.
- One API, `window.roomfit` (`spec/contracts/editor-api.ts`). UI gestures call it, the ComfyUI bridge calls it, e2e tests call it, and coding agents can call it in a browser to see what they built. Tests therefore cover the real code path without simulating canvas drags.
- Placement rules stay in `packages/placement` (pure, unit-tested); the editor only renders their results.
- Render passes are part of the API (`exportPasses`), so 3D → 2D is tested like any other behavior.
- Headless Chromium with SwiftShader renders WebGL in the harness; no GPU needed.

## Rejected

- Vue + TresJS: faster for the owner today, smaller ecosystem for contributors.
- Testing by mouse drags and screenshots only: slow, flaky, and screenshots cannot say which item collided.
- Plain three.js without React: less code at first, but UI panels (asset list, fit warnings) would need a second framework later.

## Not decided here

Undo history granularity for drags (one entry per drag, not per frame) is an implementation detail inside AC-17.
