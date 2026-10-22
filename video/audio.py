"""
ROKI AUDIO - voice, music bed and sound cues, all free and generated locally.

Voice: Kokoro (Apache-2.0). Roki's voice is a blend of two British male voices (George, with a
little of Fable for warmth), with pronunciation fixes for market names, natural sentence pauses,
per-line pace, and a broadcast chain: high-pass, warmth, presence, de-esser, gentle compression,
a touch of room, loudness to -15 LUFS.
Music: a soft four-chord pad generated in code (no licensing), ducked under the voice.
Cues: a chime (right), a low thud (wrong), a soft whoosh (scene change), a pop (card in).
"""
import os, re, subprocess
import numpy as np, soundfile as sf

TTS = os.environ.get("ROKI_TTS", "/tmp/claude-0/-home-claude/e5a839cb-5b48-5900-bada-84464bfc3f83/scratchpad/tts")
SR = 24000
VOICES = {  # name -> list of (kokoro voice, weight), language
    "roki": ([("bm_george", 0.75), ("bm_fable", 0.25)], "en-gb"),       # main: British male
    "roki-alt": ([("af_heart", 0.8), ("af_bella", 0.2)], "en-us"),       # alternate: American female
    "george": ([("bm_george", 1.0)], "en-gb"),
}
PRON = {  # what the voice should read instead (respellings it pronounces correctly)
    r"\bICICI\b": "I-C-I-C-I", r"\bInfosys\b": "Info-sis", r"\bHDFC\b": "H-D-F-C", r"\bTCS\b": "T-C-S", r"\bJPM\b": "J-P-Morgan",
    r"\bS&P\b": "S and P", r"\bBTC\b": "Bitcoin", r"\bETH\b": "Ethereum", r"\bSOL\b": "Solana", r"\bXRP\b": "X-R-P", r"\bIST\b": "Indian time",
}

_k = None
def _kokoro():
    global _k
    if _k is None:
        from kokoro_onnx import Kokoro
        _k = Kokoro(f"{TTS}/kokoro-v1.0.onnx", f"{TTS}/voices-v1.0.bin")
    return _k

def speak(text: str, voice: str = "roki", speed: float = 1.06) -> np.ndarray:
    k = _kokoro(); parts, lang = VOICES[voice]
    style = sum(k.get_voice_style(v) * w for v, w in parts) if len(parts) > 1 else parts[0][0]
    for pat, rep in PRON.items(): text = re.sub(pat, rep, text)
    a, sr = k.create(text, voice=style, speed=speed, lang=lang, sentence_pause=0.3, clause_pause=0.12)
    assert sr == SR
    return a.astype(np.float32)

def master_voice(src: str, dst: str):
    chain = ("highpass=f=75,lowshelf=f=180:g=1.5,equalizer=f=3200:t=q:w=1.2:g=2.5,deesser=i=0.35,"
             "acompressor=threshold=-20dB:ratio=2.5:attack=8:release=120:makeup=2,"
             "aecho=0.85:0.25:18|29:0.07|0.04,loudnorm=I=-15:TP=-1.5:LRA=6")
    subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-i", src, "-af", chain, "-ar", "48000", dst], check=True)

# ---------------------------------------------------------------- music and cues (48 kHz)
MSR = 48000
def _env(n, a=0.01, r=0.5):
    t = np.arange(n) / MSR; e = np.minimum(1, t / a) * np.exp(-t / r); return e

def music_bed(seconds: float, dst: str, bpm: float = 76):
    """Soft pad: Cmaj7 - Am9 - Fmaj7 - G6, one chord per bar, with a slow filter and a quiet pulse."""
    chords = [[48, 55, 59, 64, 67], [45, 52, 59, 60, 64], [41, 48, 57, 60, 64], [43, 50, 55, 59, 64]]
    bar = 4 * 60 / bpm; n = int(seconds * MSR); out = np.zeros(n, np.float32); t = np.arange(n) / MSR
    hz = lambda m: 440 * 2 ** ((m - 69) / 12)
    for i in range(int(seconds / bar) + 1):
        s = int(i * bar * MSR); e = min(n, int((i + 1) * bar * MSR) + int(0.8 * MSR))
        if s >= n: break
        tt = t[s:e] - t[s]; ln = e - s
        env = np.minimum(1, tt / 0.9) * np.minimum(1, np.maximum(0, (bar + 0.8 - tt) / 1.2))
        for m in chords[i % 4]:
            f = hz(m); ph = np.random.rand() * 6.28
            v = 0.6 * np.sin(2 * np.pi * f * tt + ph) + 0.25 * np.sin(2 * np.pi * f * 2.003 * tt) + 0.1 * np.sin(2 * np.pi * f * 0.5 * tt)
            out[s:e] += (v * env).astype(np.float32) * 0.05
        # soft pulse on the root, each beat
        for b in range(4):
            ps = s + int(b * bar / 4 * MSR); pn = min(n - ps, int(0.5 * MSR))
            if pn > 0: out[ps:ps + pn] += (np.sin(2 * np.pi * hz(chords[i % 4][0] - 12) * np.arange(pn) / MSR) * _env(pn, 0.005, 0.16) * 0.06).astype(np.float32)
    fade = int(1.5 * MSR); out[:fade] *= np.linspace(0, 1, fade); out[-fade:] *= np.linspace(1, 0, fade)
    sf.write(dst, out / (np.abs(out).max() + 1e-9) * 0.5, MSR)

def cues(folder: str):
    os.makedirs(folder, exist_ok=True)
    n = int(0.9 * MSR); t = np.arange(n) / MSR
    chime = (np.sin(2 * np.pi * 1046.5 * t) * 0.6 + np.sin(2 * np.pi * 1568 * t) * 0.35 + np.sin(2 * np.pi * 2093 * t) * 0.15) * _env(n, 0.003, 0.28)
    sf.write(f"{folder}/chime.wav", (chime * 0.5).astype(np.float32), MSR)
    n2 = int(0.5 * MSR); t2 = np.arange(n2) / MSR
    thud = np.sin(2 * np.pi * (140 - 60 * t2 / t2[-1]) * t2) * _env(n2, 0.002, 0.12) + np.random.randn(n2) * _env(n2, 0.001, 0.02) * 0.15
    sf.write(f"{folder}/thud.wav", (thud * 0.6).astype(np.float32), MSR)
    n3 = int(0.6 * MSR); noise = np.random.randn(n3).astype(np.float32)
    sw = np.sin(np.linspace(0, np.pi, n3)) ** 2
    k = np.ones(40) / 40; whoosh = np.convolve(noise, k, "same") * sw
    sf.write(f"{folder}/whoosh.wav", (whoosh / np.abs(whoosh).max() * 0.18).astype(np.float32), MSR)
    n4 = int(0.15 * MSR); t4 = np.arange(n4) / MSR
    pop = np.sin(2 * np.pi * (600 + 500 * t4 / t4[-1]) * t4) * _env(n4, 0.001, 0.035)
    sf.write(f"{folder}/pop.wav", (pop * 0.35).astype(np.float32), MSR)

def mix(voice_wav: str, music_wav: str, dst: str, music_db: float = -21):
    """Music under the voice, ducked further while Roki speaks."""
    fc = (f"[1:a]volume={music_db}dB[m];[m][0:a]sidechaincompress=threshold=0.03:ratio=6:attack=40:release=500[md];"
          f"[0:a][md]amix=inputs=2:duration=first:normalize=0,loudnorm=I=-15:TP=-1.5:LRA=7")
    subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-i", voice_wav, "-i", music_wav, "-filter_complex", fc, "-ar", "48000", dst], check=True)
