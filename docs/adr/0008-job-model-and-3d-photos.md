# ADR-0008: Jobs are first-class objects; 3D photos are a separate viewer

Date: 2026-10-18

## Status

Proposed (with spec M3, in review)

## Context

The editor logs Comfy work as a flat list of status events and runs one job at a time. M3 needs a jobs panel, parallel jobs, retries, and a new job kind (3D photo from MoGe).

## Decision (proposed)

- **One object per job** with an id, kind, title, timed steps, result and the original request. Panels, retries and expected durations read from it; nothing reconstructs jobs from a log.
- **Local concurrency limit of 3**; Cloud may queue further. Controls are never disabled by a running job.
- **Expected time, not percent.** Cloud v1 reports state, not progress; a median of past durations per kind is honest and testable.
- **3D photos stay out of the house.** A MoGe mesh is a single-view reconstruction with torn depth edges; it is shown in its own viewer with limited motion rather than mixed with real-scale furniture.

## Rejected

- Websocket progress percentages: needs a websocket path through the key proxy and only covers some nodes; later.
- Placing 3D photos into the plan: needs alignment between an image camera and the house; later.

## Consequences

Breaking change to `state().jobs`; five existing e2e tests are rewritten to read job steps (behaviour unchanged).
