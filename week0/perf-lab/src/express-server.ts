// Week 1, Lab 3 — the comparison baseline.
// This one is provided working, since the point of the exercise is to
// compare against YOUR raw HTTP server, not to re-implement Express.

import express from "express";
import client from "prom-client";

const app = express();
const PORT = 3001;

// Basic Prometheus metrics — you'll extend this in Week 2's event-loop-lag lab.
const register = new client.Registry();
client.collectDefaultMetrics({ register });

const httpDuration = new client.Histogram({
  name: "http_request_duration_seconds",
  help: "request duration in seconds",
  labelNames: ["method", "route", "status"],
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 2],
});
register.registerMetric(httpDuration);

app.use((req, res, next) => {
  const end = httpDuration.startTimer();
  res.on("finish", () => {
    end({ method: req.method, route: req.path, status: res.statusCode });
  });
  next();
});

app.get("/", (_req, res) => {
  res.send("hello");
});

app.get("/metrics", async (_req, res) => {
  res.set("Content-Type", register.contentType);
  res.send(await register.metrics());
});

app.listen(PORT, () => {
  console.log(`express server listening on :${PORT}`);
});
