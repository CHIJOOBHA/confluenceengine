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
from kokoro_onnx import Kokoro

script_path, data_path, vid = sys.argv[1], sys.argv[2], sys.argv[3]
voice = sys.argv[4] if len(sys.argv) > 4 else "bm_george"
speed = float(sys.argv[5]) if len(sys.argv) > 5 else 1.0
TTS = os.environ.get("ROKI_TTS", "/tmp/claude-0/-home-claude/e5a839cb-5b48-5900-bada-84464bfc3f83/scratchpad/tts")
S = json.load(open(script_path)); D = json.load(open(data_path))

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
for seg in S["segments"]:
    for ln in seg["lines"]:
        for tok in re.findall(r"\d[\d,]*\.?\d*", ln["cap"]):
            t = tok.rstrip(".").replace(",", "")
            if ":" in ln["cap"] and re.search(re.escape(tok) + r"\s*(am|pm)", ln["cap"]): continue  # clock times are checked below
            v = float(t)
            if v.is_integer() and v <= 20 and "allowSmall" in S and int(v) in S["allowSmall"]: continue
            if round(v, 2) not in facts and round(v) not in facts and round(v, 1) not in facts:
                bad.append((ln["cap"], tok))
        for tm in re.findall(r"\d{1,2}:\d{2}\s*(?:am|pm)", ln["cap"]):
            if tm not in json.dumps(D, ensure_ascii=False): bad.append((ln["cap"], tm))
if bad:
    print("NUMBER CHECK FAILED - these do not appear in the day's data:")
    for c, t in bad: print(f"  {t!r} in: {c}")
    sys.exit(1)
print("number check passed:", sum(len(s["lines"]) for s in S["segments"]), "lines")

# ---------------------------------------------------------------- 2. voice
k = Kokoro(f"{TTS}/kokoro-v1.0.onnx", f"{TTS}/voices-v1.0.bin")
SR = 24000; GAP_LINE, GAP_SCENE, LEAD, TAIL = 0.22, 0.45, 0.35, 1.6
audio = [np.zeros(int(LEAD * SR), dtype=np.float32)]; t = LEAD
lines, scenes = [], []
for si, seg in enumerate(S["segments"]):
    if si: audio.append(np.zeros(int(GAP_SCENE * SR), dtype=np.float32)); t += GAP_SCENE
    seg_start = t
    for li, ln in enumerate(seg["lines"]):
        if li: audio.append(np.zeros(int(GAP_LINE * SR), dtype=np.float32)); t += GAP_LINE
        a, sr = k.create(ln["say"], voice=voice, speed=speed, lang="en-gb" if voice.startswith("b") else "en-us")
        a = a.astype(np.float32); audio.append(a); d = len(a) / sr
        lines.append({"cap": ln["cap"], "start": round(t, 3), "end": round(t + d, 3)}); t += d
    scenes.append({**seg["scene"], "from": round(max(0, seg_start - (LEAD if si == 0 else 0.3)), 3)})
total = t + TAIL
audio.append(np.zeros(int(TAIL * SR), dtype=np.float32))
for i, s in enumerate(scenes): s["to"] = scenes[i + 1]["from"] + 0.3 if i + 1 < len(scenes) else round(total, 3)
os.makedirs(f"public/{vid}", exist_ok=True)
raw = f"public/{vid}/raw.wav"; sf.write(raw, np.concatenate(audio), SR)
subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-i", raw, "-af", "highpass=f=70,loudnorm=I=-15:TP=-1.5:LRA=7", "-ar", "48000", f"public/{vid}/voice.wav"], check=True)
os.remove(raw)

# ---------------------------------------------------------------- 3. charts from real bars
for s in scenes:
    if s["kind"] != "chart": continue
    c = D["charts"][s.pop("instrument")]
    s.update({"bars": c["bars"], "pdh": c["pdh"], "pdc": c["pdc"], "pdl": c["pdl"]})
    if c["trades"]:
        tr = c["trades"][0]
        s["entry"] = {"t": tr["entryTime"], "price": tr["entry"], "side": tr["side"]}
        if tr.get("exitTime"): s["exit"] = {"t": tr["exitTime"], "price": tr["exit"]}

props = {"label": S["label"], "audio": f"{vid}/voice.wav", "duration": round(total, 3), "lines": lines, "scenes": scenes}
os.makedirs("props", exist_ok=True); json.dump(props, open(f"props/{vid}.json", "w"))
print(f"voice {voice} · {round(total,1)} s · {len(lines)} lines · {len(scenes)} scenes -> props/{vid}.json")
