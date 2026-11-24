import { describe, expect, it } from "vitest";
import { JSDOM } from "jsdom";
import html from "../index.html?raw";
import main from "../src/main.tsx?raw";

describe("shell PWA sans dépendance externe", () => {
	it("ne charge aucune URL tierce dans index.html", () => {
		expect(html).not.toMatch(/(?:https?:)?\/\//);
		expect(html).not.toMatch(/fonts\.(googleapis|gstatic)|unpkg\.com/i);
		expect(html).toContain('href="/manifest.webmanifest"');
		expect(html).toContain('src="/src/main.tsx"');
		expect(html).toContain('data-astryx-theme="stone"');
	});

	it("importe la CSS MapLibre localement avant le pont Astryx", () => {
		const maplibre = main.indexOf('import "maplibre-gl/dist/maplibre-gl.css"');
		const pont = main.indexOf('import "./styles.css"');
		expect(maplibre).toBeGreaterThan(-1);
		expect(pont).toBeGreaterThan(maplibre);
		for (const feuille of [
			'import "@astryxdesign/core/reset.css"',
			'import "@astryxdesign/core/astryx.css"',
			'import "@astryxdesign/theme-stone/fonts.css"',
			'import "@astryxdesign/theme-stone/theme.css"',
		]) {
			expect(main.indexOf(feuille), `${feuille} doit précéder MapLibre`).toBeLessThan(maplibre);
		}
	});

	it("ne référence aucune ressource tierce dans le document analysé", () => {
		const document = new JSDOM(html).window.document;
		const ressources: HTMLElement[] = Array.from(
			document.querySelectorAll("link[href], script[src], img[src]"),
		);
		expect(ressources.length).toBeGreaterThan(0);
		for (const ressource of ressources) {
			const cible = ressource.getAttribute("href") ?? ressource.getAttribute("src") ?? "";
			expect(cible, ressource.outerHTML).not.toMatch(/^https?:\/\//i);
			expect(cible, ressource.outerHTML).not.toMatch(/^\/\//);
		}
		expect(document.querySelectorAll('link[rel="preconnect"]')).toHaveLength(0);
	});
});
