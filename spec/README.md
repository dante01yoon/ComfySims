# Specs

Specs are the source of truth. Code is done when the harness says the spec is met.

## The loop

1. A **spec session** (human + agent) writes or changes a milestone spec and its acceptance criteria (ACs).
2. Each AC gets an acceptance test in `acceptance/` whose name starts with the AC id (`AC-3 ...`).
3. **Implementation sessions** make the tests pass. They cannot edit `spec/`, `acceptance/`, `fixtures/`, `harness/` or `.claude/`.
4. `pnpm verify` maps test results back to ACs and prints the spec status.

## AC status

| Status | Meaning | Verify rule |
| --- | --- | --- |
| `active` | Must hold now | Needs at least one passing test and no failing test |
| `planned` | Agreed, not built yet | May have `it.todo` placeholders; reported, never fails |
| `manual` | Checked by a person (demo, visual) | Reported with the evidence link in the spec |

Moving an AC from `planned` to `active` is a spec change, so it happens in a spec session.

## Contracts

`spec/contracts/` holds the machine-readable contracts other packages and the Python node pack consume.
`room-layout.schema.json` is generated from `packages/schema` (`pnpm schema:export`); `pnpm verify` fails when it drifts.
