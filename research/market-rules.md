# How each market works: Roki's reference (checked 22 Oct 2026)

Every market Roki follows is different: different money, hours, contract sizes, costs and calendars.
The code copy of this lives in `src/core/markets.ts` and `src/core/instruments.ts`. Revisit the dated items.

## Money: every result in its own currency
| Market | Currency | Paper size of one trade |
|---|---|---|
| Indian indices (Nifty, Sensex, Bank Nifty) and stocks (Reliance, HDFC Bank, ICICI Bank, Infosys, TCS) | ₹ rupees | ₹1,00,000 |
| US stocks, S&P 500, gold (COMEX), oil (NYMEX), silver (SLV fund), crypto | $ US dollars | $1,000 |

Rupees and dollars are never added together. Until 22 Oct 2026 every market was booked as ₹1 lakh; those older records are
shown from their percentage return, re-expressed on $1,000 for dollar markets.

## India (NSE / BSE)
- Hours: 9:15 am to 3:30 pm IST, Mon–Fri; pre-open 9:00–9:08. Settlement T+1.
- 2026 trading holidays (weekdays): 15 Jan, 26 Jan, 3 Mar, 26 Mar, 31 Mar, 3 Apr, 14 Apr, 1 May, 28 May, 26 Jun, 14 Sep, 2 Oct,
  20 Oct, 10 Nov, 24 Nov, 25 Dec. Muhurat session: Sun 8 Nov 2026. The 2027 list comes out in December.
- F&O lot sizes for Oct–Dec 2026 contracts: Nifty 65, Bank Nifty 30, Fin Nifty 60, Midcap Nifty 120, Nifty Next 50 25,
  Sensex 20, Bankex 30. Stocks: Reliance 500, HDFC Bank 650, ICICI Bank 700, Infosys 400, TCS 225. Revised about every six months.
  (Nifty went 75 → 65 and Bank Nifty 35 → 30 for contracts expiring after 30 Dec 2025.)
- One Nifty lot ≈ ₹16 lakh of exposure, so a ₹1 lakh index trade is a scaled record, not a fillable order.
- Expiry: Nifty weekly on Tuesday; Sensex weekly on Thursday; Bank Nifty monthly only (last Tuesday). If the day is a holiday,
  expiry moves to the previous trading day.
- STT since 1 Apr 2026 (Budget 2026): futures 0.05% on the sell side (was 0.02%); options 0.15% of premium on the sell side and
  0.15% of intrinsic value when exercised (was 0.1%/0.125%); intraday shares 0.025% on the sell side; delivery 0.1% each side.
- Other charges (discount broker): ₹20 or 0.03% a side; NSE transaction 0.00307% (cash), 0.00183% (futures), 0.03553% of premium
  (options); stamp duty 0.003% (cash, options) / 0.002% (futures) on the buy side; SEBI ₹10 a crore; 18% GST on fees.
- Round-trip cost used by Roki: index 0.07% (one futures lot), stock 0.10% (₹1 lakh intraday).
- Rules for talking about it publicly: SEBI circular of 8 May 2026 (in force 1 Jul 2026): education may not use price data of the
  preceding 30 days to discuss or name a security, and does not predict prices or recommend.

## United States (NYSE / Nasdaq)
- Hours: 9:30 am to 4:00 pm New York time. In IST: 7:00 pm–1:30 am while the US is on daylight time (until Sun 1 Nov 2026),
  8:00 pm–2:30 am from Mon 2 Nov 2026 until mid-March 2027. India has no daylight saving, so the IST times move twice a year.
- 2026 holidays: 1 Jan, 19 Jan, 16 Feb, 3 Apr, 25 May, 19 Jun, 3 Jul, 7 Sep, 26 Nov, 25 Dec. Early close 1:00 pm: 27 Nov, 24 Dec.
- 2027 holidays: 1 Jan, 18 Jan, 15 Feb, 26 Mar, 31 May, 18 Jun, 5 Jul, 6 Sep, 25 Nov, 24 Dec. Early close: 26 Nov.
- No lots: shares, often fractional. Options cover 100 shares. Settlement T+1. Prices in dollars.
- Costs: usually no commission; about one cent of spread on large stocks; SEC/FINRA fees on sells are tiny. Roki uses 0.02%.

## Gold and oil (CME Globex), silver
- Gold GC: 100 troy ounces, tick $0.10 = $10; Micro MGC 10 oz. Crude oil CL: 1,000 barrels, tick $0.01 = $10; Micro MCL 100 barrels.
- Hours: Sunday–Friday 6:00 pm to 5:00 pm New York time, one-hour daily break (2:30–3:30 am IST in US summer, 3:30–4:30 am in winter).
  A "day" for gold and oil starts the evening before. Early stop around 1:45 pm New York time on US early-close days (check CME's notice).
- Silver: Yahoo's SI=F daily bars are unreliable, so Roki follows the SLV fund on NYSE hours.
- Indian MCX gold and crude are different contracts: priced in rupees (gold per 10 grams), with the rupee's move and import duty built in.
- Costs: a few dollars a contract plus one tick; Roki uses 0.03%.

## Crypto
- 24 hours, 7 days; Roki's crypto day runs 00:00–24:00 UTC (5:30 am to 5:30 am IST). Prices in US dollars (BTC-USD).
- Any fraction of a coin. Exchange taker fees about 0.1% each way; Roki uses 0.20% round trip.
- In India: 30% tax on gains and 1% TDS on sales (taxes, not trading costs). Indian exchanges' rupee prices include the
  dollar–rupee rate and a local premium.

## What changed in Roki because of this (22 Oct 2026)
- Money per currency in the app, reviews, learning, CSV and videos; video checks block ₹ in Global and $ in India.
- Real round-trip costs (India 0.07–0.10%, crypto 0.20%). Daily replay of the counted rules over 5 years (scripts/cost-check.ts):

| Rule, market | Trades | Gross a trade | Net, old costs | Net, real costs |
|---|---|---|---|---|
| Big-gap fade, US stocks | 236 | +0.65% | +0.63% | +0.63% |
| Gap fade, Indian indices | 850 | +0.05% | +0.02% | **−0.02%** → learning-only |
| Gap fade, US stocks | 1,204 | +0.09% | +0.07% | +0.07% |
| Extreme-close fade, Indian indices | 373 | +0.13% | +0.10% | +0.06% |
| Extreme-close fade, Indian stocks | 515 | +0.25% | +0.19% | +0.15% |
| Extreme-close fade, crypto | 787 | +0.59% | +0.49% | +0.39% |

- US early closes and the 2027 US holiday list; a daily check warns 45 days before a holiday list runs out.

## Sources
- NSE lot-size revision (Nifty 65, Bank Nifty 30, effective after 30 Dec 2025): kotakneo.com/news/market-news/index-derivative-lot-size-revision-2026,
  business-standard.com (7 Oct 2025, "NSE announces reduction in derivative lot size for four key indices"); current sizes: stockmojo.in/fno-lot-size (15 Oct 2026)
- STT after Budget 2026: cleartax.in/s/securities-transaction-tax-stt; charges: zerodha.com/charges
- NSE 2026 holidays: cleartax.in/s/nse-holidays-2026
- NYSE 2026 holidays and early closes: kiplinger.com/investing/stock-market-holidays; nyse.com/trade/hours-calendars
- Expiry days: algotest.in/blog/sensex-expiry-day
- CME contract specifications: cmegroup.com (gold and crude oil contract specs)
