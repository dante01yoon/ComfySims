# Performance runs

Every measurement of the editor's motion and loading, newest last. Each run folder has a report, raw numbers, V8 CPU profiles and Chrome traces. Environment, scenarios, signals and how the improvement points were found: [METHOD.md](METHOD.md). Each run also has flame graphs and flame charts (`flamegraph-*.svg`, `flamechart-*.svg`).

| Run | Commit | Machine | Load longest stall | Switch longest stall | Focus max step | Idle rendered frames (3 s) |
| --- | --- | --- | --- | --- | --- | --- |
| [2026-10-19-m15-before](2026-10-19-m15-before/report.md) | `0761e71` | Apple M4 Max @2x, median of 3 | 156 ms | 223 ms | 1731 cm | — |
| [2026-10-19-m15-after](2026-10-19-m15-after/report.md) | `f9a187c` | Apple M4 Max @2x, median of 3 | 105 ms | 131 ms | 85 cm | 0 |
