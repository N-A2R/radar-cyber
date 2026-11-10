import type { Source } from "../api";

const FAMILY_LABEL: Record<string, string> = {
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

function formatNumber(value: number | null): string {
  if (value === null) return "—";
  return value.toLocaleString("fr-FR");
}

function formatDate(value: string | null): string {
  if (!value) return "jamais";
  return new Date(value).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" });
}

export default function SourcesView({ sources }: { sources: Source[] }) {
  const ok = sources.filter((s) => s.ok).length;
  const err = sources.filter((s) => !s.ok && s.lastErrorAt).length;
  const pending = sources.length - ok - err;
  const declared = sources.reduce(
    (sum, s) => sum + (s.kind === "indicator" ? Number(s.itemsTotal ?? 0) : 0),
    0
  );

  return (
    <section className="sources">
      <header>
        <h1>Sources</h1>
        <p>
          {sources.length} flux déclarés, {ok} en succès, {err} en erreur, {pending} en attente
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
            <th>dernier succès</th>
            <th>erreur</th>
          </tr>
        </thead>
        <tbody>
          {sources.map((s) => (
            <tr key={s.id}>
              <td>
                <span className="pill" data-ok={s.ok}>
                  {s.ok ? "ok" : s.lastErrorAt ? "erreur" : "attente"}
                </span>
              </td>
              <td>
                <div>{s.name}</div>
                <div className="mono">
                  <a href={s.url} target="_blank" rel="noreferrer">
                    {s.url.length > 70 ? s.url.slice(0, 70) + "…" : s.url}
                  </a>
                </div>
              </td>
              <td>{FAMILY_LABEL[s.family] ?? s.family}</td>
              <td className="mono">
                {s.kind}/{s.format}
              </td>
              <td className="num">{formatNumber(Number(s.itemsTotal))}</td>
              <td>{formatDate(s.lastOkAt)}</td>
              <td className="mono">{s.lastError ?? ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
