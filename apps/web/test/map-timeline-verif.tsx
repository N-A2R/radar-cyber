/**
 * One check per observable behavior of the map timeline helpers and scrubber.
 * Rendered markup is checked as text: no browser, no network, fixed clock.
 */
import { renderToStaticMarkup } from "react-dom/server";
import MapTimeline from "../src/map/MapTimeline";
import {
  advanceBucket, buildBuckets, eventsInBucket, formatBucketLabel,
  parseEventTime, withEmptyBuckets,
} from "../src/map/timeline";
import type { MapTimelineBucket } from "../src/api";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  console.log(`${ok ? "OK  " : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

const NOW = Date.UTC(2026, 10, 22, 12, 0);
const events = [
  { id: "edge", observedAt: "2026-10-01T00:00:00Z" },
  { id: "late", observedAt: "2026-10-31 23:59:00+01" },
  { id: "next", observedAt: "2026-11-01T00:00:00Z" },
  { id: "none", observedAt: null },
  { id: "bad", observedAt: "not-a-date" },
];
const buckets = buildBuckets(events, 3, NOW);

check("Postgres offsets are parsed as UTC",
  parseEventTime("2026-10-31 23:59:00+01") === Date.UTC(2026, 9, 31, 22, 59));
check("bucket range includes its start and excludes its end",
  eventsInBucket(events, "2026-10").map((e) => e.id).join(",") === "edge,late");
check("all dates keeps every event",
  eventsInBucket(events, "all").length === events.length);
check("month labels are English and UTC",
  formatBucketLabel("2026-10") === "Oct 2026" && formatBucketLabel("bad") === "bad");
check("playback advances from all to the first month and stops at the last",
  advanceBucket(buckets, "all") === "2026-09"
  && advanceBucket(buckets, "2026-09") === "2026-10"
  && advanceBucket(buckets, "2026-11") === null);
check("empty months remain scrubber steps, invalid dates are not counted",
  buckets.map((b) => [b.key, b.count]).map(String).join("|") === "2026-09,0|2026-10,2|2026-11,1",
  buckets.map((b) => `${b.key}:${b.count}`).join(" "));
check("API counts are merged into the zero-filled window",
  withEmptyBuckets([{ key: "2026-10", from: "", to: "", count: 42 }], 3, NOW)
    .map((b) => b.count).join(",") === "0,42,0");

const html = renderToStaticMarkup(
  <MapTimeline
    buckets={buckets}
    selected="2026-10"
    shown={1}
    total={3}
    onSelect={() => {}}
  />,
);
check("scrubber renders one bar per month with accessible counts",
  (html.match(/class="map-timeline__bar-button"/g) ?? []).length === 3
  && html.includes('aria-label="Oct 2026: 2 events"')
  && html.includes('aria-pressed="true"'));
check("play, all dates and truncation are visible as text",
  html.includes(">Play</button>") && html.includes(">All dates</button>")
  && html.includes("showing 1") && html.includes("2 events")
  && html.includes('aria-label="Timeline position"'));
check("interface copy is English only",
  !html.includes("événements") && !html.includes("mois") && !html.includes("lecture"));

const empty = renderToStaticMarkup(
  <MapTimeline buckets={[] as MapTimelineBucket[]} selected="all" shown={0} total={0} onSelect={() => {}} />,
);
check("empty state stays operable", empty.includes("All dates") && !empty.includes("loading"));

console.log(failures === 0 ? "\nMap timeline: all checks pass." : `\nMap timeline: ${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
