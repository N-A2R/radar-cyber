/** Barre d'état système : connexion SSE, sources actives, fraîcheur. */

export interface StatusBarProps {
  /** Connexion SSE établie. */
  connected: boolean;
  /** Sources actives / total déclaré. */
  sourcesActive: number;
  sourcesTotal: number;
  /** Dernière mise à jour (ISO 8601 ou Date). */
  updatedAt?: string | Date | null;
  /** Mention libre alignée à droite (signature du build). */
  note?: string;
  /** Classe CSS ajoutée à la racine. */
  className?: string;
}

/** Heure courte « HH:MM:SS », alignée en monospace. */
function formatTime(value: string | Date | null): string {
  const date = value instanceof Date ? value : value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return "--:--:--";
  return date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

/**
 * Barre d'état en pied d'application (composant pur).
 *
 * Rendue par App.tsx en dernier enfant de `.app`.
 */
export default function StatusBar({
  connected,
  sourcesActive,
  sourcesTotal,
  updatedAt,
  note,
  className,
}: StatusBarProps) {
  const rootClassName = ["status-bar", className].filter(Boolean).join(" ");

  return (
    <footer className={rootClassName}>
      <span className="status-bar__item">
        <span className="status-bar__dot" data-live={connected} aria-hidden="true" />
        <span className="status-bar__label">sse</span>
        <span className="status-bar__value" data-live={connected}>
          {connected ? "connecté" : "déconnecté"}
        </span>
      </span>
      <span className="status-bar__item">
        <span className="status-bar__label">collecte</span>
        <span className="status-bar__value">
          {sourcesActive}/{sourcesTotal} sources
        </span>
      </span>
      <span className="status-bar__item">
        <span className="status-bar__label">dernier run</span>
        <span className="status-bar__value">{formatTime(updatedAt ?? null)}</span>
      </span>
      <span className="status-bar__spacer" />
      {note ? <span className="status-bar__note">{note}</span> : null}
    </footer>
  );
}
