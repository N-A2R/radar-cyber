import { closePools, query } from "./src/db.js";
import { loadOrgIndex } from "./src/quarantine/promote.js";
import { contextesDes } from "./src/quarantine/contexte.js";

for (let i = 0; i < 6; i++) {
	let t = performance.now();
	const [raw, orgIndex] = await Promise.all([
		query<{ id: number; org_hint: string | null }>(
			"SELECT id, org_hint FROM quarantine_raw WHERE kind='claim' AND status='pending' AND org_hint IS NOT NULL ORDER BY received_at DESC, id DESC LIMIT 200",
		),
		loadOrgIndex(),
	]);
	const tLoad = performance.now() - t;
	t = performance.now();
	await contextesDes(raw.rows.slice(0, 50).map((r) => ({ id: r.id, orgHint: r.org_hint })), orgIndex);
	const tCtx = performance.now() - t;
	console.log(i, "load", tLoad.toFixed(1), "ctx", tCtx.toFixed(1));
}
await closePools();
