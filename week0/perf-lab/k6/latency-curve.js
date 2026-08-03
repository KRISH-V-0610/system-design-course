// Week 1/2 lab: latency-vs-concurrency curve.
// Run at multiple VU levels and record RPS + p50/p95/p99 into results/.
//
// Usage:
//   k6 run --vus 10  --duration 30s k6/latency-curve.js
//   k6 run --vus 50  --duration 30s k6/latency-curve.js
//   k6 run --vus 100 --duration 30s k6/latency-curve.js
//   k6 run --vus 250 --duration 30s k6/latency-curve.js
//   k6 run --vus 500 --duration 30s k6/latency-curve.js
//   k6 run --vus 1000 --duration 30s k6/latency-curve.js
//
// Append each summary's rps/p50/p95/p99 to results/latency-curve.md.

import http from "k6/http";
import { sleep } from "k6";

export const options = {
  thresholds: {
    http_req_duration: ["p(99)<2000"], // adjust once you have a baseline
  },
};

const TARGET = __ENV.TARGET || "http://localhost:3000/";

export default function () {
  http.get(TARGET);
  sleep(0.01);
}
