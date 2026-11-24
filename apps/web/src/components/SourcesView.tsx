import { useMemo, useState } from "react";
import { api, registreTraitementsExportFilename, motifLabel, sourceStatus, sourceYield, type Source, type SourceStatus, type SourceYield } from "../api";
import { downloadBlob } from "../export";
import type { SourcesViewProps } from "../contracts";
import { EmptyState, LoadingSkeleton } from "./Skeleton";
import "./sources.css";
import RelancerButton from "./RelancerButton";
import { Button } from "@astryxdesign/core/Button";

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
  presse_locale: "presse locale",
};

const STATUS_LABEL: Record<SourceStatus, string> = {
  ok: "ok",
  error: "erreur",
  pending: "jamais collecté",
};

/**
 * Libellé court de l'état dans le tableau : « jamais collecté » débordait de
 * sa colonne et se lisait par-dessus la date de production. Le libellé complet
 * reste dans l'infobulle de la pastille.
 */
const STATUS_CELL_LABEL: Record<SourceStatus, string> = {
  ok: "ok",
  error: "erreur",
  pending: "jamais",
};

type SortKey =
  | "name"
  | "family"
  | "status"
  | "lastProduction"
  | "lastErrorAt"
  | "itemsTotal"
  | "entrees"
  | "evenements30j"
  | "rendement"
  | "motif"
  | "unicite"
  // Tri par défaut, propre au registre : par gravité du problème, pas par date.
  | "yield";
type SortDir = "asc" | "desc";

/**
 * Colonnes du registre, dans l'ordre du `<colgroup>`, du `<thead>` et du
 * `<tbody>` — les trois doivent rester alignés, sinon les en-têtes glissent
 * d'une colonne. Les largeurs et les colonnes masquées quand la place manque
 * sont décidées par les `@container` de `sources.css`.
 */
const COLUMNS: { key: SortKey; label: string; num?: boolean; hint?: string }[] = [
  { key: "name", label: "source" },
  { key: "family", label: "famille" },
  { key: "status", label: "état", hint: "réponse de la dernière collecte" },
  { key: "lastProduction", label: "dernière production", hint: "dernier fait produit ; à défaut, dernier succès de collecte" },
  { key: "lastErrorAt", label: "dernier échec", hint: "le dernier passage a échoué" },
  { key: "entrees", label: "lues 30 j", num: true, hint: "entrées lues par le collecteur" },
  { key: "evenements30j", label: "évén. 30 j", num: true, hint: "événements attribués à la source" },
  { key: "rendement", label: "rendement", num: true, hint: "part des entrées lues devenues un événement" },
  { key: "motif", label: "motif de rejet", hint: "ce qui coûte le plus d'entrées sur le dernier run" },
  {
    key: "unicite",
    label: "unicité",
    num: true,
    hint: "faits où elle est la seule à parler / faits où elle apparaît — ce qu'elle apporte que personne d'autre n'apporte",
  },
];

/** Libellés des rendements : ce que la source rapporte, pas si elle répond. */
export const YIELD_LABEL: Record<SourceYield, string> = {
  productive: "productive",
  vide: "lit sans rendre",
  muette: "muette",
  inconnue: "inconnue",
};

const YIELD_HINT: Record<SourceYield, string> = {
  productive: "au moins un événement retenu sur 30 jours",
  vide: "des entrées sont lues mais aucune n'est retenue : porte ou parseur en cause",
  muette: "le collecteur est passé sans rien lire",
  inconnue: "aucun passage mesurable — ce n'est pas un zéro, c'est une absence de mesure",
};

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

/** Date de dernière production : dernier fait produit, à défaut dernier succès. */
export function lastProductionAt(source: Source): string | null {
  return source.lastEventAt ?? source.lastOkAt;
}

const SEPT_JOURS_MS = 7 * 24 * 3600 * 1000;

/**
 * Taille d'une page du registre. 2 500 lignes montées d'un bloc coûtaient le
 * premier rendu ; on découpe après le filtre et le tri, donc les compteurs
 * restent ceux du résultat filtré, pas ceux de la page.
 */
export const PAGE_SIZE = 50;

/** Rouge au-delà de 7 jours sans production ; « jamais » est rouge aussi. */
export function isSourceRouge(source: Source, now = Date.now()): boolean {
  const at = timestamp(lastProductionAt(source));
  return at === null || now - at > SEPT_JOURS_MS;
}

/** Compteur affiché en tête du registre. */
export function countSourcesRouges(sources: Source[], now = Date.now()): number {
  return sources.filter((s) => isSourceRouge(s, now)).length;
}

/** Tri unitaire par dernière production croissante ; jamais produit en tête. */
export function sortByLastProduction(sources: Source[]): Source[] {
  return [...sources].sort((a, b) => compareSources(a, b, "lastProduction", "asc"));
}

/** Gravité du rendement, pour le tri optionnel par « yield ». */
const YIELD_RANK: Record<SourceYield, number> = { vide: 0, muette: 1, inconnue: 2, productive: 3 };

/** Compare deux sources sur une colonne ; les valeurs absentes restent en fin de liste. */
function compareSources(a: Source, b: Source, key: SortKey, dir: SortDir): number {
  const sign = dir === "asc" ? 1 : -1;
  switch (key) {
    case "yield": {
      const rank = YIELD_RANK[sourceYield(a)] - YIELD_RANK[sourceYield(b)];
      if (rank !== 0) return rank * sign;
      // À gravité égale, le plus mauvais rendement d'abord ; l'inconnu ensuite.
      const av = a.rendement;
      const bv = b.rendement;
      if (av === null || bv === null) return av === bv ? a.name.localeCompare(b.name, "fr") : av === null ? 1 : -1;
      return (av - bv) * sign || a.name.localeCompare(b.name, "fr");
    }
    case "motif": {
      // Les motifs absents en fin de liste dans les deux sens : « non mesuré »
      // n'est pas « aucun rejet ».
      const av = a.motifDominant;
      const bv = b.motifDominant;
      if (av === null) return bv === null ? 0 : 1;
      if (bv === null) return -1;
      return av.localeCompare(bv, "fr") * sign;
    }
    case "status": {
      const rank = STATUS_RANK[sourceStatus(a)] - STATUS_RANK[sourceStatus(b)];
      return rank !== 0 ? rank * sign : a.name.localeCompare(b.name, "fr");
    }
    case "name":
      return a.name.localeCompare(b.name, "fr") * sign;
    case "family":
      return (a.family.localeCompare(b.family, "fr") || a.name.localeCompare(b.name, "fr")) * sign;
    case "itemsTotal": {
      const av = a.itemsTotal;
      const bv = b.itemsTotal;
      if (av === null) return bv === null ? 0 : 1;
      if (bv === null) return -1;
      return (av - bv) * sign;
    }
    case "lastProduction": {
      // « Jamais produit » est le plus ancien : il ouvre la liste en croissant.
      const av = timestamp(lastProductionAt(a));
      const bv = timestamp(lastProductionAt(b));
      if (av === null) return bv === null ? a.name.localeCompare(b.name, "fr") : -1;
      if (bv === null) return 1;
      return (av - bv) * sign || a.name.localeCompare(b.name, "fr");
    }
    case "lastErrorAt": {
      const av = timestamp(a.lastErrorAt);
      const bv = timestamp(b.lastErrorAt);
      if (av === null) return bv === null ? 0 : 1;
      if (bv === null) return -1;
      return (av - bv) * sign;
    }
    // Les valeurs absentes (`null`) restent en fin de liste dans les deux sens :
    // « inconnu » ne doit jamais être classé comme « mauvais ».
    case "entrees":
    case "evenements30j": {
      const av = a[key];
      const bv = b[key];
      if (av === null) return bv === null ? 0 : 1;
      if (bv === null) return -1;
      return (av - bv) * sign;
    }
    case "unicite": {
      // Les sources jamais évaluées (serveur antérieur) passent en fin, quel que
      // soit le sens : une absence de mesure n'est pas une mauvaise note.
      const av = a.partUniquesPct;
      const bv = b.partUniquesPct;
      if (av === undefined || bv === undefined) return av === bv ? 0 : av === undefined ? 1 : -1;
      return (av - bv) * sign;
    }
    case "rendement": {
      const av = a.rendement;
      const bv = b.rendement;
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
export default function SourcesView({ sources, loading, error, onRetry }: SourcesViewProps) {
  const [query, setQuery] = useState("");
  // Le registre est un outil de triage : ce qui n'a rien produit depuis le
  // plus longtemps remonte en tête, « jamais produit » en tout premier.
  const [sortKey, setSortKey] = useState<SortKey>("lastProduction");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [page, setPage] = useState(1);
  // Export du registre RGPD : une seule action dans la toolbar, sans droit
  // particulier (la route est publique) et sans bloquer le tri des sources.
  const [exportEnCours, setExportEnCours] = useState(false);
  const [exportErreur, setExportErreur] = useState<string | null>(null);

  const rows = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("fr");
    const filtered = needle
      ? sources.filter((s) => s.name.toLocaleLowerCase("fr").includes(needle))
      : sources;
    return [...filtered].sort((a, b) => compareSources(a, b, sortKey, sortDir));
  }, [sources, query, sortKey, sortDir]);

  // La page est dérivée, jamais assainie par un effet : si un filtre réduit la
  // liste sous la page courante, on retombe simplement sur la dernière page
  // existante au lieu de rendre un tableau vide.
  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const firstIndex = (currentPage - 1) * PAGE_SIZE;
  const pageRows = rows.slice(firstIndex, firstIndex + PAGE_SIZE);
  const lastIndex = Math.min(firstIndex + PAGE_SIZE, rows.length);

  const counts = useMemo(() => {
    const c: Record<SourceStatus, number> = { ok: 0, error: 0, pending: 0 };
    for (const s of sources) c[sourceStatus(s)] += 1;
    return c;
  }, [sources]);

  const rouges = useMemo(() => countSourcesRouges(sources), [sources]);

  // Deux questions distinctes : « répond-elle ? » et « rapporte-t-elle ? ».
  // Une source peut répondre tous les jours et ne rien rendre pendant des mois.
  const yields = useMemo(() => {
    const c: Record<SourceYield, number> = { productive: 0, vide: 0, muette: 0, inconnue: 0 };
    for (const s of sources) c[sourceYield(s)] += 1;
    return c;
  }, [sources]);

  function toggleSort(key: SortKey) {
    setPage(1);
    if (sortKey === key) {
      setSortDir((dir) => (dir === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(key);
    setSortDir(key === "lastProduction" || key === "lastErrorAt" || key === "itemsTotal" ? "desc" : "asc");
  }

  async function exporterRegistre() {
    setExportEnCours(true);
    setExportErreur(null);
    try {
      const blob = await api.registreTraitementsExport();
      const nom = registreTraitementsExportFilename()
        ?? `registre_traitements_${new Date().toISOString().slice(0, 10)}.csv`;
      downloadBlob(blob, nom);
    } catch (err: unknown) {
      setExportErreur(
        `Export du registre des traitements impossible : ${err instanceof Error ? err.message : "indisponible"}`,
      );
    } finally {
      setExportEnCours(false);
    }
  }

  return (
    <section className="sources-view" aria-label="Sources">
      <header className="sources-view__head">
        <h1 className="sources-view__title">Sources</h1>
        <p className="sources-view__summary">
          {sources.length} flux déclarés · {counts.ok} ok · {counts.error} en erreur ·{" "}
          {counts.pending} jamais collectés
        </p>
        <p className="sources-view__red-count" aria-label="Compteur de sources rouges">
          {rouges} source{rouges > 1 ? "s" : ""} rouge{rouges > 1 ? "s" : ""} · plus de 7 jours sans production
        </p>
        <p className="sources-view__yield" aria-label="Rendement des sources">
          {yields.productive} productive{yields.productive > 1 ? "s" : ""} · {yields.vide} qui
          lisent sans rendre · {yields.muette} muette{yields.muette > 1 ? "s" : ""} ·{" "}
          {yields.inconnue} non mesurée{yields.inconnue > 1 ? "s" : ""}
        </p>
        {sources.some((s) => s.motifDominant !== null) && (
          <p className="sources-view__yield" aria-label="Motifs de rejet">
            Rejets dominants :{" "}
            {/*
              Un serveur d'une version antérieure ne renvoie pas `motifDominant` :
              on filtre sur le type réel, pas sur `!== null`, sinon un champ
              absent fait planter tout l'écran.
            */}
            {[...new Set(sources.map((s) => s.motifDominant).filter((m): m is string => typeof m === "string"))]
              .slice(0, 4)
              .map((motif) => `${motifLabel(motif)} (${sources.filter((s) => s.motifDominant === motif).length})`)
              .join(" · ")}
          </p>
        )}
      </header>

      <div className="sources-view__toolbar">
        <Button
          label={exportEnCours ? "Export en cours…" : "Registre des traitements (CSV)"}
          className="ds-button"
          onClick={() => void exporterRegistre()}
          isDisabled={exportEnCours}
          aria-busy={exportEnCours}
        />
        <label className="sources-view__search">
          <span className="sources-view__search-label">recherche</span>
          <input
            type="search"
            value={query}
            placeholder="nom de source"
            onChange={(event) => {
              setQuery(event.target.value);
              setPage(1);
            }}
          />
        </label>
        <span className="sources-view__count" aria-live="polite">
          {rows.length === 0
            ? "aucune ligne"
            : `${formatNumber(firstIndex + 1)}–${formatNumber(lastIndex)} sur ${formatNumber(rows.length)}`}
        </span>
      </div>

      {exportErreur ? (
        <p role="alert" className="sources-view__summary" style={{ color: "#b42318" }}>
          {exportErreur}
        </p>
      ) : null}
      <div className="sources-view__scroll">
        <table className="sources-table">
          <caption className="sources-view__caption">
            Registre des sources surveillées
          </caption>
          {/* `table-layout: fixed` sans colgroup donnait des colonnes égales :
              le nom de la source se cassait sur cinq lignes pendant que
              « il y a 18 min » débordait sur la suivante. */}
          <colgroup>
            {COLUMNS.map((col) => (
              <col key={col.key} className={`sources-table__col sources-table__col--${col.key}`} />
            ))}
            <col key="action" className="sources-table__col sources-table__col--action" />
          </colgroup>
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
                  className={`sources-table__cell sources-table__cell--${col.key}${
                    col.num ? " sources-table__num" : ""
                  }`}
                  title={col.hint}
                >
                  <button type="button" className="sources-table__sort" onClick={() => toggleSort(col.key)}>
                    {col.label}
                    <span className="sources-table__arrow" aria-hidden="true">
                      {sortKey === col.key ? (sortDir === "asc" ? "↑" : "↓") : ""}
                    </span>
                  </button>
                </th>
              ))}
              <th scope="col" className="sources-table__cell sources-table__cell--action">
                action
              </th>
            </tr>
          </thead>
          <tbody>
            {pageRows.map((source) => {
              const status = sourceStatus(source);
              const production = lastProductionAt(source);
              const rouge = isSourceRouge(source);
              const yieldKind = sourceYield(source);
              return (
                <tr key={source.id} title={YIELD_HINT[yieldKind]}>
                  <th scope="row" className="sources-table__name">
                    {source.name}
                  </th>
                  <td
                    className="sources-table__cell sources-table__cell--family sources-table__family"
                    title={FAMILY_LABEL[source.family] ?? source.family}
                  >
                    {FAMILY_LABEL[source.family] ?? source.family}
                  </td>
                  <td className="sources-table__cell sources-table__cell--status sources-table__status">
                    <span className="sources-status" data-status={status} title={STATUS_LABEL[status]}>
                      <span className="sources-status__dot" aria-hidden="true" />
                      {STATUS_CELL_LABEL[status]}
                    </span>
                    {source.disabledReason && (
                      <span className="sources-table__reason" title={source.disabledReason}>
                        {source.disabledReason}
                      </span>
                    )}
                  </td>
                  <td className="sources-table__cell sources-table__cell--lastProduction sources-table__time">
                    <span title={formatAbsolute(production)}>{formatRelative(production)}</span>
                    {rouge && (
                      <span className="sources-table__red-badge" data-rouge="oui" title="aucun fait depuis plus de 7 jours">
                        rouge · plus de 7 j
                      </span>
                    )}
                  </td>
                  <td className="sources-table__cell sources-table__cell--lastErrorAt sources-table__time">
                    <span title={formatAbsolute(source.lastErrorAt)}>
                      {formatRelative(source.lastErrorAt)}
                    </span>
                  </td>
                  <td className="sources-table__cell sources-table__cell--entrees sources-table__num">{formatNumber(source.entrees)}</td>
                  <td className="sources-table__cell sources-table__cell--evenements30j sources-table__num">{source.evenements30j}</td>
                  <td className="sources-table__cell sources-table__cell--rendement sources-table__num">
                    <span className="sources-yield" data-yield={yieldKind}>
                      {source.rendement === null
                        ? "—"
                        : `${(source.rendement * 100).toFixed(source.rendement < 0.01 ? 1 : 0)} %`}
                    </span>
                  </td>
                  <td className="sources-table__cell sources-table__cell--unicite sources-table__num">
                    {typeof source.faitsUniques === "number" && typeof source.faits === "number" ? (
                      <span
                        className="sources-unique"
                        data-unique={source.faitsUniques > 0 ? "oui" : "non"}
                        title={
                          source.faitsUniques === 0
                            ? "aucun fait où elle soit seule : elle suit, elle ne révèle pas"
                            : `${source.faitsUniques} fait(s) où elle est la seule source · ${source.primeurs ?? 0} fois la première`
                        }
                      >
                        {source.faitsUniques}/{source.faits}
                      </span>
                    ) : (
                      <span className="sources-table__unmeasured">non mesuré</span>
                    )}
                  </td>
                  <td className="sources-table__cell sources-table__cell--motif sources-table__motif">
                    {source.motifDominant === null ? (
                      <span className="sources-table__unmeasured">non mesuré</span>
                    ) : (
                      <span
                        className="sources-motif"
                        title={
                          source.motifs
                            ? Object.entries(source.motifs)
                                .sort((x, y) => Number(y[1]) - Number(x[1]))
                                .map(([motif, n]) => `${motifLabel(motif)} : ${n}`)
                                .join("\n")
                            : undefined
                        }
                      >
                        {motifLabel(source.motifDominant)}
                        {source.motifs ? ` (${source.motifs[source.motifDominant] ?? 0})` : null}
                      </span>
                    )}
                  </td>
                  <td className="sources-table__cell sources-table__cell--action sources-table__action">
                    <RelancerButton
                      sourceId={source.id}
                      sourceName={source.name}
                      onRelance={(id) => api.collecte(id).then(() => ({ inserted: 0, lancee: true }))}
                      disabled={!source.enabled}
                    />
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={COLUMNS.length + 1} className="sources-table__empty">
                  {loading ? (
                    <LoadingSkeleton label="chargement des sources…" />
                  ) : error ? (
                    <span role="alert">{error}</span>
                  ) : (
                    <EmptyState
                      message={sources.length === 0
                        ? "aucune source déclarée"
                        : "aucune source ne correspond à la recherche"}
                      actionLabel={onRetry ? "Recharger les sources" : "Effacer la recherche"}
                      onAction={onRetry ?? (() => { setQuery(""); setPage(1); })}
                    />
                  )}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {pageCount > 1 && (
        <nav className="sources-view__pager" aria-label="Pagination du registre des sources">
          <button
            type="button"
            className="sources-view__pager-btn"
            onClick={() => setPage(1)}
            disabled={currentPage === 1}
            aria-label="Première page"
          >
            «
          </button>
          <button
            type="button"
            className="sources-view__pager-btn"
            onClick={() => setPage(currentPage - 1)}
            disabled={currentPage === 1}
            aria-label="Page précédente"
          >
            ‹ précédente
          </button>
          <span className="sources-view__pager-state" aria-live="polite">
            page {currentPage} sur {pageCount}
          </span>
          <button
            type="button"
            className="sources-view__pager-btn"
            onClick={() => setPage(currentPage + 1)}
            disabled={currentPage === pageCount}
            aria-label="Page suivante"
          >
            suivante ›
          </button>
          <button
            type="button"
            className="sources-view__pager-btn"
            onClick={() => setPage(pageCount)}
            disabled={currentPage === pageCount}
            aria-label="Dernière page"
          >
            »
          </button>
        </nav>
      )}
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
