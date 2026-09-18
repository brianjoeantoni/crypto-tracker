import { Dashboard } from "@/components/dashboard";
import { fetchAssetSnapshot } from "@/lib/coinbase";
import { STRATEGY_ASSETS, type AssetFailure, type AssetSnapshot } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function Home() {
  const settled = await Promise.allSettled(STRATEGY_ASSETS.map((asset) => fetchAssetSnapshot(asset)));
  const snapshots: AssetSnapshot[] = [];
  const failures: AssetFailure[] = [];
  settled.forEach((item, index) => {
    const asset = STRATEGY_ASSETS[index];
    if (item.status === "fulfilled") snapshots.push(item.value);
    else failures.push({ asset, message: item.reason instanceof Error ? item.reason.message : "Unknown data error" });
  });
  return <Dashboard snapshots={snapshots} failures={failures} fetchedAt={snapshots[0]?.fetchedAt ?? 0} />;
}
