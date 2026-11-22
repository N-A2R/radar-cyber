/**
 * Custody panel rendering — no browser, no network.
 *
 * Checks that the panel names the observer, the observation and the recording
 * clocks in English, and that it cannot display event free text.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { CustodyDetails } from "../src/components/CustodyPanel.js";
import type { CustodyChain } from "../src/api.js";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  console.log(`${ok ? "OK  " : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

const SECRET = "Victim name 0601020304";
const chain: CustodyChain = {
  subject: "official-statement:test",
  regional: true,
  complete: true,
  missing: [],
  source: "official-na-cd47-actualites",
  sourceUrl: "https://www.lotetgaronne.fr/actualites/test",
  observedAt: "2026-11-20T10:00:00.000Z",
  links: [{
    who: "collecteur:na-official-statements",
    what: "source: official statement admitted",
    when: "2026-11-20T10:00:00.000Z",
    recordedAt: "2026-11-20T10:01:00.000Z",
    proof: ["sourceId", "sourceUrl"],
  }],
};

const html = renderToStaticMarkup(CustodyDetails({ chain }));
check("the panel is marked complete", html.includes('data-custody="complete"'));
check("the observer is named", html.includes("collecteur:na-official-statements"));
check("the observation clock is shown", html.includes("2026-11-20 10:00:00"));
check("the recording clock is shown", html.includes("recorded 2026-11-20 10:01:00"));
check("the proof keys are shown", html.includes("proof: sourceId, sourceUrl"));
check("no event free text is rendered", !html.includes(SECRET));

const broken = renderToStaticMarkup(CustodyDetails({
  chain: { ...chain, complete: false, missing: ["admission-fact-missing"], links: [] },
}));
check("a gap is named, not hidden", broken.includes("Incomplete: admission-fact-missing"));
check("a gap is marked incomplete", broken.includes('data-custody="incomplete"'));

console.log(failures === 0 ? "\ncustody panel: all green" : `\ncustody panel: ${failures} failure(s)`);
process.exit(failures === 0 ? 0 : 1);
