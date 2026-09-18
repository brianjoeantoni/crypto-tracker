export const STRATEGY_ASSETS = ["BTC-USD", "ETH-USD"] as const;

export type StrategyAsset = (typeof STRATEGY_ASSETS)[number];
export type TrendState = "WAITING" | "ON" | "OFF";
export type CandlePosition = "ABOVE" | "BELOW" | "NEUTRAL" | null;

/** A Coinbase daily OHLCV candle. timestamp is the UTC bucket start in ms. */
export interface DailyCandle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface ConfirmationCandle {
  timestamp: number;
  close: number;
  sma150: number;
  position: "ABOVE" | "BELOW";
}

export interface SignalEvent {
  id: string;
  asset: StrategyAsset;
  state: "ON" | "OFF";
  timestamp: number;
  close: number;
  sma150: number;
  distancePct: number;
  previousState: TrendState;
  confirmationCandles: [ConfirmationCandle, ConfirmationCandle, ConfirmationCandle];
}

export interface TrendPoint {
  candle: DailyCandle;
  sma150: number | null;
  distancePct: number | null;
  position: CandlePosition;
  state: TrendState;
  consecutiveAbove: number;
  consecutiveBelow: number;
}

export interface CryptoTrendResult {
  currentState: TrendState;
  latestCompletedCandle: DailyCandle | null;
  currentSma150: number | null;
  distancePct: number | null;
  consecutiveAbove: number;
  consecutiveBelow: number;
  latestSignal: SignalEvent | null;
  signals: SignalEvent[];
  points: TrendPoint[];
}

export interface AssetSnapshot {
  asset: StrategyAsset;
  candles: DailyCandle[];
  result: CryptoTrendResult;
  fetchedAt: number;
}

export interface AssetFailure {
  asset: StrategyAsset;
  message: string;
}
