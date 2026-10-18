# Recordings

Every implementation session is run headless through `node harness/tools/run-session.mjs <name> <prompt-file>` inside this repo, so the harness hooks are active. The full stream-json transcript is kept locally in `.recordings/<name>.jsonl` (not committed); the prompt and a summary (duration, turns, cost, tool calls, how often the Stop hook sent the agent back, guard blocks) are committed here as `<name>.md`.
