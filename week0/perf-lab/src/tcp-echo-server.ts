// Week 1, Lab 1 — raw TCP echo server using Node's `net` module.
//
// Goal: get comfortable at the socket level before you build the HTTP
// parser on top of it. No frameworks.
//
// TODO:
// 1. Create a `net.Server` with `net.createServer()`.
// 2. On each connection, echo back whatever bytes you receive.
// 3. Log when a connection opens and closes (you'll want this for the
//    Wireshark/tcpdump exercise later).
// 4. Start it on a port (e.g. 4000) and confirm with `nc localhost 4000`.

import net from "node:net";

const PORT = 4000;

const server = net.createServer((socket) => {
  // TODO: implement echo behavior
  // socket.on('data', (chunk) => { ... })
  // socket.on('close', () => { ... })
});

server.listen(PORT, () => {
  console.log(`tcp echo server listening on :${PORT}`);
});
