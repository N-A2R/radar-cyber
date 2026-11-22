/**
 * « Suis-je concerné ? » — vue d'une organisation centrée sur les preuves.
 *
 * Tout ce qui est rendu ici vient du `AffectedReport` structuré : catégorie,
 * libellé, valeur, horodatage et métadonnées de preuve d'un constat. Le texte
 * libre (limitations, titres d'événements, coordonnées) n'est délibérément
 * jamais imprimé, afin qu'aucune donnée personnelle de victime n'atteigne cet
 * écran.
 */
import { useEffect, useState, type FormEvent } from "react";
import type { AffectedReport } from "../api";

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

export type AffectedViewProps = {
  report?: AffectedReport | null;
  loading?: boolean;
  error?: string | null;
  query?: string;
  onQueryChange?: (q: string) => void;
  onSubmit?: (q: string) => void;
};

function StatementRow({ statement }: { statement: Statement }) {
  const { evidence, observedAt } = statement;
  return (
    <li className="affected__statement" data-category={statement.category}>
      <p className="affected__statement-head">
        <span className="affected__category" data-category={statement.category}>
          {CATEGORY_LABEL[statement.category] ?? statement.category}
        </span>
        <span className="affected__statement-label">{statement.label}</span>
      </p>
      <p className="affected__statement-value">{statement.value}</p>
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

  const handleChange = (next: string) => {
    setLocalQuery(next);
    onQueryChange?.(next);
  };
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSubmit?.(localQuery);
  };

  const statements = report?.statements ?? [];
  const summary = report?.summary;

  return (
    <section className="affected" data-view="affected" aria-labelledby="affected-title">
      <header className="affected__header">
        <h2 id="affected-title">Suis-je concerné ?</h2>
        <p className="affected__scope">Nouvelle-Aquitaine uniquement</p>
        <p className="affected__privacy">Aucune donnée personnelle de victime n'est affichée.</p>
      </header>

      <form className="affected__form" onSubmit={handleSubmit}>
        <label className="affected__query-label" htmlFor="affected-query">Organisation</label>
        <input
          id="affected-query"
          className="affected__query"
          name="organization"
          type="search"
          value={localQuery}
          onChange={(event) => handleChange(event.target.value)}
          placeholder="Nom, identifiant ou domaine"
        />
        <button className="affected__check" type="submit">Vérifier</button>
      </form>

      {loading ? <p className="affected__loading" role="status">Chargement du rapport…</p> : null}
      {error ? <p className="affected__error" role="alert">Erreur : {error}</p> : null}
      {!loading && !error && !report ? (
        <p className="affected__empty">Saisissez un nom d'organisation, un identifiant ou un domaine pour vérifier.</p>
      ) : null}

      {report ? (
        <div className="affected__result">
          <p className="affected__organization">{report.organization.name}</p>
          <p className="affected__summary">
            {summary?.statements ?? 0} constats / {summary?.withEvidence ?? 0} avec preuve / {summary?.sources ?? 0} sources
          </p>
          {statements.length === 0 ? (
            <p className="affected__no-statements">Aucun constat enregistré pour cette organisation.</p>
          ) : (
            <ul className="affected__statements">
              {statements.map((statement) => (
                <StatementRow key={statement.id} statement={statement} />
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </section>
  );
}
