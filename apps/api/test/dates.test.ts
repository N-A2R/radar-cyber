import { test } from "node:test";
import assert from "node:assert/strict";
import { parseDate, parseObservedAt } from "../src/collectors/dates.js";

const now = new Date("2026-11-10T12:00:00.000Z");

type DateCase = {
  name: string;
  raw: string | undefined;
  expected: string | null;
  source?: "feed" | "inferred" | "fetched";
  confidence?: "high" | "medium" | "low";
  alsoNull?: Array<string | undefined>;
};

// 25 cas, dont 5 pièges nommés : mois anglais, fuseaux ISO/RFC 822, dates impossibles.
const cases: DateCase[] = [
  { name: "JJ/MM/AAAA", raw: "09/11/2026", expected: "2026-11-09T00:00:00.000Z", source: "inferred", confidence: "medium" },
  { name: "JJ/M/AAAA sans zéro", raw: "9/11/2026", expected: "2026-11-09T00:00:00.000Z", source: "inferred", confidence: "medium" },
  { name: "JJ-MM-AAAA", raw: "09-11-2026", expected: "2026-11-09T00:00:00.000Z", source: "inferred", confidence: "medium" },
  { name: "AAAA-MM-JJ", raw: "2026-11-09", expected: "2026-11-09T00:00:00.000Z", source: "feed", confidence: "high" },
  { name: "ISO 8601 avec Z", raw: "2026-11-09T10:00:00Z", expected: "2026-11-09T10:00:00.000Z", source: "feed", confidence: "high" },
  { name: "ISO 8601 avec millisecondes", raw: "2026-11-09T10:00:00.123Z", expected: "2026-11-09T10:00:00.123Z", source: "feed", confidence: "high" },
  { name: "ISO sans fuseau (espace) lu en UTC", raw: "2026-11-09 10:00:00", expected: "2026-11-09T10:00:00.000Z", source: "feed", confidence: "high" },
  { name: "PIÈGE 1 — fuseau ISO +02:00", raw: "2026-11-09T10:00:00+02:00", expected: "2026-11-09T08:00:00.000Z", source: "feed", confidence: "high" },
  { name: "RSS RFC 822 +0000", raw: "Tue, 10 Nov 2026 08:00:00 +0000", expected: "2026-11-10T08:00:00.000Z", source: "feed", confidence: "high" },
  { name: "RFC 822 sans jour de semaine", raw: "10 Nov 2026 08:00:00 +0100", expected: "2026-11-10T07:00:00.000Z", source: "feed", confidence: "high" },
  { name: "PIÈGE 2 — fuseau RFC 822 -0500", raw: "Tue, 10 Nov 2026 08:00:00 -0500", expected: "2026-11-10T13:00:00.000Z", source: "feed", confidence: "high" },
  { name: "RFC 822 zone nommée GMT", raw: "Tue, 10 Nov 2026 08:00:00 GMT", expected: "2026-11-10T08:00:00.000Z", source: "feed", confidence: "high" },
  { name: "date française textuelle", raw: "9 novembre 2026", expected: "2026-11-09T00:00:00.000Z", source: "inferred", confidence: "medium" },
  { name: "PIÈGE 3 — mois anglais", raw: "9 November 2026", expected: "2026-11-09T00:00:00.000Z", source: "inferred", confidence: "medium" },
  { name: "mois anglais abrégé", raw: "Nov 9, 2026", expected: "2026-11-09T00:00:00.000Z", source: "inferred", confidence: "medium" },
  { name: "il y a 2 heures", raw: "il y a 2 heures", expected: "2026-11-10T10:00:00.000Z", source: "inferred", confidence: "medium" },
  { name: "il y a 3 jours", raw: "il y a 3 jours", expected: "2026-11-07T12:00:00.000Z", source: "inferred", confidence: "medium" },
  { name: "il y a 30 minutes", raw: "il y a 30 minutes", expected: "2026-11-10T11:30:00.000Z", source: "inferred", confidence: "medium" },
  { name: "2 hours ago", raw: "2 hours ago", expected: "2026-11-10T10:00:00.000Z", source: "inferred", confidence: "medium" },
  { name: "2 days ago", raw: "2 days ago", expected: "2026-11-08T12:00:00.000Z", source: "inferred", confidence: "medium" },
  { name: "hier", raw: "hier", expected: "2026-11-09T12:00:00.000Z", source: "inferred", confidence: "medium" },
  { name: "epoch secondes", raw: "1731230400", expected: "2024-11-10T09:20:00.000Z", source: "feed", confidence: "high" },
  { name: "epoch millisecondes", raw: "1731230400000", expected: "2024-11-10T09:20:00.000Z", source: "feed", confidence: "high" },
  { name: "PIÈGE 4 — 31 février", raw: "31/02/2026", expected: null, source: "fetched", confidence: "low" },
  {
    name: "PIÈGE 5 — 30 février ISO, vide et bruit",
    raw: "2026-02-30",
    expected: null,
    source: "fetched",
    confidence: "low",
    alsoNull: ["", "   ", undefined, "zzzzz not a date"],
  },
];

assert.equal(cases.length, 25);
assert.equal(cases.filter((c) => c.name.startsWith("PIÈGE")).length, 5);

for (const c of cases) {
  test(c.name, () => {
    const parsed = parseDate(c.raw, { now });
    if (c.expected === null) {
      assert.equal(parsed, null);
    } else {
      assert.ok(parsed instanceof Date);
      assert.equal(parsed?.toISOString(), c.expected);
    }

    const observed = parseObservedAt(c.raw, { fetchedAt: now });
    assert.equal(observed.at?.toISOString(), c.expected ?? now.toISOString());
    if (c.source) assert.equal(observed.source, c.source);
    if (c.confidence) assert.equal(observed.confidence, c.confidence);

    for (const extra of c.alsoNull ?? []) {
      assert.equal(parseDate(extra, { now }), null);
      assert.equal(parseObservedAt(extra, { fetchedAt: now }).at?.getTime(), now.getTime());
    }
  });
}
