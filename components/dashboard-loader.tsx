'use client';

import { useCallback, useEffect, useState } from 'react';
import { Dashboard } from '@/components/dashboard';
import { fetchAssetSnapshot } from '@/lib/coinbase';
import {
  STRATEGY_ASSETS,
  type AssetFailure,
  type AssetSnapshot,
} from '@/lib/types';

interface MarketDataResponse {
  snapshots: AssetSnapshot[];
  failures: AssetFailure[];
  fetchedAt: number;
}

async function loadBrowserMarketData(): Promise<MarketDataResponse> {
  const settled = await Promise.allSettled(
    STRATEGY_ASSETS.map((asset) => fetchAssetSnapshot(asset)),
  );
  const snapshots: AssetSnapshot[] = [];
  const failures: AssetFailure[] = [];

  settled.forEach((item, index) => {
    const asset = STRATEGY_ASSETS[index];
    if (item.status === 'fulfilled') snapshots.push(item.value);
    else {
      failures.push({
        asset,
        message:
          item.reason instanceof Error
            ? item.reason.message
            : 'Unknown Coinbase data error.',
      });
    }
  });

  return { snapshots, failures, fetchedAt: Date.now() };
}

export function DashboardLoader() {
  const [data, setData] = useState<MarketDataResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const nextData = await loadBrowserMarketData();
        if (nextData.snapshots.length > 0 || attempt === 2) {
          setData(nextData);
          return;
        }
        throw new Error(
          nextData.failures
            .map((failure) => `${failure.asset}: ${failure.message}`)
            .join(' '),
        );
      } catch (requestError) {
        if (attempt === 2) {
          setError(requestError instanceof Error ? requestError.message : 'Unable to load market data.');
          return;
        }
        await new Promise<void>((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
      }
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (!data) {
    return (
      <main className="min-h-screen bg-background px-4 py-7 text-foreground sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl rounded-xl border border-border bg-card p-6">
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">Crypto Tracker</h1>
          <p className="mt-3 text-base text-muted-foreground">
            {error ?? 'Loading completed daily candles from Coinbase…'}
          </p>
          {error && (
            <button
              type="button"
              onClick={() => void load()}
              className="mt-5 rounded-md bg-indigo-500 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-400"
            >
              Retry market data
            </button>
          )}
        </div>
      </main>
    );
  }

  return <Dashboard {...data} />;
}
