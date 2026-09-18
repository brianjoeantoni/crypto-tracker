import type { AssetFailure, SignalEvent } from "@/lib/types";

export interface TelegramConfig {
  botToken: string;
  chatId: string;
}

export interface TelegramNotifier {
  send(text: string): Promise<void>;
}

export type TelegramFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const date = new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", day: "2-digit", month: "short", year: "numeric" });

export function formatSignalMessage(signal: SignalEvent): string {
  const isOn = signal.state === "ON";
  const action = isOn ? "INVESTED" : "CASH";
  return [
    `${isOn ? "🟢" : "🔴"} ${signal.asset.replace("-USD", "")} — TREND ${signal.state}`,
    "",
    `Confirmed: ${date.format(signal.timestamp)}`,
    `Close: ${usd.format(signal.close)}`,
    `SMA150: ${usd.format(signal.sma150)}`,
    `Distance: ${signal.distancePct >= 0 ? "+" : ""}${signal.distancePct.toFixed(2)}%`,
    "",
    `3 consecutive daily closes ${isOn ? "above" : "below"} SMA150.`,
    "",
    `Action: ${signal.asset.replace("-USD", "")} sleeve → ${action}`,
  ].join("\n");
}

export function formatFailureMessage(failures: AssetFailure[]): string {
  return [
    "⚠️ Crypto Tracker — CHECK FAILED",
    "",
    "Could not validate Coinbase daily data.",
    "No trading signal was generated.",
    "",
    ...failures.map((failure) => `${failure.asset.replace("-USD", "")}: ${failure.message}`),
  ].join("\n");
}

export const TEST_MESSAGE = [
  "🧪 Crypto Tracker",
  "",
  "Telegram notifications configured successfully.",
  "",
  "This is a test message.",
  "No trading action required.",
].join("\n");

export function createTelegramNotifier(config: TelegramConfig, fetchFn: TelegramFetch = fetch): TelegramNotifier {
  if (!config.botToken || !config.chatId) throw new Error("Telegram configuration is missing.");
  return {
    async send(text: string) {
      const response = await fetchFn(`https://api.telegram.org/bot${config.botToken}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: config.chatId, text, disable_web_page_preview: true }),
      });
      if (!response.ok) throw new Error(`Telegram responded with HTTP ${response.status}.`);
    },
  };
}
