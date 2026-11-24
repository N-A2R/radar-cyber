// @vitest-environment jsdom
/**
 * Le journal reste auditable à 375 px : les en-têtes de colonne sont masqués
 * optiquement, jamais retirés de l'arbre accessible par `display: none`.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeAll, expect, it } from "vitest";
import axe from "axe-core";
import type { JournalDecision } from "../src/api";
import JournalList from "../src/components/JournalListe";

const AA_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];
let host: HTMLDivElement;

beforeAll(() => {
  (globalThis as unknown as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  host?.remove();
});

const row: JournalDecision = {
  id: 7, kind: "org.created", sujet: "org:chu-bordeaux", acteur: "moteur:triage",
  horodatage: "2026-11-21 09:12:00+00", decision: "creer", indice: "CHU Bordeaux",
  raison: "domaine officiel confirmé", resume: "organisation créée", preuve: { orgId: 42 },
};

it("conserve les en-têtes et passe axe à 375 px", async () => {
  Object.defineProperty(window, "innerWidth", { configurable: true, value: 375 });
  window.dispatchEvent(new Event("resize"));

  host = document.createElement("div");
  document.body.appendChild(host);
  await act(async () => {
    createRoot(host).render(
      <JournalList
        rows={[row]} total={1} filters={{}} onFilterChange={() => {}} onReset={() => {}}
        loading={false} error={null} page={1} pageCount={1}
        onPrevious={() => {}} onNext={() => {}}
        selected={null} onSelect={() => {}} onCloseDetail={() => {}}
        onExport={() => {}} exporting={false} exportError={null}
      />,
    );
  });

  const headers = [...host.querySelectorAll<HTMLTableCellElement>("thead th")];
  expect(headers.map((th) => th.textContent?.trim())).toEqual([
    "Date (UTC)", "Type", "Acteur", "Décision", "Résumé", "Détails",
  ]);
  for (const th of headers) expect(th.getAttribute("scope")).toBe("col");

  const css = readFileSync(resolve("src/components/journal.css"), "utf8");
  const mobileBlock = css.slice(css.indexOf("@media (max-width: 600px)"));
  expect(mobileBlock).not.toMatch(/\.journal__table thead\s*\{\s*display:\s*none/);
  expect(mobileBlock).toMatch(/\.journal__table thead\s*\{[\s\S]*?clip-path:\s*inset\(50%\)/);

  const result = await axe.run(host, { runOnly: { type: "tag", values: AA_TAGS } });
  expect(result.violations.map((rule) => `${rule.id}: ${rule.nodes.length}`)).toEqual([]);
  console.log(`A11Y_JOURNAL_MOBILE incomplete=${result.incomplete.reduce((n, rule) => n + rule.nodes.length, 0)}`);
}, 30_000);
