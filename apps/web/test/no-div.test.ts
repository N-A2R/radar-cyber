/**
 * Astryx : le front ne doit plus contenir de `<div>` maison. Les composants
 * du design system portent la structure ; ce test verrouille la migration.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

function tsxFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) tsxFiles(path, out);
    else if (entry.name.endsWith(".tsx")) out.push(path);
  }
  return out;
}

describe("structure Astryx", () => {
  it("ne contient aucun div dans src", () => {
    const src = resolve("src");
    const offenders = tsxFiles(src).filter((path) => /<div\b/.test(readFileSync(path, "utf8")));
    expect(offenders.map((path) => path.slice(src.length + 1))).toEqual([]);
  });
});
