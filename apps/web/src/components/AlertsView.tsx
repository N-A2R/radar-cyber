import { useCallback, useEffect, useMemo, useState } from "react";
import { api, authHeaders, type Alert, type AlertConfidence, type AlertStatRow, type AlertStatus } from "../api";
import type { AlertsViewProps } from "../contracts";
import "./alerts.css";

/** Réponse de `GET /api/alerts/:id` : provenance et corroboration d'une alerte. */
type AlertDetail = {
  alert: {
    id: number;
    rule_id: string;
    title: string;
    severity: number;
    status: AlertStatus;
    scope: string;
    created_at: string;
  };
  event: {
    id: string;
    title: string;
    family: string;
    severity: number;
    summary: string | null;
    observed_at: string | null;
    source_id: string;
    confidence: string | null;
  } | null;
  source: { name: string; url: string | null; family: string | null } | null;
  org: { id: number; name: string; dept: string | null; kind: string } | null;
  corroboration: { distinct_sources: number; sources: { name: string; count: string }[] };
  confidence: AlertConfidence | null;
  evidence: unknown;
};

async function fetchAlertDetail(id: number): Promise<AlertDetail> {
  const res = await fetch(`/api/alerts/${id}`, { headers: authHeaders() });
  if (!res.ok) {
    const err = new Error(`/alerts/${id} → ${res.status}`) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  return res.json() as Promise<AlertDetail>;
}

const STATUSES: { id: AlertStatus | "all"; label: string }[] = [
  { id: "open", label: "ouvertes" },
  { id: "ack", label: "acquittées" },
  { id: "resolved", label: "résolues" },
  { id: "all", label: "toutes" },
];

const SEVERITIES = [5, 4, 3, 2, 1];

function formatDate(value: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("fr", { dateStyle: "short", timeStyle: "short" }).format(d);
}

export default function AlertsView({ canWrite, onUnauthorized, onOpenEvent, refreshSignal = 0 }: AlertsViewProps) {
  const [status, setStatus] = useState<AlertStatus | "all">("open");
  const [severity, setSeverity] = useState<number | null>(null);
  const [section, setSection] = useState<"organization_incident" | "regional_advisory">("organization_incident");
  const [rows, setRows] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const [openId, setOpenId] = useState<number | null>(null);
  const [detail, setDetail] = useState<AlertDetail | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);

  useEffect(() => {
    if (openId === null) {
      setDetail(null);
      setDetailError(null);
      return;
    }
    let cancelled = false;
    setDetail(null);
    setDetailError(null);
    fetchAlertDetail(openId)
      .then((d) => {
        if (!cancelled) setDetail(d);
      })
      .catch((err: Error & { status?: number }) => {
        if (cancelled) return;
        if (err.status === 401) onUnauthorized();
        setDetailError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, [openId, onUnauthorized]);

  const reload = useCallback(() => {
    setLoading(true);
    setError(null);
    Promise.all([
      api.alerts({
        status: status === "all" ? undefined : status,
        severity: severity ?? undefined,
      }),
    ])
      .then(([list]) => {
        setRows(list);
      })
      .catch((err: Error & { status?: number }) => {
        if (err.status === 401) onUnauthorized();
        setError(err.message);
      })
      .finally(() => setLoading(false));
  }, [status, severity, onUnauthorized]);

  useEffect(reload, [reload, refreshSignal]);

  // Les compteurs viennent des lignes chargées : ils suivent donc les filtres
  // de statut et de sévérité, au lieu d'un total global qui les ignorerait.
  const totals = useMemo(() => {
    const out: Record<string, number> = { open: 0, ack: 0, resolved: 0 };
    for (const row of rows) out[row.status] = (out[row.status] ?? 0) + 1;
    return out;
  }, [rows]);

  const incidentCount = useMemo(
    () => rows.filter((alert) => alert.scope === "organization_incident").length,
    [rows],
  );
  const regionalCount = rows.length - incidentCount;
  const visibleRows = useMemo(
    () =>
      rows.filter((alert) =>
        section === "organization_incident"
          ? alert.scope === "organization_incident"
          : alert.scope !== "organization_incident",
      ),
    [rows, section],
  );

  const act = (id: number, kind: "ack" | "resolve") => {
    setBusy(id);
    const call = kind === "ack" ? api.ackAlert(id) : api.resolveAlert(id);
    call
      .then(() => reload())
      .catch((err: Error & { status?: number }) => {
        if (err.status === 401) onUnauthorized();
        setError(err.message);
      })
      .finally(() => setBusy(null));
  };

  return (
    <section className="alerts" aria-label="alertes">
      <header className="alerts__head">
        <h2>Alertes</h2>
        <span className="alerts__totals">
          {totals.open} ouvertes, {totals.ack} acquittées, {totals.resolved} résolues
        </span>
      </header>

      <div className="alerts__sections">
        <button
          type="button"
          aria-pressed={section === "organization_incident"}
          onClick={() => setSection("organization_incident")}
        >
          incidents <span className="alerts__count">({incidentCount})</span>
        </button>
        <button
          type="button"
          aria-pressed={section === "regional_advisory"}
          onClick={() => setSection("regional_advisory")}
        >
          avis régionaux <span className="alerts__count">({regionalCount})</span>
        </button>
      </div>

      <div className="alerts__filters">
        {STATUSES.map((s) => (
          <button
            key={s.id}
            type="button"
            aria-pressed={status === s.id}
            onClick={() => setStatus(s.id)}
          >
            {s.label}
          </button>
        ))}
        <span className="alerts__sep" />
        {SEVERITIES.map((n) => (
          <button
            key={n}
            type="button"
            aria-pressed={severity === n}
            onClick={() => setSeverity(severity === n ? null : n)}
          >
            S{n}
          </button>
        ))}
      </div>

      {error ? <p className="alerts__error" role="alert" aria-live="assertive">{error}</p> : null}
      {loading ? <p className="alerts__status" role="status" aria-live="polite">chargement</p> : null}

      <ul className="alerts__list">
        {visibleRows.map((alert) => (
          <li key={alert.id} className="alerts__item">
            <button
              type="button"
              className="alerts__row"
              aria-expanded={openId === alert.id}
              onClick={() => setOpenId(openId === alert.id ? null : alert.id)}
            >
              <span className="alerts__sev" data-level={alert.severity}>
                {alert.severity}
              </span>
              <span className="alerts__body">
                <span className="alerts__title">{alert.title}</span>
                <span className="alerts__meta">
                  {[alert.rule_id, alert.org_name, alert.event_family, formatDate(alert.created_at)]
                    .filter(Boolean)
                    .join(", ")}
                </span>
              </span>
              {alert.confidence ? (
                <span
                  className="alerts__score"
                  data-status={alert.confidence.status}
                  title={
                    alert.confidence.status === "a_verifier"
                      ? "sous le seuil : à vérifier avant de s'appuyer dessus"
                      : "au-dessus du seuil de vérification"
                  }
                >
                  {alert.confidence.score}
                </span>
              ) : null}
              <span className="alerts__state" data-state={alert.status}>
                {alert.status === "open" ? "ouverte" : alert.status === "ack" ? "acquittée" : "résolue"}
              </span>
            </button>

            {canWrite ? (
              <span className="alerts__actions">
                <button
                  type="button"
                  disabled={busy === alert.id || alert.status !== "open"}
                  onClick={() => act(alert.id, "ack")}
                >
                  acquitter
                </button>
                <button
                  type="button"
                  disabled={busy === alert.id || alert.status === "resolved"}
                  onClick={() => act(alert.id, "resolve")}
                >
                  résoudre
                </button>
              </span>
            ) : null}

              {openId === alert.id ? (
                <div className="alerts__detail" role="region" aria-live="polite" aria-label="Détail de l'alerte">
                {detailError ? <p className="alerts__detail-line">{detailError}</p> : null}
                {!detail && !detailError ? <p className="alerts__detail-line">chargement du détail</p> : null}
                {detail ? (
                  <>
                    <p className="alerts__detail-line">
                      {[
                        detail.source?.name ?? detail.event?.source_id ?? "source inconnue",
                        detail.source?.family ?? detail.event?.family ?? null,
                        formatDate(detail.event?.observed_at ?? detail.alert.created_at),
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                    {detail.event?.summary ? <p className="alerts__detail-line">{detail.event.summary}</p> : null}
                    <p className="alerts__detail-line">
                      {detail.corroboration.distinct_sources > 0
                        ? `corroboration : ${detail.corroboration.distinct_sources} source(s) — ${detail.corroboration.sources
                            .map((s) => `${s.name} (${s.count})`)
                            .join(", ")}`
                        : "aucune corroboration"}
                    </p>
                    {detail.confidence ? (
                      <p className="alerts__detail-line">
                        {`confiance ${detail.confidence.score}/100`}
                        {detail.confidence.status === "a_verifier" ? " — à vérifier" : ""}
                        {` · source ${Math.round(detail.confidence.components.source_reliability * 100)}`}
                        {` · nature ${Math.round(detail.confidence.components.assertion_strength * 100)}`}
                        {` · rattachement ${Math.round(detail.confidence.components.attachment_quality * 100)}`}
                        {` · corroboration ${Math.round(detail.confidence.components.corroboration * 100)}`}
                      </p>
                    ) : detail.event?.confidence ? (
                      <p className="alerts__detail-line">confiance {detail.event.confidence}</p>
                    ) : null}
                    {detail.event && onOpenEvent ? (
                      <p className="alerts__detail-line">
                        <button type="button" onClick={() => onOpenEvent(String(detail.event?.id))}>
                          événement
                        </button>
                      </p>
                    ) : null}
                  </>
                ) : null}
              </div>
            ) : null}
          </li>
        ))}
      </ul>

      {!loading && visibleRows.length === 0 ? (
        <div className="alerts__empty" role="status" aria-live="polite">
          <p className="alerts__empty-title">Aucune alerte sur ce filtre</p>
          <p className="alerts__empty-text">
            Le radar n'alerte que sur un score suffisant : un fait isolé, sans corroboration ni incident
            confirmé, reste dans le fil d'événements. Une alerte apparaît quand la même organisation est
            touchée par plusieurs sources, ou quand l'incident est confirmé.
          </p>
          <p className="alerts__empty-hint">
            Les événements admis mais non alertés se lisent dans <strong>Carte → Fil d'événements</strong>.
          </p>
        </div>
      ) : null}
    </section>
  );
}
