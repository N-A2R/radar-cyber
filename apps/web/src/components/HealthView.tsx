import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import {
  api,
  sourceStatus,
  type HealthSources,
  type HealthSourcesQuery,
  type LigneSourceSante,
  type Source,
  type SourceStatus,
} from "../api";
import {
  FAMILY_LABEL,
  SOURCE_STATUS_LABEL,
  formatDate,
  formatNumber,
  formatRelative,
  truncate,
} from "./SourcesView";
import { EmptyState, LoadingSkeleton } from "./Skeleton";
import "./health-view.css";

type SortKey = NonNullable<HealthSourcesQuery["sort"]>;
type SortDir = "asc" | "desc";

const COLUMNS: { key: SortKey; label: string; num?: boolean }[] = [
  { key: "status", label: "état" },
  { key: "name", label: "source" },
  { key: "family", label: "famille" },
  { key: "lastOkAt", label: "dernier succès" },
  { key: "lastError", label: "dernière erreur" },
  { key: "lastItems", label: "derniers éléments", num: true },
];

/** Tonalités déjà stylées par `.badge` : succès vert, erreur rouge, attente bleu. */
const BADGE_TONE: Record<SourceStatus, string> = {
  ok: "success",
  error: "danger",
  pending: "info",
};

const PAGE_SIZE = 50;
/** Délai de saisie avant d'interroger l'API : 300 ms, pas une requête par touche. */
const DELAI_RECHERCHE_MS = 300;

const TOOLBAR_STYLE: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "var(--space-3)",
  flexWrap: "wrap",
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

export type HealthViewProps = {
  /**
   * Jeu de démonstration (`VITE_DATA_MODE=mock`) : filtré et paginé en mémoire.
   * En mode serveur, ce prop est ignoré et la vue interroge l'API.
   */
  sources?: Source[];
  /**
   * Chargement du parent : tant qu'il dure, on garde le squelette au lieu
   * d'annoncer un « résumé indisponible » prématuré.
   */
  loading?: boolean;
  /** Relance externe (bouton du parent) : force une nouvelle lecture. */
  onRetry?: () => void;
};

/**
 * Vue « santé des sources » : une ligne par flux, page par page.
 *
 * Rien n'est filtré localement en mode serveur : chaque changement de filtre,
 * de tri ou de page appelle `GET /api/health/sources`, dont le résumé SQL
 * annonce la flotte entière. Tant que la première réponse n'est pas arrivée,
 * l'écran montre un squelette — jamais des zéros, qui se liraient comme une
 * mesure.
 */
export default function HealthView({ sources = [], loading: chargementParent = false, onRetry }: HealthViewProps) {
  const demo = import.meta.env.VITE_DATA_MODE === "mock" ? sources : null;

  const [family, setFamily] = useState<string>("all");
  const [status, setStatus] = useState<SourceStatus | "all">("all");
  const [sortKey, setSortKey] = useState<SortKey>("status");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [saisie, setSaisie] = useState("");
  const [recherche, setRecherche] = useState("");
  const [page, setPage] = useState(1);
  const [essai, setEssai] = useState(0);
  const [data, setData] = useState<HealthSources | null>(null);
  const [lecture, setLecture] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);

  // La recherche part après une pause de frappe ; la page repart à 1 pour ne
  // pas afficher « page 7 » d'un résultat qui n'en a plus qu'une.
  useEffect(() => {
    const timer = setTimeout(() => {
      const q = saisie.trim();
      setRecherche(q);
      setPage(1);
    }, DELAI_RECHERCHE_MS);
    return () => clearTimeout(timer);
  }, [saisie]);

  const filtres = useMemo(
    () => ({
      family: family === "all" ? null : family,
      status: status === "all" ? null : status,
      q: recherche === "" ? null : recherche,
      page,
      pageSize: PAGE_SIZE,
      sort: sortKey,
      dir: sortDir,
    }),
    [family, status, recherche, page, sortKey, sortDir],
  );

  useEffect(() => {
    if (demo !== null) {
      setData(pageDemo(demo, filtres));
      setErreur(null);
      setLecture(false);
      return;
    }
    const ctrl = new AbortController();
    setLecture(true);
    api
      .healthSources(filtres, ctrl.signal)
      .then((d) => {
        if (ctrl.signal.aborted) return;
        setData(d);
        setErreur(null);
      })
      .catch((e: unknown) => {
        if (ctrl.signal.aborted) return;
        setErreur(e instanceof Error ? e.message : "erreur réseau");
        setData(null);
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setLecture(false);
      });
    return () => ctrl.abort();
  }, [demo, filtres, essai]);

  const reessayer = useCallback(() => {
    setErreur(null);
    setEssai((n) => n + 1);
    onRetry?.();
  }, [onRetry]);

  function changerFamille(value: string) {
    setFamily(value);
    setPage(1);
  }

  function changerStatut(value: string) {
    if (isStatus(value)) {
      setStatus(value);
      setPage(1);
    }
  }

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "lastOkAt" || key === "lastItems" ? "desc" : "asc");
    }
    setPage(1);
  }

  const items = data?.items ?? [];
  const counts = data?.counts;
  const premier = data === null || data.items.length === 0 ? 0 : (data.page - 1) * data.pageSize + 1;
  const dernier = data === null ? 0 : premier + data.items.length - 1;

  return (
    <section className="health-view" aria-label="santé des sources">
      <header className="health-view__head">
        <h1>santé des sources</h1>
        {data === null ? (
          <p className="health-view__resume" role="status">
            {lecture || chargementParent ? "lecture des sources…" : "résumé indisponible"}
          </p>
        ) : (
          <p className="health-view__resume">
            {formatNumber(data.total)} flux · {formatNumber(counts?.ok ?? null)} ok ·{" "}
            {formatNumber(counts?.error ?? null)} en erreur ·{" "}
            {formatNumber(counts?.pending ?? null)} jamais collectés
          </p>
        )}
      </header>

      <div className="health-view__toolbar" style={TOOLBAR_STYLE}>
        <label style={FIELD_STYLE}>
          famille
          <select value={family} onChange={(e) => changerFamille(e.target.value)}>
            <option value="all">toutes{data === null ? "" : ` (${data.families.length})`}</option>
            {(data?.families ?? []).map((f) => (
              <option key={f.family} value={f.family}>
                {FAMILY_LABEL[f.family] ?? f.family} ({formatNumber(f.sources)})
              </option>
            ))}
          </select>
        </label>
        <label style={FIELD_STYLE}>
          état
          <select value={status} onChange={(e) => changerStatut(e.target.value)}>
            <option value="all">tous{data === null ? "" : ` (${formatNumber(data.total)})`}</option>
            <option value="ok">ok{data === null ? "" : ` (${formatNumber(counts?.ok ?? null)})`}</option>
            <option value="error">erreur{data === null ? "" : ` (${formatNumber(counts?.error ?? null)})`}</option>
            <option value="pending">
              jamais collectés{data === null ? "" : ` (${formatNumber(counts?.pending ?? null)})`}
            </option>
          </select>
        </label>
        <label style={FIELD_STYLE}>
          recherche
          <input
            type="search"
            value={saisie}
            placeholder="nom ou URL"
            onChange={(e) => setSaisie(e.target.value)}
          />
        </label>
        {data === null ? null : (
          <span className="health-view__compte" style={{ fontSize: 12 }}>
            {data.items.length === 0
              ? "0 flux affiché"
              : `${formatNumber(premier)}–${formatNumber(dernier)} sur ${formatNumber(data.matching)} affichés`}
          </span>
        )}
      </div>

      <div className="health-view__body">
        {erreur !== null && data === null ? (
          <div className="health-view__erreur">
            <EmptyState
              role="alert"
              message={`sources indisponibles : ${erreur}`}
              actionLabel="Réessayer"
              onAction={reessayer}
            />
          </div>
        ) : data === null ? (
          <div className="health-view__attente">
            <LoadingSkeleton label="lecture des sources…" />
          </div>
        ) : (
          <table className="data">
            <thead>
              <tr>
                {COLUMNS.map((col) => (
                  <th
                    key={col.key}
                    aria-sort={
                      sortKey === col.key ? (sortDir === "asc" ? "ascending" : "descending") : "none"
                    }
                    style={{ textAlign: col.num ? "right" : undefined }}
                  >
                    <button
                      type="button"
                      className="data__sort"
                      data-sort={col.key}
                      title={sortKey === col.key ? "inverser le tri" : "trier"}
                      aria-label={`Trier par ${col.label}`}
                      onClick={() => toggleSort(col.key)}
                    >
                      {col.label}
                      {sortKey === col.key ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map((s) => (
                <tr key={s.id}>
                  <td>
                    <span className="badge" data-tone={BADGE_TONE[s.status]}>
                      {SOURCE_STATUS_LABEL[s.status]}
                    </span>
                  </td>
                  <td>
                    <div>
                      {s.name}
                      {s.enabled ? "" : " · désactivée"}
                    </div>
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
              ))}
              {items.length === 0 && (
                <tr>
                  <td colSpan={COLUMNS.length}>
                    <EmptyState
                      message={
                        data.matching === 0 && (recherche !== "" || family !== "all" || status !== "all")
                          ? "Aucun flux ne correspond aux filtres."
                          : "Aucun flux déclaré."
                      }
                      actionLabel="Effacer les filtres"
                      onAction={() => {
                        setSaisie("");
                        setRecherche("");
                        setFamily("all");
                        setStatus("all");
                        setPage(1);
                      }}
                    />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {data === null ? null : (
        <footer className="health-view__pager">
          <button
            type="button"
            className="health-view__page-btn"
            disabled={data.page <= 1 || lecture}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            précédent
          </button>
          <span className="health-view__page-etat">
            page {formatNumber(data.page)} / {formatNumber(data.pages)}
            {lecture ? " · lecture…" : ""}
          </span>
          <button
            type="button"
            className="health-view__page-btn"
            disabled={data.page >= data.pages || lecture}
            onClick={() => setPage((p) => Math.min(data.pages, p + 1))}
          >
            suivant
          </button>
        </footer>
      )}
    </section>
  );
}

/**
 * Pagination en mémoire pour le mode démonstration uniquement : le jeu simulé
 * fait quelques dizaines de lignes, aucun appel réseau n'a lieu dans ce mode.
 */
type FiltresDemo = Required<
  Pick<HealthSourcesQuery, "family" | "status" | "q" | "page" | "pageSize" | "sort" | "dir">
>;

function pageDemo(sources: Source[], f: FiltresDemo): HealthSources {
  const toutes = sources.map<LigneSourceSante>((s) => ({
    id: s.id,
    name: s.name,
    family: s.family,
    url: s.url,
    enabled: s.enabled,
    status: sourceStatus(s),
    lastOkAt: s.lastOkAt,
    lastErrorAt: s.lastErrorAt,
    lastError: s.lastError ?? null,
    lastItems: s.lastItems ?? null,
  }));
  const counts: Record<SourceStatus, number> = { ok: 0, error: 0, pending: 0 };
  const familles = new Map<string, number>();
  for (const s of toutes) {
    counts[s.status] += 1;
    familles.set(s.family, (familles.get(s.family) ?? 0) + 1);
  }
  const q = f.q?.toLowerCase() ?? null;
  const filtrees = toutes.filter(
    (s) =>
      (f.family === null || s.family === f.family) &&
      (f.status === null || s.status === f.status) &&
      (q === null || s.name.toLowerCase().includes(q) || s.url.toLowerCase().includes(q)),
  );
  const signe = f.dir === "desc" ? -1 : 1;
  const rang: Record<SourceStatus, number> = { error: 0, pending: 1, ok: 2 };
  filtrees.sort((a, b) => {
    let d = 0;
    if (f.sort === "status") d = rang[a.status] - rang[b.status];
    else if (f.sort === "name") d = a.name.localeCompare(b.name, "fr");
    else if (f.sort === "family") d = a.family.localeCompare(b.family, "fr");
    else if (f.sort === "lastError") d = (a.lastError ?? "").localeCompare(b.lastError ?? "", "fr");
    else if (f.sort === "lastItems") d = (a.lastItems ?? -1) - (b.lastItems ?? -1);
    else d = (a.lastOkAt ? Date.parse(a.lastOkAt) : 0) - (b.lastOkAt ? Date.parse(b.lastOkAt) : 0);
    return d === 0 ? a.name.localeCompare(b.name, "fr") : d * signe;
  });
  const debut = (f.page - 1) * f.pageSize;
  return {
    ok: true,
    generatedAt: new Date().toISOString(),
    total: toutes.length,
    counts,
    families: [...familles]
      .map(([famille, n]) => ({ family: famille, sources: n }))
      .sort((a, b) => a.family.localeCompare(b.family, "fr")),
    matching: filtrees.length,
    page: f.page,
    pageSize: f.pageSize,
    pages: Math.max(1, Math.ceil(filtrees.length / f.pageSize)),
    items: filtrees.slice(debut, debut + f.pageSize),
  };
}
