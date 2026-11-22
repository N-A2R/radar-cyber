import { useEffect, useRef } from "react";
import type { LiveAlert } from "../api";
import { EmptyState } from "./Skeleton";
import "./live-alerts.css";

/**
 * Bandeau d'alertes en direct — les alertes « tombent » dans le dashboard
 * existant, sans nouvel écran principal. Le flux SSE est souscrit une seule
 * fois par `connectLiveAlerts` (qui ne dépend pas de React, donc testable).
 */

/** Alertes gardées en mémoire pour le bandeau (les plus récentes d'abord). */
export const LIVE_ALERT_LIMIT = 50;

/** Relatif et lisible : une alerte sans date n'invente pas un âge. */
export function formatAgo(iso: string, now: number = Date.now()): string {
  if (!iso) return "—";
  const at = Date.parse(iso);
  if (!Number.isFinite(at)) return "—";
  const seconds = Math.max(0, Math.round((now - at) / 1000));
  if (seconds < 60) return "à l'instant";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `il y a ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `il y a ${hours} h`;
  return `il y a ${Math.round(hours / 24)} j`;
}

/** Une charge utile SSE n'est acceptée que si elle porte les champs utiles. */
export function parseLiveAlert(raw: string): LiveAlert | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  // Objet JSON vérifié juste au-dessus : le cast ne fait que typer les champs.
  const row = value as Record<string, unknown>;
  if (typeof row.id !== "number" || !Number.isFinite(row.id)) return null;
  if (typeof row.title !== "string") return null;
  if (typeof row.severity !== "number" || !Number.isFinite(row.severity)) return null;
  const nullableNumber = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
  return {
    id: row.id,
    rule_id: typeof row.rule_id === "string" ? row.rule_id : "",
    title: row.title,
    severity: row.severity,
    status: typeof row.status === "string" ? row.status : "open",
    event_id: nullableNumber(row.event_id),
    indicator_id: nullableNumber(row.indicator_id),
    org_id: nullableNumber(row.org_id),
    scope: typeof row.scope === "string" ? row.scope : null,
    created_at: typeof row.created_at === "string" ? row.created_at : "",
  };
}

/** Ajout en tête, sans doublon, avec plafond : idempotent par `id`. */
export function addLiveAlert(list: LiveAlert[], alert: LiveAlert, limit = LIVE_ALERT_LIMIT): LiveAlert[] {
  return [alert, ...list.filter((a) => a.id !== alert.id)].slice(0, limit);
}

export type LiveAlertStreamOptions = {
  token?: string | null;
  onAlert: (alert: LiveAlert) => void;
  onConnection?: (connected: boolean) => void;
};

/**
 * Abonnement au canal `alert` de `/api/stream`. Le shell garde la main sur les
 * autres canaux (`event: new`) via `addEventListener` ; un seul EventSource par
 * session. Retourne aussi `close`, appelé au démontage ou au changement de jeton.
 */
export function connectLiveAlerts({ token, onAlert, onConnection }: LiveAlertStreamOptions) {
  const url = token ? `/api/stream?token=${encodeURIComponent(token)}` : "/api/stream";
  const stream = new EventSource(url);
  stream.onopen = () => onConnection?.(true);
  stream.onerror = () => onConnection?.(false);
  stream.addEventListener("alert", (raw) => {
    // MessageEvent SSE : `data` est une chaîne, même si le DOM la type mal.
    const message = raw as MessageEvent<string>;
    const alert = parseLiveAlert(message.data);
    // Un message reçu prouve que le flux est vivant, même après un onerror.
    onConnection?.(true);
    if (alert) onAlert(alert);
  });
  return {
    addEventListener: (type: string, cb: (raw: MessageEvent) => void) => stream.addEventListener(type, cb),
    close: () => stream.close(),
  };
}

/** Bip court, sans fichier audio : deux oscillateurs, 120 ms, niveau bas. */
function beep(severity: number): void {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = severity >= 5 ? 880 : 660;
    gain.gain.value = 0.04;
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.12);
    osc.onended = () => void ctx.close();
  } catch {
    // Audio refusé par le navigateur : le visuel suffit.
  }
}

export default function LiveAlerts({
  alerts,
  unseen,
  soundOn,
  onToggleSound,
  onOpenAlerts,
  onDismiss,
}: {
  alerts: LiveAlert[];
  unseen: number;
  soundOn: boolean;
  onToggleSound: () => void;
  onOpenAlerts: () => void;
  onDismiss: () => void;
}) {
  const latest = alerts[0] ?? null;
  const lastBeeped = useRef<number | null>(null);

  useEffect(() => {
    if (!latest) return;
    // Premier rendu : on ne sonne pas pour une alerte déjà là.
    if (lastBeeped.current === null) {
      lastBeeped.current = latest.id;
      return;
    }
    if (latest.id !== lastBeeped.current) {
      lastBeeped.current = latest.id;
      if (soundOn && latest.severity >= 4) beep(latest.severity);
    }
  }, [latest, soundOn]);

  return (
    <div className="live-alerts" data-empty={latest === null} data-testid="live-alerts" aria-live="polite">
      {latest ? (
        <button type="button" className="live-alerts__hit" onClick={onOpenAlerts} data-level={latest.severity}>
          <span className="live-alerts__dot" aria-hidden="true" />
          <span className="live-alerts__sev">S{latest.severity}</span>
          <span className="live-alerts__title">{latest.title}</span>
          <span className="live-alerts__meta">
            {latest.org_id !== null ? `organisation #${latest.org_id}` : latest.rule_id} · {formatAgo(latest.created_at)}
          </span>
          {unseen > 1 ? <span className="live-alerts__more">+{unseen - 1}</span> : null}
        </button>
      ) : (
        <EmptyState
          className="live-alerts__idle"
          message="aucune alerte en direct pour l'instant"
          actionLabel="Voir les alertes"
          onAction={onOpenAlerts}
        />
      )}

      <div className="live-alerts__controls">
        <button
          type="button"
          className="live-alerts__ctl"
          aria-pressed={soundOn}
          onClick={onToggleSound}
          title="Son pour les alertes de sévérité 4 et 5"
        >
          {soundOn ? "Son activé" : "Son coupé"}
        </button>
        {latest ? (
          <button type="button" className="live-alerts__ctl" onClick={onDismiss} aria-label="Masquer la bannière d'alerte">
            ×
          </button>
        ) : null}
      </div>
    </div>
  );
}
