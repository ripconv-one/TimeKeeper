"use client";

import {
  useEffect,
  useRef,
  useState,
} from "react";

import StockChart, {
  type ChartBar,
} from "@/components/StockChart";

import type {
  UTCTimestamp,
} from "lightweight-charts";

// ==================================================
// Types
// ==================================================

type AssetType =
  | "stock"
  | "crypto";

type Asset = {
  symbol: string;
  name: string;
  type: AssetType;
};

type Status =
  | "connecting"
  | "live"
  | "offline";

type LastEvent =
  | "TRADE"
  | "QUOTE"
  | "BAR"
  | "-";

type Market = {
  last: number;

  bid: number;
  ask: number;

  bidSize: number;
  askSize: number;

  lastSize: number;

  exchange: string;

  tradeTimestamp: number;
  quoteTimestamp: number;

  latency: number;

  tradeCount: number;
  quoteCount: number;

  lastEvent: LastEvent;
};

// ==================================================
// Constants
// ==================================================

const DEFAULT_ASSET: Asset = {
  symbol: "BTC/USD",
  name: "Bitcoin",
  type: "crypto",
};

const initialMarket: Market = {
  last: 0,

  bid: 0,
  ask: 0,

  bidSize: 0,
  askSize: 0,

  lastSize: 0,

  exchange: "-",

  tradeTimestamp: 0,
  quoteTimestamp: 0,

  latency: 0,

  tradeCount: 0,
  quoteCount: 0,

  lastEvent: "-",
};

// ==================================================
// Helpers
// ==================================================

function minuteTimestamp(
  timestamp: number
): UTCTimestamp {
  return (
    Math.floor(
      timestamp / 60000
    ) * 60
  ) as UTCTimestamp;
}

function formatTimestamp(
  timestamp: number
) {
  if (!timestamp) {
    return "-";
  }

  return new Date(
    timestamp
  ).toLocaleTimeString(
    undefined,
    {
      hour12: false,

      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",

      fractionalSecondDigits: 3,
    }
  );
}

// ==================================================
// Page
// ==================================================

export default function Home() {
  const [
    status,
    setStatus,
  ] =
    useState<Status>(
      "connecting"
    );

  const [
    assets,
    setAssets,
  ] =
    useState<Asset[]>([]);

  const [
    selected,
    setSelected,
  ] =
    useState<Asset>(
      DEFAULT_ASSET
    );

  const [
    market,
    setMarket,
  ] =
    useState<Market>(
      initialMarket
    );

  const [
    bars,
    setBars,
  ] =
    useState<ChartBar[]>([]);

  const [
    liveBar,
    setLiveBar,
  ] =
    useState<ChartBar | null>(
      null
    );

  // ==================================================
  // Refs
  // ==================================================

  const socketRef =
    useRef<WebSocket | null>(
      null
    );

  const reconnectRef =
    useRef<
      ReturnType<typeof setTimeout> | null
    >(null);

  const selectedSymbolRef =
    useRef(
      DEFAULT_ASSET.symbol
    );

  /*
   * This ref is important.
   *
   * We use it to build the current candle without
   * waiting for React state to finish rendering.
   */

  const liveBarRef =
    useRef<ChartBar | null>(
      null
    );

  // ==================================================
  // Reset
  // ==================================================

  function resetMarket() {
    setMarket({
      ...initialMarket,
    });

    setBars([]);

    setLiveBar(null);

    liveBarRef.current =
      null;
  }

  // ==================================================
  // Browser WebSocket
  // ==================================================

  useEffect(() => {
    let destroyed = false;

    const connect = () => {
      if (destroyed) {
        return;
      }

      const existing =
        socketRef.current;

      if (
        existing &&
        (
          existing.readyState ===
            WebSocket.OPEN ||
          existing.readyState ===
            WebSocket.CONNECTING
        )
      ) {
        return;
      }

      setStatus(
        "connecting"
      );

      const socket =
        new WebSocket(
          "ws://localhost:8080"
        );

      socketRef.current =
        socket;

      // ============================================
      // Open
      // ============================================

      socket.onopen = () => {
        if (destroyed) {
          socket.close(
            1000,
            "component cleanup"
          );

          return;
        }

        console.log(
          "TimeKeeper connected"
        );

        setStatus("live");
      };

      // ============================================
      // Message
      // ============================================

      socket.onmessage =
        (event) => {
          if (destroyed) {
            return;
          }

          try {
            const data =
              JSON.parse(
                event.data
              );

            // ======================================
            // Connected
            // ======================================

            if (
              data.type ===
              "connected"
            ) {
              if (
                Array.isArray(
                  data.assets
                )
              ) {
                setAssets(
                  data.assets
                );
              }

              if (data.asset) {
                selectedSymbolRef.current =
                  data.asset.symbol;

                setSelected(
                  data.asset
                );
              }

              return;
            }

            // ======================================
            // Selected
            // ======================================

            if (
              data.type ===
              "selected"
            ) {
              const asset =
                data.asset as Asset;

              selectedSymbolRef.current =
                asset.symbol;

              setSelected(asset);

              resetMarket();

              return;
            }

            // ======================================
            // Ignore stale symbol data
            // ======================================

            if (
              data.asset?.symbol &&
              data.asset.symbol !==
                selectedSymbolRef.current
            ) {
              return;
            }

            // ======================================
            // Historical bars
            // ======================================

            if (
              data.type ===
              "history"
            ) {
              const converted:
                ChartBar[] =
                data.bars.map(
                  (
                    bar: {
                      t: string;
                      o: number;
                      h: number;
                      l: number;
                      c: number;
                      v: number;
                    }
                  ) => ({
                    time:
                      Math.floor(
                        new Date(
                          bar.t
                        ).getTime() /
                          1000
                      ) as UTCTimestamp,

                    open:
                      bar.o,

                    high:
                      bar.h,

                    low:
                      bar.l,

                    close:
                      bar.c,

                    volume:
                      bar.v,
                  })
                );

              setBars(
                converted
              );

              /*
               * Seed the live candle ref using the
               * newest historical candle.
               */

              const lastBar =
                converted[
                  converted.length - 1
                ];

              if (lastBar) {
                liveBarRef.current =
                  lastBar;
              }

              return;
            }

            // ======================================
            // Snapshot
            // ======================================

            if (
              data.type ===
              "snapshot"
            ) {
              const snapshot =
                data.snapshot;

              if (!snapshot) {
                return;
              }

              const trade =
                snapshot.latestTrade;

              const quote =
                snapshot.latestQuote;

              setMarket(
                (current) => ({
                  ...current,

                  last:
                    trade?.p ??
                    current.last,

                  lastSize:
                    trade?.s ??
                    current.lastSize,

                  exchange:
                    trade?.x ??
                    current.exchange,

                  tradeTimestamp:
                    trade?.t
                      ? Date.parse(
                          trade.t
                        )
                      : current.tradeTimestamp,

                  bid:
                    quote?.bp ??
                    current.bid,

                  bidSize:
                    quote?.bs ??
                    current.bidSize,

                  ask:
                    quote?.ap ??
                    current.ask,

                  askSize:
                    quote?.as ??
                    current.askSize,

                  quoteTimestamp:
                    quote?.t
                      ? Date.parse(
                          quote.t
                        )
                      : current.quoteTimestamp,
                })
              );

              return;
            }

            // ======================================
            // LIVE TRADE
            // ======================================

            if (
              data.type ===
              "trade"
            ) {
              const now =
                Date.now();

              const timestamp =
                data.timestamp;

              setMarket(
                (current) => ({
                  ...current,

                  last:
                    data.price,

                  lastSize:
                    data.size,

                  exchange:
                    data.exchange ??
                    current.exchange,

                  tradeTimestamp:
                    timestamp,

                  latency:
                    Math.max(
                      0,
                      now -
                        timestamp
                    ),

                  tradeCount:
                    data.tradeCount ??
                    current.tradeCount +
                      1,

                  quoteCount:
                    data.quoteCount ??
                    current.quoteCount,

                  lastEvent:
                    "TRADE",
                })
              );

              // ====================================
              // BUILD LIVE 1-MINUTE CANDLE
              // ====================================

              const candleTime =
                minuteTimestamp(
                  timestamp
                );

              const current =
                liveBarRef.current;

              let next:
                ChartBar;

              /*
               * New minute.
               */

              if (
                !current ||
                current.time !==
                  candleTime
              ) {
                next = {
                  time:
                    candleTime,

                  open:
                    data.price,

                  high:
                    data.price,

                  low:
                    data.price,

                  close:
                    data.price,

                  volume:
                    Number(
                      data.size
                    ) || 0,
                };
              } else {
                /*
                 * Same minute.
                 *
                 * Update OHLC immediately.
                 */

                next = {
                  ...current,

                  high:
                    Math.max(
                      current.high,
                      data.price
                    ),

                  low:
                    Math.min(
                      current.low,
                      data.price
                    ),

                  close:
                    data.price,

                  volume:
                    current.volume +
                    (
                      Number(
                        data.size
                      ) || 0
                    ),
                };
              }

              liveBarRef.current =
                next;

              setLiveBar(next);

              return;
            }

            // ======================================
            // LIVE QUOTE
            // ======================================

            if (
              data.type ===
              "quote"
            ) {
              const now =
                Date.now();

              setMarket(
                (current) => ({
                  ...current,

                  bid:
                    data.bid,

                  bidSize:
                    data.bidSize,

                  ask:
                    data.ask,

                  askSize:
                    data.askSize,

                  quoteTimestamp:
                    data.timestamp,

                  latency:
                    Math.max(
                      0,
                      now -
                        data.timestamp
                    ),

                  tradeCount:
                    data.tradeCount ??
                    current.tradeCount,

                  quoteCount:
                    data.quoteCount ??
                    current.quoteCount +
                      1,

                  lastEvent:
                    "QUOTE",
                })
              );

              return;
            }

            // ======================================
            // Alpaca official bar
            // ======================================

            if (
              data.type ===
              "bar"
            ) {
              /*
               * We deliberately do NOT use this bar
               * to drive the visible candle anymore.
               *
               * The candle is being built trade by
               * trade above.
               *
               * Keeping this message available is
               * useful later when we want to compare
               * our locally-built candle against
               * Alpaca's official bar.
               */

              return;
            }

            // ======================================
            // Error
            // ======================================

            if (
              data.type ===
              "error"
            ) {
              console.error(
                "TimeKeeper server:",
                data.message
              );
            }
          } catch (error) {
            console.error(
              "Market message error:",
              error
            );
          }
        };

      // ============================================
      // Error
      // ============================================

      socket.onerror = () => {
        if (!destroyed) {
          console.warn(
            "TimeKeeper WebSocket error"
          );
        }
      };

      // ============================================
      // Close
      // ============================================

      socket.onclose =
        () => {
          if (
            socketRef.current ===
            socket
          ) {
            socketRef.current =
              null;
          }

          if (destroyed) {
            return;
          }

          setStatus(
            "offline"
          );

          if (
            reconnectRef.current
          ) {
            clearTimeout(
              reconnectRef.current
            );
          }

          reconnectRef.current =
            setTimeout(
              () => {
                reconnectRef.current =
                  null;

                connect();
              },
              1000
            );
        };
    };

    connect();

    // ==============================================
    // Cleanup
    // ==============================================

    return () => {
      destroyed = true;

      if (
        reconnectRef.current
      ) {
        clearTimeout(
          reconnectRef.current
        );

        reconnectRef.current =
          null;
      }

      const socket =
        socketRef.current;

      socketRef.current =
        null;

      if (!socket) {
        return;
      }

      if (
        socket.readyState ===
        WebSocket.OPEN
      ) {
        socket.close(
          1000,
          "component cleanup"
        );

        return;
      }

      if (
        socket.readyState ===
        WebSocket.CONNECTING
      ) {
        socket.onmessage = null;
        socket.onerror = null;
        socket.onclose = null;

        socket.onopen = () => {
          socket.close(
            1000,
            "component cleanup"
          );
        };
      }
    };
  }, []);

  // ==================================================
  // Select asset
  // ==================================================

  function selectAsset(
    asset: Asset
  ) {
    if (
      asset.symbol ===
      selectedSymbolRef.current
    ) {
      return;
    }

    const socket =
      socketRef.current;

    if (
      !socket ||
      socket.readyState !==
        WebSocket.OPEN
    ) {
      return;
    }

    selectedSymbolRef.current =
      asset.symbol;

    setSelected(asset);

    resetMarket();

    socket.send(
      JSON.stringify({
        type: "select",
        symbol: asset.symbol,
      })
    );
  }

  // ==================================================
  // Derived market values
  // ==================================================

  const midpoint =
    market.bid > 0 &&
    market.ask > 0
      ? (
          market.bid +
          market.ask
        ) / 2
      : 0;

  const spread =
    market.bid > 0 &&
    market.ask > 0
      ? market.ask -
        market.bid
      : 0;

  const totalEvents =
    market.tradeCount +
    market.quoteCount;

  // ==================================================
  // Formatting
  // ==================================================

  function formatPrice(
    value: number
  ) {
    if (!value) {
      return "-";
    }

    return value.toLocaleString(
      undefined,
      {
        minimumFractionDigits:
          2,

        maximumFractionDigits:
          selected.type ===
          "crypto"
            ? 4
            : 2,
      }
    );
  }

  // ==================================================
  // UI
  // ==================================================

  return (
    <main className="min-h-screen bg-zinc-950 text-white">

      {/* ==========================================
          Header
      ========================================== */}

      <header className="border-b border-zinc-800 bg-black">

        <div className="flex h-16 items-center gap-6 px-5">

          <div className="font-semibold tracking-[0.2em]">
            TIMEKEEPER
          </div>

          {/* Selector */}

          <select
            value={
              selected.symbol
            }
            onChange={(
              event
            ) => {
              const asset =
                assets.find(
                  (item) =>
                    item.symbol ===
                    event.target.value
                );

              if (asset) {
                selectAsset(
                  asset
                );
              }
            }}
            className="rounded-md border border-zinc-700 bg-zinc-900 px-4 py-2 font-mono text-sm outline-none"
          >

            {assets.map(
              (asset) => (
                <option
                  key={
                    asset.symbol
                  }
                  value={
                    asset.symbol
                  }
                >
                  {
                    asset.symbol
                  }{" "}
                  —{" "}
                  {
                    asset.name
                  }
                </option>
              )
            )}

          </select>

          {/* Quick symbols */}

          <div className="hidden items-center gap-1 lg:flex">

            {assets.map(
              (asset) => (
                <button
                  key={
                    asset.symbol
                  }
                  type="button"
                  onClick={() =>
                    selectAsset(
                      asset
                    )
                  }
                  className={`rounded px-3 py-1.5 font-mono text-xs ${
                    selected.symbol ===
                    asset.symbol
                      ? "bg-zinc-700 text-white"
                      : "text-zinc-500 hover:bg-zinc-900 hover:text-white"
                  }`}
                >
                  {
                    asset.symbol
                  }
                </button>
              )
            )}

          </div>

          {/* Status */}

          <div className="ml-auto flex items-center gap-3 text-xs">

            <span
              className={`h-2 w-2 rounded-full ${
                status ===
                "live"
                  ? "bg-green-500"
                  : status ===
                      "connecting"
                    ? "bg-yellow-500"
                    : "bg-red-500"
              }`}
            />

            <span className="text-zinc-400">
              {status.toUpperCase()}
            </span>

            <span className="font-mono text-zinc-600">
              {market.latency} ms
            </span>

          </div>

        </div>

      </header>

      {/* ==========================================
          Asset header
      ========================================== */}

      <section className="border-b border-zinc-800 bg-black px-5 py-5">

        <div className="flex items-end justify-between">

          <div>

            <div className="flex items-center gap-3">

              <h1 className="text-2xl font-semibold">
                {
                  selected.symbol
                }
              </h1>

              <span className="text-sm text-zinc-500">
                {
                  selected.name
                }
              </span>

            </div>

            <div className="mt-2 text-xs uppercase tracking-wider text-zinc-600">

              {selected.type ===
              "crypto"
                ? "CRYPTO · 24/7 · ALPACA"
                : "STOCK · ALPACA IEX"}

            </div>

          </div>

          {/* Last trade */}

          <div className="text-right">

            <div className="text-xs text-zinc-600">
              LAST TRADE
            </div>

            <div className="mt-1 font-mono text-3xl font-semibold tabular-nums">

              {market.last
                ? `$${formatPrice(
                    market.last
                  )}`
                : "Loading..."}

            </div>

            <div className="mt-1 font-mono text-xs text-zinc-600">

              {formatTimestamp(
                market.tradeTimestamp
              )}

            </div>

          </div>

        </div>

      </section>

      {/* ==========================================
          Main
      ========================================== */}

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_340px]">

        {/* Chart */}

        <section className="min-w-0 border-r border-zinc-800">

          <div className="flex h-12 items-center gap-5 border-b border-zinc-800 bg-black px-5 text-xs">

            <button className="text-white">
              1m
            </button>

            <button className="text-zinc-600">
              5m
            </button>

            <button className="text-zinc-600">
              15m
            </button>

            <button className="text-zinc-600">
              1h
            </button>

            <button className="text-zinc-600">
              1d
            </button>

            <span className="ml-auto font-mono text-zinc-600">

              {
                bars.length
              }{" "}
              bars

            </span>

          </div>

          <StockChart
            bars={bars}
            liveBar={
              liveBar
            }
          />

        </section>

        {/* ========================================
            Market data panel
        ======================================== */}

        <aside className="bg-black">

          {/* Last */}

          <div className="border-b border-zinc-800 p-5">

            <div className="text-xs text-zinc-600">
              LAST TRADE
            </div>

            <div className="mt-2 font-mono text-3xl tabular-nums">

              {formatPrice(
                market.last
              )}

            </div>

            <div className="mt-2 font-mono text-xs text-zinc-600">

              {formatTimestamp(
                market.tradeTimestamp
              )}

            </div>

          </div>

          {/* Bid / Ask */}

          <div className="grid grid-cols-2 border-b border-zinc-800">

            <div className="border-r border-zinc-800 p-5">

              <div className="text-xs text-zinc-600">
                BID
              </div>

              <div className="mt-2 font-mono text-lg tabular-nums text-green-400">

                {formatPrice(
                  market.bid
                )}

              </div>

              <div className="mt-1 text-xs text-zinc-600">

                SIZE{" "}
                {market.bidSize ||
                  "-"}

              </div>

            </div>

            <div className="p-5">

              <div className="text-xs text-zinc-600">
                ASK
              </div>

              <div className="mt-2 font-mono text-lg tabular-nums text-red-400">

                {formatPrice(
                  market.ask
                )}

              </div>

              <div className="mt-1 text-xs text-zinc-600">

                SIZE{" "}
                {market.askSize ||
                  "-"}

              </div>

            </div>

          </div>

          {/* Midpoint */}

          <div className="border-b border-zinc-800 p-5">

            <div className="text-xs text-zinc-600">
              MIDPOINT
            </div>

            <div className="mt-2 font-mono text-xl tabular-nums">

              {formatPrice(
                midpoint
              )}

            </div>

          </div>

          {/* Stats */}

          <div className="space-y-4 border-b border-zinc-800 p-5 text-sm">

            <div className="flex justify-between">

              <span className="text-zinc-500">
                Spread
              </span>

              <span className="font-mono">

                {spread
                  ? formatPrice(
                      spread
                    )
                  : "-"}

              </span>

            </div>

            <div className="flex justify-between">

              <span className="text-zinc-500">
                Last Size
              </span>

              <span className="font-mono">
                {
                  market.lastSize ||
                  "-"
                }
              </span>

            </div>

            <div className="flex justify-between">

              <span className="text-zinc-500">
                Trade Time
              </span>

              <span className="font-mono text-xs">

                {formatTimestamp(
                  market.tradeTimestamp
                )}

              </span>

            </div>

            <div className="flex justify-between">

              <span className="text-zinc-500">
                Quote Time
              </span>

              <span className="font-mono text-xs">

                {formatTimestamp(
                  market.quoteTimestamp
                )}

              </span>

            </div>

            <div className="flex justify-between">

              <span className="text-zinc-500">
                Last Event
              </span>

              <span className="font-mono">

                {
                  market.lastEvent
                }

              </span>

            </div>

          </div>

          {/* Event counters */}

          <div className="grid grid-cols-3 border-b border-zinc-800">

            <div className="border-r border-zinc-800 p-4">

              <div className="text-xs text-zinc-600">
                TRADES
              </div>

              <div className="mt-1 font-mono">
                {market.tradeCount.toLocaleString()}
              </div>

            </div>

            <div className="border-r border-zinc-800 p-4">

              <div className="text-xs text-zinc-600">
                QUOTES
              </div>

              <div className="mt-1 font-mono">
                {market.quoteCount.toLocaleString()}
              </div>

            </div>

            <div className="p-4">

              <div className="text-xs text-zinc-600">
                EVENTS
              </div>

              <div className="mt-1 font-mono">
                {totalEvents.toLocaleString()}
              </div>

            </div>

          </div>

          {/* Feed */}

          <div className="p-5">

            <div className="text-xs text-zinc-600">
              DATA SOURCE
            </div>

            <div className="mt-3 flex items-center gap-2 text-xs">

              <span
                className={`h-2 w-2 rounded-full ${
                  status ===
                  "live"
                    ? "bg-green-500"
                    : "bg-red-500"
                }`}
              />

              {selected.type ===
              "crypto"
                ? "ALPACA CRYPTO / US"
                : "ALPACA STOCK / IEX"}

            </div>

            <div className="mt-3 font-mono text-xs text-zinc-600">

              LATENCY{" "}
              {market.latency} ms

            </div>

          </div>

        </aside>

      </div>

    </main>
  );
}