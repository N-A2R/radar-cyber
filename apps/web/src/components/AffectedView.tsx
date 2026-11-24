/**
 * « Suis-je concerné ? » — vue d'une organisation centrée sur les preuves.
 *
 * Tout ce qui est rendu ici vient du `AffectedReport` structuré : catégorie,
 * libellé, valeur, horodatage et métadonnées de preuve d'un constat. Le texte
 * libre (limitations, titres d'événements, coordonnées) n'est délibérément
 * jamais imprimé, afin qu'aucune donnée personnelle de victime n'atteigne cet
 * écran.
 *
 * L'écran explique son geste avant le champ : ce que la vérification
 * interroge, ce qu'elle ne fait pas, et ce qu'un résultat contient. Les
 * exemples sont lus dans le référentiel (`GET /directory`, organisations
 * rattachées à au moins un incident) — jamais écrits en dur.
 */
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { api, type AffectedReport, type DirectoryRow } from "../api";
import "./affected.css";
import { Badge } from "@astryxdesign/core/Badge";
import { Card } from "@astryxdesign/core/Card";

type Statement = AffectedReport["statements"][number];
type Category = Statement["category"];
type Status = Statement["evidence"]["status"];

const CATEGORY_LABEL: Record<Category, string> = {
  identity: "Identité",
  location: "Localisation",
  activity: "Activité",
  incident: "Incident",
  claim: "Allégation",
};

const STATUS_LABEL: Record<Status, string> = {
  "official-record": "Registre officiel",
  reported: "Signalé",
  "unverified-claim": "Allégation non vérifiée",
};

/** Libellés de famille renvoyés par l'API, traduits pour l'écran. */
const FAMILY_FR: Record<string, string> = {
  "Security advisory": "Avis de sécurité",
  "Vulnerability advisory": "Avis de vulnérabilité",
  "Ransomware extortion claim": "Revendication d'extorsion par rançongiciel",
  "Data-leak publication report": "Publication de fuite de données",
  "National security advisory": "Avis de sécurité nationale",
  official_statement: "Communiqué officiel",
  cti: "Renseignement sur la menace",
};

/** Départements de Nouvelle-Aquitaine : seuls ceux-là ont un rapport. */
const NA_DEPTS: Record<string, true> = {
  "16": true, "17": true, "19": true, "23": true, "24": true, "33": true,
  "40": true, "47": true, "64": true, "79": true, "86": true, "87": true,
};

export type AffectedViewProps = {
  report?: AffectedReport | null;
  loading?: boolean;
  error?: string | null;
  query?: string;
  onQueryChange?: (q: string) => void;
  onSubmit?: (q: string) => void;
};

/** Code HTTP extrait du message d'erreur de `api.ts` (`/affected?q=… → 404`). */
function errorStatus(error: string | null): number | null {
  const match = error?.match(/→\s*(\d{3})\s*$/);
  return match ? Number(match[1]) : null;
}

function StatementRow({ statement }: { statement: Statement }) {
  const { evidence, observedAt } = statement;
  const family = FAMILY_FR[statement.label] ?? statement.label;
  return (
    <li className="affected__statement" data-category={statement.category}>
      <p className="affected__statement-head">
        <span className="affected__category" data-category={statement.category}>
          {CATEGORY_LABEL[statement.category] ?? statement.category}
        </span>
        <span className="affected__statement-label" title={statement.label}>{family}</span>
      </p>
      {statement.value && statement.value !== statement.label ? (
        <p className="affected__statement-value">{statement.value}</p>
      ) : null}
      {observedAt ? (
        <p className="affected__observed">
          Observé : <time dateTime={observedAt}>{observedAt}</time>
        </p>
      ) : null}
      <p className="affected__evidence-title">Preuve</p>
      <dl className="affected__evidence" data-kind={evidence.kind}>
        <dt>Éditeur</dt>
        <dd className="affected__publisher">{evidence.label}</dd>
        <dt>Référence</dt>
        <dd className="affected__reference">{evidence.reference}</dd>
        <dt>Statut</dt>
        <dd>
          <span
            className={`affected__status affected__status--${evidence.status}`}
            data-status={evidence.status}
            title={evidence.status}
          >
            {STATUS_LABEL[evidence.status] ?? evidence.status}
          </span>
        </dd>
        {evidence.url ? (
          <>
            <dt>Source</dt>
            <dd className="affected__source">
              <a href={evidence.url} target="_blank" rel="noopener noreferrer">{evidence.url}</a>
            </dd>
          </>
        ) : null}
      </dl>
    </li>
  );
}

export default function AffectedView({
  report,
  loading = false,
  error = null,
  query,
  onQueryChange,
  onSubmit,
}: AffectedViewProps) {
  // The parent may own the query (URL, App state) or leave it entirely local.
  const [localQuery, setLocalQuery] = useState(query ?? "");
  useEffect(() => {
    if (query !== undefined) setLocalQuery(query);
  }, [query]);

  // La requête réellement envoyée : c'est elle qu'on rappelle dans « aucun
  // résultat », pas la frappe en cours dans le champ.
  const [submitted, setSubmitted] = useState(query?.trim() ?? "");

  // Exemples : organisations réellement rattachées à un incident, lues dans
  // l'annuaire. `null` = lecture en cours, `[]` = rien à proposer.
  const [examples, setExamples] = useState<DirectoryRow[] | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    api
      .directory(
        { withEvents: true, limit: 20, sort: "eventCount", dir: "desc" },
        controller.signal,
      )
      .then((response) => {
        if (controller.signal.aborted) return;
        const picked: DirectoryRow[] = [];
        const seen = new Set<string>();
        for (const row of response.rows) {
          if (picked.length === 3) break;
          if (!row.eventCount || !row.dept || !NA_DEPTS[row.dept]) continue;
          if (seen.has(row.name)) continue;
          seen.add(row.name);
          picked.push(row);
        }
        setExamples(picked);
      })
      .catch(() => {
        if (!controller.signal.aborted) setExamples([]);
      });
    return () => controller.abort();
  }, []);

  const handleChange = (next: string) => {
    setLocalQuery(next);
    onQueryChange?.(next);
  };
  const runSearch = (q: string) => {
    const trimmed = q.trim();
    if (trimmed !== "") setSubmitted(trimmed);
    onSubmit?.(q);
  };
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    runSearch(localQuery);
  };

  const statements = report?.statements ?? [];
  const summary = report?.summary;
  const incidents = useMemo(
    () => statements.filter((s) => s.category === "incident" || s.category === "claim"),
    [statements],
  );
  const facts = useMemo(
    () => statements.filter((s) => s.category !== "incident" && s.category !== "claim"),
    [statements],
  );
  /** Familles incident → nombre de constats, dans l'ordre d'apparition. */
  const families = useMemo(() => {
    const counts = new Map<string, number>();
    for (const statement of incidents) {
      counts.set(statement.label, (counts.get(statement.label) ?? 0) + 1);
    }
    return [...counts.entries()];
  }, [incidents]);

  const status = errorStatus(error);
  const recalled = submitted !== "" ? submitted : localQuery.trim();

  return (
    <section className="affected" data-view="affected" aria-labelledby="affected-title">
      <header className="affected__header">
        <div className="affected__title-row">
          <h2 id="affected-title">Suis-je concerné ?</h2>
          <p className="affected__badges">
            <Badge label="Nouvelle-Aquitaine uniquement" className="affected__badge" />
            <Badge label="Aucune donnée personnelle de victime n'est affichée." className="affected__badge" />
          </p>
        </div>
        <p className="affected__lead">
          La vérification interroge les organisations déjà rattachées à un incident en
          Nouvelle-Aquitaine. Elle ne lit aucune donnée personnelle de victime et ne juge
          aucune responsabilité : elle affiche les constats enregistrés, chacun avec sa
          preuve.
        </p>
      </header>

      <form className="affected__form" onSubmit={handleSubmit} role="search">
        <label className="affected__query-label" htmlFor="affected-query">Organisation</label>
        <div className="affected__query-row">
          <input
            id="affected-query"
            className="affected__query"
            name="organization"
            type="search"
            value={localQuery}
            onChange={(event) => handleChange(event.target.value)}
            placeholder="Nom, identifiant ou domaine"
            autoComplete="off"
          />
          <button className="affected__check" type="submit" disabled={loading}>
            Vérifier
          </button>
        </div>
        <p className="affected__hint">
          Nom exact du registre, identifiant numérique ou domaine (ex. <span className="mono">exemple.fr</span>).
        </p>
      </form>

      {examples === null || examples.length > 0 ? (
        <Card variant="transparent" className="affected__examples-card">
        <section className="affected__examples" aria-labelledby="affected-examples-title">
          <h3 className="affected__examples-title" id="affected-examples-title">
            Exemples réels du référentiel
          </h3>
          {examples === null ? (
            <p className="affected__examples-loading" role="status">Lecture des exemples…</p>
          ) : (
            <ul className="affected__example-list">
              {examples.map((example) => (
                <li key={example.id}>
                  <button
                    type="button"
                    className="affected__example"
                    onClick={() => {
                      handleChange(example.name);
                      runSearch(example.name);
                    }}
                  >
                    <span className="affected__example-name">{example.name}</span>
                    <span className="affected__example-meta">
                      {[example.city, example.dept].filter(Boolean).join(" ")}
                      {example.city || example.dept ? " · " : ""}
                      {example.eventCount} incident{example.eventCount > 1 ? "s" : ""}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
        </Card>
      ) : null}

      <div className="affected__stage" aria-live="polite">
        {loading ? (
          <div className="affected__loading" role="status">
            <span className="affected__spinner" aria-hidden="true" />
            <span>Chargement du rapport…</span>
            <span className="affected__skeleton" aria-hidden="true" />
            <span className="affected__skeleton affected__skeleton--short" aria-hidden="true" />
          </div>
        ) : null}

        {!loading && error ? (
          status === 404 ? (
            <div className="affected__noresult" role="status">
              <p className="affected__noresult-title">
                Aucune organisation ne correspond à « {recalled} ».
              </p>
              <p className="affected__noresult-text">
                Le rapport ne reconnaît que le nom exact du registre, un identifiant
                numérique ou un domaine. Vérifiez l'orthographe, les accents, ou essayez
                l'un des exemples ci-dessus.
              </p>
            </div>
          ) : status === 403 ? (
            <div className="affected__noresult" role="status">
              <p className="affected__noresult-title">
                « {recalled} » est hors Nouvelle-Aquitaine.
              </p>
              <p className="affected__noresult-text">
                Cet écran ne couvre que les organisations de la région. Aucun rapport
                n'est produit pour une organisation hors périmètre.
              </p>
            </div>
          ) : (
            <p className="affected__error" role="alert">Erreur : {error}</p>
          )
        ) : null}

        {!loading && !error && !report ? (
          <div className="affected__idle">
            <p className="affected__idle-title">Aucune vérification lancée.</p>
            <p className="affected__idle-text">
              Saisissez un nom d'organisation, un identifiant ou un domaine pour vérifier.
              Vous obtiendrez l'organisation, ses incidents rattachés, les familles
              concernées et un lien vers sa fiche.
            </p>
          </div>
        ) : null}

        {!loading && !error && report ? (
          <div className="affected__result">
            <div className="affected__result-head">
              <div>
                <p className="affected__organization">{report.organization.name}</p>
                <p className="affected__organization-meta">
                  {report.organization.department
                    ? `Département ${report.organization.department} · `
                    : ""}
                  {report.organization.region}
                </p>
              </div>
              <a className="affected__sheet-link" href={`#/affected?org=${report.organization.id}`}>
                Ouvrir la fiche
              </a>
            </div>
            <p className="affected__summary">
              {summary?.statements ?? 0} constats / {summary?.withEvidence ?? 0} avec preuve / {summary?.sources ?? 0} sources
            </p>

            {statements.length === 0 ? (
              <p className="affected__no-statements">Aucun constat enregistré pour cette organisation.</p>
            ) : (
              <>
                <section className="affected__section" aria-labelledby="affected-incidents-title">
                  <h3 className="affected__section-title" id="affected-incidents-title">
                    Incidents rattachés <span className="affected__count">{incidents.length}</span>
                  </h3>
                  {incidents.length === 0 ? (
                    <p className="affected__section-empty">Aucun incident rattaché à cette organisation.</p>
                  ) : (
                    <>
                      <ul className="affected__families" aria-label="Familles d'incident">
                        {families.map(([family, count]) => (
                          <li key={family} className="affected__family">
                            {FAMILY_FR[family] ?? family}
                            <span className="affected__family-count">{count}</span>
                          </li>
                        ))}
                      </ul>
                      <ul className="affected__statements">
                        {incidents.map((statement) => (
                          <StatementRow key={statement.id} statement={statement} />
                        ))}
                      </ul>
                    </>
                  )}
                </section>

                {facts.length > 0 ? (
                  <section className="affected__section" aria-labelledby="affected-facts-title">
                    <h3 className="affected__section-title" id="affected-facts-title">
                      Identité enregistrée <span className="affected__count">{facts.length}</span>
                    </h3>
                    <ul className="affected__statements">
                      {facts.map((statement) => (
                        <StatementRow key={statement.id} statement={statement} />
                      ))}
                    </ul>
                  </section>
                ) : null}
              </>
            )}
          </div>
        ) : null}
      </div>
    </section>
  );
}
