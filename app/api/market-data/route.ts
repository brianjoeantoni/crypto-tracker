import { fetchAssetSnapshot } from '@/lib/coinbase';
import {
  STRATEGY_ASSETS,
  type AssetFailure,
  type AssetSnapshot,
} from '@/lib/types';

export const dynamic = 'force-dynamic';

interface MarketDataResponse {
  snapshots: AssetSnapshot[];
  failures: AssetFailure[];
  fetchedAt: number;
}

const CACHE_TTL_MS = 5 * 60 * 1000;
const EDGE_CACHE_CONTROL = 'public, max-age=60, s-maxage=300';
let cached: MarketDataResponse | null = null;
let inFlight: Promise<MarketDataResponse> | null = null;

async function loadMarketData(): Promise<MarketDataResponse> {
  const snapshots: AssetSnapshot[] = [];
  const failures: AssetFailure[] = [];

  // One product at a time avoids bursts of paginated requests to Coinbase.
  for (const asset of STRATEGY_ASSETS) {
    try {
      snapshots.push(await fetchAssetSnapshot(asset));
    } catch (error) {
      failures.push({
        asset,
        message: error instanceof Error ? error.message : 'Unknown data error',
      });
    }
  }

  return {
    snapshots,
    failures,
    fetchedAt: snapshots[0]?.fetchedAt ?? Date.now(),
  };
}

export async function GET(): Promise<Response> {
  const now = Date.now();
  if (cached && now - cached.fetchedAt < CACHE_TTL_MS) {
    return Response.json(cached, {
      headers: { 'Cache-Control': EDGE_CACHE_CONTROL },
    });
  }

  inFlight ??= loadMarketData().finally(() => {
    inFlight = null;
  });
  const data = await inFlight;
  if (data.snapshots.length === STRATEGY_ASSETS.length) cached = data;
  return Response.json(data, {
    headers: {
      // Cache only a complete, validated two-asset snapshot. Do not cache a
      // transient Coinbase failure, so the next request can recover.
      'Cache-Control':
        data.snapshots.length === STRATEGY_ASSETS.length
          ? EDGE_CACHE_CONTROL
          : 'no-store',
    },
  });
}
