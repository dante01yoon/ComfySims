# Performance runs

Every measurement of the editor's motion and loading, newest last. Each run folder has a report, raw numbers, V8 CPU profiles and Chrome traces. Environment, scenarios, signals and how the improvement points were found: [METHOD.md](METHOD.md). Each run also has flame graphs and flame charts (`flamegraph-*.svg`, `flamechart-*.svg`).

| Run | Commit | Machine | Load longest stall | Switch longest stall | Focus max step | Idle rendered frames (3 s) |
| --- | --- | --- | --- | --- | --- | --- |
| [2026-10-19-m15-before](2026-10-19-m15-before/report.md) | `0761e71` | Apple M4 Max @2x, median of 3 | 156 ms | 223 ms | 1731 cm | — |
| [2026-10-19-m15-after](2026-10-19-m15-after/report.md) | `f9a187c` | Apple M4 Max @2x, median of 3 | 105 ms | 131 ms | 85 cm | 0 |
| [2026-10-19-m15-final](2026-10-19-m15-final/report.md) | `899ecdc` | Apple M4 Max @2x, median of 3 | 145 ms | 151 ms | 83 cm | 0 |
| [2026-10-19-m16-before](2026-10-19-m16-before/report.md) | `c4f6d24` | Apple M4 Max @2x, median of 3 | 143 ms | 167 ms | 84 cm | 0 |
| [2026-10-19-m16-after](2026-10-19-m16-after/report.md) | `6879ae4` | Apple M4 Max @2x, median of 3 | 66 ms | 69 ms | 88 cm | 0 |
