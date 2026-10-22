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
