import type { SignalEvent, StrategyAsset } from '@/lib/types';

export interface CompletedTrend {
  asset: StrategyAsset;
  entry: SignalEvent;
  exit: SignalEvent;
  signalReturn: number;
  durationDays: number;
}

export interface StrategyStatistics {
  completedTrends: number;
  winningTrends: number;
  losingTrends: number;
  winRate: number | null;
  averageWinner: number | null;
  averageLoser: number | null;
  bestTrend: number | null;
  worstTrend: number | null;
}

export function calculateSignalReturn(
  entry: SignalEvent,
  exit: SignalEvent,
): number | null {
  if (
    entry.asset !== exit.asset ||
    entry.state !== 'ON' ||
    exit.state !== 'OFF' ||
    exit.previousState !== 'ON' ||
    exit.timestamp <= entry.timestamp
  ) {
    return null;
  }
  return exit.close / entry.close - 1;
}

/** Pairs valid ON → OFF signal events without crossing assets or open trends. */
export function pairCompletedTrends(
  events: readonly SignalEvent[],
): CompletedTrend[] {
  const pendingEntries = new Map<StrategyAsset, SignalEvent>();
  const completed: CompletedTrend[] = [];
  const ordered = [...events].sort((left, right) => left.timestamp - right.timestamp);

  for (const event of ordered) {
    if (event.state === 'ON') {
      pendingEntries.set(event.asset, event);
      continue;
    }

    const entry = pendingEntries.get(event.asset);
    if (!entry) continue;
    const signalReturn = calculateSignalReturn(entry, event);
    if (signalReturn === null) continue;

    completed.push({
      asset: event.asset,
      entry,
      exit: event,
      signalReturn,
      durationDays: (event.timestamp - entry.timestamp) / 86_400_000,
    });
    pendingEntries.delete(event.asset);
  }

  return completed;
}

export function calculateStrategyStatistics(
  completedTrends: readonly CompletedTrend[],
): StrategyStatistics {
  const returns = completedTrends.map((trend) => trend.signalReturn);
  const winners = returns.filter((value) => value > 0);
  const losers = returns.filter((value) => value < 0);
  const mean = (values: readonly number[]) =>
    values.length === 0
      ? null
      : values.reduce((sum, value) => sum + value, 0) / values.length;

  return {
    completedTrends: returns.length,
    winningTrends: winners.length,
    losingTrends: losers.length,
    winRate: returns.length === 0 ? null : winners.length / returns.length,
    averageWinner: mean(winners),
    averageLoser: mean(losers),
    bestTrend: returns.length === 0 ? null : Math.max(...returns),
    worstTrend: returns.length === 0 ? null : Math.min(...returns),
  };
}
