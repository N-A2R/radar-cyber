import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, authHeaders, type Alert, type AlertConfidence, type AlertStatRow, type AlertStatus } from "../api";
import type { AlertsViewProps } from "../contracts";
import { EmptyState, LoadingSkeleton } from "./Skeleton";
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

/** Famille d'alerte, déduite de la règle et du scope renvoyés par l'API. */
export type AlertKind = "disruption" | "silent_source" | "critical_event";

export const ALERT_KINDS: { id: AlertKind | "all"; label: string }[] = [
  { id: "all", label: "All types" },
  { id: "disruption", label: "Disruption agents" },
  { id: "silent_source", label: "Silent sources" },
  { id: "critical_event", label: "Critical events" },
];

export function alertKind(alert: { rule_id: string; scope?: string | null }): AlertKind {
  const rule = alert.rule_id.toLowerCase();
  if (rule.includes("source-muette") || rule.includes("silent-source")) return "silent_source";
  if (rule.startsWith("rupture:") || rule.startsWith("agent-") || alert.scope === "rupture") return "disruption";
  return "critical_event";
}

/** Preuve structurée portée par `alert.evidence` (agents de rupture surtout). */
export type AlertEvidence = {
  motif?: string;
  explication?: string;
  score?: number;
  faits?: (string | number)[];
};

export function readEvidence(raw: unknown): AlertEvidence | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;
  const out: AlertEvidence = {};
  if (typeof obj.motif === "string") out.motif = obj.motif;
  if (typeof obj.explication === "string") out.explication = obj.explication;
  if (typeof obj.score === "number") out.score = obj.score;
  if (Array.isArray(obj.faits)) {
    out.faits = obj.faits.filter((v): v is string | number => typeof v === "string" || typeof v === "number");
  }
  return Object.keys(out).length > 0 ? out : null;
}

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
  { id: "open", label: "Open" },
  { id: "ack", label: "Acknowledged" },
  { id: "resolved", label: "Resolved" },
  { id: "all", label: "All" },
];

const SEVERITIES = [5, 4, 3, 2, 1];

const STATE_LABEL: Record<AlertStatus, string> = {
  open: "open",
  ack: "acknowledged",
  resolved: "resolved",
};

function formatDate(value: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "short", timeStyle: "short" }).format(d);
}

export default function AlertsView({ canWrite, onUnauthorized, onOpenEvent, refreshSignal = 0 }: AlertsViewProps) {
  const [status, setStatus] = useState<AlertStatus | "all">("open");
  const [severity, setSeverity] = useState<number | null>(null);
  const [kind, setKind] = useState<AlertKind | "all">("all");
  const [rows, setRows] = useState<Alert[]>([]);
  const [stats, setStats] = useState<AlertStatRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const [openId, setOpenId] = useState<number | null>(null);
  const [detail, setDetail] = useState<AlertDetail | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const loadId = useRef(0);

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
    const current = ++loadId.current;
    setLoading(true);
    setError(null);
    // Les compteurs globaux viennent de /alerts/stats : la liste est plafonnée
    // à 500 lignes, mais le bandeau ne doit pas laisser croire qu'il n'y a
    // que 500 alertes en base.
    Promise.all([
      api.alerts({ status: status === "all" ? undefined : status, severity: severity ?? undefined, limit: 500 }),
      api.alertStats().catch(() => null),
    ])
      .then(([list, globalStats]) => {
        if (current !== loadId.current) return;
        setRows(list);
        setStats(globalStats);
      })
      .catch((err: Error & { status?: number }) => {
        if (current !== loadId.current) return;
        if (err.status === 401) onUnauthorized();
        setError(err.message);
      })
      .finally(() => {
        if (current === loadId.current) setLoading(false);
      });
  }, [status, severity, onUnauthorized]);

  useEffect(reload, [reload, refreshSignal]);

  const totals = useMemo(() => {
    const source = stats ?? rows.map((row) => ({ status: row.status, severity: row.severity, count: "1" }));
    const out: Record<AlertStatus, number> = { open: 0, ack: 0, resolved: 0 };
    for (const row of source) out[row.status] += Number(row.count) || 0;
    return out;
  }, [stats, rows]);
  const totalCount = totals.open + totals.ack + totals.resolved;

  const kindCounts = useMemo(() => {
    const out: Record<AlertKind, number> = { disruption: 0, silent_source: 0, critical_event: 0 };
    for (const row of rows) out[alertKind(row)] += 1;
    return out;
  }, [rows]);

  const visibleRows = useMemo(
    () => rows.filter((alert) => kind === "all" || alertKind(alert) === kind),
    [rows, kind],
  );

  const act = (id: number, action: "ack" | "resolve") => {
    setBusy(id);
    const call = action === "ack" ? api.ackAlert(id) : api.resolveAlert(id);
    call
      .then(() => {
        const nextStatus: AlertStatus = action === "ack" ? "ack" : "resolved";
        setDetail((prev) => (prev && prev.alert.id === id ? { ...prev, alert: { ...prev.alert, status: nextStatus } } : prev));
        reload();
      })
      .catch((err: Error & { status?: number }) => {
        if (err.status === 401) onUnauthorized();
        setError(err.message);
      })
      .finally(() => setBusy(null));
  };

  const evidence = readEvidence(detail?.evidence);

  return (
    <section className="alerts" aria-label="Alerts">
      <header className="alerts__head">
        <h2>Alerts</h2>
        <span className="alerts__totals" data-testid="alerts-totals">
          {totals.open} open, {totals.ack} acknowledged, {totals.resolved} resolved
        </span>
      </header>

      <div className="alerts__sections" role="group" aria-label="Alert type">
        {ALERT_KINDS.map((item) => (
          <button
            key={item.id}
            type="button"
            aria-pressed={kind === item.id}
            onClick={() => setKind(item.id)}
          >
            {item.label} {item.id === "all" ? null : <span className="alerts__count">({kindCounts[item.id]})</span>}
          </button>
        ))}
      </div>

      <div className="alerts__filters" role="group" aria-label="Alert filters">
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
            title={`Severity ${n}`}
            onClick={() => setSeverity(severity === n ? null : n)}
          >
            S{n}
          </button>
        ))}
      </div>

      {error ? <p className="alerts__error" role="alert">{error}</p> : null}
      {loading ? <LoadingSkeleton label="chargement des alertes" /> : null}
      {!loading && stats && totalCount > rows.length ? (
        <p className="alerts__status">
          Showing the {rows.length} most recent alerts out of {totalCount}.
        </p>
      ) : null}

      <ul className="alerts__list" aria-label="Alert list">
        {visibleRows.map((alert) => (
          <li key={alert.id} className="alerts__item" data-alert-id={alert.id}>
            <button
              type="button"
              className="alerts__row"
              aria-expanded={openId === alert.id}
              aria-label={`Evidence for alert ${alert.id}: ${alert.title}`}
              onClick={() => setOpenId(openId === alert.id ? null : alert.id)}
            >
              <span className="alerts__sev" data-level={alert.severity} title={`Severity ${alert.severity}`}>
                {alert.severity}
              </span>
              <span className="alerts__body">
                <span className="alerts__title">{alert.title}</span>
                <span className="alerts__meta">
                  {[
                    ALERT_KINDS.find((item) => item.id === alertKind(alert))?.label,
                    alert.rule_id,
                    alert.org_name,
                    alert.event_family,
                    formatDate(alert.created_at),
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </span>
              {alert.confidence ? (
                <span
                  className="alerts__score"
                  data-status={alert.confidence.status}
                  title={
                    alert.confidence.status === "a_verifier"
                      ? "Below the verification threshold: check the evidence before relying on it"
                      : "Above the verification threshold"
                  }
                >
                  {alert.confidence.score}
                </span>
              ) : null}
              <span className="alerts__state" data-state={alert.status}>
                {STATE_LABEL[alert.status]}
              </span>
            </button>

            <span className="alerts__actions">
              <button
                type="button"
                data-testid="alert-evidence"
                aria-expanded={openId === alert.id}
                onClick={() => setOpenId(openId === alert.id ? null : alert.id)}
              >
                {openId === alert.id ? "Hide evidence" : "View evidence"}
              </button>
              {canWrite ? (
                <>
                  <button
                    type="button"
                    disabled={busy === alert.id || alert.status !== "open"}
                    onClick={() => act(alert.id, "ack")}
                  >
                    {busy === alert.id ? "Working…" : "Acknowledge"}
                  </button>
                  <button
                    type="button"
                    disabled={busy === alert.id || alert.status === "resolved"}
                    onClick={() => act(alert.id, "resolve")}
                  >
                    Resolve
                  </button>
                </>
              ) : null}
            </span>

            {openId === alert.id ? (
              <div className="alerts__detail" data-testid="alert-detail">
                {detailError ? <p className="alerts__detail-line" role="alert">{detailError}</p> : null}
                {!detail && !detailError ? <LoadingSkeleton label="chargement du détail" /> : null}
                {detail ? (
                  <>
                    <p className="alerts__detail-line">
                      <strong>Evidence</strong> · rule {detail.alert.rule_id} · {formatDate(detail.alert.created_at)}
                    </p>
                    {evidence?.motif ? <p className="alerts__detail-line">Reason: {evidence.motif}</p> : null}
                    {evidence?.explication ? <p className="alerts__detail-line">Basis: {evidence.explication}</p> : null}
                    {evidence?.score !== undefined ? (
                      <p className="alerts__detail-line">Detection score: {evidence.score}</p>
                    ) : null}
                    {evidence?.faits?.length ? (
                      <p className="alerts__detail-line">
                        Source facts:{" "}
                        {evidence.faits.map((fact, i) => (
                          <span key={`${fact}-${i}`}>
                            {i > 0 ? ", " : null}
                            <button type="button" onClick={() => onOpenEvent(String(fact))}>#{String(fact)}</button>
                          </span>
                        ))}
                      </p>
                    ) : null}
                    {detail.org ? (
                      <p className="alerts__detail-line">
                        Organisation: {detail.org.name}
                        {detail.org.dept ? ` (${detail.org.dept})` : ""} · {detail.org.kind}
                      </p>
                    ) : null}
                    {detail.event ? (
                      <>
                        <p className="alerts__detail-line">
                          <strong>Triggering event</strong> · {detail.event.family} · {formatDate(detail.event.observed_at)}
                        </p>
                        {detail.event.summary ? <p className="alerts__detail-line">{detail.event.summary}</p> : null}
                        <p className="alerts__detail-line">
                          <button type="button" onClick={() => onOpenEvent(String(detail.event?.id))}>
                            Open event in the feed
                          </button>
                        </p>
                      </>
                    ) : (
                      <p className="alerts__detail-line">
                        No single triggering event: this alert aggregates several facts. Follow the source facts above.
                      </p>
                    )}
                    {detail.source ? (
                      <p className="alerts__detail-line">
                        Source: {detail.source.name}
                        {detail.source.url ? (
                          <>
                            {" · "}
                            <a href={detail.source.url} target="_blank" rel="noopener noreferrer">
                              Open the original report
                            </a>
                          </>
                        ) : null}
                      </p>
                    ) : null}
                    <p className="alerts__detail-line">
                      {detail.corroboration.distinct_sources > 0
                        ? `Corroboration: ${detail.corroboration.distinct_sources} source(s) — ${detail.corroboration.sources
                            .map((s) => `${s.name} (${s.count})`)
                            .join(", ")}`
                        : "No corroboration recorded"}
                    </p>
                    {detail.confidence ? (
                      <p className="alerts__detail-line">
                        {`Confidence ${detail.confidence.score}/100`}
                        {detail.confidence.status === "a_verifier" ? " — needs verification" : ""}
                        {` · source ${Math.round(detail.confidence.components.source_reliability * 100)}`}
                        {` · nature ${Math.round(detail.confidence.components.assertion_strength * 100)}`}
                        {` · attachment ${Math.round(detail.confidence.components.attachment_quality * 100)}`}
                        {` · corroboration ${Math.round(detail.confidence.components.corroboration * 100)}`}
                      </p>
                    ) : detail.event?.confidence ? (
                      <p className="alerts__detail-line">Confidence: {detail.event.confidence}</p>
                    ) : null}
                  </>
                ) : null}
              </div>
            ) : null}
          </li>
        ))}
      </ul>

      {!loading && visibleRows.length === 0 ? (
        <EmptyState
          className="alerts__empty"
          message={
            <>
              <strong className="alerts__empty-title">Aucune alerte sur ce filtre</strong>
              <span className="alerts__empty-text">
                Le radar n'alerte que sur un score suffisant : un fait isolé, sans corroboration ni incident
                confirmé, reste dans le fil d'événements. Une alerte apparaît quand la même organisation est
                touchée par plusieurs sources, quand l'incident est confirmé, ou quand un agent de détection
                identifie une rupture.
              </span>
              <span className="alerts__empty-hint">
                Les événements admis mais non alertés se lisent dans Carte → Fil d'événements.
              </span>
            </>
          }
          actionLabel="Voir toutes les alertes"
          onAction={() => { setStatus("all"); setSeverity(null); }}
        />
      ) : null}
    </section>
  );
}
