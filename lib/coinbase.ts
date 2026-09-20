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
const COINBASE_CACHE_TTL_SECONDS = 24 * 60 * 60;
const DEFAULT_REQUEST_INTERVAL_MS = 350;
const DEFAULT_RETRY_BASE_DELAY_MS = 750;
const MAX_RETRY_DELAY_MS = 15_000;
let nextCoinbaseRequestAt = 0;

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
  /** Minimum gap between Coinbase requests in this runtime. */
  requestIntervalMs?: number;
  /** Base delay for retryable Coinbase responses. Useful as zero in unit tests. */
  retryBaseDelayMs?: number;
}

function delay(milliseconds: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}

async function waitForCoinbaseRequestSlot(requestIntervalMs: number) {
  if (requestIntervalMs <= 0) return;
  const now = Date.now();
  const wait = Math.max(0, nextCoinbaseRequestAt - now);
  if (wait > 0) await delay(wait);
  nextCoinbaseRequestAt = Date.now() + requestIntervalMs;
}

function retryDelay(response: Response | undefined, attempt: number, retryBaseDelayMs: number) {
  const exponentialDelay = retryBaseDelayMs * 2 ** attempt;
  const retryAfter = response?.headers.get("Retry-After");
  if (!retryAfter) return exponentialDelay;

  const seconds = Number(retryAfter);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(MAX_RETRY_DELAY_MS, Math.max(exponentialDelay, seconds * 1000));
  }

  const retryAt = Date.parse(retryAfter);
  if (Number.isNaN(retryAt)) return exponentialDelay;
  return Math.min(MAX_RETRY_DELAY_MS, Math.max(exponentialDelay, retryAt - Date.now()));
}

function asFiniteNumber(value: unknown, name: string): number {
  const numberValue = typeof value === "number" || typeof value === "string" ? Number(value) : Number.NaN;
  if (!Number.isFinite(numberValue)) throw new CoinbaseDataError(`Coinbase candle ${name} is invalid.`);
  return numberValue;
}

function coinbaseHeaders(): HeadersInit {
  const headers: HeadersInit = { Accept: "application/json" };
  // Browsers forbid scripts from setting User-Agent. Cloudflare Workers need it
  // for this endpoint, so keep it on server-side calls only.
  if (typeof window === "undefined") {
    headers["User-Agent"] = "crypto-tracker/1.0 (public market-data dashboard)";
  }
  return headers;
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
  requestIntervalMs: number,
  retryBaseDelayMs: number,
): Promise<DailyCandle[]> {
  const url = new URL(`${COINBASE_ORIGIN}/products/${asset}/candles`);
  url.searchParams.set("granularity", "86400");
  url.searchParams.set("start", new Date(start).toISOString());
  url.searchParams.set("end", new Date(end).toISOString());
  let response: Response | undefined;
  let lastError: unknown;
  // Coinbase can occasionally return a transient bad-gateway 400 on a valid
  // pagination window. Retry the individual window before failing closed.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);
    try {
      await waitForCoinbaseRequestSlot(requestIntervalMs);
      response = await fetchFn(url, {
        headers: coinbaseHeaders(),
        signal: controller.signal,
        // Cloudflare caches each immutable historical window at the fetch layer.
        // Node ignores this Workers-specific option, preserving local/test behavior.
        cf: {
          cacheEverything: true,
          // Vinext marks dynamic server work as no-store. Cloudflare permits a
          // status-specific TTL in that case, unlike the plain cacheTtl option.
          cacheTtlByStatus: {
            "200-299": COINBASE_CACHE_TTL_SECONDS,
          },
        },
      });
      if (response.ok) break;
      const body = (await response.text()).replace(/\s+/g, ' ').slice(0, 240);
      lastError = new CoinbaseDataError(
        `Coinbase responded with HTTP ${response.status}${body ? `: ${body}` : ''} ` +
          `(${new Date(start).toISOString()} to ${new Date(end).toISOString()}).`,
      );
      if (response.status !== 400 && response.status !== 429 && response.status < 500) break;
    } catch (error) {
      lastError = error;
    } finally {
      clearTimeout(timeout);
    }
    if (attempt < 2) await delay(retryDelay(response, attempt, retryBaseDelayMs));
  }
  if (!response?.ok) {
    if (lastError instanceof DOMException && lastError.name === "AbortError") {
      throw new CoinbaseDataError(`Coinbase request timed out after ${Math.round(requestTimeoutMs / 1000)} seconds.`);
    }
    if (lastError instanceof CoinbaseDataError) throw lastError;
    throw new CoinbaseDataError(`Coinbase request failed: ${lastError instanceof Error ? lastError.message : "unknown error"}`);
  }
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
  const requestIntervalMs = options.requestIntervalMs ?? DEFAULT_REQUEST_INTERVAL_MS;
  const retryBaseDelayMs = options.retryBaseDelayMs ?? DEFAULT_RETRY_BASE_DELAY_MS;
  const startTimestamp = options.startTimestamp ?? EARLIEST_REQUEST_MS[asset];
  const todayStart = Math.floor(now / DAILY_INTERVAL_MS) * DAILY_INTERVAL_MS;
  const raw: DailyCandle[] = [];

  for (let start = startTimestamp; start <= todayStart; start += MAX_CANDLES_PER_REQUEST * DAILY_INTERVAL_MS) {
    const end = Math.min(start + MAX_CANDLES_PER_REQUEST * DAILY_INTERVAL_MS, todayStart + DAILY_INTERVAL_MS);
    raw.push(...(await fetchChunk(
      asset,
      start,
      end,
      fetchFn,
      requestTimeoutMs,
      requestIntervalMs,
      retryBaseDelayMs,
    )));
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
