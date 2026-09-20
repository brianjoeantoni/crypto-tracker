import { describe, expect, it } from 'vitest';
import {
  calculateSignalReturn,
  calculateStrategyStatistics,
  pairCompletedTrends,
} from '@/lib/trend-statistics';
import type { SignalEvent, StrategyAsset } from '@/lib/types';

const DAY = 86_400_000;
const START = Date.UTC(2025, 0, 1);

function signal(
  asset: StrategyAsset,
  state: 'ON' | 'OFF',
  day: number,
  close: number,
  previousState: SignalEvent['previousState'] = state === 'ON' ? 'OFF' : 'ON',
): SignalEvent {
  return {
    id: `${asset}:${state}:${day}`,
    asset,
    state,
    timestamp: START + day * DAY,
    close,
    sma150: 100,
    distancePct: 1,
    previousState,
    confirmationCandles: [
      { timestamp: START + (day - 2) * DAY, close, sma150: 100, position: state === 'ON' ? 'ABOVE' : 'BELOW' },
      { timestamp: START + (day - 1) * DAY, close, sma150: 100, position: state === 'ON' ? 'ABOVE' : 'BELOW' },
      { timestamp: START + day * DAY, close, sma150: 100, position: state === 'ON' ? 'ABOVE' : 'BELOW' },
    ],
  };
}

describe('trend statistics', () => {
  it('pairs an ON with the following valid OFF and keeps full precision', () => {
    const entry = signal('BTC-USD', 'ON', 0, 79_852.37);
    const exit = signal('BTC-USD', 'OFF', 24, 73_512.56);
    const trends = pairCompletedTrends([entry, exit]);

    expect(trends).toHaveLength(1);
    expect(trends[0].durationDays).toBe(24);
    expect(trends[0].signalReturn).toBe(73_512.56 / 79_852.37 - 1);
    expect(calculateSignalReturn(entry, exit)).toBe(trends[0].signalReturn);
  });

  it('never pairs events across assets and ignores malformed sequences safely', () => {
    const btcOn = signal('BTC-USD', 'ON', 0, 100);
    const ethOff = signal('ETH-USD', 'OFF', 5, 200);
    const btcOffWithoutOn = signal('BTC-USD', 'OFF', 3, 90, 'WAITING');
    const openEthOn = signal('ETH-USD', 'ON', 8, 200);

    expect(pairCompletedTrends([btcOn, ethOff, btcOffWithoutOn, openEthOn])).toEqual([]);
  });

  it('does not count an open ON trend and calculates winner and loser statistics', () => {
    const trends = pairCompletedTrends([
      signal('BTC-USD', 'ON', 0, 100),
      signal('BTC-USD', 'OFF', 5, 120),
      signal('BTC-USD', 'ON', 8, 100),
      signal('BTC-USD', 'OFF', 12, 80),
      signal('BTC-USD', 'ON', 16, 100),
    ]);
    const statistics = calculateStrategyStatistics(trends);

    expect(statistics.completedTrends).toBe(2);
    expect(statistics.winningTrends).toBe(1);
    expect(statistics.losingTrends).toBe(1);
    expect(statistics.winRate).toBe(0.5);
    expect(statistics.averageWinner).toBeCloseTo(0.2);
    expect(statistics.averageLoser).toBeCloseTo(-0.2);
    expect(statistics.bestTrend).toBeCloseTo(0.2);
    expect(statistics.worstTrend).toBeCloseTo(-0.2);
  });

  it('returns safe empty statistics without NaN values', () => {
    expect(calculateStrategyStatistics([])).toEqual({
      completedTrends: 0,
      winningTrends: 0,
      losingTrends: 0,
      winRate: null,
      averageWinner: null,
      averageLoser: null,
      bestTrend: null,
      worstTrend: null,
    });
  });
});
