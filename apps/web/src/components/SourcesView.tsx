import { useMemo, useState } from "react";
import { sourceStatus, type Source, type SourceStatus } from "../api";
import type { SourcesViewProps } from "../contracts";
import "./sources.css";

/** Libellés français des familles de sources (le reste est affiché brut). */
export const FAMILY_LABEL: Record<string, string> = {
  ransomware: "rançongiciel",
  vuln: "vulnérabilité",
  phishing: "hameçonnage",
  malware: "maliciel",
  cert: "certificats",
  cert_fr: "CERT-FR",
  typosquat: "typosquatting",
  reputation: "réputation",
  cti: "CTI",
};

const STATUS_LABEL: Record<SourceStatus, string> = {
  ok: "ok",
  error: "erreur",
  pending: "jamais collecté",
};

type SortKey = "name" | "family" | "status" | "lastOkAt" | "lastErrorAt" | "itemsTotal";
type SortDir = "asc" | "desc";

const COLUMNS: { key: SortKey; label: string; num?: boolean }[] = [
  { key: "name", label: "source" },
  { key: "family", label: "famille" },
  { key: "status", label: "état" },
  { key: "lastOkAt", label: "dernier succès" },
  { key: "lastErrorAt", label: "dernier échec" },
  { key: "itemsTotal", label: "éléments", num: true },
];

/** Les erreurs d'abord, puis l'inconnu, puis le succès. */
const STATUS_RANK: Record<SourceStatus, number> = { error: 0, pending: 1, ok: 2 };

/** Horodatage d'une valeur, `null` quand elle est absente. */
function timestamp(value: string | null): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

export function formatNumber(value: number | null): string {
  return value === null ? "—" : value.toLocaleString("fr-FR");
}

/** « il y a 12 min », « il y a 3 h », « il y a 2 j »… */
export function formatRelative(value: string | null): string {
  if (!value) return "jamais";
  const then = timestamp(value);
  if (then === null) return "—";
  const diff = Date.now() - then;
  if (diff < 0) return "à l'instant";
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "à l'instant";
  if (minutes < 60) return `il y a ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `il y a ${hours} h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `il y a ${days} j`;
  return `il y a ${Math.floor(days / 30)} mois`;
}

/** Date courte en français, pour l'infobulle d'un horodatage. */
export function formatAbsolute(value: string | null): string {
  const then = timestamp(value);
  if (then === null) return "jamais";
  return new Date(then).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" });
}

/** Compare deux sources sur une colonne ; les valeurs absentes restent en fin de liste. */
function compareSources(a: Source, b: Source, key: SortKey, dir: SortDir): number {
  const sign = dir === "asc" ? 1 : -1;
  switch (key) {
    case "status": {
      const rank = STATUS_RANK[sourceStatus(a)] - STATUS_RANK[sourceStatus(b)];
      return rank !== 0 ? rank * sign : a.name.localeCompare(b.name, "fr");
    }
    case "name":
      return a.name.localeCompare(b.name, "fr") * sign;
    case "family":
      return (a.family.localeCompare(b.family, "fr") || a.name.localeCompare(b.name, "fr")) * sign;
    case "lastOkAt":
    case "lastErrorAt": {
      const av = timestamp(a[key]);
      const bv = timestamp(b[key]);
      if (av === null) return bv === null ? 0 : 1;
      if (bv === null) return -1;
      return (av - bv) * sign;
    }
    case "itemsTotal": {
      const av = a.itemsTotal;
      const bv = b.itemsTotal;
      if (av === null) return bv === null ? 0 : 1;
      if (bv === null) return -1;
      return (av - bv) * sign;
    }
  }
}

/**
 * Vue « sources » : registre des flux surveillés, une ligne par source.
 * La pastille d'état vient de `sourceStatus()` : bleu pour un succès,
 * orange pour une erreur, gris tant que rien n'a été collecté.
 */
export default function SourcesView({ sources, loading, error }: SourcesViewProps) {
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const rows = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("fr");
    const filtered = needle
      ? sources.filter((s) => s.name.toLocaleLowerCase("fr").includes(needle))
      : sources;
    return [...filtered].sort((a, b) => compareSources(a, b, sortKey, sortDir));
  }, [sources, query, sortKey, sortDir]);

  const counts = useMemo(() => {
    const c: Record<SourceStatus, number> = { ok: 0, error: 0, pending: 0 };
    for (const s of sources) c[sourceStatus(s)] += 1;
    return c;
  }, [sources]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((dir) => (dir === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(key);
    setSortDir(key === "lastOkAt" || key === "lastErrorAt" || key === "itemsTotal" ? "desc" : "asc");
  }

  return (
    <section className="sources-view" aria-label="Sources">
      <header className="sources-view__head">
        <h1 className="sources-view__title">Sources</h1>
        <p className="sources-view__summary">
          {sources.length} flux déclarés · {counts.ok} ok · {counts.error} en erreur ·{" "}
          {counts.pending} jamais collectés
        </p>
      </header>

      <div className="sources-view__toolbar">
        <label className="sources-view__search">
          <span className="sources-view__search-label">recherche</span>
          <input
            type="search"
            value={query}
            placeholder="nom de source"
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <span className="sources-view__count">
          {rows.length} affichée{rows.length > 1 ? "s" : ""}
        </span>
      </div>

      <div className="sources-view__scroll">
        <table className="sources-table">
          <caption className="sources-view__caption">
            Registre des sources surveillées
          </caption>
          <thead>
            <tr>
              {COLUMNS.map((col) => (
                <th
                  key={col.key}
                  scope="col"
                  aria-sort={
                    sortKey === col.key
                      ? sortDir === "asc"
                        ? "ascending"
                        : "descending"
                      : "none"
                  }
                  className={col.num ? "sources-table__num" : undefined}
                >
                  <button type="button" className="sources-table__sort" onClick={() => toggleSort(col.key)}>
                    {col.label}
                    <span className="sources-table__arrow" aria-hidden="true">
                      {sortKey === col.key ? (sortDir === "asc" ? "↑" : "↓") : ""}
                    </span>
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((source) => {
              const status = sourceStatus(source);
              return (
                <tr key={source.id}>
                  <th scope="row" className="sources-table__name">
                    {source.name}
                  </th>
                  <td className="sources-table__family">{FAMILY_LABEL[source.family] ?? source.family}</td>
                  <td className="sources-table__status">
                    <span className="sources-status" data-status={status}>
                      <span className="sources-status__dot" aria-hidden="true" />
                      {STATUS_LABEL[status]}
                    </span>
                  </td>
                  <td className="sources-table__time">
                    <span title={formatAbsolute(source.lastOkAt)}>
                      {formatRelative(source.lastOkAt)}
                    </span>
                  </td>
                  <td className="sources-table__time">
                    <span title={formatAbsolute(source.lastErrorAt)}>
                      {formatRelative(source.lastErrorAt)}
                    </span>
                  </td>
                  <td className="sources-table__num">{formatNumber(source.itemsTotal)}</td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={COLUMNS.length} className="sources-table__empty">
                  {loading
                    ? "chargement des sources…"
                    : error
                      ? error
                      : sources.length === 0
                        ? "aucune source déclarée"
                        : "aucune source ne correspond à la recherche"}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/** Libellés des états de source, partagés avec la vue Santé. */
export const SOURCE_STATUS_LABEL: Record<SourceStatus, string> = {
  ok: "ok",
  error: "erreur",
  pending: "en attente",
};

/** Tonalité visuelle associée à chaque état de source. */
export const SOURCE_STATUS_TONE: Record<SourceStatus, string> = {
  ok: "ok",
  error: "error",
  pending: "pending",
};

/** Date absolue courte, alias de `formatAbsolute` pour la vue Santé. */
export function formatDate(value: string | null): string {
  return formatAbsolute(value);
}

/** Tronque une chaîne longue en gardant la fin lisible. */
export function truncate(value: string, max = 48): string {
  if (value.length <= max) return value;
  return value.slice(0, Math.max(0, max - 1)) + "…";
}
