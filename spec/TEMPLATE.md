# M<n> — <title>

| | |
| --- | --- |
| Status | Draft · In review · Approved · Done |
| Date | YYYY-MM-DD |
| Owner | Dante |
| Decisions | ADR links |

Every new feature starts as a copy of this file in `Draft`. Implementation sessions start only after the owner marks it `Approved`. ACs stay `planned` until then.

## 1. Why

The problem, who has it, and the evidence (recordings, numbers, screenshots). One paragraph per problem.

## 2. Goals and non-goals

- Goals: what is true when this milestone is done.
- Non-goals: what we deliberately do not do now, and why.

## 3. Scenarios

Numbered user scenarios in plain language: who, starting state, steps, outcome.

## 4. Screens and states

Where each control lives, a rough layout, and every state: empty, loading/in progress, success, failure, disabled. Exact labels for buttons and fields (tests use them).

## 5. Behaviour rules

Precise rules a test can check: ordering, limits, defaults, what happens on failure, what is undoable.

## 6. Contract and data changes

New and changed types in `packages/schema` and `spec/contracts/*`. Mark breaking changes and list the existing tests they touch.

## 7. ComfyUI workflows

New or changed workflow files, the nodes they use, and evidence that they run (Cloud job id, time, output).

## 8. Acceptance criteria

| AC | Status | Criterion |
| --- | --- | --- |

## 9. Test plan

For each AC: the lowest level that proves it (pure function test, e2e with the fake ComfyUI, Python, manual recording).

## 10. Risks and open questions

Risks with mitigations. Open questions the owner must answer before approval, each with a recommended answer.

## Change log

- YYYY-MM-DD Draft.
