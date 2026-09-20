# TradingView parity checklist

Before enabling the scheduled workflow, compare at least three ON and three OFF events for each asset against `COINBASE:BTCUSD` and `COINBASE:ETHUSD` on the 1D chart with SMA150.

Record the signal date (third confirmation close), state, close, SMA150, and the three classifications below. Do not enable notifications if any value differs; investigate the candle source, UTC boundary, data gaps, SMA initialization, or incomplete-candle handling first.

| Asset | Direction | Signal date | Coinbase close | Coinbase SMA150 | TradingView match | Checked by |
| --- | --- | --- | --- | --- | --- | --- |
| BTC | ON | 2025-04-24 | 94,021.96 | 93,037.78 | Yes | Manual verification |
| BTC | OFF |  |  |  |  |  |
| ETH | ON |  |  |  |  |  |
| ETH | OFF |  |  |  |  |  |

## Recorded validations

### BTC ON — 2025-04-24 UTC

Manually compared against `COINBASE:BTCUSD` on the 1D timeframe with SMA150.
The third completed confirmation candle matched the app's `ON` signal.

| Date | Coinbase close | Coinbase SMA150 | Classification | TradingView match |
| --- | ---: | ---: | --- | --- |
| 2025-04-22 | 93,489.10 | 93,059.55 | ABOVE | Yes |
| 2025-04-23 | 93,740.92 | 93,030.97 | ABOVE | Yes |
| 2025-04-24 | 94,021.96 | 93,037.78 | ABOVE | Yes |
