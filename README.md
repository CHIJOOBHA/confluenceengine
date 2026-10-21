# Confluence Engine

A rule-based research and paper-trading engine for Indian and US markets.
It trades only rules that were tested on real prices and survived, runs on
real market data, and keeps every call and trade so results can be checked.
Claude (Anthropic) writes a plain-language brief from the engine's numbers.
Live orders through Dhan are possible but off by default and behind several
safety gates.

## What the brain does

Every few minutes (or on a cron ping) the server:

1. Downloads real prices (Yahoo Finance: 5 years of daily bars and recent
   5-minute bars) for 22 instruments: Nifty, Sensex, Bank Nifty; Reliance,
   HDFC Bank, ICICI Bank, Infosys, TCS; S&P 500; Apple, Microsoft, Nvidia,
   Amazon, JPMorgan; gold, silver (SLV), US oil; BTC, ETH, SOL, BNB, XRP.
2. Makes calls with odds: the night before, "does yesterday's high / low
   break?"; at the open, "does the gap fill?" and "does it close above
   yesterday's close?". Odds come from walk-forward distance tables built
   only from earlier days. A call is made only at 60% or more either way.
3. Opens, manages and settles paper trades on 5-minute bars for these rules:

| Rule | What it does | Active in |
|---|---|---|
| GAPFADE | Open more than 0.5 ADR from yesterday's close: trade back toward it; target yesterday's close; exit at the close | Indian indices, US stocks |
| XFADE | Yesterday closed in its top or bottom 10%: trade against it at the open; exit at the close. Skipped on quiet markets, after a small day, on Fridays and Sundays | Indian indices, Indian stocks, crypto |
| BIGGAP | Gap above 0.75 ADR in the direction of the 50-day trend, market not quiet: fade it; exit at the close | US stocks |
| GAPFADE30 | GAPFADE entered 30 minutes after the open (timing test) | shadow only |

   Every trade has a 1 ADR safety stop. Outside its active markets a rule
   runs as a **shadow** trade: logged and counted separately, never sent to a
   broker. On days without a signal the engine does nothing.
4. Scores each call when its session ends.
5. Optionally asks Claude for a brief (around 8:30 am and 3:40 pm IST).

ADR = the 10-day average daily range. The research behind each rule (5 years,
costs included, chosen on 2021-24 and judged on 2024-26) and the rules that
failed are in the Market Prediction Ledger. `scripts/parity-check.ts` checks
this TypeScript brain against the Python research engine on the same data.

### What was removed and why
- **Gemini agents**: they were asked to analyse FII/DII data, GIFT Nifty, OI
  and news but were given no data, so their answers were invented. Removed.
- **30-minute opening-range breakout**: tested on 790 real trades over 60
  sessions it won 51% and lost slightly after costs. Removed.
- **Hard-coded opening candle**: the old server used fixed prices
  (22,150 / 21,950) every day. Replaced by real data.
- **"Teach agent" lessons**: saved text only; nothing learned from it. The
  ledger's live hit rates are the learning loop now.

## Running it

```bash
npm install
cp .env.example .env   # fill in what you need
npm run dev            # http://localhost:3000
```

The brain runs 5 seconds after start and then every `RUN_EVERY_MIN` minutes.
Data is stored in Firestore through the Firebase Admin SDK; set
`BRAIN_STORE=file` to keep it in `data/brain-state.json` instead.

**Hosting.** On an always-on host (Railway, Render, a VPS) the built-in timer
runs the brain. On Vercel the server is serverless, so `vercel.json` calls
`/api/cron` with `CRON_SECRET` after the Indian open, after the Indian close
and after the US close (check your Vercel plan's cron limits). Paper results
are the same either way, because trades are settled from the 5-minute bars
afterwards. Live orders need an always-on host, because they must be sent
within 10 minutes of the open.

## Claude briefs
Set `ANTHROPIC_API_KEY` (server only). `CLAUDE_MODEL` defaults to
`claude-sonnet-5-5`. Claude only explains the engine's numbers; it never
decides trades, and it is told not to give buy or sell advice.

## Live trading (Dhan), off by default
Orders are sent only when **all** of these hold:
1. `LIVE_TRADING_ENABLED=true` and Dhan keys are set on the **server**
   (Dhan also requires a whitelisted static IP for orders).
2. You press **Go live** in the dashboard, and the kill switch is off.
3. The trade is an **active** trade in an Indian index or stock, entered
   within the last 10 minutes.
4. Today's live trades are below `MAX_LIVE_TRADES_PER_DAY` (default 1) and
   today's loss is below `DAILY_LOSS_LIMIT_INR` (default Rs 4,000).

Size is set so the 1 ADR safety stop loses about `RISK_PER_TRADE_INR`
(default Rs 2,000). Instrument ids and lot sizes come from Dhan's instrument
list each day. With the default risk, one index futures lot is usually too
large (a Nifty lot at a 1 ADR stop risks far more than Rs 2,000), so index
trades stay paper unless you raise the limit; stocks can be sized. Each live
entry gets a stop-loss order at the broker; the exit is a market order when
the paper trade closes. Keep paper trading until each rule has about 40
closed trades and still makes money.

## Security
- Every API route except `/api/health` requires the owner's Firebase login
  (`ADMIN_EMAIL`); `/api/cron` requires `CRON_SECRET`.
- Broker and Claude keys live only in server environment variables. Nothing
  secret is bundled into the website, and Firestore rules block the browser
  from writing anything.
- Kill switch: stops live orders at once (paper tracking continues).

Paper trading is research. Results are small samples so far. Nothing here is
investment advice.
