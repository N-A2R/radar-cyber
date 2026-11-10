export type RealFormat = "rss" | "atom" | "rdf" | "json" | "html" | "csv" | "text" | "empty";

export function sniffFormat(text: string, contentType: string | null): RealFormat {
  const t = text.trimStart();
  if (!t) return "empty";
  const ct = (contentType ?? "").toLowerCase();

  // XML feeds first (content may be mislabeled json)
  if (t.startsWith("<")) {
    if (/<rdf:RDF\b/i.test(t) || (/xmlns:rdf/i.test(t) && /<(?:[\w.-]+:)?item\b/i.test(t))) return "rdf";
    if (/<feed\b/i.test(t)) return "atom";
    if (/<rss\b/i.test(t) || /<(?:[\w.-]+:)?channel\b/i.test(t) && /<(?:[\w.-]+:)?item\b/i.test(t)) return "rss";
    if (/<!doctype html/i.test(t) || /<html\b/i.test(t)) return "html";
    // generic XML that still looks like a feed
    if (/<(?:[\w.-]+:)?entry\b/i.test(t)) return "atom";
    if (/<(?:[\w.-]+:)?item\b/i.test(t)) return "rss";
    if (ct.includes("html")) return "html";
    return "text";
  }

  if (t.startsWith("{") || t.startsWith("[")) {
    try { JSON.parse(text); return "json"; } catch { /* fall through */ }
  }

  if (ct.includes("json") && (t.startsWith("{") || t.startsWith("["))) return "json";

  if (/<!doctype html/i.test(t) || /^<html\b/i.test(t)) return "html";

  // CSV-ish: header + delimiter, no angle brackets
  const firstLine = t.split(/\r?\n/, 1)[0] ?? "";
  if (!t.includes("<") && /[,;\t]/.test(firstLine) && t.split(/\r?\n/).filter(Boolean).length >= 2) {
    const cols = [",", ";", "\t"].map((d) => firstLine.split(d).length).sort((a, b) => b - a)[0] ?? 0;
    if (cols >= 2) return "csv";
  }

  return "text";
}
