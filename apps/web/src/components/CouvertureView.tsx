/**
 * Coverage screen: displays the published measurement returned by
 * GET /api/couverture. This is a frozen figure with its corpus fingerprint,
 * not a live estimate computed from the current database.
 *
 * All user-facing text is in English; raw API keys stay visible as a fallback
 * so an unknown reason is never silently dropped.
 */
import type { CouverturePublique } from "../api";
import type { CouvertureViewProps } from "../contracts";
import "./couverture.css";

const REASON_LABELS: Record<string, string> = {
  vu: "Seen",
  pas_admis: "Not admitted",
  pas_rattache: "Not linked",
  hors_fenetre: "Outside the window",
};

/** Translate a known reason; keep the raw key when the API adds a new one. */
export function reasonLabel(motif: string): string {
  return REASON_LABELS[motif] ?? motif;
}

/** ISO timestamp shown in UTC: never a local time guessed by the browser. */
export function formatDate(iso: string | null): string {
  if (!iso) return "unknown date";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return `${date.toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

/** The API already rounds rates to one decimal; do not round them again. */
function percent(rate: number): string {
  return `${rate}%`;
}

/** A bar is drawn from the published share, clamped to a sane CSS width. */
function barWidth(part: number): string {
  const width = Number.isFinite(part) ? Math.min(100, Math.max(0, part)) : 0;
  return `${width}%`;
}

export default function CouvertureView({ data, loading, error }: CouvertureViewProps) {
  return (
    <section className="couverture" aria-labelledby="couverture-title">
      <header className="couverture__head">
        <p className="couverture__kicker">Reference corpus measurement</p>
        <h1 className="couverture__title" id="couverture-title">Coverage</h1>
        <p className="couverture__subtitle">
          Share of reference incidents correctly linked to an organisation.
        </p>
        {data ? (
          <p className="couverture__meta">
            Calculated on <time dateTime={data.dateCalcul}>{formatDate(data.dateCalcul)}</time>
            {" · "}Window: {formatDate(data.fenetre.debut)} → {formatDate(data.fenetre.fin)}
          </p>
        ) : null}
      </header>

      {loading ? <p className="couverture__status" role="status">Loading coverage…</p> : null}
      {error ? (
        <p className="couverture__status couverture__status--error" role="alert">
          Unable to load coverage: {error}
        </p>
      ) : null}
      {!data && !loading && !error ? (
        <p className="couverture__status" role="status">No coverage measurement available.</p>
      ) : null}

      {data ? (
        <>
          <section className="couverture__hero" aria-labelledby="couverture-figure-label">
            <p className="couverture__hero-label" id="couverture-figure-label">Incidents correctly identified</p>
            <p className="couverture__figure">{percent(data.global.taux)}</p>
            <p className="couverture__hero-detail">
              {data.global.vus} of {data.global.total} incidents in the measurement window
            </p>
          </section>

          <section className="couverture__panel" aria-labelledby="couverture-reasons">
            <div className="couverture__panel-head">
              <h2 id="couverture-reasons">Breakdown by reason</h2>
              <p>Share of all incidents in scope</p>
            </div>
            <ul className="couverture__bars">
              {data.parMotif.map((row) => (
                <li className="couverture__bar" key={row.motif}>
                  <span className="couverture__bar-label">{reasonLabel(row.motif)}</span>
                  <span className="couverture__bar-track" aria-hidden="true">
                    <span className="couverture__bar-fill" style={{ width: barWidth(row.part) }} />
                  </span>
                  <span className="couverture__bar-value">
                    {row.incidents} · {percent(row.part)}
                  </span>
                </li>
              ))}
            </ul>
          </section>

          <section className="couverture__panel" aria-labelledby="couverture-departments">
            <div className="couverture__panel-head">
              <h2 id="couverture-departments">By department</h2>
              <p>Incidents counted in the measurement window</p>
            </div>
            <div className="couverture__table-wrap">
              <table className="couverture__table">
                <thead>
                  <tr>
                    <th scope="col">Department</th>
                    <th scope="col">Seen</th>
                    <th scope="col">Incidents</th>
                    <th scope="col">Rate</th>
                  </tr>
                </thead>
                <tbody>
                  {data.parDepartement.map((row) => (
                    <tr key={row.departement}>
                      <th scope="row">{row.departement}</th>
                      <td>{row.vus}</td>
                      <td>{row.total}</td>
                      <td>{percent(row.taux)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="couverture__panel" aria-labelledby="couverture-sectors">
            <div className="couverture__panel-head">
              <h2 id="couverture-sectors">By sector</h2>
              <p>Incidents counted in the measurement window</p>
            </div>
            <div className="couverture__table-wrap">
              <table className="couverture__table">
                <thead>
                  <tr>
                    <th scope="col">Sector</th>
                    <th scope="col">Seen</th>
                    <th scope="col">Incidents</th>
                    <th scope="col">Rate</th>
                  </tr>
                </thead>
                <tbody>
                  {data.parSecteur.map((row) => (
                    <tr key={row.secteur}>
                      <th scope="row">{row.secteur}</th>
                      <td>{row.vus}</td>
                      <td>{row.total}</td>
                      <td>{percent(row.taux)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <p className="couverture__fingerprint">Corpus SHA-256: <code>{data.hashCorpus}</code></p>
        </>
      ) : null}
    </section>
  );
}
