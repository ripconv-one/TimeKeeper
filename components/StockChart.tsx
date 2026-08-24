"use client";

import {
  useEffect,
  useRef,
} from "react";

import {
  CandlestickSeries,
  ColorType,
  createChart,
  HistogramSeries,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from "lightweight-charts";

export type ChartBar = {
  time: UTCTimestamp;

  open: number;
  high: number;
  low: number;
  close: number;

  volume: number;
};

type Props = {
  bars: ChartBar[];
  liveBar: ChartBar | null;
};

export default function StockChart({
  bars,
  liveBar,
}: Props) {
  const containerRef =
    useRef<HTMLDivElement | null>(
      null
    );

  const chartRef =
    useRef<IChartApi | null>(
      null
    );

  const candleRef =
    useRef<ISeriesApi<"Candlestick"> | null>(
      null
    );

  const volumeRef =
    useRef<ISeriesApi<"Histogram"> | null>(
      null
    );

  // ==================================================
  // Create chart once
  // ==================================================

  useEffect(() => {
    if (!containerRef.current) {
      return;
    }

    const container =
      containerRef.current;

    const chart = createChart(
      container,
      {
        width:
          container.clientWidth,

        height: 600,

        layout: {
          background: {
            type: ColorType.Solid,
            color: "#09090b",
          },

          textColor:
            "#71717a",
        },

        grid: {
          vertLines: {
            color: "#18181b",
          },

          horzLines: {
            color: "#18181b",
          },
        },

        rightPriceScale: {
          borderColor:
            "#27272a",
        },

        timeScale: {
          borderColor:
            "#27272a",

          timeVisible: true,

          secondsVisible:
            false,

          rightOffset: 5,

          barSpacing: 8,
        },

        crosshair: {
          vertLine: {
            color: "#52525b",
          },

          horzLine: {
            color: "#52525b",
          },
        },
      }
    );

    // ----------------------------------------------
    // Candles
    // ----------------------------------------------

    const candles =
      chart.addSeries(
        CandlestickSeries,
        {
          upColor:
            "#22c55e",

          downColor:
            "#ef4444",

          borderVisible:
            false,

          wickUpColor:
            "#22c55e",

          wickDownColor:
            "#ef4444",

          priceLineVisible:
            true,

          lastValueVisible:
            true,
        }
      );

    // ----------------------------------------------
    // Volume
    // ----------------------------------------------

    const volume =
      chart.addSeries(
        HistogramSeries,
        {
          priceFormat: {
            type: "volume",
          },

          priceScaleId:
            "volume",

          priceLineVisible:
            false,

          lastValueVisible:
            false,
        }
      );

    chart
      .priceScale("volume")
      .applyOptions({
        scaleMargins: {
          top: 0.82,
          bottom: 0,
        },
      });

    chartRef.current =
      chart;

    candleRef.current =
      candles;

    volumeRef.current =
      volume;

    // ----------------------------------------------
    // Resize
    // ----------------------------------------------

    const observer =
      new ResizeObserver(
        (entries) => {
          const entry =
            entries[0];

          if (!entry) {
            return;
          }

          chart.applyOptions({
            width:
              entry.contentRect.width,
          });
        }
      );

    observer.observe(
      container
    );

    return () => {
      observer.disconnect();

      chart.remove();

      chartRef.current = null;
      candleRef.current = null;
      volumeRef.current = null;
    };
  }, []);

  // ==================================================
  // Historical data
  // ==================================================

  useEffect(() => {
    if (
      !candleRef.current ||
      !volumeRef.current
    ) {
      return;
    }

    candleRef.current.setData(
      bars.map((bar) => ({
        time: bar.time,
        open: bar.open,
        high: bar.high,
        low: bar.low,
        close: bar.close,
      }))
    );

    volumeRef.current.setData(
      bars.map((bar) => ({
        time: bar.time,

        value: bar.volume,

        color:
          bar.close >= bar.open
            ? "#22c55e80"
            : "#ef444480",
      }))
    );

    if (bars.length > 0) {
      chartRef.current
        ?.timeScale()
        .fitContent();
    }
  }, [bars]);

  // ==================================================
  // Live candle
  // ==================================================

  useEffect(() => {
    if (
      !liveBar ||
      !candleRef.current ||
      !volumeRef.current
    ) {
      return;
    }

    candleRef.current.update({
      time: liveBar.time,

      open: liveBar.open,
      high: liveBar.high,
      low: liveBar.low,
      close: liveBar.close,
    });

    volumeRef.current.update({
      time: liveBar.time,

      value: liveBar.volume,

      color:
        liveBar.close >=
        liveBar.open
          ? "#22c55e80"
          : "#ef444480",
    });
  }, [liveBar]);

  return (
    <div
      ref={containerRef}
      className="h-[600px] w-full"
    />
  );
}