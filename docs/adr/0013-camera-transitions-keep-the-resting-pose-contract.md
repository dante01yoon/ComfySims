# ADR-0013: Camera transitions animate only what is on screen; `camera()` stays the resting pose

Date: 2026-10-19

## Status

Accepted

## Context

Every camera change in the editor was instant: focusing a room moved the camera 17.5 m in one frame. The fix is to animate camera changes. But a lot already depends on the camera being exactly where it was set, at once:

- 13 existing e2e checks read `camera()` right after `focusZone`/`setView`.
- Renders and depth exports set an eye-level camera, shoot, and restore it in the same tick.
- The MCP `screenshot` tool and agents expect the view they asked for.

## Decision

Split the camera into two poses:

- **The resting pose:** where the camera is going. `camera()` keeps returning it, and every render, export and plan computation uses it.
- **The pose on screen:** `cameraFrame()`. It is animated toward the resting pose with ease-in-out over 0.6–1.0 s, with damping after user input.

Further rules:

- **`setCamera` stays instant.** It is the programmatic primitive.
- **Renders finish any running transition first.** `screenshot()` waits for the camera to settle.
- **Walk mode is a navigation state, not a separate camera.** Its eye pose is the resting pose, and entering or leaving it is a transition like any other.
- **The canvas renders on demand.** Transitions, inertia and walking request frames while they move.

## Alternatives

- **Animate `camera()` itself:** every caller would have to wait for transitions. That breaks renders (they would shoot mid-flight) and 13 tests. Rejected.
- **Add an `animate` flag to each API call, default off:** the UI would animate but the API would still teleport, and the two paths would drift apart. Rejected; animation is a presentation concern.
- **First-person controls from three's examples (PointerLockControls):** pointer lock needs a user gesture, hides the cursor and can't be driven from tests or agents. A walker driven by `walkStep`/`look`, with keys and drag on top, is testable and works in an iframe. Chosen.
- **Physics engine for collision (Rapier):** a 25 cm circle against wall segments and furniture rectangles is a few lines of 2D geometry, and it already exists in `packages/placement` in another form. Rejected as unnecessary weight.

## Consequences

- Existing tests and agents keep working unchanged.
- A missed invalidation under render-on-demand freezes the view. AC-122 guards the common case.
- Walk collision reuses the listed-size footprints, so you bump into the box you see in the editor, not into the mesh.
