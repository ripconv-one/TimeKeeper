import { WebSocketServer, WebSocket } from "ws";

const PORT = 8080;

const wss = new WebSocketServer({
  port: PORT,
});

let price = 227.41;
let sequence = 0;

console.log(`Market server running on ws://localhost:${PORT}`);

wss.on("connection", (socket) => {
  console.log("Client connected");

  socket.send(
    JSON.stringify({
      type: "connected",
      symbol: "AAPL",
    })
  );

  socket.on("close", () => {
    console.log("Client disconnected");
  });
});

// Simulate 100 market ticks per second.
setInterval(() => {
  const movement = (Math.random() - 0.5) * 0.04;

  price = Math.max(0, price + movement);
  sequence++;

  const tick = {
    type: "tick",
    symbol: "AAPL",
    price,
    timestamp: Date.now(),
    sequence,
  };

  const message = JSON.stringify(tick);

  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  }
}, 10);