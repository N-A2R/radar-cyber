/** Test entry point: one line per offline behaviour. */
import { runOfflineChecks } from "./offline-pwa-checks.js";

const { results, passed, total } = runOfflineChecks();
for (const result of results) {
	console.log(`${result.ok ? "OK  " : "FAIL"} ${result.name}${result.detail ? ` — ${result.detail}` : ""}`);
}
console.log(`\nOffline PWA: ${passed}/${total} behaviours verified`);
process.exit(passed === total ? 0 : 1);
