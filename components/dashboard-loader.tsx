'use client';

import { useCallback, useEffect, useState } from 'react';
import { Dashboard } from '@/components/dashboard';
import type { AssetFailure, AssetSnapshot } from '@/lib/types';

interface MarketDataResponse {
  snapshots: AssetSnapshot[];
  failures: AssetFailure[];
  fetchedAt: number;
}

export function DashboardLoader() {
  const [data, setData] = useState<MarketDataResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const response = await fetch('/api/market-data', { cache: 'no-store' });
        if (!response.ok) throw new Error(`Dashboard data request failed with HTTP ${response.status}.`);
        const nextData = (await response.json()) as MarketDataResponse;
        setData(nextData);
        return;
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
      <main className="min-h-screen bg-[#09111f] px-4 py-7 text-slate-100 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl rounded-xl border border-slate-800 bg-slate-900/75 p-6">
          <h1 className="text-3xl font-semibold tracking-tight text-white">Crypto Tracker</h1>
          <p className="mt-3 text-base text-slate-400">
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
