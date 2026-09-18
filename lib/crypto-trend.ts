import type {
  CandlePosition,
  ConfirmationCandle,
  CryptoTrendResult,
  DailyCandle,
  SignalEvent,
  StrategyAsset,
  TrendPoint,
  TrendState,
} from "@/lib/types";

export const SMA_PERIOD = 150;
export const DAILY_INTERVAL_MS = 86_400_000;

export class CandleValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CandleValidationError";
  }
}

function utcDate(timestamp: number) {
  return new Date(timestamp).toISOString().slice(0, 10);
}

/**
 * The engine deliberately accepts only already-normalized, complete daily candles.
 * Coinbase response parsing and incomplete-candle removal belong to the adapter.
 */
export function validateDailyCandles(candles: readonly DailyCandle[]): void {
  let previousTimestamp: number | null = null;

  for (const candle of candles) {
    const values = [
      candle.timestamp,
      candle.open,
      candle.high,
      candle.low,
      candle.close,
      candle.volume,
    ];
    if (!values.every(Number.isFinite)) {
      throw new CandleValidationError("Candle contains a non-finite value.");
    }
    if (!Number.isInteger(candle.timestamp) || candle.timestamp % DAILY_INTERVAL_MS !== 0) {
      throw new CandleValidationError("Candle timestamp is not a UTC daily boundary.");
    }
    if (candle.open <= 0 || candle.high <= 0 || candle.low <= 0 || candle.close <= 0 || candle.volume < 0) {
      throw new CandleValidationError("Candle contains an invalid OHLCV value.");
    }
    if (candle.low > candle.high || candle.open < candle.low || candle.open > candle.high || candle.close < candle.low || candle.close > candle.high) {
      throw new CandleValidationError("Candle OHLC values are inconsistent.");
    }
    if (previousTimestamp !== null && candle.timestamp !== previousTimestamp + DAILY_INTERVAL_MS) {
      throw new CandleValidationError("Candles must be ordered, unique, and contiguous.");
    }
    previousTimestamp = candle.timestamp;
  }
}

function emptyResult(candles: readonly DailyCandle[]): CryptoTrendResult {
  return {
    currentState: "WAITING",
    latestCompletedCandle: candles.at(-1) ?? null,
    currentSma150: null,
    distancePct: null,
    consecutiveAbove: 0,
    consecutiveBelow: 0,
    latestSignal: null,
    signals: [],
    points: [],
  };
}

export function calculateCryptoTrend(
  candles: readonly DailyCandle[],
  asset: StrategyAsset,
): CryptoTrendResult {
  validateDailyCandles(candles);
  if (candles.length < SMA_PERIOD) return emptyResult(candles);

  let rollingSum = 0;
  let state: TrendState = "WAITING";
  let consecutiveAbove = 0;
  let consecutiveBelow = 0;
  const points: TrendPoint[] = [];
  const signals: SignalEvent[] = [];

  for (let index = 0; index < candles.length; index += 1) {
    const candle = candles[index];
    rollingSum += candle.close;
    if (index >= SMA_PERIOD) rollingSum -= candles[index - SMA_PERIOD].close;

    let sma150: number | null = null;
    let position: CandlePosition = null;
    if (index >= SMA_PERIOD - 1) {
      sma150 = rollingSum / SMA_PERIOD;
      position = candle.close > sma150 ? "ABOVE" : candle.close < sma150 ? "BELOW" : "NEUTRAL";
      consecutiveAbove = position === "ABOVE" ? consecutiveAbove + 1 : 0;
      consecutiveBelow = position === "BELOW" ? consecutiveBelow + 1 : 0;

      const nextState = consecutiveAbove >= 3 ? "ON" : consecutiveBelow >= 3 ? "OFF" : null;
      if (nextState && nextState !== state) {
        const confirmationCandles = points.slice(-2).concat({
          candle,
          sma150,
          position,
          state,
          consecutiveAbove,
          consecutiveBelow,
          distancePct: ((candle.close - sma150) / sma150) * 100,
        } satisfies TrendPoint);
        if (confirmationCandles.length !== 3 || confirmationCandles.some((point) => point.sma150 === null || point.position !== position)) {
          throw new CandleValidationError("Unable to form a valid three-candle confirmation.");
        }
        const previousState = state;
        state = nextState;
        const eventCandles = confirmationCandles.map((point) => ({
          timestamp: point.candle.timestamp,
          close: point.candle.close,
          sma150: point.sma150 as number,
          position: point.position as "ABOVE" | "BELOW",
        })) as [ConfirmationCandle, ConfirmationCandle, ConfirmationCandle];
        const signal: SignalEvent = {
          id: `${asset}:${state}:${utcDate(candle.timestamp)}`,
          asset,
          state,
          timestamp: candle.timestamp,
          close: candle.close,
          sma150,
          distancePct: ((candle.close - sma150) / sma150) * 100,
          previousState,
          confirmationCandles: eventCandles,
        };
        signals.push(signal);
      }
    } else {
      consecutiveAbove = 0;
      consecutiveBelow = 0;
    }

    points.push({
      candle,
      sma150,
      distancePct: sma150 === null ? null : ((candle.close - sma150) / sma150) * 100,
      position,
      state,
      consecutiveAbove,
      consecutiveBelow,
    });
  }

  const latestPoint = points.at(-1)!;
  return {
    currentState: state,
    latestCompletedCandle: candles.at(-1) ?? null,
    currentSma150: latestPoint.sma150,
    distancePct: latestPoint.distancePct,
    consecutiveAbove: latestPoint.consecutiveAbove,
    consecutiveBelow: latestPoint.consecutiveBelow,
    latestSignal: signals.at(-1) ?? null,
    signals,
    points,
  };
}
