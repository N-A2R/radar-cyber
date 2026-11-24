import { useEffect, useState } from "react";
import { api, type ApiError, type OrgDetail as OrgDetailData, type OrgLien } from "../api";
import { renduCorroboration, renduHistorique } from "./corroboration-view";
import { mockOrgDetail } from "../mock";
import { DroitReponseBloc } from "./DroitReponseSection";
import { EmptyState, LoadingSkeleton } from "./Skeleton";
import "./orgsheet.css";
import { Badge } from "@astryxdesign/core/Badge";
import { Button } from "@astryxdesign/core/Button";
import { Drawer, DrawerHeader } from "@astryxdesign/core/Drawer";

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

const LIEN_LABEL: Record<OrgLien["relation"], string> = {
  mere: "organisation mère",
  etablissement: "établissement rattaché",
};

export default function OrgSheet({
  orgId,
  onClose,
  mock = false,
}: {
  orgId: number;
  onClose: () => void;
  /** Démonstration : fiche construite localement, aucun appel réseau. */
  mock?: boolean;
}) {
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [reloadSignal, setReloadSignal] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });
    if (mock) {
      const data = mockOrgDetail(orgId);
      setState(data ? { status: "ready", data } : { status: "notfound" });
      return;
    }
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
  }, [orgId, mock, reloadSignal]);

  return <OrgSheetContenu state={state} onClose={onClose} onRetry={() => setReloadSignal((n) => n + 1)} />;
}


async function downloadOrgReport(orgId: number): Promise<string | null> {
  try {
    const blob = await api.orgReportPdf(orgId);
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `organisation-${orgId}-rapport.pdf`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : "Download failed";
  }
}

/** Présentation pure : chaque état est vérifiable sans réseau ni effet React. */
export function OrgSheetContenu({
  state,
  onClose,
  onRetry,
}: {
  state: LoadState;
  onClose: () => void;
  onRetry?: () => void;
}) {
  const title = state.status === "ready" ? state.data.org.name : "Organisation";
  const [reportError, setReportError] = useState<string | null>(null);
  const onDownload = (orgId: number): void => {
    void downloadOrgReport(orgId).then(setReportError);
  };

  return (
    <Drawer
      isOpen
      label="Fiche organisation"
      onOpenChange={(open) => { if (!open) onClose(); }}
      data-testid="orgsheet"
    >
      <DrawerHeader
        title={title}
        endContent={
          <>
            <Badge label="fiche" />
            {state.status === "ready" && (
              <Button
                label="Download 10-page report (PDF)"
                variant="secondary"
                size="sm"
                onClick={() => onDownload(state.data.org.id)}
              />
            )}
            <Button label="Fermer la fiche" variant="ghost" size="sm" onClick={onClose}>
              fermer
            </Button>
          </>
        }
      />
      {reportError ? <p className="orgsheet__report-error" role="alert">{reportError}</p> : null}

      {state.status === "loading" && <LoadingSkeleton label="chargement de la fiche…" />}
      {state.status === "notfound" && (
        <EmptyState message="organisation inconnue" actionLabel="Fermer la fiche" onAction={onClose} />
      )}
      {state.status === "error" && (
        <EmptyState
          message={`API : ${state.message}`}
          role="alert"
          actionLabel="Recharger la fiche"
          onAction={onRetry ?? onClose}
        />
      )}
      {state.status === "ready" && <OrgSheetBody data={state.data} onClose={onClose} />}
    </Drawer>
  );
}

// Exportée pour la vérification hors navigateur (test/etat-rendu.tsx et
// test/orgsheet-verif.tsx) : le rendu statique n'exécute pas les effets, donc
// le corps de la fiche se vérifie en le rendant avec des données chargées.
export function OrgSheetBody({ data, onClose }: { data: OrgDetailData; onClose?: () => void }) {
  const { org, assets, events, claims, exposure } = data;
  const aliases = data.aliases ?? [];
  const domains = data.domains ?? [];
  const relatedOrgs = data.relatedOrgs ?? [];
  const sourceCount = data.sourceCount ?? 0;
  const identity = [org.kind, org.sector, org.city, org.dept].filter(
    (v): v is string => typeof v === "string" && v.trim().length > 0
  );
  const peak = Math.max(1, ...exposure.map((p) => p.count));

  return (
    <div className="orgsheet__body">
      <p className="orgsheet__identity">{identity.length > 0 ? identity.join(" · ") : "identité incomplète"}</p>

      <section className="orgsheet__section">
        <h3 className="orgsheet__section-title">alias</h3>
        {aliases.length === 0 ? (
          <p className="orgsheet__empty">aucun alias connu</p>
        ) : (
          <ul className="orgsheet__list">
            {aliases.map((alias) => (
              <li key={alias} className="orgsheet__row">
                <span className="orgsheet__row-title">{alias}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="orgsheet__section">
        <h3 className="orgsheet__section-title">domaines</h3>
        {domains.length === 0 ? (
          <p className="orgsheet__empty">aucun domaine connu</p>
        ) : (
          <p className="orgsheet__breakdown">
            {domains.map((domain) => (
              <span key={domain} className="orgsheet__chip orgsheet__mono">{domain}</span>
            ))}
          </p>
        )}
      </section>

      <section className="orgsheet__section">
        <h3 className="orgsheet__section-title">
          organisations liées <span className="orgsheet__count">{relatedOrgs.length}</span>
        </h3>
        {relatedOrgs.length === 0 ? (
          <p className="orgsheet__empty">aucune organisation liée</p>
        ) : (
          <ul className="orgsheet__list">
            {relatedOrgs.map((lien) => (
              <li key={`${lien.relation}-${lien.id}`} className="orgsheet__row">
                <span className="orgsheet__row-title">{lien.name}</span>
                <span className="orgsheet__meta">{LIEN_LABEL[lien.relation] ?? lien.relation}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="orgsheet__section">
        <h3 className="orgsheet__section-title">
          sources <span className="orgsheet__count">{sourceCount.toLocaleString("fr-FR")}</span>
        </h3>
        {sourceCount === 0 ? (
          <p className="orgsheet__empty">aucune source</p>
        ) : (
          <p className="orgsheet__note">sources distinctes ayant produit un événement rattaché</p>
        )}
      </section>

      {/*
        Avant les actifs et les événements : ce que l'organisation a *vécu*,
        regroupé par fait. Cinq lignes d'événements peuvent raconter un seul
        incident relayé par cinq sources — ou cinq incidents.
      */}
      {renduHistorique(data.historique ?? null, onClose)}
      {renduCorroboration(data.corroboration ?? null, onClose)}

      <section className="orgsheet__section">
        <h3 className="orgsheet__section-title">
          actifs <span className="orgsheet__count">{assets.total}</span>
        </h3>
        {assets.total === 0 ? (
          onClose
            ? <EmptyState className="orgsheet__empty" message="aucun actif découvert" actionLabel="Fermer la fiche" onAction={onClose} />
            : <p className="orgsheet__empty">aucun actif découvert</p>
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
                    {formatDate(a.firstSeen) ? ` · ${formatDate(a.firstSeen)}` : ""}
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
          événements récents <span className="orgsheet__count">{events.total}</span>
        </h3>
        {events.total === 0 ? (
          onClose
            ? <EmptyState className="orgsheet__empty" message="aucun événement rattaché" actionLabel="Fermer la fiche" onAction={onClose} />
            : <p className="orgsheet__empty">aucun événement rattaché</p>
        ) : (
          <>
            <p className="orgsheet__note">{events.recent.length} plus récents affichés</p>
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
          onClose
            ? <EmptyState className="orgsheet__empty" message="aucune revendication" actionLabel="Fermer la fiche" onAction={onClose} />
            : <p className="orgsheet__empty">aucune revendication</p>
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

      <DroitReponseBloc
        orgId={org.id}
        organisation={org.name}
        domain={org.domain}
        initial={data.rectifications}
      />

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
