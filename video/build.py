"""
ROKI DAILY - build one video's voice, timings and props from a script and the day's data package.

  python3 build.py scripts/india-2026-10-21.json data/india-2026-10-21.json <id> [voice] [speed]

1. Checks every number in every caption against the data package; stops on any mismatch.
2. Speaks each line with Kokoro (local, free) and joins them with natural pauses.
3. Times captions and scenes from the real audio, fills chart scenes with real 5-minute bars.
4. Writes public/<id>/voice.wav and props/<id>.json for Remotion.
"""
import json, re, sys, os, subprocess
import numpy as np, soundfile as sf
import audio, compliance

script_path, data_path, vid = sys.argv[1], sys.argv[2], sys.argv[3]
voice = sys.argv[4] if len(sys.argv) > 4 else "roki"
speed = float(sys.argv[5]) if len(sys.argv) > 5 else 1.06
S = json.load(open(script_path)); D = json.load(open(data_path))

# ---------------------------------------------------------------- 0. compliance
problems = compliance.check(S, D)
if problems:
    print("COMPLIANCE CHECK FAILED:"); [print("  " + p) for p in problems]; sys.exit(1)
print("compliance check passed")

# ---------------------------------------------------------------- 1. number check
def walk(o):
    if isinstance(o, dict):
        for v in o.values(): yield from walk(v)
    elif isinstance(o, list):
        for v in o: yield from walk(v)
    else: yield o
facts = set()
def add(x):
    try: x = float(x)
    except: return
    for v in (x, abs(x)):
        facts.add(round(v, 2)); facts.add(round(v)); facts.add(round(v, 1))
for v in walk(D):
    if isinstance(v, (int, float)) and not isinstance(v, bool): add(v)
    elif isinstance(v, str):
        for m in re.findall(r"\d[\d,]*\.?\d*", v): add(m.replace(",", ""))
for x in S.get("extraFacts", []): add(x)        # counts the script states (e.g. number of predictions), listed explicitly
bad = []
def screen_texts(o):
    if isinstance(o, str): yield o
    elif isinstance(o, dict):
        for k2, v2 in o.items():
            if k2 not in ("kind", "tone", "instrument", "at", "done", "need", "value", "of", "inr", "money"): yield from screen_texts(v2)
    elif isinstance(o, list):
        for v2 in o: yield from screen_texts(v2)
for seg in S["segments"]:
    for ln in seg["lines"] + [{"cap": t} for t in screen_texts(seg["scene"])]:
        for tok in re.findall(r"\d[\d,]*\.?\d*", ln["cap"]):
            t = tok.rstrip(".").replace(",", "")
            if ":" in ln["cap"] and re.search(re.escape(tok) + r"\s*(am|pm)", ln["cap"]): continue  # clock times are checked below
            v = float(t)
            if v.is_integer() and 1900 < v < 2100: continue  # years in dates
            if round(v, 2) not in facts and round(v) not in facts and round(v, 1) not in facts:
                bad.append((ln["cap"], tok))
        for tm in re.findall(r"\d{1,2}:\d{2}\s*(?:am|pm)", ln["cap"]):
            tm = tm.replace(" ", " ")
            if tm not in json.dumps(D, ensure_ascii=False): bad.append((ln["cap"], tm))
if bad:
    print("NUMBER CHECK FAILED - these do not appear in the day's data:")
    for c, t in bad: print(f"  {t!r} in: {c}")
    sys.exit(1)
for seg in S["segments"]:  # numbers placed directly in scene fields must also be facts
    sc = seg["scene"]
    nums = []
    for c in sc.get("cards", []): nums.append(c.get("money", c.get("inr")))
    for t in sc.get("tiles", []): nums += [t["value"]] + ([t["of"]] if "of" in t else [])
    for r in sc.get("rows", []): nums += [r[k] for k in ("done", "need") if k in r]
    if "total" in sc: nums.append(sc["total"].get("money", sc["total"].get("inr")))
    for v in nums:
        if round(float(v)) not in facts and round(float(v), 2) not in facts: bad.append((f"scene {sc['kind']}", str(v)))
if bad:
    print("NUMBER CHECK FAILED:"); [print(f"  {t!r} in: {c}") for c, t in bad]; sys.exit(1)
print("number check passed:", sum(len(s["lines"]) for s in S["segments"]), "lines and every on-screen number")

# ---------------------------------------------------------------- 2. voice, music, cues
SR = audio.SR; GAP_LINE, GAP_SCENE, LEAD, TAIL = 0.18, 0.38, 0.25, 1.8
pieces = [np.zeros(int(LEAD * SR), dtype=np.float32)]; t = LEAD
lines, scenes = [], []
for si, seg in enumerate(S["segments"]):
    if si: pieces.append(np.zeros(int(GAP_SCENE * SR), dtype=np.float32)); t += GAP_SCENE
    seg_start = t
    for li, ln in enumerate(seg["lines"]):
        if li: pieces.append(np.zeros(int(GAP_LINE * SR), dtype=np.float32)); t += GAP_LINE
        a = audio.speak(ln["say"], voice, speed * ln.get("pace", 1.0)); d = len(a) / SR
        pieces.append(a); lines.append({"cap": ln["cap"], "start": round(t, 3), "end": round(t + d, 3)}); t += d
        if ln.get("pause"): pieces.append(np.zeros(int(ln["pause"] * SR), dtype=np.float32)); t += ln["pause"]
    scenes.append({**seg["scene"], "from": round(max(0, seg_start - (LEAD if si == 0 else 0.3)), 3)})
total = t + TAIL
pieces.append(np.zeros(int(TAIL * SR), dtype=np.float32))
for i, sc in enumerate(scenes): sc["to"] = scenes[i + 1]["from"] + 0.3 if i + 1 < len(scenes) else round(total, 3)
os.makedirs(f"public/{vid}", exist_ok=True)
raw, vo, bed = f"public/{vid}/raw.wav", f"public/{vid}/vo.wav", f"public/{vid}/bed.wav"
sf.write(raw, np.concatenate(pieces), SR)
audio.master_voice(raw, vo); audio.music_bed(total + 1, bed); audio.mix(vo, bed, f"public/{vid}/voice.wav")
for f in (raw, vo, bed): os.remove(f)
if not os.path.exists("public/sfx/chime.wav"): audio.cues("public/sfx")

# ---------------------------------------------------------------- 3. charts from real bars
for s in scenes:
    if s["kind"] != "chart": continue
    c = D["charts"][s.pop("instrument")]
    s.update({"bars": c["bars"], "pdh": c["pdh"], "pdc": c["pdc"], "pdl": c["pdl"]})
    if c["trades"]:
        tr = c["trades"][0]
        s["entry"] = {"t": tr["entryTime"], "price": tr["entry"], "side": tr["side"]}
        if tr.get("exitTime"): s["exit"] = {"t": tr["exitTime"], "price": tr["exit"]}

props = {"label": S["label"], "ccy": D.get("currency", "INR" if D.get("group") == "india" else "USD"), "audio": f"{vid}/voice.wav", "duration": round(total, 3), "lines": lines, "scenes": scenes}
os.makedirs("props", exist_ok=True); json.dump(props, open(f"props/{vid}.json", "w"))
print(f"voice {voice} · {round(total,1)} s · {len(lines)} lines · {len(scenes)} scenes -> props/{vid}.json")
