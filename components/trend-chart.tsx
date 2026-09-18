"use client";

import { useEffect, useRef, useState } from "react";
import { CandlestickSeries, ColorType, createChart, createSeriesMarkers, LineSeries, type IChartApi, type UTCTimestamp } from "lightweight-charts";
import type { CryptoTrendResult, DailyCandle, SignalEvent } from "@/lib/types";

interface TrendChartProps { candles: DailyCandle[]; result: CryptoTrendResult; signals: SignalEvent[]; range: "6M" | "1Y" | "2Y" | "ALL"; }
interface HoverData { timestamp: number; open: number; high: number; low: number; close: number; sma150: number | null; distancePct: number | null; state: string; }

function rangeStart(range: TrendChartProps["range"], latest: number) {
  const days = range === "6M" ? 183 : range === "1Y" ? 365 : range === "2Y" ? 730 : Number.POSITIVE_INFINITY;
  return latest - days * 86_400_000;
}

export function TrendChart({ candles, result, signals, range }: TrendChartProps) {
  const container = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<HoverData | null>(null);
  useEffect(() => {
    if (!container.current || candles.length === 0) return;
    const latest = candles.at(-1)!.timestamp;
    const from = rangeStart(range, latest);
    const visiblePoints = result.points.filter((point) => point.candle.timestamp >= from);
    const visibleSignals = signals.filter((signal) => signal.timestamp >= from);
    const pointByTime = new Map(result.points.map((point) => [Math.floor(point.candle.timestamp / 1000), point]));
    const chartContainer = container.current;
    const chart: IChartApi = createChart(chartContainer, { width: chartContainer.clientWidth, height: 410, layout: { background: { type: ColorType.Solid, color: "#0e1726" }, textColor: "#99a8c2" }, grid: { vertLines: { color: "#1c2a3e" }, horzLines: { color: "#1c2a3e" } }, rightPriceScale: { borderColor: "#2a3950" }, timeScale: { borderColor: "#2a3950", timeVisible: false }, crosshair: { vertLine: { color: "#61708a" }, horzLine: { color: "#61708a" } } });
    const candlesSeries = chart.addSeries(CandlestickSeries, { upColor: "#28c18a", downColor: "#f05d70", borderVisible: false, wickUpColor: "#28c18a", wickDownColor: "#f05d70" });
    candlesSeries.setData(visiblePoints.map((point) => ({ time: Math.floor(point.candle.timestamp / 1000) as UTCTimestamp, open: point.candle.open, high: point.candle.high, low: point.candle.low, close: point.candle.close })));
    createSeriesMarkers(candlesSeries, visibleSignals.map((signal) => ({ time: Math.floor(signal.timestamp / 1000) as UTCTimestamp, position: signal.state === "ON" ? "belowBar" : "aboveBar", color: signal.state === "ON" ? "#28c18a" : "#f05d70", shape: signal.state === "ON" ? "arrowUp" : "arrowDown", text: signal.state })));
    const smaSeries = chart.addSeries(LineSeries, { color: "#8c9cff", lineWidth: 2, priceLineVisible: false });
    smaSeries.setData(visiblePoints.flatMap((point) => point.sma150 === null ? [] : [{ time: Math.floor(point.candle.timestamp / 1000) as UTCTimestamp, value: point.sma150 }]));
    chart.timeScale().fitContent();
    // Applying a chart resize directly inside a ResizeObserver callback can
    // trigger the browser's observer-loop warning. Defer it to the next frame.
    let resizeFrame = 0;
    const resizeObserver = new ResizeObserver(() => {
      cancelAnimationFrame(resizeFrame);
      resizeFrame = requestAnimationFrame(() => {
        const width = chartContainer.clientWidth;
        if (width > 0) chart.applyOptions({ width });
      });
    });
    resizeObserver.observe(chartContainer);
    chart.subscribeCrosshairMove((param) => {
      if (!param.time || typeof param.time !== "number") return setHover(null);
      const point = pointByTime.get(param.time);
      if (!point) return setHover(null);
      setHover({ timestamp: point.candle.timestamp, open: point.candle.open, high: point.candle.high, low: point.candle.low, close: point.candle.close, sma150: point.sma150, distancePct: point.distancePct, state: point.state });
    });
    return () => {
      resizeObserver.disconnect();
      cancelAnimationFrame(resizeFrame);
      chart.remove();
    };
  }, [candles, range, result.points, signals]);
  return <div className="relative"><div ref={container} aria-label="Daily candlestick chart with SMA150 and trend signal markers" />{hover && <div className="pointer-events-none absolute left-3 top-3 rounded-md border border-slate-700 bg-slate-950/95 px-3 py-2 text-xs text-slate-300 shadow-xl"><div className="mb-1 font-semibold text-slate-100">{new Date(hover.timestamp).toLocaleDateString("en-GB", { timeZone: "UTC" })}</div><div>O {hover.open.toLocaleString("en-US", { maximumFractionDigits: 2 })} · H {hover.high.toLocaleString("en-US", { maximumFractionDigits: 2 })}</div><div>L {hover.low.toLocaleString("en-US", { maximumFractionDigits: 2 })} · C {hover.close.toLocaleString("en-US", { maximumFractionDigits: 2 })}</div><div>SMA150 {hover.sma150?.toLocaleString("en-US", { maximumFractionDigits: 2 }) ?? "—"} · {hover.distancePct?.toFixed(2) ?? "—"}% · {hover.state}</div></div>}</div>;
}
