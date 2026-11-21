export type DateSource = "feed" | "inferred" | "fetched";
export type DateConfidence = "high" | "medium" | "low";

export interface ParsedDate {
  at: Date | null;
  source: DateSource;
  confidence: DateConfidence;
}

type DateKind = "epoch" | "iso" | "rfc822" | "textual" | "numeric" | "relative" | "unknown";
type DetailedDate = { at: Date | null; kind: DateKind };

// Clés normalisées : minuscules, sans accents ni points (« nov. » -> « nov »).
const MONTHS: Record<string, number> = {
  janvier: 0, janv: 0, jan: 0, january: 0,
  fevrier: 1, fevr: 1, feb: 1, february: 1,
  mars: 2, mar: 2, march: 2,
  avril: 3, avr: 3, apr: 3, april: 3,
  mai: 4, may: 4,
  juin: 5, jun: 5, june: 5,
  juillet: 6, juil: 6, jul: 6, july: 6,
  aout: 7, aou: 7, aug: 7, august: 7,
  septembre: 8, sept: 8, sep: 8, september: 8,
  octobre: 9, oct: 9, october: 9,
  novembre: 10, nov: 10, november: 10,
  decembre: 11, dec: 11, december: 11,
};

const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{1,2}):(\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?(?:\s*(Z|[+-]\d{2}:?\d{2}))?)?$/i;
const RFC822_RE = /^(?:(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),\s*)?(\d{1,2})\s+([A-Za-zÀ-ÿ.]+)\s+(\d{2}|\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s+(Z|GMT|UTC|UT|[+-]\d{4}|[+-]\d{2}:\d{2}|EST|EDT|CST|CDT|MST|MDT|PST|PDT)$/i;
const NUMERIC_RE = /^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/;
const TEXT_DMY_RE = /^(\d{1,2})\s+([A-Za-zÀ-ÿ.]+)\s+(\d{4})$/;
const TEXT_MDY_RE = /^([A-Za-zÀ-ÿ.]+)\s+(\d{1,2}),?\s+(\d{4})$/;
const REL_FR_RE = /^il y a\s+(\d+)\s+(secondes?|minutes?|heures?|jours?|semaines?|mois|ans?)$/i;
const REL_EN_RE = /^(\d+)\s+(seconds?|minutes?|hours?|days?|weeks?|months?|years?)\s+ago$/i;

function norm(value: string): string {
  return value.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\./g, "");
}

/** Construit une date en UTC et refuse les composantes débordantes (30 février, 25:00...). */
function utcDate(y: number, m: number, d: number, hh = 0, mi = 0, ss = 0): Date | null {
  if (!Number.isInteger(y) || y < 100 || y > 9999) return null;
  if (!Number.isInteger(m) || m < 1 || m > 12) return null;
  if (!Number.isInteger(d) || d < 1 || d > 31) return null;
  if (!Number.isInteger(hh) || hh < 0 || hh > 23) return null;
  if (!Number.isInteger(mi) || mi < 0 || mi > 59) return null;
  if (!Number.isInteger(ss) || ss < 0 || ss > 59) return null;
  const at = new Date(Date.UTC(y, m - 1, d, hh, mi, ss));
  if (at.getUTCFullYear() !== y || at.getUTCMonth() !== m - 1 || at.getUTCDate() !== d) return null;
  return at;
}

function unitOf(token: string): string {
  const t = norm(token);
  if (t === "mois") return "month";
  if (t === "an" || t === "ans") return "year";
  if (t.startsWith("seconde")) return "second";
  if (t.startsWith("minute")) return "minute";
  if (t.startsWith("heure")) return "hour";
  if (t.startsWith("jour")) return "day";
  if (t.startsWith("semaine")) return "week";
  return t.replace(/s$/, "");
}

/** Soustrait une durée en UTC : le fuseau de la machine ne change jamais le résultat. */
function shift(now: Date, n: number, unit: string): Date {
  switch (unit) {
    case "second": return new Date(now.getTime() - n * 1_000);
    case "minute": return new Date(now.getTime() - n * 60_000);
    case "hour": return new Date(now.getTime() - n * 3_600_000);
    case "day": return new Date(now.getTime() - n * 86_400_000);
    case "week": return new Date(now.getTime() - n * 604_800_000);
    case "month": {
      const at = new Date(now.getTime());
      at.setUTCMonth(at.getUTCMonth() - n);
      return at;
    }
    case "year": {
      const at = new Date(now.getTime());
      at.setUTCFullYear(at.getUTCFullYear() - n);
      return at;
    }
    default: return new Date(now.getTime());
  }
}

function parseDetailed(raw: string | undefined, now: Date): DetailedDate {
  const s = (raw ?? "").trim();
  const none: DetailedDate = { at: null, kind: "unknown" };
  if (!s) return none;

  if (/^\d{10}$/.test(s) || /^\d{13}$/.test(s)) {
    const at = new Date(s.length === 10 ? Number(s) * 1_000 : Number(s));
    return Number.isNaN(at.getTime()) ? none : { at, kind: "epoch" };
  }

  const iso = s.match(ISO_RE);
  if (iso) {
    const y = Number(iso[1]); const m = Number(iso[2]); const d = Number(iso[3]);
    const hh = Number(iso[4] ?? 0); const mi = Number(iso[5] ?? 0); const ss = Number(iso[6] ?? 0);
    const ms = iso[7] ? Number((iso[7] + "000").slice(0, 3)) : 0;
    const tz = iso[8];
    const base = utcDate(y, m, d, hh, mi, ss);
    if (!base) return none;
    if (!tz) {
      base.setUTCMilliseconds(ms);
      return { at: base, kind: "iso" };
    }
    // Un offset explicite doit être converti par Date.parse ; les composantes
    // sont déjà validées, donc pas de débordement silencieux du type 30 février.
    const zone = /^[+-]\d{4}$/.test(tz) ? `${tz.slice(0, 3)}:${tz.slice(3)}` : tz.toUpperCase();
    const canonical = `${iso[1]}-${iso[2]}-${iso[3]}T${(iso[4] ?? "00").padStart(2, "0")}:${iso[5]}:${iso[6] ?? "00"}.${String(ms).padStart(3, "0")}${zone}`;
    const t = Date.parse(canonical);
    return Number.isNaN(t) ? none : { at: new Date(t), kind: "iso" };
  }

  const rfc = s.match(RFC822_RE);
  if (rfc) {
    const mon = MONTHS[norm(rfc[2])];
    if (mon === undefined) return none;
    const rawYear = Number(rfc[3]);
    const y = rfc[3].length === 2 ? (rawYear >= 70 ? 1900 + rawYear : 2000 + rawYear) : rawYear;
    const base = utcDate(y, mon + 1, Number(rfc[1]), Number(rfc[4]), Number(rfc[5]), Number(rfc[6] ?? 0));
    if (!base) return none;
    const t = Date.parse(s);
    return Number.isNaN(t) ? none : { at: new Date(t), kind: "rfc822" };
  }

  const num = s.match(NUMERIC_RE);
  if (num) {
    const at = utcDate(Number(num[3]), Number(num[2]), Number(num[1]),
      Number(num[4] ?? 0), Number(num[5] ?? 0), Number(num[6] ?? 0));
    return at ? { at, kind: "numeric" } : none;
  }

  const dmy = s.match(TEXT_DMY_RE);
  const mdy = dmy ? null : s.match(TEXT_MDY_RE);
  if (dmy || mdy) {
    const mon = MONTHS[norm(dmy ? dmy[2] : mdy![1])];
    if (mon === undefined) return none;
    const d = Number(dmy ? dmy[1] : mdy![2]);
    const y = Number(dmy ? dmy[3] : mdy![3]);
    const at = utcDate(y, mon + 1, d);
    return at ? { at, kind: "textual" } : none;
  }

  const low = s.toLowerCase();
  if (/^(hier|yesterday)$/.test(low)) return { at: shift(now, 1, "day"), kind: "relative" };
  if (/^(aujourd'hui|aujourd’hui|today)$/.test(low)) return { at: new Date(now.getTime()), kind: "relative" };
  const relFr = s.match(REL_FR_RE);
  const relEn = relFr ? null : s.match(REL_EN_RE);
  if (relFr || relEn) {
    const n = Number(relFr ? relFr[1] : relEn![1]);
    const unit = unitOf(relFr ? relFr[2] : relEn![2]);
    return { at: shift(now, n, unit), kind: "relative" };
  }

  // Chaîne non reconnue : jamais Date.parse en fourre-tout (il interprète le
  // texte anglais et les dates sans fuseau dans le fuseau local de la machine).
  return none;
}

/**
 * Parse une date de flux en un instant UTC, ou null si le format est inconnu
 * ou la date impossible. Les dates sans fuseau sont interprétées comme UTC.
 */
export function parseDate(raw: string | undefined, opts: { now?: Date } = {}): Date | null {
  return parseDetailed(raw, opts.now ?? new Date()).at;
}

/**
 * Adaptateur pour l'ingestion : conserve la source, la confiance et le repli
 * sur l'instant de collecte (les événements sans observed_at sont rejetés).
 */
export function parseObservedAt(raw: string | undefined, opts: { fetchedAt: Date }): ParsedDate {
  const { at, kind } = parseDetailed(raw, opts.fetchedAt);
  if (at) {
    if (kind === "epoch" || kind === "iso" || kind === "rfc822") return { at, source: "feed", confidence: "high" };
    return { at, source: "inferred", confidence: "medium" };
  }
  return { at: opts.fetchedAt, source: "fetched", confidence: "low" };
}
