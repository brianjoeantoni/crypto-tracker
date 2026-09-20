# Crypto Tracker

Crypto Tracker is a personal BTC and ETH trend-following research dashboard.
It reconstructs the **Crypto Trend v1** state from Coinbase Exchange daily
candles, displays the historical signal record and signal-close statistics, and
can notify a Telegram chat when a newly completed daily candle changes state.

It is a tracker and research tool. It does **not** connect to an exchange,
place orders, manage a portfolio, use leverage, or provide financial advice.

## What the application does

- Tracks `BTC-USD` and `ETH-USD` independently.
- Fetches all available contiguous daily Coinbase Exchange candle history for
  each supported asset.
- Calculates the current Crypto Trend v1 state and a complete, auditable signal
  history from the same shared strategy engine.
- Shows current state cards, a candlestick/SMA150 chart, confirmation details,
  and per-asset historical signal statistics.
- Provides client-side BTC/ETH, timeframe, and signal-history filters. The
  chart filters already-loaded history; changing a chart selection does not
  fetch a different market-data payload.
- Supports light and dark themes. Dark is the default theme.
- Runs a daily GitHub Actions check and can send Telegram messages for newly
  confirmed state transitions or data-validation failures.

## Crypto Trend v1 (current frozen strategy)

The only live strategy engine is [`lib/crypto-trend.ts`](lib/crypto-trend.ts).
The following rules are the current Crypto Trend v1 definition:

1. Calculate a simple moving average of the last **150 completed daily closes**
   (SMA150).
2. Classify each eligible close against its own SMA150 without rounding:
   - `ABOVE` when close > SMA150
   - `BELOW` when close < SMA150
   - `NEUTRAL` when close = SMA150
3. Change to **ON** only after **three consecutive completed UTC daily closes
   above their SMA150 values**.
4. Change to **OFF** only after **three consecutive completed UTC daily closes
   below their SMA150 values**.
5. A neutral close, or a close on the other side of the SMA, resets the
   relevant consecutive count. Once ON or OFF, repeated qualifying closes do
   not create duplicate signals.
6. BTC and ETH have independent candle histories, SMA values, state, and
   signal events.

The intended interpretation is **long/cash only**: ON represents the
asset-specific long sleeve being invested, and OFF represents cash. There is no
leverage in the strategy definition.

### Completed candles and initial state

Coinbase timestamps identify the start of a daily UTC bucket. A candle is used
only when `bucket start + 86,400,000 ms <= current time`; in practice, the
current forming UTC day is excluded and the latest usable candle is the one
that completed at the most recent 00:00 UTC boundary.

The engine needs at least 150 valid daily candles before SMA150 exists. It
starts in `WAITING`. The first three-close direction establishes ON or OFF and
is retained in history as a `WAITING -> ON` or `WAITING -> OFF` event so the
record is auditable. It is **not** a notification-worthy transition. Only a
later ON <-> OFF transition that occurs on the latest completed candle is a new
signal for the notification runner.

### Signal generation is not trade execution

A signal is a deterministic state transition derived from historical candle
data. It is not an order, recommendation, broker instruction, or guarantee of
return. The application has no exchange credentials, order-routing code,
portfolio/account state, position sizing, slippage, fees, tax treatment, or
execution tracking. Telegram's `INVESTED` and `CASH` wording is a label for the
strategy state only.

## Market data

The only market-data source is the public Coinbase Exchange candles endpoint:

```text
GET https://api.exchange.coinbase.com/products/{BTC-USD|ETH-USD}/candles
    ?granularity=86400&start={ISO-8601}&end={ISO-8601}
```

[`lib/coinbase.ts`](lib/coinbase.ts) requests history in 299-day windows. This
stays below Coinbase's 300-candle response limit when the inclusive date range
is considered. It normalizes the API's candle tuples, sorts them oldest first,
removes the forming bucket, then fails closed if data is malformed, non-finite,
misaligned with a UTC day, duplicate, unordered, gapped, or too short for
SMA150.

The configured historical starts are:

| Asset | Coinbase product | Start used by the adapter |
| --- | --- | --- |
| Bitcoin | `BTC-USD` | 2015-01-01 UTC |
| Ether | `ETH-USD` | 2016-05-23 UTC |

ETH begins on 23 May 2016 because Coinbase's launch-era history has a known
discontinuity before that date; this preserves the adapter's contiguous-history
validation. Each Coinbase window has a 15-second default timeout and up to
three attempts. HTTP 400, 429, and 5xx responses are retried because valid
Coinbase windows can intermittently return a bad-gateway-style 400 response.
The adapter also sends an `Accept` header and a `User-Agent`, which is required
for the Cloudflare Worker request path.

## Dashboard behavior

The browser loads the dashboard through one request to `GET /api/market-data`.
This makes the request visible in the browser Network tab while keeping the
Coinbase calls server-side. The endpoint:

- loads BTC and ETH one product at a time to avoid a burst of paginated
  Coinbase requests;
- returns successful assets alongside a per-asset failure list;
- coalesces simultaneous loads; and
- keeps a successful two-asset response in an in-process cache for five
  minutes. Its HTTP response is marked `Cache-Control: no-store`.

The client retries the dashboard endpoint up to three times (with 500 ms and
1,000 ms waits before the later attempts). A partial data failure is shown in
the dashboard rather than silently replaced with stale or invented values.

The chart uses Lightweight Charts and renders candles, SMA150, and ON/OFF
markers from the already-loaded data. Its `6M`, `1Y`, `2Y`, and `ALL` controls
are display filters, not additional API requests. `ALL` is the contiguous
history returned by Coinbase through the adapter's configured start date.

## Signal history and statistics

Every stored signal includes its asset, state, previous state, confirmation
date, close, SMA150, distance from SMA150, and the exact three confirmation
candles. Selecting a history row shows this audit detail.

[`lib/trend-statistics.ts`](lib/trend-statistics.ts) pairs a valid ON event
with the next valid OFF event **for the same asset**. A completed trend's
signal return is:

```text
OFF confirmation close / ON confirmation close - 1
```

The dashboard reports completed trends, winning/losing trends, win rate,
average winner/loser, and best/worst signal return separately for BTC and ETH.
An open ON trend is deliberately excluded from completed-trend statistics.
These are signal-close measurements only; they are not backtested execution
results and do not include fees, spread, slippage, funding, tax, or position
sizing.

## Architecture

```text
Browser
  DashboardLoader
    -> GET /api/market-data
         -> Coinbase adapter (paginated daily candles)
              -> shared calculateCryptoTrend() engine
                   -> snapshots, signals, chart data, statistics

GitHub Actions / local check script
  scripts/check-signals.ts
    -> runSignalCheck()
         -> same Coinbase adapter + same strategy engine
         -> Telegram notifier when appropriate
```

The strategy implementation is shared rather than duplicated between the
dashboard and scheduled check. Both routes reconstruct state from daily candle
history; no database or persistent strategy-state store is used.

### Project structure

| Path | Responsibility |
| --- | --- |
| [`app/page.tsx`](app/page.tsx) | Home route; renders the client data loader. |
| [`app/api/market-data/route.ts`](app/api/market-data/route.ts) | Server endpoint, partial-failure handling, request coalescing, and five-minute module cache. |
| [`components/dashboard-loader.tsx`](components/dashboard-loader.tsx) | Browser request/retry state for `/api/market-data`. |
| [`components/dashboard.tsx`](components/dashboard.tsx) | Dashboard cards, independent chart/history filters, signal details, and statistics UI. |
| [`components/trend-chart.tsx`](components/trend-chart.tsx) | Client-only Lightweight Charts candlestick, SMA, marker, hover, and resize behavior. |
| [`components/navbar.tsx`](components/navbar.tsx) | Dashboard navigation/header and theme control. |
| [`components/theme-provider.tsx`](components/theme-provider.tsx) and [`components/theme-toggle.tsx`](components/theme-toggle.tsx) | `next-themes` integration and user theme toggle. |
| [`lib/types.ts`](lib/types.ts) | Shared assets, candle, trend, signal, and snapshot types. |
| [`lib/crypto-trend.ts`](lib/crypto-trend.ts) | Pure validation and Crypto Trend v1 calculation engine. |
| [`lib/coinbase.ts`](lib/coinbase.ts) | Coinbase paging, normalization, completion filtering, retry, and fail-closed validation. |
| [`lib/trend-statistics.ts`](lib/trend-statistics.ts) | Pure ON-to-OFF pairing and strategy statistics. |
| [`lib/signal-check.ts`](lib/signal-check.ts) | Reusable daily-check and notification decision logic. |
| [`lib/telegram.ts`](lib/telegram.ts) | Telegram message formatting and Bot API notifier. |
| [`scripts/check-signals.ts`](scripts/check-signals.ts) | Command-line entry point for normal checks and Telegram test messages. |
| [`tests/`](tests) | Vitest coverage for engine, Coinbase adapter, notifications, and statistics. |
| [`.github/workflows/crypto-trend.yml`](.github/workflows/crypto-trend.yml) | Scheduled/manual GitHub Actions workflow. |
| [`docs/tradingview-validation.md`](docs/tradingview-validation.md) | Manual Coinbase/TradingView parity checklist. |
| [`wrangler.jsonc`](wrangler.jsonc) | Cloudflare Worker configuration. |

`components/ui/` contains the local shadcn/Base UI component set used by the
interface. The dashboard directly uses its card, tabs, table, and button
primitives.

## Tech stack

- TypeScript, React 19, and Vinext
- Vite 8 and Cloudflare Workers tooling (Wrangler)
- Tailwind CSS 4, shadcn/Base UI, Lucide icons, and `next-themes`
- Lightweight Charts for the candlestick chart
- Vitest for unit tests
- Oxlint and Oxfmt for linting and formatting

## Local development

### Prerequisites

- Node.js **22.13.0 or newer** (enforced by `package.json`)
- npm (the repository includes `package-lock.json`)

### Install and run

```bash
npm ci
npm run dev
```

Vinext prints the local URL when it starts (normally `http://localhost:3000`).
The dashboard uses Coinbase's public candles API and needs no API key. If the
page reports market-data failures, inspect the request to `/api/market-data` in
the browser Network tab and the terminal running Vinext; the detailed Coinbase
requests are made by the server route, not directly by the browser.

### Production-like local Worker

Build first, then start Wrangler against the generated server configuration:

```bash
npm run build
npm run start
```

## Environment variables

The dashboard and public Coinbase data adapter require no application
environment variables.

The signal-check script requires these variables only when it needs to create a
Telegram notifier:

| Variable | Purpose |
| --- | --- |
| `TELEGRAM_BOT_TOKEN` | Telegram Bot API token. |
| `TELEGRAM_CHAT_ID` | Destination private chat or group chat ID. |

For a temporary PowerShell session:

```powershell
$env:TELEGRAM_BOT_TOKEN = '...'
$env:TELEGRAM_CHAT_ID = '...'
npm run check-signals -- --mode=test
```

Do not commit either value. `.env*` files are ignored, but the command-line
script reads `process.env` directly; it does not load a `.env` file itself.
For GitHub Actions, configure both values as repository secrets named exactly
`TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID`.

## Available npm scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start Vinext development server. |
| `npm run build` | Create the Vinext production build. |
| `npm run start` | Serve the generated Worker locally through Wrangler; run `build` first. |
| `npm run lint` | Run Oxlint over the configured app, library, script, test, and dashboard/chart files. |
| `npm run format` | Run Oxfmt. |
| `npm run typecheck` | Run strict TypeScript checking without emitting files. |
| `npm test` | Run the Vitest suite once. |
| `npm run test:watch` | Run Vitest in watch mode. |
| `npm run check-signals` | Run the normal BTC/ETH signal check; it may notify Telegram for a new transition or data failure. |
| `npm run check-signals -- --mode=test` | Send only the unmistakable Telegram test message; it does not fetch market data or generate a signal. |
| `npm run deploy:cloudflare` | Run `vinext-cloudflare deploy`. |
| `npm run dev:vinext` | Start Vinext on port 3001. |
| `npm run build:vinext` | Alias for the Vinext production build. |
| `npm run start:vinext` | Alias for Wrangler local Worker serving. |
| `npm run deploy:vinext` | Deploy with the generated `dist/server/wrangler.json` configuration. |

## Testing and quality checks

The test suite uses injected fetch/notifier dependencies so it does not need
network access or Telegram credentials. It covers:

- SMA data availability, equality/neutral handling, three-close confirmation,
  state persistence, duplicate prevention, precision, and candle validation;
- Coinbase normalization, ordering, incomplete current-bucket exclusion,
  malformed data, duplicate timestamps, gaps, and HTTP failures;
- notification suppression for the initial `WAITING` event, latest-candle
  transitions, data-failure warnings, and test-message formatting; and
- same-asset ON-to-OFF pairing and safe strategy-statistics calculations.

Before deployment, the relevant repository checks are:

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

## Cloudflare deployment

Cloudflare Worker configuration lives in [`wrangler.jsonc`](wrangler.jsonc):

- Worker name: `crypto-tracker`
- Compatibility date: `2026-05-22`
- Compatibility flag: `nodejs_compat`
- Server entry: `vinext/server/fetch-handler`
- Static assets: `dist/client` bound as `ASSETS`
- Worker cache: enabled

There is no account ID, route, custom domain, Cloudflare secret, D1 binding, or
R2 binding committed to this repository. Authenticate/configure Cloudflare for
the intended account before running a deployment command. The committed setup
does not document a production URL or a custom domain.

## GitHub Actions and Telegram notifications

The workflow at [`.github/workflows/crypto-trend.yml`](.github/workflows/crypto-trend.yml)
is named **Crypto Trend v1 daily check**. It runs:

- on the cron schedule `5 0 * * *` (00:05 UTC every day); and
- manually through **Run workflow**, with one of two modes:
  - `check` — normal daily BTC/ETH check;
  - `telegram-test` — sends only the explicit test message.

The workflow uses Ubuntu, Node 22, `npm ci`, and the two Telegram repository
secrets. A normal check rebuilds both states from Coinbase candles. It sends a
Telegram signal message only when the latest completed candle contains an
actionable ON <-> OFF event. No message on a successful normal run means no new
actionable transition was confirmed. If either asset's data cannot be fetched
and validated, it attempts to send a non-secret operational warning and then
fails the job.

## Design decisions and limitations

- **No persistence:** all state and history are reconstructed from Coinbase
  candles. The dashboard's five-minute cache is module-local and should not be
  treated as durable cache across Worker instances or deployments.
- **Fail closed:** malformed or discontinuous data produces an unavailable/
  failed result instead of a potentially incorrect signal.
- **No live price:** values represent the latest completed daily candle, not an
  intraday quote.
- **Full-history loading:** each uncached dashboard load retrieves all adapter
  history for both assets. Timeframe tabs filter that loaded data locally; there
  is no lazy pagination while chart-panning.
- **Only two Coinbase USD products:** BTC-USD and ETH-USD are the configured
  strategy assets.
- **No backtest execution model:** displayed signal returns are close-to-close
  measures, not a simulation of tradable performance.
- **No exchange integration:** receiving a Telegram message does not perform a
  trade.

## Validation and research use

Use [`docs/tradingview-validation.md`](docs/tradingview-validation.md) to
compare reconstructed events with `COINBASE:BTCUSD` and `COINBASE:ETHUSD` on a
1D chart using SMA150. The checklist calls for at least three ON and three OFF
events per asset; its table is a starting template and should be expanded with
the actual checks performed before relying on scheduled notifications.

## Disclaimer

This is a personal research and tracking tool, not financial, investment,
trading, legal, or tax advice. Crypto assets are volatile and losses can exceed
expectations. Verify data and strategy behavior independently before making any
financial decision.
