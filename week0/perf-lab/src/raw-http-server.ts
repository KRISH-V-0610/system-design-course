// Week 1, Lab 2 — hand-rolled HTTP/1.1 server on top of `net`.
//
// Goal: parse HTTP yourself so "keep-alive" and "Content-Length" stop being
// magic. Do NOT use Node's `http` module here — that defeats the point.
//
// TODO, in order of difficulty:
// 1. Parse the request line: METHOD /path HTTP/1.1
// 2. Parse headers into a Map/object (case-insensitive keys).
// 3. Handle `Content-Length`: read exactly that many body bytes.
// 4. Handle `Transfer-Encoding: chunked`: parse chunk-size lines + data.
// 5. Write a correct status line + headers + body back.
// 6. Implement keep-alive: after responding, don't close the socket if
//    the client sent `Connection: keep-alive` (HTTP/1.1 default) — wait
//    for the next request on the same socket instead.
// 7. Serve "hello world" from the /  route.
//
// Once this responds correctly to `curl -v http://localhost:3000/`,
// benchmark it against the Express server with autocannon (see
// package.json scripts) and compare RPS + latency.

import net from "node:net";

const PORT = 3000;

const server = net.createServer((socket) => {
  // TODO: implement request parsing + response writing + keep-alive
});

server.listen(PORT, () => {
  console.log(`raw http server listening on :${PORT}`);
});
