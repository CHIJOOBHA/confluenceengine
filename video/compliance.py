"""
ROKI COMPLIANCE CHECK - runs before any voice is made. A video that fails is not built.

Grounded in:
- SEBI circular HO/47/17/12(11)2025-MRD-POD3/I/11107/2026 (8 May 2026, in force 1 July 2026):
  a person engaged solely in education does not give advice, recommend securities or predict
  prices, and does not use price data of the preceding 30 days to discuss or display the name of
  any security. The India video therefore only discusses sessions 30+ days old, and never says
  what an Indian security will do next.
- Insider trading and manipulation: Roki only uses public exchange prices; the script never
  claims or hints at non-public information, never urges anyone to trade, never names small or
  illiquid stocks, and never promotes paid groups or tips.
- Platform rules: no guaranteed returns, no get-rich claims; disclaimer always on screen.
- Market facts (added 22 Oct 2026): each market is described in its own terms. India is booked in
  rupees (₹1 lakh a trade), every Global market (US stocks, S&P 500, gold, silver, oil, crypto) in
  US dollars ($1,000 a trade). Indian-only terms (lots, STT, expiry, SEBI) stay out of the Global
  video, and clock times in the Global video always say whose time (IST or New York).
"""
import datetime as dt
import json
import re

INDIAN = ["nifty", "sensex", "bank nifty", "reliance", "hdfc", "icici", "infosys", "infy", "tcs"]

BANNED = [  # (pattern, why)
    (r"\b(you|viewers?) (should|must|need to) (buy|sell|invest|trade)", "tells viewers to trade"),
    (r"\b(buy|sell|short) (it |this |now|today|tomorrow)", "call to action to trade"),
    (r"\btarget (price|of|is)\b", "price target"),
    (r"\bstop[- ]?loss (at|of)\b", "trade instruction for viewers"),
    (r"\bguarantee", "guarantee"), (r"\bsure[- ]?shot\b", "sure-shot claim"), (r"\brisk[- ]?free\b", "risk-free claim"),
    (r"\b(can'?t|cannot|never) lose\b", "cannot-lose claim"), (r"\bdouble your\b", "get-rich claim"), (r"\bmultibagger\b", "hype term"),
    (r"\b(tip|tips)\b", "stock tips"), (r"\binside(r)? (info|information|news|source)", "non-public information"),
    (r"\b(telegram|whatsapp|paid group|join my|premium group|signal group)\b", "promotes a paid or private group"),
    (r"\bfinancial advice\b(?! not)", "advice framing"),
]
RUPEE = re.compile(r"₹|\brs\.?\s?\d|\brupees?\b|\blakhs?\b|\bcrores?\b|\bpaise\b", re.I)
DOLLAR = re.compile(r"\$|\bdollars?\b|\bcents?\b|\busd\b", re.I)
FX_TALK = re.compile(r"dollar[- ]rupee|rupee[- ]dollar|usd ?/ ?inr|inr ?/ ?usd|exchange rate|\bthe rupee\b|\bthe dollar\b", re.I)  # the currency itself as a topic
INDIA_ONLY = [(r"\blots?\b(?! of)", "Indian F&O lot sizes"), (r"\bstt\b", "India's securities transaction tax"),
              (r"\bexpiry\b", "Indian weekly expiry"), (r"\bf&o\b", "Indian F&O")]
CLOCK = re.compile(r"\b\d{1,2}(:\d{2})?\s*(am|pm)\b", re.I)
ZONE = re.compile(r"\bIST\b|indian time|india time|new york|\bET\b|eastern|\bUTC\b", re.I)
FUTURE_PRICE = re.compile(r"\b(will|going to|should|expect(ed)? to|likely to)\b[^.]{0,40}\b(rise|fall|go up|go down|break|hit|reach|touch|close (above|below)|rally|crash|bounce)", re.I)


def check(S: dict, D: dict, today: dt.date | None = None) -> list[str]:
    today = today or dt.date.today()
    problems: list[str] = []
    texts: list[tuple[str, str]] = []
    for seg in S["segments"]:
        for ln in seg["lines"]:
            texts += [("spoken", ln["say"]), ("caption", ln["cap"])]
        for v in _strings(seg["scene"]):
            texts.append(("on screen", v))

    for where, t in texts:
        low = t.lower()
        for pat, why in BANNED:
            if re.search(pat, low):
                problems.append(f"{why} ({where}): {t}")

    problems += market_facts(S, D, texts)

    if D.get("group") == "india":
        age = (today - dt.date.fromisoformat(D["date"])).days
        if age < 30:
            problems.append(f"India video discusses {D['date']}, only {age} days ago; SEBI's rule needs 30+ days.")
        for where, t in texts:
            low = t.lower()
            if any(n in low for n in INDIAN) and FUTURE_PRICE.search(t) and not _is_past_call(t):
                problems.append(f"says what an Indian security will do ({where}): {t}")
        if not D.get("replay") and age < 30:
            problems.append("India video must be a replay of a session 30+ days old.")
    return problems


def market_facts(S: dict, D: dict, texts: list[tuple[str, str]]) -> list[str]:
    """Each video talks about its markets in their own currency and terms."""
    out: list[str] = []
    group = D.get("group")
    want = "INR" if group == "india" else "USD"
    if D.get("currency") and D["currency"] != want:
        out.append(f"data package is in {D['currency']}, but the {group} video must be in {want}.")
    for where, t in texts:
        if FX_TALK.search(t):
            continue
        if group == "global":
            if RUPEE.search(t):
                out.append(f"rupees in the Global video ({where}): {t}  -> Global markets trade in US dollars; use $ and 'dollars'.")
            if any(re.search(r"\b" + re.escape(n) + r"\b", t.lower()) for n in INDIAN):
                out.append(f"names an Indian security in the Global video ({where}): {t}  -> recent Indian data may not be discussed (SEBI 30-day rule).")
            for pat, what in INDIA_ONLY:
                if re.search(pat, t, re.I):
                    out.append(f"{what} in the Global video ({where}): {t}  -> US stocks have no lots; gold/oil are futures contracts (100 oz, 1,000 barrels); crypto trades in any fraction.")
            if CLOCK.search(t) and not ZONE.search(t):
                out.append(f"clock time without a time zone in the Global video ({where}): {t}  -> say 'IST' / 'Indian time' or 'New York time'.")
        elif group == "india":
            if DOLLAR.search(t):
                out.append(f"dollars in the India video ({where}): {t}  -> Indian markets trade in rupees; use ₹ and 'rupees'.")
    return out


def _is_past_call(t: str) -> bool:
    """'I expected Nifty to close above...' or 'I bet it would come back' describe a past call that was already scored."""
    return bool(re.search(r"\b(i (expected|bet|said|predicted|called)|my (call|prediction|rule) (was|said))\b", t, re.I))


def _strings(o):
    if isinstance(o, str):
        yield o
    elif isinstance(o, dict):
        for k, v in o.items():
            if k not in ("kind", "tone", "instrument"):
                yield from _strings(v)
    elif isinstance(o, list):
        for v in o:
            yield from _strings(v)


if __name__ == "__main__":
    import sys
    S, D = json.load(open(sys.argv[1])), json.load(open(sys.argv[2]))
    p = check(S, D)
    print("\n".join(p) if p else "compliance check passed")
