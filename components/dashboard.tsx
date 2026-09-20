'use client';

import { useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Clock3,
} from 'lucide-react';
import { TrendChart } from '@/components/trend-chart';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table } from '@/components/ui/table';
import { ThemeToggle } from '@/components/theme-toggle';
import {
  calculateStrategyStatistics,
  pairCompletedTrends,
  type CompletedTrend,
  type StrategyStatistics,
} from '@/lib/trend-statistics';
import type {
  AssetFailure,
  AssetSnapshot,
  SignalEvent,
  StrategyAsset,
  TrendState,
} from '@/lib/types';

interface DashboardProps {
  snapshots: AssetSnapshot[];
  failures: AssetFailure[];
  fetchedAt: number;
}
const usd = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const date = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'UTC',
  day: '2-digit',
  month: 'short',
  year: 'numeric',
});

// Base UI Tabs may report `null` when a tab is temporarily deactivated. Keep
// the dashboard's derived selection on one of the two snapshots in that case.
function isStrategyAsset(value: unknown): value is StrategyAsset {
  return value === 'BTC-USD' || value === 'ETH-USD';
}

function isChartRange(value: unknown): value is '6M' | '1Y' | '2Y' | 'ALL' {
  return value === '6M' || value === '1Y' || value === '2Y' || value === 'ALL';
}

function isHistoryFilter(
  value: unknown,
): value is 'All' | StrategyAsset {
  return value === 'All' || isStrategyAsset(value);
}

function formatReturn(value: number | null) {
  return value === null ? '—' : `${value >= 0 ? '+' : ''}${(value * 100).toFixed(2)}%`;
}

function formatRate(value: number | null) {
  return value === null ? '—' : `${(value * 100).toFixed(2)}%`;
}

function stateClass(state: TrendState) {
  return state === 'ON'
    ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300'
    : state === 'OFF'
      ? 'border-rose-400/30 bg-rose-400/10 text-rose-300'
      : 'border-amber-400/30 bg-amber-400/10 text-amber-200';
}
function TrendStatus({ state }: { state: TrendState }) {
  return (
    <Badge
      className={`h-7 border px-2.5 text-xs tracking-wide ${stateClass(state)}`}
    >
      {state === 'WAITING' ? 'WAITING' : `TREND ${state}`}
    </Badge>
  );
}
function Metric({
  label,
  value,
  positive,
}: {
  label: string;
  value: string;
  positive?: boolean;
}) {
  return (
    <div>
      <p className="mb-1 text-xs text-slate-500">{label}</p>
      <p
        className={`font-medium ${positive === undefined ? 'text-slate-200' : positive ? 'text-emerald-300' : 'text-rose-300'}`}
      >
        {value}
      </p>
    </div>
  );
}

function AssetCard({ snapshot }: { snapshot: AssetSnapshot }) {
  const { asset, result } = snapshot;
  const label = asset === 'BTC-USD' ? 'Bitcoin' : 'Ethereum';
  const streak =
    result.consecutiveAbove > 0
      ? `${result.consecutiveAbove} closes above SMA`
      : result.consecutiveBelow > 0
        ? `${result.consecutiveBelow} closes below SMA`
        : 'No current directional streak';
  return (
    <Card className="border border-slate-800 bg-slate-900/75 shadow-none">
      <CardHeader className="pb-1">
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="text-lg text-slate-100">{label}</CardTitle>
            <p className="mt-0.5 text-sm text-slate-500">{asset.slice(0, 3)}</p>
          </div>
          <TrendStatus state={result.currentState} />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-x-4 gap-y-3 border-y border-slate-800 py-4 text-sm">
          <Metric
            label="Confirmed close"
            value={
              result.latestCompletedCandle
                ? usd.format(result.latestCompletedCandle.close)
                : '—'
            }
          />
          <Metric
            label="SMA150"
            value={
              result.currentSma150 ? usd.format(result.currentSma150) : '—'
            }
          />
          <Metric
            label="Distance"
            value={
              result.distancePct === null
                ? '—'
                : `${result.distancePct >= 0 ? '+' : ''}${result.distancePct.toFixed(2)}%`
            }
            positive={(result.distancePct ?? 0) >= 0}
          />
          <Metric
            label="Confirmed through"
            value={
              result.latestCompletedCandle
                ? date.format(result.latestCompletedCandle.timestamp)
                : '—'
            }
          />
        </div>
        <div className="flex items-center justify-between gap-3 text-sm">
          <span className="text-slate-500">Last signal</span>
          <span className="text-right font-medium text-slate-200">
            {result.latestSignal
              ? `${result.latestSignal.state} · ${date.format(result.latestSignal.timestamp)}`
              : 'None'}
          </span>
        </div>
        <div className="flex items-center gap-2 text-sm text-slate-400">
          <Activity className="size-4" /> {streak}
        </div>
      </CardContent>
    </Card>
  );
}

function SignalDetails({
  signal,
  completedTrend,
}: {
  signal: SignalEvent | null;
  completedTrend: CompletedTrend | null;
}) {
  if (!signal)
    return (
      <p className="py-10 text-center text-sm text-slate-500">
        Select a signal to inspect its confirmation.
      </p>
    );
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-widest text-slate-500">
            Signal details
          </p>
          <h3 className="mt-1 text-lg font-semibold text-slate-100">
            {signal.asset.replace('-USD', '')} — TREND {signal.state}
          </h3>
        </div>
        <TrendStatus state={signal.state} />
      </div>
      <div className="grid grid-cols-2 gap-3 text-sm">
        <Metric label="Confirmed" value={date.format(signal.timestamp)} />
        <Metric label="Close" value={usd.format(signal.close)} />
        <Metric label="SMA150" value={usd.format(signal.sma150)} />
        <Metric
          label="Distance"
          value={`${signal.distancePct >= 0 ? '+' : ''}${signal.distancePct.toFixed(2)}%`}
          positive={signal.distancePct >= 0}
        />
      </div>
      {completedTrend ? (
        <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-3">
          <p className="mb-3 text-xs font-medium uppercase tracking-widest text-slate-500">
            Completed trend
          </p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-4 text-sm">
            <Metric
              label="Entry signal"
              value={`${date.format(completedTrend.entry.timestamp)} · ${usd.format(completedTrend.entry.close)}`}
            />
            <Metric
              label="Exit signal"
              value={`${date.format(completedTrend.exit.timestamp)} · ${usd.format(completedTrend.exit.close)}`}
            />
            <Metric
              label="Signal return"
              value={formatReturn(completedTrend.signalReturn)}
              positive={completedTrend.signalReturn >= 0}
            />
            <Metric
              label="Duration"
              value={`${completedTrend.durationDays} days`}
            />
          </div>
        </div>
      ) : signal.state === 'ON' ? (
        <p className="rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2 text-sm text-slate-400">
          Trend started — no completed Signal Return yet.
        </p>
      ) : null}
      <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-3">
        <p className="mb-3 text-xs font-medium uppercase tracking-widest text-slate-500">
          Three-close confirmation
        </p>
        <div className="space-y-2">
          {signal.confirmationCandles.map((candle) => (
            <div
              key={candle.timestamp}
              className="flex items-center justify-between text-sm"
            >
              <span className="text-slate-400">
                {date.format(candle.timestamp)}
              </span>
              <span
                className={
                  candle.position === 'ABOVE'
                    ? 'text-emerald-300'
                    : 'text-rose-300'
                }
              >
                {candle.position}{' '}
                <CheckCircle2 className="ml-1 inline size-3.5" />
              </span>
            </div>
          ))}
        </div>
      </div>
      <p className="text-sm text-slate-400">
        Previous state{' '}
        <span className="font-medium text-slate-200">
          {signal.previousState}
        </span>{' '}
        → New state{' '}
        <span className="font-medium text-slate-200">{signal.state}</span>
      </p>
    </div>
  );
}

function StrategyStatisticsCard({
  asset,
  statistics,
}: {
  asset: StrategyAsset;
  statistics: StrategyStatistics;
}) {
  return (
    <Card className="border border-slate-800 bg-slate-900/75 shadow-none">
      <CardHeader className="pb-1">
        <CardTitle className="text-lg text-slate-100">
          {asset.replace('-USD', '')}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-x-5 gap-y-4 text-sm sm:grid-cols-4">
          <Metric label="Completed trends" value={String(statistics.completedTrends)} />
          <Metric label="Winning trends" value={String(statistics.winningTrends)} positive />
          <Metric label="Losing trends" value={String(statistics.losingTrends)} positive={false} />
          <Metric label="Win rate" value={formatRate(statistics.winRate)} positive={statistics.winRate === null ? undefined : statistics.winRate >= 0.5} />
          <Metric label="Average winner" value={formatReturn(statistics.averageWinner)} positive={statistics.averageWinner === null ? undefined : true} />
          <Metric label="Average loser" value={formatReturn(statistics.averageLoser)} positive={statistics.averageLoser === null ? undefined : false} />
          <Metric label="Best trend" value={formatReturn(statistics.bestTrend)} positive={statistics.bestTrend === null ? undefined : statistics.bestTrend >= 0} />
          <Metric label="Worst trend" value={formatReturn(statistics.worstTrend)} positive={statistics.worstTrend === null ? undefined : statistics.worstTrend >= 0} />
        </div>
      </CardContent>
    </Card>
  );
}

export function Dashboard({ snapshots, failures, fetchedAt }: DashboardProps) {
  const [asset, setAsset] = useState<StrategyAsset>(
    snapshots[0]?.asset ?? 'BTC-USD',
  );
  const [range, setRange] = useState<'6M' | '1Y' | '2Y' | 'ALL'>('1Y');
  const [filter, setFilter] = useState<'All' | 'BTC-USD' | 'ETH-USD'>('All');
  const [showAll, setShowAll] = useState(false);
  const allSignals = useMemo(
    () =>
      snapshots
        .flatMap((snapshot) => snapshot.result.signals)
        .sort((a, b) => b.timestamp - a.timestamp),
    [snapshots],
  );
  const completedTrends = useMemo(() => pairCompletedTrends(allSignals), [allSignals]);
  const completedTrendByExitId = useMemo(
    () => new Map(completedTrends.map((trend) => [trend.exit.id, trend])),
    [completedTrends],
  );
  const statisticsByAsset = useMemo(
    () =>
      new Map(
        (['BTC-USD', 'ETH-USD'] as const).map((asset) => [
          asset,
          calculateStrategyStatistics(
            completedTrends.filter((trend) => trend.asset === asset),
          ),
        ]),
      ),
    [completedTrends],
  );
  const filteredSignals = allSignals.filter(
    (signal) => filter === 'All' || signal.asset === filter,
  );
  const [selectedId, setSelectedId] = useState<string | null>(
    allSignals[0]?.id ?? null,
  );
  const selectedSnapshot =
    snapshots.find((snapshot) => snapshot.asset === asset) ?? null;
  const selectedSignal =
    allSignals.find((signal) => signal.id === selectedId) ?? null;

  return (
    <main className="tracker-dashboard min-h-screen bg-[#09111f] text-slate-100">
      <div className="mx-auto max-w-7xl px-4 py-7 sm:px-6 lg:px-8">
        <header className="mb-8 flex flex-col gap-5 border-b border-slate-800 pb-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="mb-2 flex items-center gap-2 text-sm font-medium text-indigo-300">
              <BarChart3 className="size-4" /> Crypto Trend v1
            </p>
            <h1 className="text-3xl font-semibold tracking-tight text-white">
              Crypto Tracker
            </h1>
            <p className="mt-2 text-base text-slate-400">
              BTC & ETH trend-following monitor
            </p>
          </div>
          <div className="text-sm text-slate-500">
            <p className="flex items-center gap-2">
              <Clock3 className="size-4" /> Last updated{' '}
              {fetchedAt
                ? `${new Date(fetchedAt).toLocaleString('en-GB', { timeZone: 'UTC', dateStyle: 'medium', timeStyle: 'short' })} UTC`
                : 'unavailable'}
            </p>
            <p className="mt-2 text-xs">
              SMA150 · 3-close confirmation · Daily Coinbase candles
            </p>
          </div>
          <ThemeToggle />
        </header>
        {failures.length > 0 && (
          <div className="mb-6 flex gap-3 rounded-xl border border-amber-400/25 bg-amber-400/10 p-4 text-sm text-amber-100">
            <AlertTriangle className="mt-0.5 size-5 shrink-0" />
            <div>
              <p className="font-medium">Some market data is unavailable</p>
              <p className="mt-1 text-amber-100/75">
                {failures
                  .map(
                    (failure) =>
                      `${failure.asset.replace('-USD', '')}: ${failure.message}`,
                  )
                  .join(' · ')}
              </p>
            </div>
          </div>
        )}
        <section
          aria-label="Current trend states"
          className="grid gap-5 md:grid-cols-2"
        >
          {snapshots.map((snapshot) => (
            <AssetCard key={snapshot.asset} snapshot={snapshot} />
          ))}
        </section>
        {selectedSnapshot && (
          <section className="mt-8 rounded-xl border border-slate-800 bg-slate-900/75 p-4 sm:p-6">
            <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-xl font-semibold text-slate-100">
                  Trend chart
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  Signals are based only on completed UTC daily candles.
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <Tabs
                  value={asset}
                  onValueChange={(value) => {
                    if (isStrategyAsset(value)) setAsset(value);
                  }}
                >
                  <TabsList className="bg-slate-800">
                    <TabsTrigger value="BTC-USD" className="px-3 text-xs">
                      BTC
                    </TabsTrigger>
                    <TabsTrigger value="ETH-USD" className="px-3 text-xs">
                      ETH
                    </TabsTrigger>
                  </TabsList>
                </Tabs>
                <Tabs
                  value={range}
                  onValueChange={(value) => {
                    if (isChartRange(value)) setRange(value);
                  }}
                >
                  <TabsList className="bg-slate-800">
                    {(['6M', '1Y', '2Y', 'ALL'] as const).map((item) => (
                      <TabsTrigger
                        key={item}
                        value={item}
                        className="px-2.5 text-xs"
                      >
                        {item}
                      </TabsTrigger>
                    ))}
                  </TabsList>
                </Tabs>
              </div>
            </div>
            <TrendChart
              candles={selectedSnapshot.candles}
              result={selectedSnapshot.result}
              signals={selectedSnapshot.result.signals}
              range={range}
            />
          </section>
        )}
        <section className="mt-8" aria-labelledby="strategy-statistics-title">
          <div className="mb-5">
            <h2 id="strategy-statistics-title" className="text-xl font-semibold text-slate-100">
              Strategy statistics
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Historical ON → OFF trends, measured using signal confirmation closes.
            </p>
          </div>
          <div className="grid gap-5 md:grid-cols-2">
            {(['BTC-USD', 'ETH-USD'] as const).map((asset) => (
              <StrategyStatisticsCard
                key={asset}
                asset={asset}
                statistics={statisticsByAsset.get(asset) ?? calculateStrategyStatistics([])}
              />
            ))}
          </div>
          <p className="mt-4 text-sm text-slate-500">
            Crypto Trend v1 may produce frequent losing trends during sideways markets. The strategy is designed to participate in sustained trends, so win rate alone does not describe its historical behavior.
          </p>
        </section>
        <section className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(300px,0.8fr)]">
          <div className="rounded-xl border border-slate-800 bg-slate-900/75 p-4 sm:p-6">
            <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-xl font-semibold">Signal history</h2>
                <p className="mt-1 text-sm text-slate-500">
                  Reconstructed from Coinbase daily candles.
                </p>
              </div>
              <Tabs
                value={filter}
                onValueChange={(value) => {
                  if (isHistoryFilter(value)) {
                    setFilter(value);
                    setShowAll(false);
                  }
                }}
              >
                <TabsList className="bg-slate-800">
                  <TabsTrigger value="All" className="px-2.5 text-xs">
                    All
                  </TabsTrigger>
                  <TabsTrigger value="BTC-USD" className="px-2.5 text-xs">
                    BTC
                  </TabsTrigger>
                  <TabsTrigger value="ETH-USD" className="px-2.5 text-xs">
                    ETH
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
            <Table className="min-w-[610px] text-left text-sm">
              <thead className="border-b border-slate-800 text-xs uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="pb-3 font-medium">Asset</th>
                  <th className="pb-3 font-medium">Signal</th>
                  <th className="pb-3 font-medium">Date</th>
                  <th className="pb-3 font-medium">Close</th>
                  <th className="pb-3 font-medium">SMA150</th>
                  <th className="pb-3 text-right font-medium">Signal Return</th>
                </tr>
              </thead>
              <tbody>
                {(showAll ? filteredSignals : filteredSignals.slice(0, 10)).map(
                  (signal) => (
                    <tr
                      key={signal.id}
                      onClick={() => setSelectedId(signal.id)}
                      className={`cursor-pointer border-b border-slate-800/70 transition hover:bg-slate-800/60 ${selectedId === signal.id ? 'bg-slate-800/50' : ''}`}
                    >
                      <td className="py-3 font-medium text-slate-200">
                        {signal.asset.replace('-USD', '')}
                      </td>
                      <td
                        className={`py-3 font-medium ${signal.state === 'ON' ? 'text-emerald-300' : 'text-rose-300'}`}
                      >
                        {signal.state === 'ON' ? (
                          <ArrowUpRight className="mr-1 inline size-4" />
                        ) : (
                          <ArrowDownRight className="mr-1 inline size-4" />
                        )}
                        {signal.state}
                      </td>
                      <td className="py-3 text-slate-400">
                        {date.format(signal.timestamp)}
                      </td>
                      <td className="py-3 text-slate-300">
                        {usd.format(signal.close)}
                      </td>
                      <td className="py-3 text-slate-300">
                        {usd.format(signal.sma150)}
                      </td>
                      <td
                        className={`py-3 text-right ${completedTrendByExitId.get(signal.id) ? completedTrendByExitId.get(signal.id)!.signalReturn >= 0 ? 'text-emerald-300' : 'text-rose-300' : 'text-slate-500'}`}
                      >
                        {formatReturn(
                          completedTrendByExitId.get(signal.id)?.signalReturn ?? null,
                        )}
                      </td>
                    </tr>
                  ),
                )}
              </tbody>
            </Table>
            {filteredSignals.length === 0 && (
              <p className="py-10 text-center text-sm text-slate-500">
                No reconstructed signals in this filter.
              </p>
            )}
            {filteredSignals.length > 10 && (
              <button
                onClick={() => setShowAll((shown) => !shown)}
                className="mt-5 flex items-center gap-1 text-sm font-medium text-indigo-300 hover:text-indigo-200"
              >
                {showAll ? 'Show latest 10' : 'Show all'}
                <ChevronRight className="size-4" />
              </button>
            )}
          </div>
          <aside className="rounded-xl border border-slate-800 bg-slate-900/75 p-5">
            <SignalDetails
              signal={selectedSignal}
              completedTrend={
                selectedSignal
                  ? completedTrendByExitId.get(selectedSignal.id) ?? null
                  : null
              }
            />
          </aside>
        </section>
        <footer className="mt-8 flex items-center gap-2 border-t border-slate-800 pt-5 text-xs text-slate-500">
          <CalendarDays className="size-4" /> Strategy values are confirmed
          through the most recently completed 00:00 UTC candle.
        </footer>
      </div>
    </main>
  );
}
