# TradingView parity checklist

Before enabling the scheduled workflow, compare at least three ON and three OFF events for each asset against `COINBASE:BTCUSD` and `COINBASE:ETHUSD` on the 1D chart with SMA150.

Record the signal date (third confirmation close), state, close, SMA150, and the three classifications below. Do not enable notifications if any value differs; investigate the candle source, UTC boundary, data gaps, SMA initialization, or incomplete-candle handling first.

| Asset | Direction | Signal date | Coinbase close | Coinbase SMA150 | TradingView match | Checked by |
| --- | --- | --- | --- | --- | --- | --- |
| BTC | ON |  |  |  |  |  |
| BTC | OFF |  |  |  |  |  |
| ETH | ON |  |  |  |  |  |
| ETH | OFF |  |  |  |  |  |
