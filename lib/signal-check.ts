import { fetchAssetSnapshot, type CoinbaseOptions } from "@/lib/coinbase";
import { formatFailureMessage, formatSignalMessage, type TelegramNotifier } from "@/lib/telegram";
import { STRATEGY_ASSETS, type AssetFailure, type AssetSnapshot, type SignalEvent } from "@/lib/types";

export interface SignalCheckResult {
  snapshots: AssetSnapshot[];
  newSignals: SignalEvent[];
}

export async function runSignalCheck(
  notifier: TelegramNotifier,
  options: CoinbaseOptions = {},
): Promise<SignalCheckResult> {
  const settled = await Promise.allSettled(STRATEGY_ASSETS.map((asset) => fetchAssetSnapshot(asset, options)));
  const snapshots: AssetSnapshot[] = [];
  const failures: AssetFailure[] = [];

  settled.forEach((item, index) => {
    const asset = STRATEGY_ASSETS[index];
    if (item.status === "fulfilled") snapshots.push(item.value);
    else failures.push({ asset, message: item.reason instanceof Error ? item.reason.message : "Unknown data error" });
  });

  if (failures.length) {
    await notifier.send(formatFailureMessage(failures));
    throw new Error(`Crypto Trend v1 check failed: ${failures.map((failure) => failure.asset).join(", ")}`);
  }

  const newSignals = snapshots.flatMap((snapshot) => {
    const latest = snapshot.result.latestSignal;
    return latest && latest.timestamp === snapshot.result.latestCompletedCandle?.timestamp && latest.previousState !== "WAITING" ? [latest] : [];
  });
  for (const signal of newSignals) await notifier.send(formatSignalMessage(signal));
  return { snapshots, newSignals };
}
