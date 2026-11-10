export type DateSource = "feed" | "inferred" | "fetched";
export type DateConfidence = "high" | "medium" | "low";

export interface ParsedDate {
  at: Date | null;
  source: DateSource;
  confidence: DateConfidence;
}

const MONTHS_FR: Record<string, number> = {
  janvier: 0, fevrier: 1, "février": 1, mars: 2, avril: 3, mai: 4, juin: 5, juillet: 6, aout: 7, "août": 7, septembre: 8, octobre: 9, novembre: 10, decembre: 11, "décembre": 11,
};

export function parseObservedAt(raw: string | undefined, opts: { fetchedAt: Date }): ParsedDate {
  const f = opts.fetchedAt;
  const s = (raw ?? "").trim();
  if (!s) return { at: f, source: "fetched", confidence: "low" };

  // epoch
  if (/^\d{10}$/.test(s)) return { at: new Date(Number(s) * 1000), source: "feed", confidence: "high" };
  if (/^\d{13}$/.test(s)) return { at: new Date(Number(s)), source: "feed", confidence: "high" };

  // RFC3339 / ISO
  const iso = Date.parse(s);
  // careful: only accept if looks like ISO/RFC
  if (/^\d{4}-\d{2}-\d{2}(T|\s|$)/.test(s) && !isNaN(iso)) {
    return { at: new Date(iso), source: "feed", confidence: "high" };
  }
  // RFC822-ish: contains comma weekday or month name abbreviations
  if (!isNaN(Date.parse(s)) && /[A-Za-z]{3}/.test(s)) {
    return { at: new Date(Date.parse(s)), source: "feed", confidence: "high" };
  }

  // ISO date alone handled above; french "9 novembre 2026"
  const mFr = s.toLowerCase().match(/^(\d{1,2})\s+([a-zéûôîàèç]+)\s+(\d{4})$/);
  if (mFr) {
    const d = Number(mFr[1]);
    const mon = MONTHS_FR[mFr[2]];
    const y = Number(mFr[3]);
    if (mon !== undefined) {
      const dt = new Date(Date.UTC(y, mon, d));
      return { at: dt, source: "inferred", confidence: "medium" };
    }
  }
  // 09/11/2026 JJ/MM
  const mSlash = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (mSlash) {
    const d = Number(mSlash[1]); const mo = Number(mSlash[2]) - 1; const y = Number(mSlash[3]);
    return { at: new Date(Date.UTC(y, mo, d)), source: "inferred", confidence: "medium" };
  }
  // relative
  const low = s.toLowerCase();
  if (low === "hier") { const d = new Date(f); d.setDate(d.getDate()-1); return { at: d, source: "inferred", confidence: "medium" }; }
  if (low === "today" || low === "aujourd'hui") return { at: f, source: "inferred", confidence: "medium" };
  const relEn = low.match(/(\d+)\s+(hour|hours|day|days|minute|minutes)\s+ago/);
  if (relEn) {
    const n = Number(relEn[1]); const unit = relEn[2];
    const d = new Date(f);
    if (unit.startsWith("hour")) d.setHours(d.getHours()-n);
    else if (unit.startsWith("day")) d.setDate(d.getDate()-n);
    else if (unit.startsWith("minute")) d.setMinutes(d.getMinutes()-n);
    return { at: d, source: "inferred", confidence: "medium" };
  }
  const relFr = low.match(/il y a\s+(\d+)\s+(heure|heures|jour|jours|minute|minutes)/);
  if (relFr) {
    const n = Number(relFr[1]); const unit = relFr[2];
    const d = new Date(f);
    if (unit.startsWith("heure")) d.setHours(d.getHours()-n);
    else if (unit.startsWith("jour")) d.setDate(d.getDate()-n);
    else if (unit.startsWith("minute")) d.setMinutes(d.getMinutes()-n);
    return { at: d, source: "inferred", confidence: "medium" };
  }

  // fallback try Date.parse
  if (!isNaN(Date.parse(s))) {
    return { at: new Date(Date.parse(s)), source: "feed", confidence: "medium" };
  }
  return { at: f, source: "fetched", confidence: "low" };
}