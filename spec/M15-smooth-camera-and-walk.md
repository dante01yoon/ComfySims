# M15 — Smooth camera and walk mode: glide between views, walk through the house

| | |
| --- | --- |
| Status | Approved (2026-10-19) |
| Date | 2026-10-19 |
| Owner | Dante |
| Decisions | [ADR-0013](../docs/adr/0013-camera-transitions-keep-the-resting-pose-contract.md) |
| Case study | [docs/portfolio/smooth-motion-case-study.md](../docs/portfolio/smooth-motion-case-study.md) |

## 1. Why

**The editor feels janky and you cannot move around inside a room.** Dante (2026-10-19), after two smooth Three.js interior demos: "지금 되게 버벅이고 방 안도 못돌아다니고 하잖아. 이거 해결해줄 수 있어?"

Measured on 2026-10-19 (`demo/measure-motion.mjs`, Apple M4 Max, DPR 2; data in `docs/portfolio/data/m15-before-dpr2.json`):

- **Steady frame rate is fine:** 60 fps when orbiting or idle.
- **The camera teleports.**
  - Focusing a room moves it 17.5 m in one frame.
  - Switching to the studio moves it 16.9 m.
- **The controls have no inertia:** the camera stops dead, and the wheel zooms in jumps.
- **You cannot walk.** The only cameras are an orbit around the house and the eye-level render camera.
- **The scene renders 60 frames a second even when nothing changes.**

Loading and view-switch stalls (148 ms and 243 ms, caused by heavy generated assets) are M16. This milestone is about motion.

## 2. Goals and non-goals

Goals
- Every camera change the user sees glides: focus a room, room chips, switch views, enter and leave walk mode.
- Orbit, pan and zoom have inertia.
- A walk mode at eye height inside the house:
  - Move with WASD or the arrow keys, and drag to look.
  - Walls and tall furniture stop you; doors let you through.
- Render on demand: no frames while nothing changes.

Non-goals (M15)
- Asset weight, texture uploads and shader compile stalls (M16).
- Click-to-walk on the floor, touch joysticks, VR.
- An MCP walk tool (agents keep using `render_room`).
- Collision with furniture lower than 50 cm (you step over rugs and coffee tables).

## 3. Scenarios

1. **Glide.** In the studio, Dante clicks the Bedroom chip. The camera flies from the whole-house view to the bedroom over about 0.8 s instead of jumping.
2. **Walk.**
   - With the living room focused, Dante clicks **Walk**. The camera flies down to eye height inside the room.
   - He holds W and walks toward the kitchen door, dragging to look around. He passes through the door, and the room chip switches to Kitchen.
   - Walking into a wall stops him at the wall, not through it.
   - Esc flies back up to the orbit view of the room he is in.
3. **Render while gliding.** An agent calls `render_room` right after `focus_room`. The render uses the destination view, not a frame from mid-flight.

## 4. Screens and states

- **Bottom bar:**
  - A **Walk** button, enabled when a plan room is focused (title "Focus a room to walk in it" otherwise).
  - In walk mode it becomes **Exit walk**, and a hint reads "WASD / arrows to move · Shift to run · drag to look · Esc to exit".
- **Room chips:** while walking, they highlight the room you are in.
- No other UI changes.

## 5. Behaviour rules

- **Resting pose vs pose on screen.**
  - `camera()` keeps meaning the camera's *resting pose*: the destination of any running transition. In walk mode it is the eye pose.
  - `cameraFrame()` is the pose rendered now.
  - `cameraMoving()` is true while a transition, inertia or a walk key is moving the camera.
- **Transitions:**
  - `focusZone`, room chips, `setView`, entering walk and leaving walk move the rendered camera from its current pose to the resting pose.
  - Each transition takes 0.6–1.0 s with ease-in-out, and position and target are interpolated together.
  - A new transition starts from wherever the camera is on screen.
- **Instant moves:**
  - `setCamera` stays instant: renders and tests use it.
  - `exportPasses`, `renderInComfy` and every render path first finish any running transition (jump to the resting pose), then shoot.
  - `screenshot()` waits until `cameraMoving()` is false (at most 1.5 s).
- **Inertia:**
  - After a drag or wheel input ends, the orbit camera keeps moving and slows to rest. It must still move 100 ms after release and settle within 1.5 s.
  - Zoom is smoothed: there are no per-wheel-tick jumps.
- **Walk mode:**
  - **Entry:** `walk()` with no argument starts at the focused room's standing point (the same point eye-level renders use), facing across the room. `walk({ x, z, yawDeg })` starts at that point.
  - **Eye:** height 160 cm, pitch 0.
  - **Refusals:** fails with `not-a-plan` for box rooms, `no-room` with no point and no focused room, and `blocked` when the point is inside a wall or tall furniture.
  - **Yaw convention (same as the 360° viewer):** yaw 0 looks at +Z, yaw 90 at +X.
  - **Movement:**
    - W/S or Up/Down move forward and back; A/D or Left/Right strafe.
    - Speed is 140 cm/s, or 280 cm/s with Shift. Movement is frame-rate independent.
  - **Look:** dragging turns yaw freely; pitch is clamped to ±60°.
  - **The walker** is a 25 cm-radius circle on the floor.
    - Solid wall segments block it.
    - Door openings (`kind: 'door'`) are passable; window openings are not.
    - Furniture with listed height ≥ 50 cm blocks it, using listed-size footprints like collisions do.
  - **Blocked moves** slide along the obstacle when possible. Otherwise the walker stops touching it.
  - `walkStep({ forward, right })` moves by that many centimetres in the eye's frame, applies collision, and returns how far it moved and whether it was blocked.
  - `look({ yawDeg, pitchDeg })` turns relative to the current direction.
  - `state().navigation.zoneId` is the zone containing the eye. Room chips and `focusedZone` follow it.
  - `stopWalking()` (or Esc, or **Exit walk**) returns to orbit, focused on the zone the walker is in, with a transition.
- **Render on demand:**
  - The main canvas renders a frame only when something changed: layout, selection, view, lighting fade, transition, inertia, walking, a loaded mesh or a resize.
  - While idle it renders nothing.
  - `renderStats().frames` counts rendered frames.
- **Other API calls in walk mode:** `setView('editor')` leaves walk mode first. `focusZone(id)` leaves walk mode and focuses that room.

## 6. Contract and data changes

`spec/contracts/editor-api.ts`:
- `Navigation = { mode: 'orbit' } | { mode: 'walk'; eye: Vec3; yawDeg: number; pitchDeg: number; zoneId: string | null }`
- `EditorState.navigation: Navigation`
- New methods:
  - `cameraFrame()`
  - `cameraMoving()`
  - `walk(start?)`
  - `stopWalking()`
  - `walkStep(move)`
  - `look(turn)`
  - `renderStats()`

No layout or MCP changes.

## 7. ComfyUI workflows

None.

## 8. Acceptance criteria

| AC | Status | Criterion |
| --- | --- | --- |
| AC-116 | active | Focusing a room, a room chip and switching views glide: `camera()` returns the destination at once, `cameraFrame()` passes through at least 5 distinct poses, the move takes 0.5–1.5 s (wall clock, tolerant of slow CI renderers) and ends at `camera()` within 1 cm; `setCamera` stays instant |
| AC-117 | active | A render or `exportPasses` started mid-transition uses the destination pose, and `screenshot()` waits for the camera to settle |
| AC-118 | active | Orbit drag has inertia: the rendered camera still moves after release and settles (`cameraMoving()` false) within 1.5 s at any frame rate (settling is judged by speed, not by distance per frame) |
| AC-119 | active | Walk mode: the Walk button needs a focused room; entering puts the eye at 160 cm at the room's standing point, looking level, with a glide down; Esc returns to orbit focused on the walker's room |
| AC-120 | active | Walking: a wall stops the walker ≥ 25 cm from its face, a door lets it into the next room (navigation and focused room follow), furniture ≥ 50 cm tall stops it, lower furniture does not; holding W for 1 s moves 100–180 cm |
| AC-121 | active | Look: drag turns yaw freely and clamps pitch to ±60°; `look()` turns relative to the current direction |
| AC-122 | active | Render on demand: no frames render while idle for 2 s; moving an item renders at least one frame |
| AC-123 | manual | Real-GPU measurement after M15 (`demo/measure-motion.mjs`, median of 3 headless runs): when focusing a room, no frame moves the camera more than 6% of the glide's length and no frame gap exceeds 33 ms; and a recording of walking through the demo house (evidence 2026-10-19: `docs/portfolio/perf/2026-10-19-m15-final/report.md`, `docs/recordings/media/roomfit-walk.mp4`) |
| AC-124 | active | Wheel zoom works anywhere over the 3D view, including over a room label or other overlay on the canvas |
| AC-133 | active | In walk mode the bottom bar keeps its one-row height and the key hint stays on one line |

## 9. Test plan

| AC | Level |
| --- | --- |
| AC-116 ~ AC-122, AC-124, AC-133 | e2e (`acceptance/e2e/motion.spec.ts`): sample `cameraFrame()` every animation frame from the page; walk with `walkStep` for deterministic collision checks and with the keyboard for speed |
| AC-123 | manual: measurement script + recording |

Existing tests that read `camera()` right after `focusZone`/`setView` stay valid because `camera()` is the resting pose.

## 10. Risks and open questions

- SwiftShader in CI renders slowly, so transition checks count distinct poses and wall-clock duration with tolerances rather than per-frame step sizes. The per-frame step limit is checked on a real GPU (AC-123).
- With render on demand, a missed `invalidate()` shows as a frozen view. The AC-122 test moves an item and expects a frame; lighting fades and job thumbnails must also invalidate.
- Implementation choice: drei `CameraControls` (camera-controls) has smooth transitions and damping built in. OrbitControls with damping plus our own tween also works. The session picks, and the ADR records the choice.

## Change log

- 2026-10-20 First CI run of the M15 tests (GitHub runner, SwiftShader at ~3 fps with the demo house):
  - Glide tests saw only 2–3 rendered poses.
  - Inertia "settled" only after 4.5 s, because settling was judged by distance per frame and slow frames move further. That is a real defect on slow machines: the view is still but `cameraMoving()` stays true, so renders and screenshots wait.
  - AC-118 now says "at any frame rate".
  - Motion tests run at 800 × 450 to keep the software renderer's frame rate usable.

- 2026-10-19 After the first real-GPU measurement:
  - **AC-123 revised.** It said "largest camera step per frame ≤ 50 cm". That limit was mis-specified: a 17 m glide that takes ≤ 1 s with ease-in-out peaks at roughly 1.5–2× its average speed, so ~60–90 cm per frame. It cannot meet an absolute limit without becoming slow. Measured: 85 cm, which is 4.9% of the 17.3 m glide.
  - **New AC-123.** The criterion is now relative (≤ 6% of the glide per frame) plus "no frame gap > 33 ms". The original limit is recorded as not met.
  - **AC-133 added.** The walk recording showed the key hint wrapping one word per line inside the bottom bar, stretching the bar to ~220 px. No test checked layout.
  - **AC-124 added.** Profiling showed wheel zoom did nothing over a focused room: the room label sits at the screen centre and the new wheel handler listened on the canvas only. No test had covered it.

- 2026-10-19 Written after measuring (see the case study). Approved in one step: Dante asked for exactly this ("이거 해결해줄 수 있어?" and "해결 과정 기록해놔"), and the open choices follow the reference demos and the existing eye-level camera rules.
