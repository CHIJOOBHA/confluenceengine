/** Fails (exit 1) when the brain differs from the approved one. Run by GitHub on every push. */
import { brainStatus } from "../src/core/brainCheck.js";
const s = brainStatus();
console.log(`brain ${s.fingerprint}, approved ${s.approved} (${s.approvedAt}: ${s.note})`);
if (!s.ok) { console.error("The brain changed without approval. If the change is agreed, run: npx tsx scripts/brain-approve.ts \"what changed\""); process.exit(1); }
