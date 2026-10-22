/**
 * Approve the current brain: npx tsx scripts/brain-approve.ts "what changed and why"
 * Writes the fingerprint to src/core/brainLock.ts and adds a dated line to research/brain-changes.md.
 * Only run this for a change the owner has agreed to.
 */
import fs from "fs";
import { brainFingerprint } from "../src/core/brainCheck.js";
const note = process.argv.slice(2).join(" ").trim();
if (!note) { console.error('Say what changed: npx tsx scripts/brain-approve.ts "what changed and why"'); process.exit(1); }
const fp = brainFingerprint(), at = new Date().toISOString().slice(0, 10);
fs.writeFileSync("src/core/brainLock.ts", `// The approved brain. Written by scripts/brain-approve.ts; do not edit by hand.\nexport const BRAIN_LOCK = ${JSON.stringify({ fingerprint: fp, approvedAt: at, note })};\n`);
const log = "research/brain-changes.md";
if (!fs.existsSync(log)) fs.writeFileSync(log, "# Changes to Roki's brain\n\nEvery approved change to rules, costs, expectations or data limits, newest last.\n\n| Date | Fingerprint | What changed |\n|---|---|---|\n");
fs.appendFileSync(log, `| ${at} | ${fp} | ${note.replace(/\|/g, "/")} |\n`);
console.log("approved", fp);
