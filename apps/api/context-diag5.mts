import { closePools } from "./src/db.js";
import { reviewQueue } from "./src/quarantine/review.js";

const times: number[] = [];
for (let i = 0; i < 12; i++) {
	const t = performance.now();
	const result = await reviewQueue({
		status: "pending", onlyPendingWithHint: true, enriched: true, avecContexte: true,
		limit: 50, page: 0,
	});
	const elapsed = performance.now() - t;
	if (i >= 3) times.push(elapsed);
	console.log(i, elapsed.toFixed(1), result.tookMs, result.rows.length, result.rows[0]?.contexte?.candidats.length);
}
console.log("moyenne", (times.reduce((a, b) => a + b, 0) / times.length).toFixed(1));
await closePools();
