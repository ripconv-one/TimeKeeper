"use client";

import { useEffect, useRef, useState } from "react";

type ConnectionStatus = "connecting" | "live" | "offline";

export default function Home() {
  const [price, setPrice] = useState(227.41);
  const [previousPrice, setPreviousPrice] = useState(227.41);

  const [status, setStatus] =
    useState<ConnectionStatus>("connecting");

  const [latency, setLatency] = useState(0);
  const [tickCount, setTickCount] = useState(0);

  // Holds the latest incoming market price without
  // forcing React to render on every WebSocket message.
  const priceRef = useRef(227.41);

  useEffect(() => {
    let socket: WebSocket | null = null;

    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    let animationFrame = 0;

    let destroyed = false;

    const connect = () => {
      if (destroyed) {
        return;
      }

      setStatus("connecting");

      socket = new WebSocket("ws://localhost:8080");

      socket.onopen = () => {
        console.log("Connected to market server");

        setStatus("live");
      };

      socket.onmessage = (event) => {
        const data = JSON.parse(event.data);

        if (data.type === "tick") {
          priceRef.current = data.price;

          setLatency(
            Math.max(0, Date.now() - data.timestamp)
          );

          setTickCount(data.sequence);
        }
      };

      socket.onerror = () => {
        console.warn(
          "Market WebSocket connection error"
        );
      };

      socket.onclose = () => {
        if (destroyed) {
          return;
        }

        console.log("Market server disconnected");

        setStatus("offline");

        reconnectTimer = setTimeout(() => {
          connect();
        }, 1000);
      };
    };

    const render = () => {
      setPrice((currentPrice) => {
        const latestPrice = priceRef.current;

        if (latestPrice !== currentPrice) {
          setPreviousPrice(currentPrice);

          return latestPrice;
        }

        return currentPrice;
      });

      animationFrame =
        requestAnimationFrame(render);
    };

    connect();

    animationFrame =
      requestAnimationFrame(render);

    return () => {
      destroyed = true;

      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
      }

      socket?.close();

      cancelAnimationFrame(animationFrame);
    };
  }, []);

  const direction =
    price > previousPrice
      ? "up"
      : price < previousPrice
        ? "down"
        : "flat";

  return (
    <main className="min-h-screen bg-black text-white">
      <div className="mx-auto max-w-5xl px-6 py-16">

        {/* Header */}

        <header className="mb-16 flex items-center justify-between">
          <h1 className="text-xl font-semibold tracking-widest">
            TIMEKEEPER
          </h1>

          <div className="flex items-center gap-3 text-sm">

            <span
              className={`h-2 w-2 rounded-full ${
                status === "live"
                  ? "bg-green-500"
                  : status === "connecting"
                    ? "bg-yellow-500"
                    : "bg-red-500"
              }`}
            />

            <span className="text-zinc-400">
              {status.toUpperCase()}
            </span>

            {status === "live" && (
              <span className="font-mono text-zinc-600">
                {latency} ms
              </span>
            )}

          </div>
        </header>

        {/* Stock */}

        <section>

          <div className="mb-8">
            <div className="text-sm text-zinc-500">
              NASDAQ
            </div>

            <h2 className="mt-2 text-5xl font-semibold tracking-tight">
              AAPL
            </h2>

            <p className="mt-2 text-zinc-400">
              Apple Inc.
            </p>
          </div>

          {/* Price */}

          <div className="flex items-end gap-4">

            <div
              className={`text-7xl font-medium tabular-nums transition-colors ${
                direction === "up"
                  ? "text-green-400"
                  : direction === "down"
                    ? "text-red-400"
                    : "text-white"
              }`}
            >
              ${price.toFixed(4)}
            </div>

            <div className="pb-2 text-2xl">

              {direction === "up" && "▲"}

              {direction === "down" && "▼"}

            </div>

          </div>

          {/* Market information */}

          <div className="mt-12 border-t border-zinc-800 pt-6">

            <div className="grid grid-cols-3 gap-8">

              <div>
                <div className="text-sm text-zinc-500">
                  Last
                </div>

                <div className="mt-1 text-xl tabular-nums">
                  ${price.toFixed(4)}
                </div>
              </div>

              <div>
                <div className="text-sm text-zinc-500">
                  Previous Tick
                </div>

                <div className="mt-1 text-xl tabular-nums">
                  ${previousPrice.toFixed(4)}
                </div>
              </div>

              <div>
                <div className="text-sm text-zinc-500">
                  Feed
                </div>

                <div className="mt-1 text-xl">
                  SIMULATED
                </div>
              </div>

            </div>

          </div>

          {/* Diagnostics */}

          <div className="mt-8 border-t border-zinc-800 pt-6">

            <div className="flex flex-wrap gap-8 font-mono text-sm text-zinc-500">

              <span>
                LATENCY{" "}
                <span className="text-white">
                  {latency} ms
                </span>
              </span>

              <span>
                SEQUENCE{" "}
                <span className="text-white">
                  {tickCount.toLocaleString()}
                </span>
              </span>

            </div>

          </div>

        </section>

      </div>
    </main>
  );
}