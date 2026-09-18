import { describe, expect, it } from "vitest";
import { runSignalCheck } from "@/lib/signal-check";
import { formatSignalMessage, TEST_MESSAGE, type TelegramNotifier } from "@/lib/telegram";
import type { SignalEvent } from "@/lib/types";

const START = Date.UTC(2020, 0, 1);
const NOW = START + 156 * 86_400_000 + 3_600_000;
function rows(closes: number[]) { return closes.map((close, index) => [String((START + index * 86_400_000) / 1000), String(close - 1), String(close + 1), String(close), String(close), "2"]); }
function notifier(messages: string[]): TelegramNotifier { return { send: async (message) => { messages.push(message); } }; }

describe("signal checking and Telegram messages", () => {
  it("sends no notification for a WAITING-to-ON initial historical event", async () => {
    const messages: string[] = [];
    await runSignalCheck(notifier(messages), { fetchFn: async () => new Response(JSON.stringify(rows([...Array(150).fill(100), 110, 111, 112, 113]))), now: NOW, startTimestamp: START });
    expect(messages).toEqual([]);
  });
  it("notifies only for transitions on the latest completed candle", async () => {
    const messages: string[] = [];
    await runSignalCheck(notifier(messages), { fetchFn: async () => new Response(JSON.stringify(rows([...Array(150).fill(100), 110, 111, 112, 90, 89, 88, 87]))), now: NOW, startTimestamp: START });
    expect(messages).toHaveLength(2);
    expect(messages.every((message) => message.includes("TREND OFF"))).toBe(true);
  });
  it("sends a failure notification and rejects when one asset cannot be validated", async () => {
    const messages: string[] = [];
    await expect(runSignalCheck(notifier(messages), { fetchFn: async (input) => { const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url; const btc = url.includes("BTC-USD"); return new Response(JSON.stringify(btc ? {} : rows(Array(154).fill(100))), { status: btc ? 500 : 200 }); }, now: NOW, startTimestamp: START })).rejects.toThrow("BTC-USD");
    expect(messages[0]).toContain("CHECK FAILED");
  });
  it("formats recognizably distinct test and signal messages", () => {
    const signal: SignalEvent = { id: "BTC-USD:ON:2020-01-01", asset: "BTC-USD", state: "ON", timestamp: START, close: 100, sma150: 90, distancePct: 11.111, previousState: "OFF", confirmationCandles: [{ timestamp: START - 2 * 86_400_000, close: 95, sma150: 90, position: "ABOVE" }, { timestamp: START - 86_400_000, close: 97, sma150: 90, position: "ABOVE" }, { timestamp: START, close: 100, sma150: 90, position: "ABOVE" }] };
    expect(formatSignalMessage(signal)).toContain("TREND ON");
    expect(TEST_MESSAGE).toContain("This is a test message");
  });
});
