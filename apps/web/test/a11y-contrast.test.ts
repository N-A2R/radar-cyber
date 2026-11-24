// @vitest-environment jsdom
/**
 * Contraste AA mesuré sur le pont de jetons, pas seulement déclaré.
 *
 * axe-core ne peut pas résoudre les couleurs calculées en jsdom (règle
 * `color-contrast` en `incomplete`) : on relit donc les feuilles réellement
 * chargées par l'application (theme.css puis styles.css) et on calcule les
 * ratios sRGB des jetons utilisés pour du texte informatif.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const themeCss = readFileSync(
  resolve("node_modules/@astryxdesign/theme-stone/dist/theme.css"),
  "utf8",
);
const bridgeCss = readFileSync(resolve("src/styles.css"), "utf8");
const naCss = readFileSync(resolve("src/components/na.css"), "utf8");
const reviewCss = readFileSync(resolve("src/components/review.css"), "utf8");
const quarantineCss = readFileSync(resolve("src/components/quarantine-review.css"), "utf8");
const affectedCss = readFileSync(resolve("src/components/affected.css"), "utf8");
const directoryCss = readFileSync(resolve("src/components/directory.css"), "utf8");

const tokens = new Map<string, string>();
for (const sheet of [themeCss, bridgeCss]) {
  for (const [, name, value] of sheet.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    tokens.set(name, value.trim());
  }
}

/** Résout les alias du pont (`--faint → --muted → --color-text-secondary`). */
function token(name: string, seen = new Set<string>()): string {
  const value = tokens.get(name);
  if (!value) throw new Error(`jeton introuvable : ${name}`);
  if (seen.has(name)) throw new Error(`cycle de jetons : ${name}`);
  seen.add(name);
  return value.replace(/var\((--[\w-]+)\)/g, (_, alias: string) => token(alias, seen));
}

function luminance(color: string): number {
  const dark = color.trim().match(/^light-dark\([^,]+,\s*([^)]+)\)$/);
  const hex = (dark?.[1] ?? color).trim().replace("#", "");
  if (!/^[\da-f]{6}$/i.test(hex)) throw new Error(`couleur non hexadécimale : ${color}`);
  const channels = [0, 2, 4].map((at) => {
    const value = Number.parseInt(hex.slice(at, at + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function ratio(foreground: string, background: string): number {
  const a = luminance(token(foreground));
  const b = luminance(token(background));
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

describe("contraste des jetons du pont", () => {
  it("alias les textes informatifs sur un jeton lisible du pont", () => {
    expect(ratio("--color-text-disabled", "--bg")).toBeLessThan(4.5);
  });

  it("alias les textes informatifs sur un jeton lisible through the bridge", () => {
    expect(token("--faint")).toBe(token("--muted"));
    expect(token("--text-info")).toBe(token("--muted"));
    for (const background of ["--bg", "--surface", "--surface-2", "--surface-3"]) {
      expect(ratio("--muted", background), `--muted sur ${background}`).toBeGreaterThanOrEqual(4.5);
      expect(ratio("--faint", background), `--faint sur ${background}`).toBeGreaterThanOrEqual(4.5);
      expect(ratio("--text-info", background), `--text-info sur ${background}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("garde les messages d'erreur au-dessus de 4,5:1", () => {
    expect(token("--text-error")).not.toBe("");
    for (const background of ["--bg", "--surface", "--surface-2"]) {
      expect(ratio("--text-error", background)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("déplace l'échelle NA dans le pont, en alias de jetons de données", () => {
    expect(naCss).not.toMatch(/--na-niveau-\d\s*:\s*#/);
    for (const level of [0, 1, 2, 3, 4, 5]) {
      expect(bridgeCss).toMatch(new RegExp(`--data-na-${level}\\s*:`));
      expect(bridgeCss).toMatch(new RegExp(`--na-niveau-${level}\\s*:\\s*var\\(--data-na-${level}\\)`));
    }
  });
  it("ne code aucune couleur de texte informatif en dur dans les feuilles revues", () => {
    for (const sheet of [reviewCss, quarantineCss, affectedCss, directoryCss]) {
      expect(sheet).not.toMatch(/(?:color|background)\s*:\s*#[0-9a-f]{3,8}\b/i);
      expect(sheet).not.toMatch(/(?:color|background)\s*:\s*rgba?\(/i);
    }
  });
});
