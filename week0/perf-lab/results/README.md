# perf-lab results

Curriculum rule: "Every project ships with numbers." This file is that.

## Raw HTTP server vs Express — Week 1

| Server | RPS | p50 | p95 | p99 |
|---|---|---|---|---|
| raw (net module) |  |  |  |  |
| express |  |  |  |  |

## Latency-vs-concurrency curve — Week 2

| VUs | RPS | p50 | p95 | p99 |
|---|---|---|---|---|
| 10 |  |  |  |  |
| 50 |  |  |  |  |
| 100 |  |  |  |  |
| 250 |  |  |  |  |
| 500 |  |  |  |  |
| 1000 |  |  |  |  |

**Where's the knee?**
<!-- the concurrency level where p99 starts degrading nonlinearly -->

## Event-loop-blocking experiment — Week 2

| Scenario | p50 | p95 | p99 |
|---|---|---|---|
| baseline (no blocking endpoint hit) |  |  |  |
| 200ms sync CPU loop, 200 VUs |  |  |  |
| same, moved to worker_threads |  |  |  |

**Delta and why:**
