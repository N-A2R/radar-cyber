/** Ticker d'événements : les derniers titres défilent en bande fine. */

/** Événement minimal lu par le ticker. */
export interface TickerEvent {
  /** Identifiant stable (clé de rendu). */
  id: string;
  /** Titre de l'événement. */
  title: string;
  /** Sévérité 1 à 5 (pastille carrée). */
  severity: number;
}

export interface EventTickerProps {
  /** Événements à faire défiler, du plus récent au plus ancien. */
  events: TickerEvent[];
  /** Nombre maximal de titres (défaut 20). */
  limit?: number;
  /** Classe CSS ajoutée à la racine. */
  className?: string;
}

/** Pastille de sévérité : 1 à 5, bornée. */
function severityKey(value: number): string {
  const rounded = Math.round(value);
  if (rounded < 1) return "1";
  if (rounded > 5) return "5";
  return String(rounded);
}

/**
 * Bande de défilement des derniers événements (composant pur).
 *
 * Rendue par App.tsx sous la bande KPI ; visible sur la carte.
 */
export default function EventTicker({ events, limit = 20, className }: EventTickerProps) {
  const items = events.slice(0, limit);
  if (items.length === 0) return null;
  const rootClassName = ["event-ticker", className].filter(Boolean).join(" ");

  /* Deux copies identiques : la translation de -50 % boucle sans saut. */
  const copy = (suffix: string, decorative: boolean) => (
    <div className="event-ticker__copy" aria-hidden={decorative || undefined}>
      {items.map((event) => (
        <span className="event-ticker__item" key={`${suffix}-${event.id}`}>
          <span className="event-ticker__sev" data-sev={severityKey(event.severity)} aria-hidden="true" />
          <span className="event-ticker__title">{event.title}</span>
          <span className="event-ticker__sep" aria-hidden="true">
            ·
          </span>
        </span>
      ))}
    </div>
  );

  return (
    <section className={rootClassName} aria-label="Derniers événements">
      <span className="event-ticker__label">flux</span>
      <div className="event-ticker__viewport">
        <div className="event-ticker__track">
          {copy("a", false)}
          {copy("b", true)}
        </div>
      </div>
    </section>
  );
}
