import { useCallback, useEffect, useMemo, useState } from "react";
import { api, type Alert, type AlertStatRow, type AlertStatus } from "../api";
import type { AlertsViewProps } from "../contracts";
import "./alerts.css";

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

export default function AlertsView({ canWrite, onUnauthorized, onOpenEvent }: AlertsViewProps) {
  const [status, setStatus] = useState<AlertStatus | "all">("open");
  const [severity, setSeverity] = useState<number | null>(null);
  const [section, setSection] = useState<"organization_incident" | "regional_advisory">("organization_incident");
  const [rows, setRows] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<number | null>(null);

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

  useEffect(reload, [reload]);

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

      {error ? <p className="alerts__error">{error}</p> : null}
      {loading ? <p className="alerts__status">chargement</p> : null}

      <ul className="alerts__list">
        {visibleRows.map((alert) => (
          <li key={alert.id} className="alerts__item">
            <button
              type="button"
              className="alerts__row"
              onClick={() => {
                if (alert.event_id !== null) onOpenEvent(String(alert.event_id));
              }}
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
          </li>
        ))}
      </ul>

      {!loading && visibleRows.length === 0 ? <p className="alerts__status">aucune alerte sur ce filtre</p> : null}
    </section>
  );
}
