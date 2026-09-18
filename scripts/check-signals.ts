import { runSignalCheck } from "@/lib/signal-check";
import { createTelegramNotifier, TEST_MESSAGE } from "@/lib/telegram";

const mode = process.argv.includes("--mode=test") ? "test" : "check";
const notifier = createTelegramNotifier({
  botToken: process.env.TELEGRAM_BOT_TOKEN ?? "",
  chatId: process.env.TELEGRAM_CHAT_ID ?? "",
});

async function main() {
  if (mode === "test") {
    await notifier.send(TEST_MESSAGE);
    console.log("Telegram test message sent successfully.");
    return;
  }
  const result = await runSignalCheck(notifier);
  for (const snapshot of result.snapshots) {
    const { result: trend } = snapshot;
    console.log(`${snapshot.asset} | state=${trend.currentState} | completed=${trend.latestCompletedCandle ? new Date(trend.latestCompletedCandle.timestamp).toISOString().slice(0, 10) : "none"} | new-signal=${trend.latestSignal && trend.latestSignal.timestamp === trend.latestCompletedCandle?.timestamp && trend.latestSignal.previousState !== "WAITING" ? trend.latestSignal.state : "NO"}`);
  }
  console.log("Crypto Trend v1 check completed successfully.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Signal check failed.");
  process.exitCode = 1;
});
