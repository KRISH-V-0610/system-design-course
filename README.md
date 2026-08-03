# System Design Mastery — 28-Week Curriculum
### Build-first, Node/TypeScript-native, engineered for depth rather than interview trivia

---

## 0. How this curriculum is different

The two roadmaps you linked are good **topic indexes**. They are not curricula. `roadmap.sh/system-design` is a concept graph with no ordering guarantees or practice loop. The 12-week Vercel roadmap is well-structured but is fundamentally a **reading + discussion** program (5–6 hrs/week, two AI-assisted study sessions, one paper design exercise). That produces people who can *talk* about system design.

You said you want to be *best* at system design. That requires a different loop:

> **Read the concept → build the primitive yourself → break it → measure it → write down what you learned.**

Every distributed systems concept in this curriculum has a corresponding thing you implement in TypeScript. You will write your own consistent hashing ring, your own rate limiter in Lua, your own inverted index, your own quorum-replicated KV store, your own saga orchestrator. Reading about consistent hashing takes 20 minutes; implementing it and watching 1/N keys move when you add a node changes how you think permanently.

**Commitment:** 28 weeks, 12–15 hrs/week. 24 weeks of engineering + 4 weeks of interview conversion.
A compressed 10-week variant is at the end if you have placement pressure.

**Weekly rhythm (adjust to your schedule, keep the ratio):**

| Block | Hours | What |
|---|---|---|
| Concepts | 4 | Reading + notes. DDIA, docs, papers, engineering blogs. |
| Lab | 5 | The week's hands-on build. Small, throwaway, measured. |
| Project | 4 | The phase project. Cumulative, portfolio-grade. |
| Drill | 1 | One timed 45-min design problem, written. |
| Write-up | 1 | Notes in your own words. Non-negotiable — see §11. |

---

## 1. Baseline stack and tooling

Set this up in Week 0. Everything below runs on your machine via Docker Compose.

**Language/runtime:** Node 22+, TypeScript strict mode, pnpm, Vitest.
**Frameworks:** Express (you know it) → later, one week on Fastify to feel the perf difference and understand *why*.
**Datastores:** PostgreSQL 16, MongoDB 7, Redis 7.
**Messaging:** BullMQ (Redis), Redpanda (Kafka-compatible, far lighter locally than real Kafka).
**Proxy/LB:** Nginx.
**Observability:** OpenTelemetry SDK, Prometheus, Grafana, Loki, Tempo.
**Load testing:** k6 (primary), autocannon (quick).
**Chaos:** Toxiproxy, plus `docker kill` and `tc netem`.
**Diagrams:** Excalidraw or Mermaid, committed into repos.

**Week 0 checklist**
- [ ] One `docker-compose.yml` bringing up Postgres + Mongo + Redis + Redpanda + Prometheus + Grafana + Tempo + Loki
- [ ] A `sysdesign-notes` repo. Markdown. One file per week. This becomes your second brain.
- [ ] A `perf-lab` repo scaffolded with k6 and a results directory
- [ ] Verify prereqs: you can write non-trivial SQL joins/aggregates, you know what a TCP port is, you can read `docker logs`

---

## 2. Prerequisite honesty check

Skip nothing here. If any of these are shaky, fix them in Week 0 — they are load-bearing for everything after.

| Prerequisite | Self-test |
|---|---|
| SQL | Write a query with a self-join, a window function, and a `GROUP BY ... HAVING`, without looking it up |
| HTTP | Explain what happens between typing a URL and first byte, naming 8+ distinct steps |
| Concurrency | Explain the difference between concurrency and parallelism, and where Node sits |
| Linux basics | `ps`, `top`, `lsof`, `netstat`/`ss`, `strace` — you know what each shows |
| Git | Branching, rebasing, resolving conflicts without panic |

---

# PHASE 0 — Ground Truth
### Weeks 1–2 · The machine under your server

**Why this phase exists:** Most engineers learn system design as a vocabulary of boxes and arrows. That produces designs that are internally consistent and physically wrong. You cannot reason about latency budgets, connection limits, or tail latency without knowing what a TCP connection actually costs and what your runtime actually does with a request. This phase makes every later abstraction concrete.

---

## Week 1 — Networking as a cost model

**Concepts**
- OSI model, practically: what your app actually controls at L4 vs L7
- TCP: three-way handshake, slow start, congestion window, Nagle's algorithm + delayed ACK interaction, `SO_BACKLOG`, TIME_WAIT, ephemeral port exhaustion
- TLS: handshake round trips, session resumption, TLS 1.3's 1-RTT and 0-RTT, termination points
- HTTP/1.1: keep-alive, head-of-line blocking, why pipelining failed, connection-per-origin limits
- HTTP/2: multiplexing, HPACK, server push (and why it died), TCP-level HOL blocking remains
- HTTP/3 / QUIC: why moving to UDP fixed HOL blocking, connection migration
- DNS: resolver chain, record types, TTL semantics, why DNS-based failover has a long tail
- **Latency numbers to memorize** (L1 ~1ns, main memory ~100ns, SSD random read ~100µs, same-DC round trip ~0.5ms, cross-continent ~150ms)
- Latency vs throughput; percentiles; **why p99 is the number that matters** (a request touching 10 services each with p99=10ms has a much worse than 10ms tail)
- Little's Law: `L = λW` — concurrency = arrival rate × latency

**Lab**
1. Write a raw TCP echo server using Node's `net` module.
2. Extend it into a hand-rolled HTTP/1.1 server: parse the request line, headers, handle `Content-Length` and `Transfer-Encoding: chunked`, implement keep-alive correctly.
3. Serve the same "hello" from your parser and from Express. Benchmark both with autocannon.
4. Capture one request in Wireshark or `tcpdump`. Identify every packet in the handshake, the request, the response, the teardown.

**Deliverable:** a note answering — how many bytes and how many round trips does one cold HTTPS request cost before your handler runs?

---

## Week 2 — Node as a system component

**Concepts**
- Event loop phases: timers → pending callbacks → poll → check → close. Where `setImmediate` vs `process.nextTick` vs promise microtasks land
- libuv threadpool: which operations use it (fs, dns.lookup, crypto, zlib) and which don't (network I/O). `UV_THREADPOOL_SIZE` default of 4 and when it bottlenecks you
- Blocking the loop: what happens to p99 when one handler does 200ms of CPU work while 500 requests are in flight
- `worker_threads` for CPU-bound work; when to reach for a separate service instead
- Streams and backpressure: `highWaterMark`, why `pipe()` handles backpressure and manual `.on('data')` often doesn't
- Process model: `cluster` module, `SO_REUSEPORT`, PM2 vs N container replicas behind a load balancer — and why the latter wins in production
- Memory: V8 heap limit, `--max-old-space-size`, GC pause impact on tail latency, finding leaks with heap snapshots
- Graceful shutdown: SIGTERM → stop accepting → drain in-flight → close pools → exit

**Lab**
1. Instrument event loop lag (`perf_hooks.monitorEventLoopDelay`). Expose it as a Prometheus metric.
2. Add an endpoint that does a synchronous 200ms CPU loop. Run k6 at 200 VUs. Chart p50/p95/p99 with and without that endpoint being hit.
3. Move that work to `worker_threads`. Re-measure. Document the delta.
4. Produce a **latency-vs-concurrency curve** for your server: run k6 at 10, 50, 100, 250, 500, 1000 VUs. Plot RPS and p99 against concurrency. Find the knee.
5. Verify Little's Law against your own measurements.

### ▶ Project 0 — `perf-lab`
Your benchmarking harness. Raw HTTP server + Express server + k6 scripts + a results README containing your measured RPS and p50/p95/p99 at each concurrency level, plus the latency curve chart.

You will reuse this harness in every later phase. Every project from here on ships with numbers.

**Phase gate:** You can explain, using your own measurements, why average latency is a lie and where your server's throughput knee is.

---

# PHASE 1 — Data
### Weeks 3–6 · The layer you can't undo

**Why this phase exists:** You can rewrite a service in a week. You cannot re-shard a 2TB table in a week. Data model and storage choices compound for years, and almost every "we need to scale" conversation is really a database conversation. Most engineers are weak here because it requires internals knowledge, not API knowledge.

---

## Week 3 — PostgreSQL internals

**Concepts**
- Physical layout: heap files, 8KB pages, tuples, line pointers, TOAST for large values
- Write-Ahead Log: why it exists, `fsync`, checkpoints, `synchronous_commit`, the durability/latency dial
- MVCC: `xmin`/`xmax`, tuple visibility, why `UPDATE` writes a new row version
- VACUUM: dead tuples, bloat, autovacuum tuning, transaction ID wraparound
- Isolation levels: Read Committed (default) vs Repeatable Read vs Serializable. Anomalies: dirty read, non-repeatable read, phantom, **lost update**, **write skew**
- Locking: row locks, `SELECT ... FOR UPDATE`, `FOR UPDATE SKIP LOCKED` (queue pattern), deadlock detection, advisory locks
- The buffer pool / `shared_buffers` and its relationship to OS page cache

**Lab**
1. Seed a table with 5M realistic rows.
2. Run `EXPLAIN (ANALYZE, BUFFERS)` on ten different queries. Learn to read every field: actual vs estimated rows, loops, shared hit vs read.
3. Reproduce **lost update** with two concurrent transactions under Read Committed. Fix it three ways: `FOR UPDATE`, optimistic version column, `SERIALIZABLE`. Compare throughput of each under contention.
4. Reproduce **write skew** (classic: two doctors both going off-call). Show Repeatable Read doesn't prevent it, Serializable does.

---

## Week 4 — Indexing and query performance

**Concepts**
- B-tree mechanics: node structure, height, why point lookups are ~3–4 page reads at any realistic scale
- Composite indexes: leftmost-prefix rule, column ordering by selectivity vs by predicate type (equality columns before range columns)
- Index-only scans and covering indexes (`INCLUDE`)
- Partial indexes, expression indexes
- GIN (full text, JSONB, arrays), GiST (geometric, ranges), BRIN (huge append-only tables) — when each wins
- Planner: statistics, selectivity estimation, when it goes wrong, `ANALYZE`, extended statistics
- **Pagination:** offset pagination is O(offset) — prove it. Keyset/cursor pagination. Handling ties with composite cursors. Stable ordering requirements
- Connection pooling: Postgres is process-per-connection (~10MB each). Why 500 app connections kills a database. PgBouncer session vs transaction vs statement pooling and what breaks in each. Pool sizing (start near `2 × cores`, then measure)
- The N+1 problem, how ORMs cause it, batching and DataLoader-style solutions

**Lab**
Take one slow endpoint over your 5M-row table. Get p99 from ~800ms to under 30ms. Document every step: what you changed, what `EXPLAIN` said before and after, what the measured improvement was. This document is more valuable than the code.

Then: run the same endpoint at 200 concurrent connections directly, then behind PgBouncer in transaction mode. Compare.

---

## Week 5 — MongoDB and the document model

**Concepts**
- WiredTiger storage engine; B-tree vs LSM-tree tradeoffs (write amplification, read amplification, space amplification) and which workloads suit which
- Document modeling: embed vs reference. The 16MB document limit. Unbounded array anti-pattern
- Patterns: bucket (time-series), extended reference, computed, subset, outlier
- Indexes: compound prefix rule, multikey indexes and their restrictions, **ESR rule** (Equality, Sort, Range), partial, TTL, wildcard
- Aggregation pipeline: stage ordering matters, `$lookup` cost, `$match` pushdown, `allowDiskUse`
- Replica sets: oplog, elections, `w` write concern, `readConcern`, read preference and the staleness you inherit
- Sharding: shard key selection (cardinality, frequency, monotonicity), chunk splits, jumbo chunks, hot shard from monotonic keys, hashed vs ranged sharding, targeted vs scatter-gather queries
- Transactions in Mongo: they exist, they cost, when they signal a modeling mistake

**Lab**
Model the *same* domain — a social feed with users, posts, follows, likes — in both Postgres and MongoDB. Implement three access patterns in both: (a) user's own posts paginated, (b) home timeline, (c) post with top 10 comments and like count. Seed 1M posts. Benchmark all three in both stores. Write a decision doc: which store for which pattern and why, with numbers.

---

## Week 6 — Choosing and evolving data systems

**Concepts**
- Taxonomy by workload, not by hype: relational, document, key-value, wide-column (Cassandra/Dynamo), graph, time-series, search, vector, object storage, embedded (SQLite/RocksDB). For each: access pattern it's optimized for, and the one it's terrible at
- ACID vs BASE — where eventual consistency is genuinely acceptable, and where it silently corrupts business logic
- Normalization vs denormalization as an explicit read-cost/write-cost trade
- **Zero-downtime schema migration: expand-contract.** Add column nullable → dual-write → backfill in batches → switch reads → stop old writes → drop. Practice this, it is a real senior skill
- Backfills at scale: batching, throttling, resumability, avoiding long transactions and lock storms
- Online index creation (`CREATE INDEX CONCURRENTLY`) and its failure modes
- Multi-tenancy: shared table + tenant_id + Row Level Security vs schema-per-tenant vs database-per-tenant. Blast radius, noisy neighbor, migration cost, per-tenant backup/restore

### ▶ Project 1 — `linkforge`
**A URL shortener + analytics API that a real team would accept.**

Stack: Node + TypeScript + Express + Postgres + Redis.

Requirements:
- Base62 short codes. Choose and justify: counter-based vs random-with-collision-check vs hash-based. Support custom slugs with reservation semantics
- Redirect endpoint: target p99 < 20ms
- Analytics: click events with timestamp, referrer, coarse geo, device. Aggregation endpoints
- **Keyset pagination** everywhere. No `OFFSET`
- **Idempotency keys** on all creates (Stripe-style: key + request fingerprint + stored response, with a TTL)
- API versioning strategy, RFC 7807 problem-details error format, consistent error taxonomy
- Migrations with a real tool. 10M seeded rows minimum
- Postgres read replica; route reads to it; **then handle the read-after-write problem you just created** (sticky-to-primary window, or LSN tracking)
- OpenTelemetry traces, Prometheus RED metrics (rate/errors/duration), structured JSON logs with correlation IDs propagated end to end
- README containing: schema with justification for every index (with the `EXPLAIN` output that justifies it), architecture diagram, k6 results at 4 concurrency levels, and a **bottleneck log** — each bottleneck you hit, how you diagnosed it, what you changed, the measured delta

**Phase gate:** You can defend every index and every data-type choice in your schema with a measurement, not an opinion.

**Reading:** DDIA Ch. 2, 3, 6. Andy Pavlo's CMU Database Systems lectures (free on YouTube) for storage engines and query execution.

---

# PHASE 2 — Caching and Redis as a system primitive
### Weeks 7–8

**Why this phase exists:** Caching is the highest leverage-per-rupee tool in backend engineering, and the one with the most subtle, production-breaking failure modes. Everyone knows cache-aside. Almost nobody has actually implemented stampede protection or debugged a hot key. That gap is where you differentiate.

---

## Week 7 — Cache theory and Redis internals

**Concepts**
- The cache hierarchy: browser cache → CDN → reverse proxy cache → in-process LRU (L1) → Redis (L2) → DB buffer pool. Each layer's hit ratio, latency, and invalidation difficulty
- Patterns: cache-aside (lazy), read-through, write-through, write-behind, write-around, refresh-ahead. The consistency and failure characteristics of each
- Invalidation strategies: TTL, event-driven, **versioned keys** (`user:123:v7` — never delete, just bump), tag-based invalidation
- Eviction: LRU vs LFU vs random; `allkeys-*` vs `volatile-*`; approximated LRU in Redis and why it's approximate
- Redis internals: single-threaded command execution (so one slow `KEYS` blocks everyone), RESP protocol, data structures — string, hash, list, set, sorted set, stream, bitmap, HyperLogLog, geo — and the algorithmic complexity of each command you use
- Expiration: lazy + active sampling; why a key can persist past TTL in memory
- Persistence: RDB snapshots vs AOF (`appendfsync` modes) vs both; the fork + copy-on-write memory spike
- Topology: standalone → replication → Sentinel (HA) → Cluster (16384 hash slots, key hashing, hash tags `{}`, cross-slot restrictions, resharding)
- Pipelining vs `MULTI/EXEC` vs Lua scripts — three different things people confuse. Lua gives you atomicity *and* a single round trip

**Lab**
Add a two-tier cache to `linkforge`: in-process LRU (L1, short TTL) + Redis (L2). Instrument hit ratio per tier. Measure p99 and database QPS before and after. Then deliberately set L1 TTL too high and observe the staleness bugs it causes across replicas — understand why L1 caches must be short-lived or event-invalidated.

---

## Week 8 — Cache failure modes and distributed coordination

**Concepts**
- **Stampede / thundering herd:** a hot key expires, 5,000 concurrent requests all miss and hit the DB simultaneously. Mitigations: single-flight (in-process + distributed lock), probabilistic early recomputation (XFetch), stale-while-revalidate, never-expire + background refresh
- **Cache avalanche:** many keys expiring at once because they were written together. Fix: TTL jitter
- **Cache penetration:** requests for keys that don't exist bypass the cache every time. Fix: negative caching with short TTL, Bloom filter as an existence pre-check
- **Hot key:** one key saturates a single Redis node. Fix: L1 local cache, key replication across N suffixed copies, client-side sharding
- **Distributed locks:** `SET key val NX PX ttl`, unlocking safely with a Lua compare-and-delete, lock renewal/watchdog, **fencing tokens**. Read the Kleppmann critique of Redlock and antirez's reply — then internalize the real distinction: a lock used for *efficiency* (avoid duplicate work) has very different requirements from a lock used for *correctness* (prevent double-spend). Only the latter needs fencing
- **Rate limiting algorithms**, implemented not just described:
  - Fixed window — simple, allows 2× burst at the boundary
  - Sliding window log — exact, O(N) memory per key
  - Sliding window counter — weighted approximation, O(1) memory, the usual production choice
  - Token bucket — allows controlled bursts, the right model for API quotas
  - Leaky bucket — smooths output rate, the right model for protecting a downstream

### ▶ Project 2 — `gatekeeper`
**A publishable TypeScript middleware package. Something you'd actually `npm install`.**

- All five rate-limiting algorithms, each implemented as a **Redis Lua script** so it's atomic and one round trip. Pluggable key extraction (IP, user, tenant, API key), tiered limits, standard `RateLimit-*` response headers
- Cache helper: cache-aside with single-flight, stale-while-revalidate, TTL jitter, negative caching, versioned-key invalidation
- Distributed lock with auto-renewal and fencing tokens
- Circuit breaker (closed/open/half-open) with configurable thresholds
- **Failure-mode test suite:** what happens when Redis is unreachable mid-request? Fail-open or fail-closed? Make it configurable, test both, and document which you'd choose for a rate limiter vs a cache (they differ)
- Benchmarks: overhead per request for each algorithm, at 1k and 10k RPS
- Real README with algorithm comparison table and usage examples

**Phase gate:** You can write a sliding-window rate limiter in Lua from memory and explain its memory/accuracy trade against token bucket without hesitating.

---

# PHASE 3 — Distributed Systems Fundamentals
### Weeks 9–12 · The hard core

**Why this phase exists:** This is the phase most self-taught engineers skip, and it is exactly what separates "can design a CRUD system" from "can design a system." Everything after this — Kafka, sharding, multi-region, real-time — is an application of what you learn here. Give it the full four weeks. Expect it to be uncomfortable.

---

## Week 9 — Failure, time, and impossibility

**Concepts**
- The 8 fallacies of distributed computing, each with a concrete outage it has caused
- **Partial failure:** the defining property. A local program either works or crashes; a distributed system is permanently in a state where some part is broken and you don't know which
- A slow network and a dead node are **indistinguishable** from the outside. Every timeout is a guess. This single fact generates most of distributed systems theory
- Failure detection: heartbeats, timeout tuning, phi-accrual failure detectors, false positives and their cost
- **Clocks:** wall clock vs monotonic clock, NTP skew and jumps, why you must never measure a duration with `Date.now()`, why timestamps do not give you ordering across machines
- Logical time: Lamport timestamps (happened-before, total order without causality detection), **vector clocks** (detect concurrency, O(N) size), hybrid logical clocks (used by CockroachDB and MongoDB)
- **CAP stated correctly:** during a *network partition*, choose availability or consistency. It says nothing about normal operation, and "CA system" is a category error. Then **PACELC**: else (no partition), choose latency or consistency — which is the trade you actually make 99.9% of the time
- FLP impossibility, briefly — why consensus needs either randomness or partial synchrony

**Lab**
1. Simulate clock skew between two writers. Demonstrate last-write-wins silently discarding a write. This is a real class of data-loss bug
2. Implement vector clocks in TypeScript. Show them correctly flagging two concurrent writes as conflicting where LWW would have silently dropped one
3. Build a heartbeat-based failure detector. Tune the timeout. Show the false-positive/detection-latency trade with numbers

---

## Week 10 — Replication and consistency

**Concepts**
- Single-leader: synchronous vs asynchronous vs semi-synchronous replication. Replication lag. Failover, and how automatic failover creates split brain
- The three anomalies async replication creates, and their fixes:
  - **Read-your-own-writes** → route recent writers to the leader, or track write LSN/timestamp per client
  - **Monotonic reads** → pin a user to one replica
  - **Consistent prefix reads** → causality tracking across partitions
- Multi-leader: use cases (multi-DC, offline clients, collaborative editing), write conflicts, resolution strategies (LWW, application merge, CRDTs), topologies
- Leaderless / Dynamo-style: quorums, `W + R > N`, sloppy quorums and hinted handoff, read repair, anti-entropy with Merkle trees. Why `W + R > N` does *not* actually guarantee you read the latest value in edge cases
- **The consistency ladder:** linearizable → sequential → causal → read-your-writes → eventual. Cost increases upward; availability decreases upward. Know where each real system sits
- Where linearizability is genuinely required: leader election, uniqueness constraints, locks, financial balance checks. Where it isn't: almost everything else

**Lab**
1. Set up Postgres streaming replication (primary + 2 replicas) in Docker Compose
2. Drive writes with k6, measure replication lag under increasing write load. Find where lag becomes user-visible
3. Reproduce a real read-after-write bug: create a resource, immediately read it from a replica, get a 404. Then fix it two ways (sticky-to-primary window, LSN tracking) and compare the cost of each
4. Kill the primary. Promote a replica manually. Time the whole procedure and write it up as a runbook

---

## Week 11 — Partitioning and consensus

**Concepts**
- Range partitioning (efficient range scans, hotspot-prone with sequential keys) vs hash partitioning (even distribution, loses range queries)
- **Consistent hashing:** the ring, virtual nodes and why naive consistent hashing has terrible load variance without them, key movement on node add/remove (~K/N), rendezvous hashing as a simpler alternative
- Rebalancing: fixed partition count (Riak/Elasticsearch approach) vs dynamic splitting (HBase/Mongo). Why "rehash everything" is never acceptable
- Secondary indexes: local/document-partitioned (write-cheap, read = scatter-gather) vs global/term-partitioned (read-cheap, write = distributed transaction). This trade shows up constantly in design interviews
- Request routing: client-aware, routing tier, or any-node-forwards. Service discovery
- **Consensus and Raft**, in detail: terms, leader election with randomized timeouts, log replication, commit index, safety properties, log compaction/snapshots, membership changes. Understand it well enough to draw the state machine
- Paxos in one paragraph: same problem, harder to reason about, that's why Raft exists
- What you actually use consensus *for*: leader election, distributed configuration, service discovery, distributed locks with correctness requirements. etcd, ZooKeeper, Consul

**Lab**
1. Implement a consistent hashing ring with configurable virtual nodes in TypeScript
2. With 4 nodes and 1M keys, measure load distribution at vnode counts of 1, 10, 100, 500. Chart the variance
3. Add a 5th node. Measure the exact percentage of keys that move. Compare to the theoretical `1/N`
4. Watch MIT 6.824 lectures 5–7 (Raft). Optional but high-value: implement leader election over TCP for 3 nodes

---

## Week 12 — Distributed transactions

**Concepts**
- Two-phase commit: prepare/commit, the coordinator, and its fatal flaw — a coordinator crash after prepare leaves participants blocked holding locks indefinitely. Why nobody wants 2PC across microservices
- **Sagas:** a sequence of local transactions with compensating actions. Orchestration (central coordinator, explicit, easier to debug) vs choreography (event-driven, decoupled, becomes untraceable past ~5 services). Sagas give you atomicity but *not* isolation — understand the anomalies (dirty reads of intermediate state, lost updates) and the countermeasures (semantic locks, commutative updates, pessimistic ordering)
- **The dual-write problem:** write to DB and publish to Kafka — one succeeds, one fails, your system is now permanently inconsistent. There is no ordering of the two operations that fixes it
- **Transactional outbox:** write the event to an outbox table in the *same* transaction as the business data, then relay it. The canonical fix
- Change Data Capture: reading the WAL/oplog to produce a stream. Debezium
- **"Exactly-once delivery" does not exist.** What exists is at-least-once delivery + idempotent processing = effectively-once. Internalize this; it's a frequent interview differentiator
- Idempotency key design: key scope, request fingerprinting, storing the response, dedup window sizing, concurrent-request handling

### ▶ Project 3 — `minikv`
**A distributed key-value store in TypeScript. This is the single highest-signal project in the curriculum.**

- N nodes communicating over TCP (or gRPC). Start with 5
- Consistent hashing with virtual nodes for key placement
- Replication factor 3, **tunable quorum** — configurable W and R per request
- Conflict handling: vector clocks (return siblings on conflict) or HLC-based LWW. Implement one properly, document why you chose it
- Read repair on divergent reads
- Hinted handoff: when a replica is down, a neighbor holds the write and delivers it on recovery
- Gossip-based membership + failure detection
- A CLI client and an HTTP API
- **A chaos script:** kills random nodes, partitions the network with `iptables`/Toxiproxy, and verifies your stated guarantees hold
- README: state precisely which consistency guarantees you provide under which W/R settings, and include the test scenarios that demonstrate each

Do not skip this because it's hard. It's hard because it's where the learning is. Budget the full week plus overflow.

**Phase gate:** Given any system, you can state its consistency model, name its failure modes, and explain what happens during a network partition. You can explain why exactly-once delivery is impossible without hedging.

**Reading:** DDIA Ch. 5, 6, 7, 8, 9 — the core of the book. **Papers:** Amazon Dynamo (2007), Raft (2014). Read these two properly, with notes.

---

# PHASE 4 — Async, Queues, and Event-Driven Systems
### Weeks 13–15

**Why this phase exists:** Every system above trivial scale has an async spine. Queues are also where correctness bugs hide, because failure is normal and retries are constant. Knowing *when not to* introduce a queue is as valuable as knowing how to use one.

---

## Week 13 — Queues

**Concepts**
- The sync/async boundary decision: what must be in the request path (things the user's next action depends on) vs what belongs behind a queue (email, thumbnails, analytics, webhooks, search indexing)
- Delivery semantics: at-most-once, at-least-once, "exactly-once". Visibility timeout, ack/nack, redelivery
- Retries: exponential backoff with **full jitter** (and why unjittered backoff creates synchronized retry waves), retry budgets, max attempts, DLQ
- Poison pills: one bad message blocking a partition or consumer forever. Detection and quarantine
- Priority queues, delayed jobs, scheduled/cron jobs. Distributed cron needs leader election — otherwise N replicas each fire the job
- BullMQ internals: how it uses Redis lists and sorted sets, job lifecycle, stalled job detection, concurrency and rate limiting, flows/dependencies
- **Backpressure:** queue depth is your most important signal. Bounded vs unbounded queues — an unbounded queue converts a throughput problem into an unbounded latency problem, which is worse. When to shed load instead of enqueueing

**Lab**
Build a job processing system with BullMQ: retries with jitter, DLQ, a replay CLI, stalled-job recovery, graceful shutdown that finishes in-flight jobs. Then produce a chart of queue depth vs end-to-end latency as you push producer rate past consumer capacity. Watch it go non-linear. That shape is the intuition you want.

---

## Week 14 — Kafka and log-based thinking

**Concepts**
- **The log as a primitive:** append-only, ordered, replayable, durable. Once you see the log as the primitive, Kafka, WAL, event sourcing, CDC, and replication all become the same idea
- Topics, partitions, offsets. **Ordering is guaranteed only within a partition** — therefore partition key design *is* your ordering design
- Replication: leader/follower per partition, ISR, `acks=0|1|all`, `min.insync.replicas`. The durability/latency/availability triangle
- Consumer groups, partition assignment, rebalancing (eager stop-the-world vs cooperative sticky), rebalance storms, consumer lag as the health metric
- Retention by time/size vs **log compaction** (keep latest value per key, tombstones for deletes) — compaction turns a log into a replayable table
- Idempotent producer, Kafka transactions, and precisely what "exactly-once semantics" means in Kafka (it's exactly-once *processing within Kafka*, not end-to-end to your database)
- **Decision matrix:** BullMQ vs RabbitMQ vs SQS vs Kafka vs NATS. Task queue vs message broker vs event log are three different tools. Kafka is the wrong choice for most task queues, and using it anyway is a common resume-driven mistake

**Lab**
Redpanda in Docker. Producer + consumer in TypeScript. Then: partition your topic 6 ways, run 3 consumers, kill one mid-processing and observe the rebalance and any duplicate processing. Measure consumer lag under a producer burst. Implement a compacted topic and demonstrate replay reconstructing current state.

---

## Week 15 — Event-driven architecture

**Concepts**
- Three things people conflate:
  - **Event notification** — "order created", consumer calls back for details. Low coupling, chatty
  - **Event-carried state transfer** — event contains the data. No callback, but stale data and schema coupling
  - **Event sourcing** — events *are* the source of truth; current state is a fold over the log
- Transactional outbox in practice + Debezium CDC wiring
- **CQRS:** separate write and read models. Projection lag is now a product decision, not an implementation detail. When the complexity is justified (very different read/write shapes or scales) and when it's cargo cult
- Event sourcing properly: append-only store, snapshots for replay performance, **event schema versioning** (the genuinely hard part — upcasting, weak schema), temporal queries, audit for free
- Saga implementation: an orchestrator as a state machine, persisted state, timeouts, compensations that are themselves idempotent and retryable
- Durable execution (Temporal, Restate) as an alternative to hand-rolled sagas — what it actually buys you
- Schema registry, Avro/Protobuf, compatibility modes (backward/forward/full) and why the producer can't just add a required field

### ▶ Project 4 — `orderflow`
**An event-driven commerce backbone. TypeScript monorepo, four services.**

- Services: `order`, `payment`, `inventory`, `notification`
- **Transactional outbox** in Postgres → Debezium → Redpanda. Prove the dual-write problem exists first (write a version that publishes directly, then kill the process between the DB commit and the publish), then fix it with the outbox
- **Orchestrated saga** with compensations. The scenario that matters: payment succeeds, inventory reservation fails → compensating refund must fire, be idempotent, and be retried until it succeeds
- Idempotent consumers with a dedup store (processed message IDs with TTL)
- DLQ + a replay CLI. Poison-pill quarantine
- Distributed tracing across all four services — one trace ID visible from HTTP request through Kafka to the final consumer. Getting trace context to propagate through Kafka headers is the interesting part
- **Chaos:** kill the payment service mid-saga. Kill Redpanda. Kill the outbox relay. In each case, document the recovery path and prove the system converges to a correct state

**Phase gate:** You can explain the dual-write problem and demonstrate both the failure and the fix in your own repository.

**Reading:** DDIA Ch. 11. microservices.io on Saga and Outbox patterns.

---

# PHASE 5 — The Edge, Resilience, and Operations
### Weeks 16–18

**Why this phase exists:** Everything so far assumed things mostly work. This phase is about designing for the fact that they don't, and about the operational surface that decides whether a system survives contact with real traffic. Interviewers probe here to separate people who've shipped from people who've read.

---

## Week 16 — Traffic management

**Concepts**
- L4 vs L7 load balancing: what each can see and therefore what each can decide
- Algorithms: round robin, weighted RR, least connections, **least response time / EWMA** (usually the best default), consistent hashing for sticky routing or cache affinity, power-of-two-choices
- Health checks: active vs passive, liveness vs readiness (different questions — readiness controls traffic, liveness controls restarts), why a health check that hits the database causes correlated cascading failure
- Connection draining, slow start for newly added backends
- Nginx concretely: `upstream` blocks, keepalive to upstream (huge and commonly missed), proxy buffering, the four timeout directives, TLS termination, `limit_req` zones, proxy caching
- API gateway responsibilities (authn, rate limiting, routing, aggregation) vs **service mesh** (sidecar proxies, mTLS, retries/timeouts at the infra layer, traffic splitting). When a mesh is worth its operational cost — usually later than people think
- BFF pattern: one backend per client type, and why it beats a single API serving web + mobile + partner
- CDN: `Cache-Control` semantics (`max-age`, `s-maxage`, `stale-while-revalidate`, `stale-if-error`, `immutable`, `private` vs `public`), cache key composition, `Vary`, origin shield, purge vs versioned URLs, signed URLs for private assets

**Lab**
Nginx in front of 3 replicas of `linkforge`. Test round robin vs least-connections under deliberately skewed load (one replica made slow with Toxiproxy). Kill a replica mid-request — with and without connection draining. Add upstream keepalive and measure the latency change. Document all of it.

---

## Week 17 — Resilience engineering

**Concepts**
- **Timeouts:** every network call needs one. Deadline propagation — if the client's budget is 2s and you've used 1.5s, downstream gets 500ms, not its default. Timeout hierarchy must decrease inward or you get cascading timeouts
- **Retries are dangerous.** A struggling service retried by every caller receives a multiple of its normal load precisely when it can least handle it. Retry budgets (cap retries at ~10% of requests), exponential backoff with full jitter, retry only idempotent operations, never retry at multiple layers simultaneously
- **Circuit breaker:** closed → open → half-open. Threshold tuning (error rate over a window, minimum request volume). What the fallback returns matters as much as the breaker
- **Bulkheads:** separate connection pools/thread pools per dependency so one slow downstream can't consume all your capacity
- **Load shedding and admission control:** when overloaded, rejecting 20% fast is better than serving 100% slowly. Priority-aware shedding (drop analytics before checkout). Brownout / graceful degradation
- Backpressure end to end: rejecting at the edge is cheaper than queueing internally
- Graceful shutdown in Node with Kubernetes semantics: SIGTERM → fail readiness probe → wait for LB to notice → drain in-flight → close pools → exit. The `preStop` sleep and why you need it
- **Queueing theory intuition:** the utilization/latency curve. At 50% utilization latency is fine; at 90% it's roughly 10× worse; past ~80% you're on a cliff. This is why "our CPU is only at 70%" is not reassuring

**Lab**
Using Toxiproxy against `orderflow`: inject 500ms latency, 30% packet loss, and full downstream failure. Measure system behavior before and after adding timeouts, circuit breakers, and bulkheads. Produce a **failure matrix**: for each dependency failing, what the user sees, what the system does, and how long recovery takes.

---

## Week 18 — Capacity, deployment, multi-region

**Concepts**
- Capacity planning from first principles: measure single-instance capacity → derive instance count for peak with headroom → validate with load test. Headroom for failover (if you run 3 AZs, each must handle 50% traffic)
- Load test types and what each answers: smoke, load, stress (find the breaking point), soak (find leaks), spike (test autoscaling)
- Autoscaling: **CPU is usually the wrong signal** for I/O-bound Node services. Better: RPS per pod, in-flight concurrency, queue depth (KEDA). Scale-up vs scale-down asymmetry, cooldowns, and why autoscaling can't save you from a cold cache
- Deployment strategies: rolling, blue-green, **canary with automated rollback on SLO burn**, feature flags, dark launch / shadow traffic (mirror production traffic to the new version, compare, don't serve)
- Zero-downtime schema migration executed for real under live traffic (expand-contract from Week 6)
- Multi-region: active-passive (simple, RPO/RTO tradeoff) vs active-active (hard: conflict resolution, split brain, data residency). Latency-based/geo DNS, anycast, cross-region replication lag, egress cost as a real architectural constraint
- SLI / SLO / error budget: choose SLIs the user feels (availability, latency at p99, correctness), set SLOs below 100% deliberately, **alert on error budget burn rate, not on raw thresholds**. Multi-window multi-burn-rate alerting
- Alert on symptoms, not causes. Every alert links to a runbook or it shouldn't page

### ▶ Project 5 — `linkforge-prod`
**Take Project 1 to production shape. This is the repo you show people.**

- Fully containerized: 3 app replicas behind Nginx, Postgres primary + replica, Redis, all in Compose (Kubernetes if you want the extra credit)
- Complete observability stack: Prometheus + Grafana + Loki + Tempo. Four dashboards: service overview (RED), database, cache, and business metrics
- Defined SLIs and SLOs with an error budget, and burn-rate alert rules that would actually page correctly
- Resilience: timeouts, circuit breakers, bulkheads, load shedding, graceful shutdown
- Chaos test suite driven by Toxiproxy + container kills, with the documented failure matrix
- Blue-green deploy script
- **The headline deliverable: execute an expand-contract migration (add a column, backfill 10M rows, switch reads, drop the old column) while k6 drives sustained live traffic, with zero errors and no p99 regression. Record the Grafana dashboard during it.** If you can show that, you can hold your own in a senior conversation

**Phase gate:** You have written an incident-report-style postmortem for a failure you caused in your own system — timeline, impact, root cause, contributing factors, remediation.

**Reading:** Google SRE Book — Monitoring, Alerting, Being On-Call, Error Budgets (free at sre.google).

---

# PHASE 6 — Specialized Systems
### Weeks 19–22

**Why this phase exists:** Real-time, search, and geospatial are where system design interviews get hard and where most candidates are weakest. They're also the areas where feature complexity per architecture decision is highest. Given your GIS/remote-sensing interest, Week 21 is unusually high leverage for you specifically.

---

## Week 19 — Real-time systems

**Concepts**
- Transport decision matrix: short polling, long polling, SSE (server→client only, HTTP, auto-reconnect, works through every proxy), WebSocket (bidirectional, stateful, proxy headaches), WebRTC (P2P media), HTTP/2 streams. Most "we need WebSockets" cases are actually SSE cases
- WebSocket at scale: per-connection memory cost (measure it), file descriptor limits, `ulimit`, ephemeral port limits on the LB side
- Auth on upgrade (you can't set headers from browser WS — ticket/token patterns)
- Heartbeat ping/pong, half-open connection detection, reconnect with exponential backoff, **resume with a backlog** (client sends last-seen sequence number, server replays the gap)
- Horizontal scaling: sticky sessions vs stateless connection nodes + a pub/sub fanout tier. Redis Pub/Sub is **at-most-once and fire-and-forget** — messages published while a node is disconnected are gone. Know when that's acceptable and when you need Redis Streams or Kafka instead
- Presence: heartbeat + TTL keys, ghost sessions, flapping, presence for large channels
- **Fan-out on write** (precompute each follower's timeline; fast reads, expensive writes, terrible for celebrities) vs **fan-out on read** (compute at read time; cheap writes, slow reads) vs the **hybrid** every real system uses (push for normal users, pull for high-follower accounts, merged at read)
- Messaging delivery guarantees: per-user inbox, monotonic sequence numbers per conversation, client ack + server resend, ordering under concurrent senders, offline sync

**Lab**
Open 10,000 concurrent WebSocket connections against a single Node process. Measure memory and CPU per connection. Find where it breaks. Then scale to 3 nodes with a Redis pub/sub fanout and verify cross-node message delivery. Then kill a node and observe what messages are lost — and design the fix.

---

## Week 20 — Search and feeds

**Concepts**
- **Inverted index from first principles:** tokenization, normalization (lowercase, stemming, stop words), the postings list, skip pointers, positional indexes for phrase queries, index compression
- Scoring: TF-IDF intuition → BM25 (term saturation and document length normalization — understand *why* those two corrections exist)
- Elasticsearch/OpenSearch: shards and replicas, the refresh interval and "near-real-time", the translog, bulk indexing throughput, **zero-downtime reindex using aliases**, mapping explosions, deep pagination limits (`search_after`)
- Autocomplete: trie vs edge n-grams vs completion suggester, ranking by popularity + personalization, typo tolerance (Levenshtein automata, n-gram similarity)
- Vector search: embeddings, the curse of dimensionality, ANN algorithms — **HNSW** (navigable small world graph, `M` and `efConstruction`/`efSearch` parameters), IVF, product quantization. The recall/latency/memory triangle. pgvector vs Qdrant/Milvus: when the dedicated store earns its operational cost
- **Hybrid retrieval:** BM25 + vector, fused with Reciprocal Rank Fusion. Why it beats either alone (lexical catches exact identifiers and rare terms; vector catches paraphrase)
- Cross-encoder reranking on the top-K
- Feed ranking pipeline: candidate generation (multiple sources) → filtering (blocked, seen, eligibility) → scoring (ML model) → diversity/business rules → serving. Feature freshness requirements per stage

**Lab**
Implement an inverted index with BM25 scoring in TypeScript over a 50k-document corpus. No libraries for the index itself. Then index the same corpus in Elasticsearch. Compare result quality and latency. You will understand Elasticsearch permanently after doing this.

---

## Week 21 — Geospatial and media

**Concepts**
- Why B-trees fail for 2D: you can't order 2D points on one axis without losing locality
- **Spatial indexing:** geohash (Z-order curve, prefix = proximity, the boundary problem), quadtree (adaptive to density), **S2 cells** (Hilbert curve on a sphere — Google's approach), **H3** (hexagonal, uniform neighbor distance — Uber's approach). Know the tradeoffs of each
- PostGIS: geometry vs geography types, SRID/projections, GiST indexes, `ST_DWithin` vs `ST_Distance` (only the first uses the index — a classic production bug), `KNN` operator (`<->`)
- Redis GEO (built on sorted sets + geohash) — when its simplicity beats PostGIS
- Proximity search patterns: fixed-radius, k-nearest, ride-matching (supply/demand grid), geofencing at scale
- High-frequency location ingestion: 100k drivers × 1 update/4s. Why you don't write every ping to Postgres. Write path design: in-memory grid + periodic durable snapshot + a stream for history
- Map tiles: raster vs vector tiles, tile pyramids, tile caching and CDN, on-the-fly vs pregenerated
- **Media pipeline:** object storage semantics (S3 consistency model, multipart upload), presigned URLs for direct-to-storage upload (never proxy large uploads through your API), resumable/chunked uploads, checksum verification, virus scanning as an async step
- Transcoding: queue + worker fleet, ladder generation, HLS/DASH manifests, adaptive bitrate, thumbnail/sprite generation, CDN signed URLs with expiry, storage lifecycle tiering for cost

**Lab**
Build a proximity API two ways over the same 1M-point dataset: PostGIS with a GiST index, and Redis GEO. Benchmark k-nearest and radius queries in both at several radii. Write up which you'd choose for a real-time ride-matching system vs an analytics query, and why.

---

## Week 22 — ▶ Project 6 — pick ONE, go deep

Two weeks of effort compressed into one calendar week plus overflow. Choose based on what you want to be known for.

**Option A — `pulse` (recommended for you, given GIS interest)**
Real-time fleet/asset tracking. 10,000 concurrent WebSocket connections across 3 nodes, high-frequency location ingest, spatial indexing with H3 or PostGIS, geofence entry/exit events, presence, historical replay of any asset's path, live map client. Handle the write-amplification problem properly.

**Option B — `chatline`**
WhatsApp-style messaging. Per-user inbox model, sequence-number ordering, delivery and read receipts, offline sync with catch-up, group fan-out, media attachments via presigned URLs, push notification fallback when the socket is closed.

**Option C — `findit`**
Hybrid search engine. Your own inverted index + BM25, pgvector for semantic, RRF fusion, cross-encoder reranking, faceting, typeahead, zero-downtime reindex via aliases, relevance evaluation harness measuring recall@5 and recall@10 per retrieval mode.

**Non-negotiable for any option:** design doc, SLOs, k6 load test with results, chaos test, distributed tracing, architecture diagram.

---

# PHASE 7 — Security, Cost, and AI-Native Infrastructure
### Weeks 23–24

---

## Week 23 — Security and multi-tenancy as architecture

**Concepts**
- **AuthN:** OAuth 2.0 authorization code + PKCE (and why implicit flow is dead), OIDC vs OAuth (identity vs authorization — commonly confused), refresh token rotation with reuse detection
- **JWT vs server-side sessions — the real trade:** JWTs are stateless and therefore *not revocable* before expiry. Every "solution" (short expiry + refresh, denylist, token versioning) reintroduces the state you were avoiding. Know when the trade is worth it and be ready to defend either side
- **AuthZ:** RBAC → ABAC → **ReBAC (Google Zanzibar model)** — relationship tuples, why "can user X view doc Y" becomes a graph problem at scale, check latency and caching of authorization decisions. Policy engines: OPA, Cedar
- Service-to-service: mTLS, workload identity, short-lived credentials, why long-lived API keys between internal services are a liability
- Data protection: encryption in transit and at rest, **envelope encryption** with a KMS, key rotation without re-encrypting everything, field-level encryption, PII tokenization, secrets management (never in env vars committed anywhere)
- Multi-tenancy isolation: silo / bridge / pool models, Postgres Row Level Security implementation and its footguns, per-tenant rate limits to prevent noisy neighbors, per-tenant encryption keys
- Abuse and availability: DDoS at L3/4 vs L7, WAF, bot detection, tiered quotas, cost-based rate limiting (expensive endpoints get lower limits)
- **GDPR/DPDP deletion is an architecture problem:** deleting a user means deleting from primary DB, replicas, caches, search index, event log, analytics warehouse, logs, and backups. Design for it upfront (crypto-shredding: delete the per-user key instead of the data) or it becomes impossible later
- Audit logging: what to log, immutability, retention, and keeping it out of the hot path

---

## Week 24 — AI-native backend and cost engineering

**Concepts**
- What a backend engineer must know about LLM serving: TTFT vs inter-token latency, token streaming over SSE, KV cache and its memory cost, continuous batching (vLLM/PagedAttention) vs static batching, quantization tradeoffs, why GPU utilization economics drive the whole architecture
- **LLM gateway pattern:** single ingress for all model calls — multi-provider routing and fallback, per-tenant quotas and budget caps, retry/timeout policy, **semantic caching** (embed the query, serve cached response on high similarity), prompt prefix caching, per-request cost attribution, prompt/response logging with PII scrubbing
- **RAG architecture end to end:** ingest → chunk (fixed / recursive / semantic — and the chunk-size vs context-precision trade) → embed → index → hybrid retrieve → rerank → generate → stream. Document update and deletion handling (the part everyone skips). Evaluation: recall@k, groundedness, answer relevance
- Agentic systems as distributed systems: tool calls are network calls (timeouts, retries, idempotency), long-running agents need durable execution, sandboxing untrusted code execution, guardrails and prompt injection as a security boundary, cost ceilings per run
- **Cost engineering:** unit economics per request (compute + storage + egress + third-party), storage lifecycle tiering, egress as often the dominant cloud cost, right-sizing, cache as a cost lever not just a latency lever, observability cardinality cost (a high-cardinality label can cost more than the service)

### ▶ Project 7 — `askdocs`
**A production RAG service, since AI/agentic systems is one of your stated interests.**

- TypeScript ingestion pipeline: PDF/HTML → chunking (implement two strategies, compare) → embeddings → pgvector (or Qdrant)
- Hybrid retrieval (BM25 + vector) with RRF, cross-encoder reranking
- Streaming responses over SSE
- LLM gateway: provider fallback, semantic cache, per-tenant rate limits (reuse `gatekeeper`), cost tracking per request per tenant
- Full OpenTelemetry instrumentation with per-stage latency breakdown. Target p99 < 2s end to end and show where the time actually goes
- An eval harness: a labelled question set, measured recall@5/@10 for vector-only, BM25-only, and hybrid. Report the numbers

---

# PHASE 8 — Design Mastery and Interview Conversion
### Weeks 25–28

**Why this phase exists:** Knowledge doesn't transmit itself. A 45-minute design conversation is a communication exercise with a structure, and the structure is learnable and worth deliberate practice — separately from the engineering.

---

## Week 25 — The framework

**The 45-minute structure (time-boxed, practice with a timer):**

| Time | Phase | What you actually do |
|---|---|---|
| 0–5 min | Requirements | Functional (what it does), non-functional (scale, latency SLO, consistency needs, availability target). **Explicitly state what's out of scope.** Write them down visibly |
| 5–8 min | Estimation | DAU → QPS (peak = ~2–3× average) → storage/day → storage/5yr → bandwidth → rough server/cache count. State every assumption out loud |
| 8–13 min | API + data model | Core endpoints with signatures. Entities, relationships, key access patterns. **Choose your datastore here and justify it** |
| 13–25 min | High-level design | Boxes and arrows, but narrate the request path end to end. Client → CDN → LB → service → cache → DB → queue → workers |
| 25–38 min | Deep dive | Interviewer picks, or you offer the most interesting bottleneck. This is where the interview is won. Go to actual mechanism: index choice, partition key, cache invalidation strategy, consistency handling |
| 38–43 min | Bottlenecks + failure modes | What breaks first at 10×? What happens when each component fails? What's your degraded mode? |
| 43–45 min | Trade-offs + wrap | Explicitly name what you'd do differently with more time or different constraints |

**How to articulate a trade-off (practice this phrasing until it's automatic):**
> "Option A gives us X at the cost of Y. Given the requirement of Z, I'd choose A — but if the requirement changed to W, B would be better because…"

**Signals of seniority** — say these when they're true:
- "We don't need that yet." (Rejecting Kafka/microservices/multi-region for a system that doesn't need them is a *strong* signal, not a weak one)
- Naming a specific failure mode unprompted
- Giving a number with an assumption attached
- "That's a consistency-vs-latency trade; here's which side I'd take and why"
- Correcting yourself mid-design when you spot a flaw

**Failure modes to eliminate in yourself:**
- Jumping to architecture before requirements
- Designing for 100M users when they said 10k
- Boxes with no explanation of what's inside them
- Never mentioning failure, and never mentioning numbers
- Defensiveness when challenged (the challenge is usually the interviewer testing whether you *can* change your mind)

**Also:** learn to write a real design doc — problem statement, goals, non-goals, proposed approach, alternatives considered and rejected (with reasons), risks, rollout plan, open questions. 500–1500 words. This is the actual artifact of the job.

---

## Weeks 26–27 — The problem set

**Three timed 45-minute designs per week, written up afterward. Record yourself for at least three of them.**

**Tier 1 — mechanics (do these first, they should feel easy now)**
- URL shortener · Distributed rate limiter · Pastebin · Notification service · Distributed cache · Leaderboard / ranking system

**Tier 2 — the standard set**
- Twitter/X timeline (fan-out) · Instagram · WhatsApp · Dropbox/Google Drive · Web crawler (1B URLs) · Flash sale / ticket booking (inventory contention) · Distributed job scheduler · Yelp/proximity service · Typeahead suggestion

**Tier 3 — hard**
- Uber (matching + geo + real-time) · Google Docs (CRDT/OT) · YouTube (upload → transcode → CDN) · S3 / object storage · Stripe (idempotency + saga + ledger) · Ad click aggregation (streaming, exactly-once counting) · Google Maps (routing, tiles) · LLM serving platform · Distributed transaction coordinator

For each: what is this problem *really* testing? (Twitter → fan-out strategy. Flash sale → contention and inventory correctness. Ad click aggregation → streaming aggregation and dedup. Uber → spatial indexing plus matching under latency constraints.) Knowing the hidden question is most of the answer.

---

## Week 28 — Capstone and portfolio

- Write full design docs for three systems you designed, publish them
- Five mock interviews: peers, Pramp, or an AI playing a skeptical interviewer instructed to interrupt and push back
- **Portfolio pass** — your seven repos need README-first presentation:
  - Problem statement and requirements
  - Architecture diagram
  - Key design decisions with trade-offs and *rejected alternatives*
  - Benchmark numbers
  - Failure matrix
  - "What I'd do differently at 100× scale"

The README is the deliverable. Most people's projects lose all their signal because the reader can't tell that `minikv` implements tunable quorums with hinted handoff.

---

# 9. Parallel tracks (run these throughout)

## 9.1 Reading schedule — DDIA mapped to weeks

Designing Data-Intensive Applications is the single best book here. Don't read it linearly at the start; read each chapter the week you need it.

| Weeks | DDIA chapters |
|---|---|
| 1–2 | Ch. 1 (Reliability, Scalability, Maintainability) |
| 3–4 | Ch. 3 (Storage and Retrieval) |
| 5–6 | Ch. 2 (Data Models), Ch. 4 (Encoding and Evolution) |
| 9–10 | Ch. 5 (Replication), Ch. 8 (Trouble with Distributed Systems) |
| 11 | Ch. 6 (Partitioning) |
| 12 | Ch. 7 (Transactions), Ch. 9 (Consistency and Consensus) |
| 13–15 | Ch. 11 (Stream Processing) |
| 20 | Ch. 10 (Batch Processing) |

## 9.2 Papers — one every two weeks from Week 9

Read with notes. Don't skip the evaluation sections.

1. **Dynamo** (Amazon, 2007) — consistent hashing, quorums, vector clocks, hinted handoff. Read before Project 3
2. **Raft** (2014) — the most readable consensus paper ever written
3. **Google File System** (2003) — foundational for every distributed storage design
4. **MapReduce** (2004) — short, historically essential
5. **Bigtable** (2006) — wide-column model
6. **Kafka** (2011) — the log as infrastructure
7. **Spanner** (2012) — TrueTime and externally consistent distributed transactions
8. **Zanzibar** (2019) — authorization at Google scale
9. **Chubby** (2006) — lock service, and the best paper on the human side of distributed systems

## 9.3 Engineering blogs — one post per week

Discord (WebSocket scaling, Elixir/Rust migrations), Figma (multiplayer), Stripe (idempotency, API design), Cloudflare (edge, DDoS), Uber (geo, dispatch), Netflix (chaos, resilience), Dropbox (storage migration), Slack (real-time), Shopify (flash sales — directly relevant), Canva, Notion (block data model), Airbnb (service migration).

Read for the *decision*, not the technology. Extract: what constraint forced this? What did they reject? What did it cost?

## 9.4 Design drills

One 45-minute timed design every week from Week 5, not just in Phase 8. Written, timed, reviewed. 20+ reps by Week 28 makes Phase 8 a polish exercise rather than a cram.

---

# 10. How to use AI (ChatGPT/Claude) well for this

You're already studying with ChatGPT, so this matters. AI is excellent at some roles here and actively harmful in others.

**Good uses**
- **Socratic partner:** "I think X. Attack it." Ask it to argue the opposite position
- **Adversarial reviewer:** paste your design and say *"You are a staff engineer who thinks this design is wrong. Find the three worst problems."*
- **Mock interviewer:** instruct it to interrupt, push back on vague answers, and refuse to accept "we'd use a cache" without asking which cache, what TTL, what invalidation
- **Explaining a paper section you're stuck on**
- **Generating realistic test data and load test scripts** (boring work, low risk)
- **Rubber duck for debugging** your own implementation

**Bad uses**
- Learning a concept for the first time from a chat response. Use the primary source (DDIA, Postgres docs, the paper). AI summaries feel like understanding but leave no structure behind
- Having it write your project code. The entire point of Project 3 is the struggle
- Trusting numbers, benchmarks, or config recommendations without verifying. It will confidently produce plausible-but-wrong constants
- Accepting an architecture it proposes. It defaults to over-engineered, everything-included designs — which is exactly the failure mode you're training out of yourself

**A prompt worth reusing:**
> I'm designing [system]. Here are my requirements: [...]. Here's my design: [...]. Act as a skeptical staff engineer. Don't validate me. Find the failure modes I haven't handled, the components I've added without justification, and the scale at which this breaks. For each issue, ask me a question rather than giving me the answer.

---

# 11. Rules that make this work

1. **Every project ships with numbers.** p50/p95/p99 at multiple concurrency levels, and a documented bottleneck-and-fix log. A project without measurements taught you syntax, not systems.
2. **Write everything down in your own words.** If you can't explain it in a paragraph without looking, you don't know it. The `sysdesign-notes` repo is the actual output of this program.
3. **Break your own systems on purpose.** Kill nodes, add latency, fill disks, partition networks. You learn more from ten minutes of chaos testing than an hour of reading.
4. **Justify every component.** If you can't say why a component exists and what breaks without it, remove it. Deleting a service from your design is a skill.
5. **Don't collect roadmaps.** You have one now. Following one mediocre plan completely beats sampling five good ones.
6. **Videos are dessert, not dinner.** Watching system design content is passive pattern-matching that feels like progress. Cap it at 20% of your study time.
7. **Design for the scale in the requirements.** The most common mistake by people who've studied a lot of system design is designing Netflix when asked for a school portal. Sizing correctly is senior judgment.
8. **Ship publicly.** Push every repo. Write up the interesting ones. The writing forces clarity, and it compounds for your career.

---

# 12. Compressed 10-week variant

If placements are close, run this instead and return to the full curriculum after. Same rules, fewer topics, projects 1 and 2 only.

| Week | Content |
|---|---|
| 1 | Phase 0 (both weeks compressed) — networking, Node runtime, benchmarking harness |
| 2 | Weeks 3–4 — Postgres internals, indexing, pooling, pagination |
| 3 | Weeks 5–6 — Mongo, data model selection, migrations. **Start Project 1** |
| 4 | Weeks 7–8 — caching, Redis, stampede, rate limiting. **Finish Project 1, build Project 2** |
| 5 | Weeks 9–10 — failure, time, CAP/PACELC, replication, consistency models |
| 6 | Weeks 11–12 — partitioning, consistent hashing, Raft, sagas, outbox, idempotency |
| 7 | Weeks 13–14 — queues, Kafka, delivery semantics |
| 8 | Weeks 16–17 — load balancing, CDN, timeouts/retries/circuit breakers, observability |
| 9 | Week 19 + Week 25 — real-time and fan-out, then the interview framework |
| 10 | Weeks 26–27 compressed — 8 timed designs, 4 mocks, portfolio README pass |

Non-negotiable even in compressed mode: Project 1 and Project 2 shipped with measurements, the consistent hashing lab, and 12+ timed design reps.

---

# 13. Progress tracker

| Phase | Weeks | Project | Gate | Done |
|---|---|---|---|---|
| 0 · Ground Truth | 1–2 | `perf-lab` | Latency curve + Little's Law verified | ☐ |
| 1 · Data | 3–6 | `linkforge` | Every index justified by an EXPLAIN | ☐ |
| 2 · Caching | 7–8 | `gatekeeper` | Sliding-window limiter in Lua from memory | ☐ |
| 3 · Distributed | 9–12 | `minikv` | Stated consistency guarantees, proven by tests | ☐ |
| 4 · Async | 13–15 | `orderflow` | Dual-write failure demonstrated and fixed | ☐ |
| 5 · Ops | 16–18 | `linkforge-prod` | Live expand-contract migration, zero errors | ☐ |
| 6 · Specialized | 19–22 | `pulse` / `chatline` / `findit` | 10k connections or your own BM25 index | ☐ |
| 7 · Security + AI | 23–24 | `askdocs` | p99 < 2s with per-stage breakdown | ☐ |
| 8 · Mastery | 25–28 | Design docs + mocks | 6 recorded 45-min designs reviewed | ☐ |

---

*Seven repositories. Roughly 350 hours. If you finish this, you will not be preparing for system design interviews — you will be someone who has built the things the interview is about.*
