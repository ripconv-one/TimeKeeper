import { config } from "dotenv";
import { WebSocket, WebSocketServer } from "ws";

config({
  path: ".env.local",
  quiet: true,
});

const API_KEY = process.env.ALPACA_API_KEY;
const SECRET_KEY = process.env.ALPACA_SECRET_KEY;

if (!API_KEY || !SECRET_KEY) {
  console.error("Missing Alpaca credentials in .env.local");
  process.exit(1);
}

const PORT = 8080;

type AssetType = "stock" | "crypto";

type Asset = {
  symbol: string;
  name: string;
  type: AssetType;
};

const ASSETS: Asset[] = [
  {
    symbol: "BTC/USD",
    name: "Bitcoin",
    type: "crypto",
  },
  {
    symbol: "ETH/USD",
    name: "Ethereum",
    type: "crypto",
  },
  {
    symbol: "SOL/USD",
    name: "Solana",
    type: "crypto",
  },
  {
    symbol: "AAPL",
    name: "Apple Inc.",
    type: "stock",
  },
  {
    symbol: "TSLA",
    name: "Tesla Inc.",
    type: "stock",
  },
  {
    symbol: "NVDA",
    name: "NVIDIA Corp.",
    type: "stock",
  },
];

const STOCK_WS =
  "wss://stream.data.alpaca.markets/v2/iex";

const CRYPTO_WS =
  "wss://stream.data.alpaca.markets/v1beta3/crypto/us";

const DATA_URL =
  "https://data.alpaca.markets";

const headers = {
  "APCA-API-KEY-ID": API_KEY,
  "APCA-API-SECRET-KEY": SECRET_KEY,
};

// ==================================================
// State
// ==================================================

let currentAsset: Asset = ASSETS[0];

let alpacaSocket: WebSocket | null = null;

let reconnectTimer:
  | ReturnType<typeof setTimeout>
  | null = null;

let shuttingDown = false;

let sequence = 0;

let tradeCount = 0;
let quoteCount = 0;

// ==================================================
// Local WebSocket server
// ==================================================

const localServer = new WebSocketServer({
  port: PORT,
});

console.log(
  `TimeKeeper running on ws://localhost:${PORT}`
);

// ==================================================
// Broadcast
// ==================================================

function broadcast(data: unknown) {
  const payload = JSON.stringify(data);

  for (const client of localServer.clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  }
}

// ==================================================
// Historical bars
// ==================================================

async function getHistory(asset: Asset) {
  try {
    const end = new Date();

    const hours =
      asset.type === "crypto"
        ? 12
        : 24;

    const start = new Date(
      end.getTime() -
        hours * 60 * 60 * 1000
    );

    // ----------------------------------------------
    // Crypto
    // ----------------------------------------------

    if (asset.type === "crypto") {
      const params = new URLSearchParams({
        symbols: asset.symbol,
        timeframe: "1Min",
        start: start.toISOString(),
        end: end.toISOString(),
        limit: "1000",
        sort: "asc",
      });

      const response = await fetch(
        `${DATA_URL}/v1beta3/crypto/us/bars?${params}`,
        { headers }
      );

      if (!response.ok) {
        console.error(
          "Crypto history failed:",
          response.status,
          await response.text()
        );

        return [];
      }

      const data = await response.json();

      return data.bars?.[asset.symbol] ?? [];
    }

    // ----------------------------------------------
    // Stock
    // ----------------------------------------------

    const params = new URLSearchParams({
      timeframe: "1Min",
      start: start.toISOString(),
      end: end.toISOString(),
      limit: "1000",
      adjustment: "raw",
      feed: "iex",
      sort: "asc",
    });

    const response = await fetch(
      `${DATA_URL}/v2/stocks/${asset.symbol}/bars?${params}`,
      { headers }
    );

    if (!response.ok) {
      console.error(
        "Stock history failed:",
        response.status,
        await response.text()
      );

      return [];
    }

    const data = await response.json();

    return data.bars ?? [];
  } catch (error) {
    console.error(
      "History request failed:",
      error
    );

    return [];
  }
}

// ==================================================
// Snapshot
// ==================================================

async function getSnapshot(asset: Asset) {
  try {
    if (asset.type === "crypto") {
      const params = new URLSearchParams({
        symbols: asset.symbol,
      });

      const response = await fetch(
        `${DATA_URL}/v1beta3/crypto/us/snapshots?${params}`,
        { headers }
      );

      if (!response.ok) {
        console.error(
          "Crypto snapshot failed:",
          response.status,
          await response.text()
        );

        return null;
      }

      const data = await response.json();

      return (
        data.snapshots?.[asset.symbol] ??
        null
      );
    }

    const response = await fetch(
      `${DATA_URL}/v2/stocks/${asset.symbol}/snapshot?feed=iex`,
      { headers }
    );

    if (!response.ok) {
      console.error(
        "Stock snapshot failed:",
        response.status,
        await response.text()
      );

      return null;
    }

    return await response.json();
  } catch (error) {
    console.error(
      "Snapshot request failed:",
      error
    );

    return null;
  }
}

// ==================================================
// Initial browser data
// ==================================================

async function sendInitialData(
  socket: WebSocket,
  asset: Asset
) {
  const history = await getHistory(asset);

  if (
    currentAsset.symbol !== asset.symbol ||
    socket.readyState !== WebSocket.OPEN
  ) {
    return;
  }

  socket.send(
    JSON.stringify({
      type: "history",
      asset,
      bars: history,
    })
  );

  const snapshot = await getSnapshot(asset);

  if (
    currentAsset.symbol !== asset.symbol ||
    socket.readyState !== WebSocket.OPEN
  ) {
    return;
  }

  socket.send(
    JSON.stringify({
      type: "snapshot",
      asset,
      snapshot,
    })
  );
}

// ==================================================
// Browser connections
// ==================================================

let browserId = 0;

localServer.on(
  "connection",
  (socket, request) => {
    const id = ++browserId;

    console.log(
      `[Browser ${id}] CONNECTED from=${request.socket.remoteAddress}`
    );

    socket.send(
      JSON.stringify({
        type: "connected",
        asset: currentAsset,
        assets: ASSETS,
      })
    );

    void sendInitialData(
      socket,
      currentAsset
    );

    // ----------------------------------------------
    // Browser commands
    // ----------------------------------------------

    socket.on("message", (raw) => {
      try {
        const message = JSON.parse(
          raw.toString()
        );

        if (message.type !== "select") {
          return;
        }

        const requested =
          ASSETS.find(
            (asset) =>
              asset.symbol ===
              message.symbol
          );

        if (!requested) {
          socket.send(
            JSON.stringify({
              type: "error",
              message: "Unsupported symbol",
            })
          );

          return;
        }

        if (
          requested.symbol ===
          currentAsset.symbol
        ) {
          return;
        }

        console.log(
          `Switching ${currentAsset.symbol} -> ${requested.symbol}`
        );

        currentAsset = requested;

        sequence = 0;
        tradeCount = 0;
        quoteCount = 0;

        broadcast({
          type: "selected",
          asset: currentAsset,
        });

        reconnectAlpaca();

        for (const client of localServer.clients) {
          if (
            client.readyState ===
            WebSocket.OPEN
          ) {
            void sendInitialData(
              client,
              currentAsset
            );
          }
        }
      } catch (error) {
        console.error(
          "Browser message error:",
          error
        );
      }
    });

    socket.on("close", (code, reason) => {
      console.log(
        `[Browser ${id}] CLOSED code=${code} reason=${
          reason.toString() || "none"
        }`
      );
    });

    socket.on("error", (error) => {
      console.error(
        `[Browser ${id}] ERROR`,
        error.message
      );
    });
  }
);

// ==================================================
// Alpaca reconnect
// ==================================================

function reconnectAlpaca() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  if (alpacaSocket) {
    const oldSocket = alpacaSocket;

    alpacaSocket = null;

    oldSocket.removeAllListeners();

    try {
      oldSocket.close();
    } catch {
      // Ignore.
    }
  }

  connectToAlpaca();
}

// ==================================================
// Alpaca connection
// ==================================================

function connectToAlpaca() {
  if (shuttingDown) {
    return;
  }

  const asset = currentAsset;

  const url =
    asset.type === "crypto"
      ? CRYPTO_WS
      : STOCK_WS;

  console.log(
    `Connecting to Alpaca ${asset.type} stream for ${asset.symbol}...`
  );

  const socket = new WebSocket(url);

  alpacaSocket = socket;

  // ----------------------------------------------
  // Open
  // ----------------------------------------------

  socket.on("open", () => {
    console.log(
      `Connected to Alpaca for ${asset.symbol}`
    );

    socket.send(
      JSON.stringify({
        action: "auth",
        key: API_KEY,
        secret: SECRET_KEY,
      })
    );
  });

  // ----------------------------------------------
  // Messages
  // ----------------------------------------------

  socket.on("message", (raw) => {
    try {
      const messages = JSON.parse(
        raw.toString()
      );

      if (!Array.isArray(messages)) {
        return;
      }

      for (const message of messages) {
        // ==========================================
        // Connection
        // ==========================================

        if (
          message.T === "success" &&
          message.msg === "connected"
        ) {
          console.log(
            "Alpaca connection confirmed"
          );

          continue;
        }

        // ==========================================
        // Authentication
        // ==========================================

        if (
          message.T === "success" &&
          message.msg === "authenticated"
        ) {
          console.log(
            `Authenticated: ${asset.symbol}`
          );

          const subscription:
            Record<string, unknown> = {
            action: "subscribe",
            trades: [asset.symbol],
            quotes: [asset.symbol],
          };

          if (asset.type === "crypto") {
            subscription.bars = [
              asset.symbol,
            ];
          }

          socket.send(
            JSON.stringify(subscription)
          );

          continue;
        }

        // ==========================================
        // Subscription
        // ==========================================

        if (message.T === "subscription") {
          console.log(
            "Alpaca subscription:",
            message
          );

          continue;
        }

        // ==========================================
        // Ignore old connections
        // ==========================================

        if (
          currentAsset.symbol !==
          asset.symbol
        ) {
          continue;
        }

        // ==========================================
        // TRADE
        // ==========================================

        if (
          message.T === "t" &&
          message.S === asset.symbol
        ) {
          sequence++;
          tradeCount++;

          const timestamp =
            Date.parse(message.t);

          broadcast({
            type: "trade",

            asset,

            symbol: message.S,

            price: message.p,

            size: message.s,

            exchange:
              message.x ?? "-",

            tradeId:
              message.i ?? null,

            timestamp,

            sequence,

            tradeCount,

            quoteCount,
          });

          continue;
        }

        // ==========================================
        // QUOTE
        // ==========================================

        if (
          message.T === "q" &&
          message.S === asset.symbol
        ) {
          quoteCount++;

          const timestamp =
            Date.parse(message.t);

          broadcast({
            type: "quote",

            asset,

            symbol: message.S,

            bid: message.bp,

            bidSize: message.bs,

            ask: message.ap,

            askSize: message.as,

            timestamp,

            tradeCount,

            quoteCount,
          });

          continue;
        }

        // ==========================================
        // Official Alpaca crypto bar
        // ==========================================

        if (
          message.T === "b" &&
          message.S === asset.symbol
        ) {
          broadcast({
            type: "bar",

            asset,

            symbol: message.S,

            bar: {
              t: message.t,
              o: message.o,
              h: message.h,
              l: message.l,
              c: message.c,
              v: message.v,
            },
          });

          continue;
        }

        // ==========================================
        // Error
        // ==========================================

        if (message.T === "error") {
          console.error(
            `Alpaca error ${message.code}: ${message.msg}`
          );
        }
      }
    } catch (error) {
      console.error(
        "Alpaca message error:",
        error
      );
    }
  });

  // ----------------------------------------------
  // Error
  // ----------------------------------------------

  socket.on("error", (error) => {
    console.error(
      "Alpaca WebSocket error:",
      error.message
    );
  });

  // ----------------------------------------------
  // Close
  // ----------------------------------------------

  socket.on("close", (code, reason) => {
    if (alpacaSocket === socket) {
      alpacaSocket = null;
    }

    if (
      shuttingDown ||
      currentAsset.symbol !==
        asset.symbol
    ) {
      return;
    }

    console.log(
      `Alpaca closed code=${code} reason=${
        reason.toString() || "none"
      }`
    );

    console.log(
      "Reconnecting in 3 seconds..."
    );

    reconnectTimer = setTimeout(
      () => {
        reconnectTimer = null;
        connectToAlpaca();
      },
      3000
    );
  });
}

// ==================================================
// Start
// ==================================================

connectToAlpaca();

// ==================================================
// Shutdown
// ==================================================

function shutdown() {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;

  console.log(
    "\nShutting down TimeKeeper..."
  );

  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
  }

  alpacaSocket?.close();

  for (const client of localServer.clients) {
    client.close();
  }

  localServer.close(() => {
    process.exit(0);
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);