import { describe, expect, it } from "vitest";
import { fetchHistoricalCandles, CoinbaseDataError } from "@/lib/coinbase";

const START = Date.UTC(2020, 0, 1);
const NOW = START + 153 * 86_400_000 + 3_600_000;
function rows(count = 154) { return Array.from({ length: count }, (_, index) => [String((START + index * 86_400_000) / 1000), "99", "101", "100", "100", "2"]); }
function fakeFetch(payload: unknown, status = 200) { return async () => new Response(JSON.stringify(payload), { status, headers: { "Content-Type": "application/json" } }); }

describe("Coinbase adapter", () => {
  it("normalizes sorted candles and excludes the forming daily bucket", async () => {
    const result = await fetchHistoricalCandles("BTC-USD", { fetchFn: fakeFetch(rows().reverse()), now: NOW, startTimestamp: START, requestIntervalMs: 0, retryBaseDelayMs: 0 });
    expect(result).toHaveLength(153);
    expect(result.at(-1)?.timestamp).toBe(START + 152 * 86_400_000);
  });
  it("fails closed for a malformed response", async () => {
    await expect(fetchHistoricalCandles("BTC-USD", { fetchFn: fakeFetch({ candles: [] }), now: NOW, startTimestamp: START, requestIntervalMs: 0, retryBaseDelayMs: 0 })).rejects.toBeInstanceOf(CoinbaseDataError);
  });
  it("fails closed for missing daily data and API errors", async () => {
    const missing = rows().filter((_, index) => index !== 90);
    await expect(fetchHistoricalCandles("ETH-USD", { fetchFn: fakeFetch(missing), now: NOW, startTimestamp: START, requestIntervalMs: 0, retryBaseDelayMs: 0 })).rejects.toBeInstanceOf(CoinbaseDataError);
    await expect(fetchHistoricalCandles("ETH-USD", { fetchFn: fakeFetch({}, 500), now: NOW, startTimestamp: START, requestIntervalMs: 0, retryBaseDelayMs: 0 })).rejects.toBeInstanceOf(CoinbaseDataError);
  });
  it("rejects duplicate timestamps", async () => {
    const duplicate = rows(); duplicate.push(duplicate[0]);
    await expect(fetchHistoricalCandles("BTC-USD", { fetchFn: fakeFetch(duplicate), now: NOW, startTimestamp: START, requestIntervalMs: 0, retryBaseDelayMs: 0 })).rejects.toBeInstanceOf(CoinbaseDataError);
  });

  it("passes Workers cache settings to the Coinbase request", async () => {
    let requestInit: RequestInit | undefined;
    await fetchHistoricalCandles("BTC-USD", {
      fetchFn: async (_input, init) => {
        requestInit = init;
        return new Response(JSON.stringify(rows()));
      },
      now: NOW,
      startTimestamp: START,
      requestIntervalMs: 0,
      retryBaseDelayMs: 0,
    });

    expect(requestInit?.cf).toMatchObject({
      cacheEverything: true,
      cacheTtlByStatus: { "200-299": 86_400 },
    });
  });
});
