import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/** Un manifeste invalide casse l'installation pnpm avant même les tests. */
test("le manifeste racine reste du JSON valide", () => {
  const raw = readFileSync(new URL("../../../package.json", import.meta.url), "utf8");
  const manifest = JSON.parse(raw) as { scripts?: Record<string, string> };
  assert.ok(manifest.scripts && Object.keys(manifest.scripts).length > 0);
});
