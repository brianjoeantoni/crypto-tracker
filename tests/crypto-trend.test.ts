import { describe, expect, it } from "vitest";
import { calculateCryptoTrend, CandleValidationError } from "@/lib/crypto-trend";
import type { DailyCandle } from "@/lib/types";

const START = Date.UTC(2020, 0, 1);
function candle(index: number, close: number): DailyCandle {
  return { timestamp: START + index * 86_400_000, open: close, high: close + 1, low: close - 1, close, volume: 1 };
}
function series(closes: number[]) { return closes.map((close, index) => candle(index, close)); }

describe("calculateCryptoTrend", () => {
  it("waits when there are fewer than 150 observations", () => {
    expect(calculateCryptoTrend(series(Array(149).fill(100)), "BTC-USD").currentState).toBe("WAITING");
  });
  it("treats equality with SMA as neutral", () => {
    const result = calculateCryptoTrend(series(Array(155).fill(100)), "BTC-USD");
    expect(result.currentState).toBe("WAITING");
    expect(result.points.at(-1)?.position).toBe("NEUTRAL");
  });
  it("requires exactly three completed above closes before establishing ON", () => {
    const two = calculateCryptoTrend(series([...Array(150).fill(100), 110, 111]), "BTC-USD");
    const three = calculateCryptoTrend(series([...Array(150).fill(100), 110, 111, 112]), "BTC-USD");
    expect(two.currentState).toBe("WAITING");
    expect(three.currentState).toBe("ON");
    expect(three.latestSignal?.previousState).toBe("WAITING");
    expect(three.latestSignal?.confirmationCandles).toHaveLength(3);
  });
  it("preserves state for mixed sequences and emits no duplicate ON", () => {
    const result = calculateCryptoTrend(series([...Array(150).fill(100), 110, 111, 112, 113, 90, 114, 91]), "BTC-USD");
    expect(result.currentState).toBe("ON");
    expect(result.signals).toHaveLength(1);
  });
  it("switches OFF only after three below closes and uses moving SMAs", () => {
    const result = calculateCryptoTrend(series([...Array(150).fill(100), 110, 111, 112, 90, 89, 88]), "ETH-USD");
    expect(result.currentState).toBe("OFF");
    expect(result.signals.map((signal) => signal.state)).toEqual(["ON", "OFF"]);
    expect(result.signals[0].sma150).not.toBe(result.signals[1].sma150);
  });
  it("rejects duplicate or unordered daily timestamps", () => {
    const candles = series(Array(150).fill(100));
    candles[149] = { ...candles[149], timestamp: candles[148].timestamp };
    expect(() => calculateCryptoTrend(candles, "BTC-USD")).toThrow(CandleValidationError);
  });
  it("does not round prior to SMA comparison", () => {
    const result = calculateCryptoTrend(series([...Array(149).fill(100), 100.0001, 100.0002, 100.0003]), "BTC-USD");
    expect(result.currentState).toBe("ON");
  });
});
