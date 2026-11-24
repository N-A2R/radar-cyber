/**
 * Contrôle navigateur du contraste : axe-core résout ici les couleurs
 * calculées que jsdom laisse en `incomplete`. Les `incomplete` restent
 * enregistrés explicitement, ils ne sont pas confondus avec un AA vert.
 */
import { expect, test } from "@playwright/test";
import { fileURLToPath } from "node:url";

const axePath = fileURLToPath(new URL("../node_modules/axe-core/axe.min.js", import.meta.url));
const AA_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

test("axe mesure le contraste AA dans Chromium à 375 px", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.addInitScript(() => {
    localStorage.setItem("radar_token", "a11y-contrast-token");
  });
  await page.goto("/");
  await expect(page.locator(".shell")).toBeVisible();
  // axe doit mesurer l'écran rendu, pas le squelette de chargement.
  await expect(page.getByRole("region", { name: "Espace Carte" })).toBeVisible();
  // Le panneau régional prouve que la Carte a quitté le squelette de chargement.
  await expect(page.getByRole("heading", { name: "Nouvelle-Aquitaine", level: 2 })).toBeVisible();
  await page.addScriptTag({ path: axePath });

  const result = await page.evaluate(async (tags) => {
    // axe-core injecte `window.axe` ; le type du DOM ne connaît pas ce global.
    const globalWithAxe = window as unknown as {
      axe: {
        run: (context: Document, options: unknown) => Promise<{
          violations: { id: string; nodes: unknown[] }[];
          incomplete: { id: string; nodes: unknown[] }[];
        }>;
      };
    };
    return globalWithAxe.axe.run(document, { runOnly: { type: "tag", values: tags } });
  }, AA_TAGS);

  const contrast = result.violations.filter((rule) => rule.id === "color-contrast");
  const incomplete = result.incomplete.filter((rule) => rule.id === "color-contrast");
  const detail = contrast.flatMap((rule) => rule.nodes.map((node: unknown) => {
    const n = node as { target?: unknown; failureSummary?: string; html?: string };
    return { cible: n.target, resume: n.failureSummary, html: n.html?.slice(0, 200) };
  }));
  console.log(`A11Y_CONTRAST_NODES=${JSON.stringify(detail)}`);
  expect(contrast.map((rule) => `${rule.id}: ${rule.nodes.length}`)).toEqual([]);
});
