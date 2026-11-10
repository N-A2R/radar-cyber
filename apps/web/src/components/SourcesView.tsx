import { sourceStatus, type Source, type SourceStatus } from "../api";

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

export const SOURCE_STATUS_LABEL: Record<SourceStatus, string> = {
  ok: "ok",
  error: "erreur",
  pending: "jamais collecté",
};

// Tone de badge styles.css : confirmed = vert, claim = orange, ambient = gris.
export const SOURCE_STATUS_TONE: Record<SourceStatus, "confirmed" | "claim" | "ambient"> = {
  ok: "confirmed",
  error: "claim",
  pending: "ambient",
};

export function formatNumber(value: number | null): string {
  if (value === null) return "—";
  return value.toLocaleString("fr-FR");
}

export function formatDate(value: string | null): string {
  if (!value) return "jamais";
  return new Date(value).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" });
}

/** « il y a 12 min », « il y a 3 h », « il y a 2 j »… */
export function formatRelative(value: string | null): string {
  if (!value) return "jamais";
  const then = Date.parse(value);
  if (!Number.isFinite(then)) return "—";
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

export function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

export type SourcesViewProps = {
  /**
   * Flux déclarés, tels que renvoyés par `GET /api/sources`
   * (dernier succès, dernière erreur, volumes…).
   * En mode démonstration, passer `mockData.sources`.
   */
  sources: Source[];
};

/**
 * Vue « sources » : registre des flux surveillés.
 *
 * Branchage dans App.tsx :
 *   {view === "sources" ? <SourcesView sources={sources} /> : …}
 * où `sources` est l'état chargé via `api.sources()` (ou `mockData.sources`
 * en mode démonstration).
 */
export default function SourcesView({ sources }: SourcesViewProps) {
  const counts: Record<SourceStatus, number> = { ok: 0, error: 0, pending: 0 };
  for (const s of sources) counts[sourceStatus(s)] += 1;
  const declared = sources.reduce(
    (sum, s) => sum + (s.kind === "indicator" ? Number(s.itemsTotal ?? 0) : 0),
    0
  );

  return (
    <section className="sources">
      <header>
        <h1>Sources</h1>
        <p>
          {sources.length} flux déclarés, {counts.ok} en succès, {counts.error} en erreur,{" "}
          {counts.pending} jamais collectés
          <br />
          {formatNumber(declared)} éléments déclarés par les flux d'indicateurs
        </p>
      </header>

      <table className="data">
        <thead>
          <tr>
            <th>état</th>
            <th>source</th>
            <th>famille</th>
            <th>type</th>
            <th style={{ textAlign: "right" }}>éléments</th>
            <th style={{ textAlign: "right" }}>derniers</th>
            <th>dernier succès</th>
            <th>erreur</th>
          </tr>
        </thead>
        <tbody>
          {sources.map((s) => {
            const status = sourceStatus(s);
            return (
              <tr key={s.id}>
                <td>
                  <span className="badge" data-tone={SOURCE_STATUS_TONE[status]}>
                    {SOURCE_STATUS_LABEL[status]}
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
                <td className="mono">
                  {s.kind}/{s.format}
                </td>
                <td className="num">{formatNumber(s.itemsTotal)}</td>
                <td className="num">{formatNumber(s.lastItems)}</td>
                <td className="mono" title={s.lastOkAt ? formatDate(s.lastOkAt) : "jamais collecté"}>
                  {formatRelative(s.lastOkAt)}
                </td>
                <td className="mono">
                  {s.lastError ? <span title={s.lastError}>{truncate(s.lastError, 80)}</span> : ""}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}
