# Roki daily videos

Two vertical videos a day (1080×1920, 60–80 s): **India** and **Global**.

1. **Data**: `NODE_USE_ENV_PROXY=1 npx tsx ../scripts/video-data.ts <india|global> <date> data/<group>-<date>.json 2026-10-19 [--replay]`
   - India: always `--replay` with a session **at least 30 days old** (SEBI circular of 8 May 2026, in force 1 July 2026:
     education may not use price data of the preceding 30 days to discuss or name a security, and does not predict prices).
   - Global: the live paper record of the previous session.
   - Research, scorecards and running totals always come from the live record.
2. **Script**: `scripts/<group>-<date>.json`, written with the `roki-scriptwriter` skill (hook, why it matters, the story,
   viewer question, predictions, testing now, researching next, lesson, scoreboard, cliffhanger).
3. **Build**: `python3 build.py scripts/<id>.json data/<id>.json <id> roki 1.1`
   - `compliance.py` blocks advice, calls to action, targets, guarantees, tips, insider-information claims, paid groups,
     and anything recent or forward-looking about Indian securities. A failing script is not built.
   - Every spoken, captioned and on-screen number must appear in the day's data (or be listed in `extraFacts`).
   - `audio.py`: voice `roki` (British male blend, main) or `roki-alt` (American female blend), Kokoro running locally
     (model files from github.com/thewh1teagle/kokoro-onnx releases, folder in `ROKI_TTS`); generated music bed and cues.
4. **Render** (style "Roki Ink"): `npx remotion render src/index.ts RokiInk out/<id>.mp4 --props=props/<id>.json --browser-executable=<headless chrome>`
