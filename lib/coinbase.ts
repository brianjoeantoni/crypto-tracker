import { calculateCryptoTrend, DAILY_INTERVAL_MS, validateDailyCandles } from "@/lib/crypto-trend";
import type { AssetSnapshot, DailyCandle, StrategyAsset } from "@/lib/types";

const COINBASE_ORIGIN = "https://api.exchange.coinbase.com";
// ETH-USD has three discontinuous launch-era buckets (18–20 May 2016, then
// 23 May). Start its "all contiguous history" at that first stable bucket so
// normal validation can remain fail-closed for every later gap.
const EARLIEST_REQUEST_MS: Record<StrategyAsset, number> = {
  "BTC-USD": Date.UTC(2015, 0, 1),
  "ETH-USD": Date.UTC(2016, 4, 23),
};
// Coinbase permits at most 300 returned buckets. Its start/end range is inclusive,
// so a 300-day difference can yield 301 daily buckets; request 299 per window.
const MAX_CANDLES_PER_REQUEST = 299;

export class CoinbaseDataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CoinbaseDataError";
  }
}

export type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export interface CoinbaseOptions {
  fetchFn?: FetchLike;
  now?: number;
  startTimestamp?: number;
  requestTimeoutMs?: number;
}

function asFiniteNumber(value: unknown, name: string): number {
  const numberValue = typeof value === "number" || typeof value === "string" ? Number(value) : Number.NaN;
  if (!Number.isFinite(numberValue)) throw new CoinbaseDataError(`Coinbase candle ${name} is invalid.`);
  return numberValue;
}

function parseCandle(value: unknown): DailyCandle {
  if (!Array.isArray(value) || value.length !== 6) {
    throw new CoinbaseDataError("Coinbase returned an unexpected candle structure.");
  }
  const timestamp = asFiniteNumber(value[0], "timestamp") * 1000;
  return {
    timestamp,
    low: asFiniteNumber(value[1], "low"),
    high: asFiniteNumber(value[2], "high"),
    open: asFiniteNumber(value[3], "open"),
    close: asFiniteNumber(value[4], "close"),
    volume: asFiniteNumber(value[5], "volume"),
  };
}

async function fetchChunk(
  asset: StrategyAsset,
  start: number,
  end: number,
  fetchFn: FetchLike,
  requestTimeoutMs: number,
): Promise<DailyCandle[]> {
  const url = new URL(`${COINBASE_ORIGIN}/products/${asset}/candles`);
  url.searchParams.set("granularity", "86400");
  url.searchParams.set("start", new Date(start).toISOString());
  url.searchParams.set("end", new Date(end).toISOString());
  let response: Response;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);
  try {
    response = await fetchFn(url, { headers: { Accept: "application/json" }, signal: controller.signal });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new CoinbaseDataError(`Coinbase request timed out after ${Math.round(requestTimeoutMs / 1000)} seconds.`);
    }
    throw new CoinbaseDataError(`Coinbase request failed: ${error instanceof Error ? error.message : "unknown error"}`);
  } finally {
    clearTimeout(timeout);
  }
  if (!response.ok) throw new CoinbaseDataError(`Coinbase responded with HTTP ${response.status}.`);
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new CoinbaseDataError("Coinbase returned invalid JSON.");
  }
  if (!Array.isArray(payload)) throw new CoinbaseDataError("Coinbase returned an unexpected response structure.");
  return payload.map(parseCandle).filter((candle) => candle.timestamp >= start && candle.timestamp < end);
}

/** Fetch all available contiguous daily history, including the current bucket so it can be explicitly excluded. */
export async function fetchHistoricalCandles(
  asset: StrategyAsset,
  options: CoinbaseOptions = {},
): Promise<DailyCandle[]> {
  const fetchFn = options.fetchFn ?? fetch;
  const now = options.now ?? Date.now();
  const requestTimeoutMs = options.requestTimeoutMs ?? 15_000;
  const startTimestamp = options.startTimestamp ?? EARLIEST_REQUEST_MS[asset];
  const todayStart = Math.floor(now / DAILY_INTERVAL_MS) * DAILY_INTERVAL_MS;
  const raw: DailyCandle[] = [];

  for (let start = startTimestamp; start <= todayStart; start += MAX_CANDLES_PER_REQUEST * DAILY_INTERVAL_MS) {
    const end = Math.min(start + MAX_CANDLES_PER_REQUEST * DAILY_INTERVAL_MS, todayStart + DAILY_INTERVAL_MS);
    raw.push(...(await fetchChunk(asset, start, end, fetchFn, requestTimeoutMs)));
  }

  raw.sort((left, right) => left.timestamp - right.timestamp);
  const completed = raw.filter((candle) => candle.timestamp + DAILY_INTERVAL_MS <= now);
  if (completed.length < 1) throw new CoinbaseDataError("Coinbase returned no completed daily candles.");
  try {
    validateDailyCandles(completed);
  } catch (error) {
    throw new CoinbaseDataError(error instanceof Error ? error.message : "Candle validation failed.");
  }
  if (completed.length < 150) throw new CoinbaseDataError("Coinbase returned insufficient completed history for SMA150.");
  return completed;
}

export async function fetchAssetSnapshot(asset: StrategyAsset, options: CoinbaseOptions = {}): Promise<AssetSnapshot> {
  const candles = await fetchHistoricalCandles(asset, options);
  return {
    asset,
    candles,
    result: calculateCryptoTrend(candles, asset),
    fetchedAt: options.now ?? Date.now(),
  };
}
