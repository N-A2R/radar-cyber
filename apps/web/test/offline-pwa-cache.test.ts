import { describe, expect, it } from "vitest";
import { runOfflineChecks } from "./offline-pwa-checks";

/**
 * Point d'entrée Vitest des 27 comportements offline, dont la timeline carte,
 * la non-persistance des dossiers confidentiels, la rédaction récursive et
 * le groupement des anciens écrans dans les quatre destinations.
 */
describe("cache API hors ligne", () => {
	it("satisfait chaque comportement vérifiable", () => {
		const { results, passed, total } = runOfflineChecks();
		const echecs = results.filter((result) => !result.ok).map((result) => `${result.name}: ${result.detail}`);
		expect(echecs, echecs.join("\n")).toEqual([]);
		expect(passed).toBe(total);
	});
});
