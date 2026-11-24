// @vitest-environment jsdom
/** One behavioural check per exported component: it must render in Storybook. */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { inventory } from "../scripts/storybook-inventory.mjs";
import { events, orgs, rectifications } from "../src/storybook/fixtures";

const { components, storyFiles, storyFiles: fileCount } = inventory();
const NA_DEPARTMENTS: Record<string, true> = {
  "16": true, "17": true, "19": true, "23": true, "24": true,
  "33": true, "40": true, "47": true, "64": true, "79": true, "86": true, "87": true,
};

describe("Documented design system", () => {
  it.each(components.map((component) => [`${component.module}: ${component.name}`, component] as const))(
    "%s renders in Storybook",
    (_label, component) => {
      expect(component.story, `${component.name} has no story file`).not.toBeNull();
      expect(component.documented, `${component.name} is imported but never rendered`).toBe(true);
    },
  );

  it("discovers every component module through its story file", () => {
    expect(fileCount).toBeGreaterThan(0);
    expect(new Set(components.map((component) => component.module)).size).toBe(fileCount);
  });

  it("keeps organisation fixtures inside Nouvelle-Aquitaine", () => {
    expect(orgs.length).toBeGreaterThan(0);
    expect(NA_DEPARTMENTS["18"], "le Cher n'est pas en Nouvelle-Aquitaine").toBeUndefined();
    for (const org of orgs) {
      expect(NA_DEPARTMENTS[org.dept ?? ""], `département ${org.dept} hors NA`).toBe(true);
    }
  });

  it("keeps event fixtures free of victim personal data", () => {
    for (const event of events) {
      expect(event.title.toLowerCase()).not.toMatch(/victim|victime/);
      expect((event.summary ?? "").toLowerCase()).not.toMatch(/victim|victime/);
    }
    expect(JSON.stringify(rectifications)).not.toMatch(/(?:\+33|0)[1-9](?:[ .-]?\d{2}){4}/);
  });

  it("configures Storybook to load the component story glob", () => {
    const config = readFileSync(resolve(process.cwd(), ".storybook/main.ts"), "utf8");
    expect(config).toContain("../src/**/*.stories.@(ts|tsx)");
    expect(config).toContain("@storybook/react-vite");
    expect(storyFiles).toBeGreaterThan(0);
  });
});
