import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, type Alert, type AlertConfidence, type AlertStatRow, type AlertStatus } from "../api";
import type { AlertsViewProps } from "../contracts";
import { EmptyState, LoadingSkeleton } from "./Skeleton";
import { FAMILY_LABEL } from "./SourcesView";
import { useScreenExport } from "./ExportMenu";
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
  { id: "all", label: "Tous les types" },
  { id: "disruption", label: "Agents de rupture" },
  { id: "silent_source", label: "Sources muettes" },
  { id: "critical_event", label: "Événements critiques" },
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

const STATUSES: { id: AlertStatus | "all"; label: string }[] = [
  { id: "open", label: "Ouvertes" },
  { id: "ack", label: "Acquittées" },
  { id: "resolved", label: "Résolues" },
  { id: "all", label: "Toutes" },
];

const SEVERITIES = [5, 4, 3, 2, 1];

const STATE_LABEL: Record<AlertStatus, string> = {
  open: "ouverte",
  ack: "acquittée",
  resolved: "résolue",
};

/** Sévérité en mot : le chiffre seul oblige à connaître l'échelle. */
const SEVERITY_WORD: Record<number, string> = {
  5: "critique",
  4: "haute",
  3: "moyenne",
  2: "faible",
  1: "information",
};

const ORG_KIND_LABEL: Record<string, string> = {
  sante: "santé",
  collectivite: "collectivité",
  entreprise: "entreprise",
  enseignement: "enseignement",
  recherche: "recherche",
  operateur: "opérateur",
  operateur_critique: "opérateur critique",
};

/**
 * Libellé français d'un identifiant de règle. Les règles connues ont une
 * formulation stable ; les autres sont dépliantes (« rupture:agent-x » →
 * « Rupture : agent x »). Le code brut reste dans l'infobulle.
 */
export function ruleLabel(ruleId: string): string {
  const rule = ruleId.toLowerCase();
  if (rule.startsWith("rupture:")) return "Rupture détectée";
  if (rule.includes("source-muette")) return "Source muette";
  if (rule.startsWith("incident-confirme")) return "Incident confirmé";
  if (rule.startsWith("supervision-collecte")) return "Supervision de collecte";
  const words = rule.replace(/[-_.:]+/g, " ").trim();
  if (!words) return "Règle de détection";
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** Confiance en mot : la couleur ne doit pas être le seul porteur du sens. */
export function confidenceWord(score: number): string {
  if (score >= 75) return "élevée";
  if (score >= 50) return "moyenne";
  return "faible";
}

function formatDate(value: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: "short" }).format(d);
}

/** Méta d'une ligne : libellés français, code technique replié dans `title`. */
function alertMeta(alert: Alert): { label: string; title?: string }[] {
  const items: { label: string; title?: string }[] = [
    { label: ALERT_KINDS.find((item) => item.id === alertKind(alert))?.label ?? "Alerte" },
    { label: ruleLabel(alert.rule_id), title: `Règle : ${alert.rule_id}` },
  ];
  if (alert.org_name) items.push({ label: alert.org_name, title: `Organisation : ${alert.org_name}` });
  if (alert.event_family) {
    items.push({
      label: FAMILY_LABEL[alert.event_family] ?? alert.event_family,
      title: `Famille d'événement : ${alert.event_family}`,
    });
  }
  items.push({
    label: `sévérité ${SEVERITY_WORD[alert.severity] ?? alert.severity}`,
    title: `Sévérité ${alert.severity} sur 5`,
  });
  items.push({ label: formatDate(alert.created_at), title: alert.created_at });
  return items;
}

export default function AlertsView({ canWrite, onUnauthorized, onOpenEvent, refreshSignal = 0 }: AlertsViewProps) {
  const [status, setStatus] = useState<AlertStatus | "all">("open");
  const [severity, setSeverity] = useState<number | null>(null);
  const [kind, setKind] = useState<AlertKind | "all">("all");
  const [rows, setRows] = useState<Alert[]>([]);
  useScreenExport("alerts", rows.map((alert) => ({
    id: alert.id, date: alert.created_at, kind: alert.rule_id,
    severity: alert.severity, status: alert.status, scope: alert.scope,
    organisation: alert.org_name, title: alert.event_title ?? alert.title,
  })));
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
    api.alertDetail<AlertDetail>(openId)
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
    <section className="alerts" aria-label="Alertes">
      <header className="alerts__head">
        <h2>Alertes</h2>
        <span className="alerts__totals" data-testid="alerts-totals">
          {totals.open} {totals.open > 1 ? "ouvertes" : "ouverte"}, {totals.ack}{" "}
          {totals.ack > 1 ? "acquittées" : "acquittée"}, {totals.resolved}{" "}
          {totals.resolved > 1 ? "résolues" : "résolue"}
        </span>
      </header>

      <div className="alerts__sections" role="group" aria-label="Type d'alerte">
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

      <div className="alerts__filters" role="group" aria-label="Filtres d'alerte">
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
            title={`Sévérité ${n}`}
            onClick={() => setSeverity(severity === n ? null : n)}
          >
            S{n}
          </button>
        ))}
      </div>

      {error ? <p className="alerts__error" role="alert" aria-live="assertive">{error}</p> : null}
      {loading ? <LoadingSkeleton label="chargement des alertes" /> : null}
      {!loading && stats && totalCount > rows.length ? (
        <p className="alerts__status">
          Affichage des {rows.length} alertes les plus récentes sur {totalCount}.
        </p>
      ) : null}

      <ul className="alerts__list" aria-label="Liste des alertes">
        {visibleRows.map((alert) => (
          <li key={alert.id} className="alerts__item" data-alert-id={alert.id}>
            <button
              type="button"
              className="alerts__row"
              aria-expanded={openId === alert.id}
              aria-label={`Preuve de l'alerte ${alert.id} : ${alert.title}`}
              onClick={() => setOpenId(openId === alert.id ? null : alert.id)}
            >
              <span className="alerts__sev" data-level={alert.severity} title={`Sévérité ${alert.severity} sur 5 — ${SEVERITY_WORD[alert.severity] ?? "non qualifiée"}`}>
                {alert.severity}
              </span>
              <span className="alerts__body">
                <span className="alerts__title">{alert.title}</span>
                <span className="alerts__meta">
                  {alertMeta(alert).map((item, i) => (
                    <span key={`${item.label}-${i}`}>
                      {i > 0 ? " · " : null}
                      <span title={item.title}>{item.label}</span>
                    </span>
                  ))}
                </span>
              </span>
              {alert.confidence ? (
                <span
                  className="alerts__score"
                  data-status={alert.confidence.status}
                  title={
                    alert.confidence.status === "a_verifier"
                      ? "Sous le seuil de vérification : consulter la preuve avant de s'y fier"
                      : "Au-dessus du seuil de vérification"
                  }
                  aria-label={`Confiance ${confidenceWord(alert.confidence.score)}, ${alert.confidence.score} sur 100`}
                >
                  {confidenceWord(alert.confidence.score)} · {alert.confidence.score}
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
                {openId === alert.id ? "Masquer la preuve" : "Voir la preuve"}
              </button>
              {canWrite ? (
                <>
                  <button
                    type="button"
                    disabled={busy === alert.id || alert.status !== "open"}
                    onClick={() => act(alert.id, "ack")}
                  >
                    {busy === alert.id ? "En cours…" : "Acquitter"}
                  </button>
                  <button
                    type="button"
                    disabled={busy === alert.id || alert.status === "resolved"}
                    onClick={() => act(alert.id, "resolve")}
                  >
                    Résoudre
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
                      <strong>Preuve</strong> ·{" "}
                      <span title={`Règle : ${detail.alert.rule_id}`}>{ruleLabel(detail.alert.rule_id)}</span> ·{" "}
                      {formatDate(detail.alert.created_at)}
                    </p>
                    {evidence?.motif ? <p className="alerts__detail-line">Motif : {evidence.motif}</p> : null}
                    {evidence?.explication ? <p className="alerts__detail-line">Base : {evidence.explication}</p> : null}
                    {evidence?.score !== undefined ? (
                      <p className="alerts__detail-line">Score de détection : {evidence.score}</p>
                    ) : null}
                    {evidence?.faits?.length ? (
                      <p className="alerts__detail-line">
                        Faits sources :{" "}
                        {evidence.faits.map((fact, i) => (
                          <span key={`${fact}-${i}`}>
                            {i > 0 ? ", " : null}
                            <button
                              type="button"
                              title={`Ouvrir l'événement ${String(fact)} dans le fil`}
                              aria-label={`Ouvrir l'événement ${String(fact)} dans le fil`}
                              onClick={() => onOpenEvent(String(fact))}
                            >
                              #{String(fact)}
                            </button>
                          </span>
                        ))}
                      </p>
                    ) : null}
                    {detail.org ? (
                      <p className="alerts__detail-line">
                        Organisation : {detail.org.name}
                        {detail.org.dept ? ` (${detail.org.dept})` : ""} ·{" "}
                        <span title={`Type : ${detail.org.kind}`}>
                          {ORG_KIND_LABEL[detail.org.kind] ?? detail.org.kind}
                        </span>
                      </p>
                    ) : null}
                    {detail.event ? (
                      <>
                        <p className="alerts__detail-line">
                          <strong>Événement déclencheur</strong> ·{" "}
                          <span title={`Famille : ${detail.event.family}`}>
                            {FAMILY_LABEL[detail.event.family] ?? detail.event.family}
                          </span>{" "}
                          · {formatDate(detail.event.observed_at)}
                        </p>
                        {detail.event.summary ? <p className="alerts__detail-line">{detail.event.summary}</p> : null}
                        <p className="alerts__detail-line">
                          <button type="button" onClick={() => onOpenEvent(String(detail.event?.id))}>
                            Ouvrir l'événement dans le fil
                          </button>
                        </p>
                      </>
                    ) : (
                      <p className="alerts__detail-line">
                        Aucun événement déclencheur unique : cette alerte agrège plusieurs faits. Suivre les faits
                        sources ci-dessus.
                      </p>
                    )}
                    {detail.source ? (
                      <p className="alerts__detail-line">
                        Source : {detail.source.name}
                        {detail.source.url ? (
                          <>
                            {" · "}
                            <a href={detail.source.url} target="_blank" rel="noopener noreferrer">
                              Ouvrir le rapport d'origine
                            </a>
                          </>
                        ) : null}
                      </p>
                    ) : null}
                    <p className="alerts__detail-line">
                      {detail.corroboration.distinct_sources > 0
                        ? `Corroboration : ${detail.corroboration.distinct_sources} source(s) — ${detail.corroboration.sources
                            .map((s) => `${s.name} (${s.count})`)
                            .join(", ")}`
                        : "Aucune corroboration enregistrée"}
                    </p>
                    {detail.confidence ? (
                      <p className="alerts__detail-line">
                        {`Confiance ${detail.confidence.score}/100`}
                        {detail.confidence.status === "a_verifier" ? " — à vérifier" : ""}
                        {` · source ${Math.round(detail.confidence.components.source_reliability * 100)}`}
                        {` · nature ${Math.round(detail.confidence.components.assertion_strength * 100)}`}
                        {` · rattachement ${Math.round(detail.confidence.components.attachment_quality * 100)}`}
                        {` · corroboration ${Math.round(detail.confidence.components.corroboration * 100)}`}
                      </p>
                    ) : detail.event?.confidence ? (
                      <p className="alerts__detail-line">Confiance : {detail.event.confidence}</p>
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
