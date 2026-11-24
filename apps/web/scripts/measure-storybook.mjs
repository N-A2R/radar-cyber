import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { inventory } from "./storybook-inventory.mjs";

const base = inventory();
const url = process.env.STORYBOOK_DB_URL ?? "postgres://radar:radar@localhost:5433/radar";

/** The brief's real-state anchor, measured at run time rather than copied. */
function baseline() {
  try {
    const output = execFileSync(
      "psql",
      [url, "-At", "-c", "SELECT (SELECT count(*) FROM org), (SELECT count(*) FROM source), (SELECT count(*) FROM event)"],
      { encoding: "utf8", timeout: 15_000, stdio: ["ignore", "pipe", "pipe"] },
    );
    const [organisations, sources, events] = output.trim().split("|").map(Number);
    if ([organisations, sources, events].some((value) => !Number.isFinite(value))) throw new Error("bad psql output");
    return { organisations, sources, events, source: url.replace(/:[^:@]*@/, ":***@") };
  } catch {
    const snapshot = JSON.parse(
      readFileSync(new URL("../../../bench/results/couverture-mesuree.json", import.meta.url), "utf8"),
    );
    return {
      organisations: Number(snapshot.base.organisations),
      sources: snapshot.base.sources,
      events: snapshot.base.evenements,
      source: "bench/results/couverture-mesuree.json (database unavailable)",
    };
  }
}

console.log(JSON.stringify({
  components: base.components.length,
  documented: base.documentedComponents,
  coveragePercent: base.coveragePercent,
  storyFiles: base.storyFiles,
  stories: base.stories,
  missing: base.missing,
  baseline: baseline(),
}, null, 2));

if (base.missing.length > 0) process.exitCode = 1;
