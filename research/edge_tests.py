"""Roki research: four candidate edges, tested on real data, first half vs second half."""
import yfinance as yf, pandas as pd, numpy as np, time, warnings; warnings.filterwarnings("ignore")
def dl(s, **k):
    for _ in range(3):
        try:
            d = yf.Ticker(s).history(auto_adjust=False, **k)
            if len(d): d.index = d.index.tz_localize(None) if d.index.tz is None else d.index.tz_convert("Asia/Kolkata").tz_localize(None); return d
        except Exception as e: print("retry", s, e)
        time.sleep(2)
    raise SystemExit(f"no data {s}")
out = []
def say(*a):
    s = " ".join(str(x) for x in a); print(s); out.append(s)

N = dl("^NSEI", period="10y"); N.index = N.index.normalize()
SP = dl("^GSPC", period="10y"); SP.index = SP.index.normalize()
NK = dl("^N225", period="10y"); NK.index = NK.index.normalize()
VX = dl("^INDIAVIX", period="10y"); VX.index = VX.index.normalize()
d = N[["Open", "High", "Low", "Close"]].copy()
d["pdh"], d["pdl"], d["pdc"] = d.High.shift(1), d.Low.shift(1), d.Close.shift(1)
d["adr"] = (d.High - d.Low).rolling(10).mean().shift(1)
d["clv"] = ((d.pdc - d.pdl) / (d.pdh - d.pdl)).clip(0, 1)
d["brkH"], d["brkL"] = d.High > d.pdh, d.Low < d.pdl
d["closeUp"] = d.Close > d.pdc
d["gap"] = (d.Open - d.pdc) / d.adr
# US session that finished before India opens: the last S&P close strictly before the Indian date
sp_ret = SP.Close.pct_change()
d["us"] = [sp_ret[sp_ret.index < t].iloc[-1] if (sp_ret.index < t).any() else np.nan for t in d.index]
nk_ret = (NK.Close / NK.Close.shift(1) - 1)
d["nk"] = [nk_ret[nk_ret.index < t].iloc[-1] if (nk_ret.index < t).any() else np.nan for t in d.index]
d["vix"] = VX.Close.shift(1).reindex(d.index)
d = d.dropna(subset=["pdh", "adr", "us"])
half = d.index[len(d) // 2]
def halves(mask, col):
    a, b = d[mask & (d.index < half)], d[mask & (d.index >= half)]
    return f"{a[col].mean():.0%} (n={len(a)}) / {b[col].mean():.0%} (n={len(b)})"

say("=== 1. Overnight US move vs Nifty's day (first half / second half) ===")
for lab, m in [("US fell more than 1%", d.us < -0.01), ("US fell 0.3-1%", (d.us >= -0.01) & (d.us < -0.003)), ("US flat", d.us.abs() <= 0.003),
               ("US rose 0.3-1%", (d.us > 0.003) & (d.us <= 0.01)), ("US rose more than 1%", d.us > 0.01)]:
    say(f"  {lab:22s} high breaks {halves(m,'brkH')} | low breaks {halves(m,'brkL')} | closes above yesterday {halves(m,'closeUp')}")
say("  (base rates)          high breaks", halves(d.us == d.us, "brkH"), "| low breaks", halves(d.us == d.us, "brkL"))
# does US move add to the night-before high/low-break call beyond CLV?
d["clvb"] = pd.cut(d.clv, [-.01, .25, .75, 1.01], labels=["low close", "mid", "high close"])
say("  Same CLV, split by US move (high-break rate):")
for c in ["low close", "mid", "high close"]:
    m = d.clvb == c
    say(f"    {c:10s}: US down {d[m & (d.us < -0.003)].brkH.mean():.0%} (n={(m & (d.us < -0.003)).sum()}) | US flat {d[m & (d.us.abs() <= 0.003)].brkH.mean():.0%} | US up {d[m & (d.us > 0.003)].brkH.mean():.0%} (n={(m & (d.us > 0.003)).sum()})")

say("\n=== 3. India VIX level (previous close) vs the day ===")
d["range_adr"] = (d.High - d.Low) / d.adr
for lab, m in [("VIX < 12", d.vix < 12), ("VIX 12-15", (d.vix >= 12) & (d.vix < 15)), ("VIX 15-20", (d.vix >= 15) & (d.vix < 20)), ("VIX >= 20", d.vix >= 20)]:
    a = d[m]
    say(f"  {lab:10s} n={len(a):4d} day range {a.range_adr.mean():.2f}x normal | high breaks {a.brkH.mean():.0%} | low breaks {a.brkL.mean():.0%} | gap fills (touch yesterday's close) {((a.Low<=a.pdc)&(a.High>=a.pdc)).mean():.0%}")

say("\n=== 4. Weekly expiry days (Thursday until Aug 2025, Tuesday from Sep 2025) ===")
def expiry(t):
    wd = 1 if t >= pd.Timestamp("2025-09-01") else 3
    return t.weekday() == wd
idx = list(d.index)
d["exp"] = False
for i, t in enumerate(idx):  # expiry = the scheduled weekday, or the last session before it if that day was a holiday
    wd = 1 if t >= pd.Timestamp("2025-09-01") else 3
    nxt = idx[i + 1] if i + 1 < len(idx) else None
    if t.weekday() == wd or (t.weekday() < wd and (nxt is None or nxt.weekday() > wd or (nxt - t).days > (wd - t.weekday()))):
        d.loc[t, "exp"] = True
d["fill"] = (d.Low <= d.pdc) & (d.High >= d.pdc)
for lab, m in [("expiry days", d.exp), ("other days", ~d.exp)]:
    a = d[m]
    say(f"  {lab:12s} n={len(a):4d} range {a.range_adr.mean():.2f}x | close within 0.25 normal day of open {( (a.Close-a.Open).abs()/a.adr < .25).mean():.0%} | gap fills {a.fill.mean():.0%} | high breaks {a.brkH.mean():.0%}")
big = d.gap.abs() > 0.5
say(f"  big gaps on expiry days fill {d[big & d.exp].fill.mean():.0%} (n={(big & d.exp).sum()}) vs other days {d[big & ~d.exp].fill.mean():.0%} (n={(big & ~d.exp).sum()})")

say("\n=== 2. Intraday momentum: first hour vs last hour (Nifty, 1-hour bars, ~2 years) ===")
H = dl("^NSEI", period="730d", interval="1h")
H["date"] = H.index.date
rows = []
for dt, g in H.groupby("date"):
    if len(g) < 6: continue
    g = g.sort_index()
    prevc = None
    first = g.iloc[0].Close / g.iloc[0].Open - 1
    last_open = g[g.index.hour == 14]
    if not len(last_open): continue
    lastr = g.iloc[-1].Close / last_open.iloc[0].Open - 1
    rows.append((dt, first, lastr))
R = pd.DataFrame(rows, columns=["d", "first", "last"]).set_index("d")
h2 = R.index[len(R) // 2]
for lab, x in [("first half", R[R.index < h2]), ("second half", R[R.index >= h2])]:
    same = (np.sign(x["first"]) == np.sign(x["last"])).mean()
    big = x[x["first"].abs() > x["first"].abs().quantile(0.7)]
    say(f"  {lab}: days={len(x)} last hour same direction as first hour {same:.0%}; after big first hours {(np.sign(big['first'])==np.sign(big['last'])).mean():.0%} (n={len(big)}); corr {x['first'].corr(x['last']):.2f}")
    pnl = np.sign(x["first"]) * x["last"] - 0.0003
    say(f"     trade the last hour in the first hour's direction: {pnl.mean()*100:+.3f}% a day after costs, win {(pnl>0).mean():.0%}")
open("/home/claude/research/edge_tests.txt", "w").write("\n".join(out))
