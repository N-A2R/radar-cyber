import { closePools, query } from "./src/db.js";
import { loadOrgIndex } from "./src/quarantine/promote.js";
import { buildSimilarityIndex, organisationsProches, contextesDes } from "./src/quarantine/contexte.js";

const orgs = await loadOrgIndex();
buildSimilarityIndex(orgs);
const rows = (await query<{ id: number; org_hint: string | null }>(
	"SELECT id, org_hint FROM quarantine_raw WHERE kind='claim' AND status='pending' AND org_hint IS NOT NULL ORDER BY received_at DESC, id DESC LIMIT 50",
)).rows;
const t0 = performance.now();
for (let i = 0; i < 5; i++) buildSimilarityIndex(orgs);
console.log("build x5", (performance.now() - t0).toFixed(1));
const index = buildSimilarityIndex(orgs);
const t1 = performance.now();
for (let i = 0; i < 5; i++) for (const r of rows) organisationsProches(r.org_hint, index);
console.log("proches 250", (performance.now() - t1).toFixed(1));
const t2 = performance.now();
await contextesDes(rows.map((r) => ({ id: r.id, orgHint: r.org_hint })), []);
console.log("sqlOnly", (performance.now() - t2).toFixed(1));
const t3 = performance.now();
await contextesDes(rows.map((r) => ({ id: r.id, orgHint: r.org_hint })), orgs);
console.log("contexte complet", (performance.now() - t3).toFixed(1));
await closePools();
