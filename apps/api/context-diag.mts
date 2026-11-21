import { closePools, query } from "./src/db.js";
import { loadOrgIndex } from "./src/quarantine/promote.js";
import { buildSimilarityIndex, organisationsProches, contextesDes } from "./src/quarantine/contexte.js";

const orgs = await loadOrgIndex();
let t = performance.now();
const index = buildSimilarityIndex(orgs);
console.log("buildSimilarityIndex", (performance.now() - t).toFixed(1), "ms", orgs.length, "orgs");

const rows = (await query<{ id: number; org_hint: string | null }>(
	"SELECT id, org_hint FROM quarantine_raw WHERE kind='claim' AND status='pending' AND org_hint IS NOT NULL ORDER BY received_at DESC, id DESC LIMIT 50",
)).rows;
t = performance.now();
for (const row of rows) organisationsProches(row.org_hint, index);
console.log("organisationsProches 50", (performance.now() - t).toFixed(1), "ms");

t = performance.now();
await contextesDes(rows.map((r) => ({ id: r.id, orgHint: r.org_hint })), orgs);
console.log("contextesDes 50", (performance.now() - t).toFixed(1), "ms");
await closePools();
