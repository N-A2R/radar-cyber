import { useEffect, useState } from "react";
import { api, type ApiError, type OrgDetail as OrgDetailData } from "../api";
import "./orgsheet.css";

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "notfound" }
  | { status: "ready"; data: OrgDetailData };

function formatDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
}

/** Étiquette lisible d'un type d'actif. */
const ASSET_LABELS: Record<string, string> = {
  domain: "domaine",
  subdomain: "sous-domaine",
  ip: "IP",
  cert: "certificat",
};

function assetLabel(kind: string): string {
  return ASSET_LABELS[kind] ?? kind;
}

export default function OrgSheet({ orgId, onClose }: { orgId: number; onClose: () => void }) {
  const [state, setState] = useState<LoadState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });
    api
      .orgDetail(orgId)
      .then((data) => {
        if (!cancelled) setState({ status: "ready", data });
      })
      .catch((err: ApiError) => {
        if (cancelled) return;
        if (err.status === 404) setState({ status: "notfound" });
        else setState({ status: "error", message: err.message });
      });
    return () => {
      cancelled = true;
    };
  }, [orgId]);

  const title = state.status === "ready" ? state.data.org.name : "Organisation";

  return (
    <aside className="orgsheet" aria-label="Fiche organisation">
      <header className="orgsheet__header">
        <h2 className="orgsheet__title">{title}</h2>
        <button type="button" className="orgsheet__close" onClick={onClose} aria-label="Fermer la fiche">
          fermer
        </button>
      </header>

      {state.status === "loading" && <p className="orgsheet__status">chargement…</p>}
      {state.status === "notfound" && <p className="orgsheet__status">organisation inconnue</p>}
      {state.status === "error" && <p className="orgsheet__status orgsheet__status--error">{state.message}</p>}
      {state.status === "ready" && <OrgSheetBody data={state.data} />}
    </aside>
  );
}

function OrgSheetBody({ data }: { data: OrgDetailData }) {
  const { org, assets, events, claims, exposure } = data;
  const identity = [org.kind, org.sector, org.city, org.dept].filter(
    (v): v is string => typeof v === "string" && v.trim().length > 0
  );
  const peak = Math.max(1, ...exposure.map((p) => p.count));

  return (
    <div className="orgsheet__body">
      <p className="orgsheet__identity">{identity.length > 0 ? identity.join(" · ") : "identité incomplète"}</p>

      <section className="orgsheet__section">
        <h3 className="orgsheet__section-title">
          actifs <span className="orgsheet__count">{assets.total}</span>
        </h3>
        {assets.total === 0 ? (
          <p className="orgsheet__empty">aucun actif découvert</p>
        ) : (
          <>
            <p className="orgsheet__breakdown">
              {assets.byKind.map((k) => (
                <span key={k.kind} className="orgsheet__chip">
                  {assetLabel(k.kind)} <b>{k.n}</b>
                </span>
              ))}
            </p>
            <ul className="orgsheet__list">
              {assets.recent.map((a) => (
                <li key={`${a.kind}-${a.value}`} className="orgsheet__row">
                  <span className="orgsheet__mono">{a.value}</span>
                  <span className="orgsheet__meta">
                    {assetLabel(a.kind)}
                    {formatDate(a.createdAt) ? ` · ${formatDate(a.createdAt)}` : ""}
                    {a.source ? ` · ${a.source}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <section className="orgsheet__section">
        <h3 className="orgsheet__section-title">
          événements <span className="orgsheet__count">{events.total}</span>
        </h3>
        {events.total === 0 ? (
          <p className="orgsheet__empty">aucun événement rattaché</p>
        ) : (
          <>
            <p className="orgsheet__breakdown">
              {events.byFamily.map((f) => (
                <span key={f.family} className={`orgsheet__chip orgsheet__chip--${f.family}`}>
                  {f.family} <b>{f.n}</b>
                </span>
              ))}
            </p>
            <ul className="orgsheet__list">
              {events.recent.map((e) => (
                <li key={e.id} className="orgsheet__row">
                  <span className={`orgsheet__sev orgsheet__sev--${e.severity}`}>{e.severity}</span>
                  <span className="orgsheet__row-title">{e.title}</span>
                  <span className="orgsheet__meta">{formatDate(e.observedAt)}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <section className="orgsheet__section">
        <h3 className="orgsheet__section-title">
          revendications <span className="orgsheet__count">{claims.total}</span>
        </h3>
        {claims.total === 0 ? (
          <p className="orgsheet__empty">aucune revendication</p>
        ) : (
          <ul className="orgsheet__list">
            {claims.recent.map((c) => (
              <li key={c.id} className="orgsheet__row">
                <span className="orgsheet__row-title">{c.groupe ?? c.orgHint ?? c.source}</span>
                <span className="orgsheet__meta">
                  {c.source}
                  {c.tlp ? ` · ${c.tlp}` : ""}
                  {formatDate(c.claimedAt) ? ` · ${formatDate(c.claimedAt)}` : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="orgsheet__section">
        <h3 className="orgsheet__section-title">exposition sur 12 mois</h3>
        <div className="orgsheet__chart" role="img" aria-label={`exposition mensuelle, maximum ${peak}`}>
          {exposure.map((p) => (
            <div key={p.month} className="orgsheet__bar-slot">
              <div
                className={`orgsheet__bar${p.count === 0 ? " orgsheet__bar--empty" : ""}`}
                style={{ height: `${Math.round((p.count / peak) * 100)}%` }}
                title={`${p.month} : ${p.count}`}
              />
              <span className="orgsheet__bar-label">{p.month.slice(5)}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
