import { useMemo, useState, type CSSProperties } from "react";
import { sourceStatus, type Source, type SourceStatus } from "../api";
import {
  FAMILY_LABEL,
  SOURCE_STATUS_LABEL,
  SOURCE_STATUS_TONE,
  formatDate,
  formatNumber,
  formatRelative,
  truncate,
} from "./SourcesView";

type SortKey = "status" | "name" | "family" | "lastOkAt" | "lastError" | "lastItems";
type SortDir = "asc" | "desc";

/** Poids d'ordonnancement : les erreurs d'abord, puis l'inconnu, puis le succès. */
const STATUS_RANK: Record<SourceStatus, number> = { error: 0, pending: 1, ok: 2 };

const COLUMNS: { key: SortKey; label: string; num?: boolean }[] = [
  { key: "status", label: "état" },
  { key: "name", label: "source" },
  { key: "family", label: "famille" },
  { key: "lastOkAt", label: "dernier succès" },
  { key: "lastError", label: "dernière erreur" },
  { key: "lastItems", label: "derniers éléments", num: true },
];

const TOOLBAR_STYLE: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "var(--space-3)",
  flexWrap: "wrap",
  marginBottom: "var(--space-4)",
};

const FIELD_STYLE: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "var(--space-2)",
  fontSize: 12,
  color: "var(--muted)",
};

function isStatus(value: string): value is SourceStatus | "all" {
  return value === "all" || value === "ok" || value === "error" || value === "pending";
}

/** Compare deux sources sur une colonne ; les valeurs absentes restent en fin de liste. */
function compareSources(a: Source, b: Source, key: SortKey, dir: SortDir): number {
  const sign = dir === "asc" ? 1 : -1;
  switch (key) {
    case "status": {
      const d = STATUS_RANK[sourceStatus(a)] - STATUS_RANK[sourceStatus(b)];
      return d !== 0 ? d * sign : a.name.localeCompare(b.name, "fr");
    }
    case "name":
      return a.name.localeCompare(b.name, "fr") * sign;
    case "family":
      return (a.family.localeCompare(b.family, "fr") || a.name.localeCompare(b.name, "fr")) * sign;
    case "lastOkAt":
    case "lastError": {
      const aRaw = a[key];
      const bRaw = b[key];
      const av = aRaw ? Date.parse(aRaw) : Number.NaN;
      const bv = bRaw ? Date.parse(bRaw) : Number.NaN;
      if (Number.isNaN(av)) return Number.isNaN(bv) ? 0 : 1;
      if (Number.isNaN(bv)) return -1;
      return (av - bv) * sign;
    }
    case "lastItems": {
      const av = a.lastItems ?? Number.NaN;
      const bv = b.lastItems ?? Number.NaN;
      if (Number.isNaN(av)) return Number.isNaN(bv) ? 0 : 1;
      if (Number.isNaN(bv)) return -1;
      return (av - bv) * sign;
    }
  }
}

export type HealthViewProps = {
  /**
   * Flux déclarés, tels que renvoyés par `GET /api/sources`
   * (dernier succès, dernière erreur, volumes…).
   * En mode démonstration, passer `mockData.sources`.
   */
  sources: Source[];
};

/**
 * Vue « santé des sources » : une ligne par flux avec état, fraîcheur du dernier
 * succès et volume récent. Filtres par famille et par état, tri par colonne.
 *
 * Branchage dans App.tsx :
 *   {view === "sante" ? <HealthView sources={sources} /> : …}
 * où `sources` est l'état chargé via `api.sources()` (ou `mockData.sources`
 * en mode démonstration).
 */
export default function HealthView({ sources }: HealthViewProps) {
  const [family, setFamily] = useState<string>("all");
  const [status, setStatus] = useState<SourceStatus | "all">("all");
  const [sortKey, setSortKey] = useState<SortKey>("status");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const families = useMemo(() => {
    const set = new Set<string>();
    for (const s of sources) set.add(s.family);
    return [...set].sort((a, b) => a.localeCompare(b, "fr"));
  }, [sources]);

  const counts = useMemo(() => {
    const c: Record<SourceStatus, number> = { ok: 0, error: 0, pending: 0 };
    for (const s of sources) c[sourceStatus(s)] += 1;
    return c;
  }, [sources]);

  const visible = useMemo(() => {
    const filtered = sources.filter(
      (s) =>
        (family === "all" || s.family === family) &&
        (status === "all" || sourceStatus(s) === status)
    );
    return [...filtered].sort((a, b) => compareSources(a, b, sortKey, sortDir));
  }, [sources, family, status, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(key);
    setSortDir(key === "lastOkAt" || key === "lastItems" ? "desc" : "asc");
  }

  return (
    <section className="sources">
      <header>
        <h1>santé des sources</h1>
        <p>
          {sources.length} flux · {counts.ok} ok · {counts.error} en erreur · {counts.pending}{" "}
          jamais collectés
        </p>
      </header>

      <div style={TOOLBAR_STYLE}>
        <label style={FIELD_STYLE}>
          famille
          <select value={family} onChange={(e) => setFamily(e.target.value)}>
            <option value="all">toutes ({families.length})</option>
            {families.map((f) => (
              <option key={f} value={f}>
                {FAMILY_LABEL[f] ?? f}
              </option>
            ))}
          </select>
        </label>
        <label style={FIELD_STYLE}>
          état
          <select
            value={status}
            onChange={(e) => {
              const value = e.target.value;
              if (isStatus(value)) setStatus(value);
            }}
          >
            <option value="all">tous ({sources.length})</option>
            <option value="ok">ok ({counts.ok})</option>
            <option value="error">erreur ({counts.error})</option>
            <option value="pending">jamais collectés ({counts.pending})</option>
          </select>
        </label>
        <span style={{ color: "var(--faint)", fontSize: 12 }}>
          {visible.length} flux affiché{visible.length > 1 ? "s" : ""}
        </span>
      </div>

      <div className="sources__scroll">
      <table className="data">
        <thead>
          <tr>
            {COLUMNS.map((col) => (
              <th
                key={col.key}
                aria-sort={
                  sortKey === col.key ? (sortDir === "asc" ? "ascending" : "descending") : "none"
                }
                style={{
                  cursor: "pointer",
                  userSelect: "none",
                  textAlign: col.num ? "right" : undefined,
                }}
                title={sortKey === col.key ? "inverser le tri" : "trier"}
                onClick={() => toggleSort(col.key)}
              >
                {col.label}
                {sortKey === col.key ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {visible.map((s) => {
            const st = sourceStatus(s);
            return (
              <tr key={s.id}>
                <td>
                  <span className="badge" data-tone={SOURCE_STATUS_TONE[st]}>
                    {SOURCE_STATUS_LABEL[st]}
                  </span>
                </td>
                <td>
                  <div>{s.name}</div>
                  <div className="mono">
                    <a href={s.url} target="_blank" rel="noreferrer">
                      {truncate(s.url, 70)}
                    </a>
                  </div>
                </td>
                <td>{FAMILY_LABEL[s.family] ?? s.family}</td>
                <td className="mono" title={s.lastOkAt ? formatDate(s.lastOkAt) : "jamais collecté"}>
                  {formatRelative(s.lastOkAt)}
                </td>
                <td className="mono" title={s.lastError ?? undefined}>
                  {s.lastError ? truncate(s.lastError, 80) : "—"}
                </td>
                <td className="num">{formatNumber(s.lastItems)}</td>
              </tr>
            );
          })}
          {visible.length === 0 && (
            <tr>
              <td colSpan={COLUMNS.length} style={{ color: "var(--faint)" }}>
                {sources.length === 0
                  ? "Aucun flux déclaré."
                  : "Aucun flux ne correspond aux filtres."}
              </td>
            </tr>
          )}
        </tbody>
      </table>
      </div>
    </section>
  );
}
