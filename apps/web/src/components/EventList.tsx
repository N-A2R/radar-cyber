import type { Event } from "../api";
import type { FeedProps } from "../contracts";
import FamilyFilter from "./FamilyFilter";
import "./feed.css";

function formatRelative(iso: string | null): string {
  if (!iso) return "—";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "—";
  const diff = Date.now() - t;
  const sec = Math.round(diff / 1000);
  const rtf = new Intl.RelativeTimeFormat("fr", { numeric: "auto", style: "short" });
  const abs = Math.abs(sec);
  if (abs < 60) return rtf.format(-sec, "second");
  const min = Math.round(sec / 60);
  if (Math.abs(min) < 60) return rtf.format(-min, "minute");
  const hr = Math.round(min / 60);
  if (Math.abs(hr) < 24) return rtf.format(-hr, "hour");
  const day = Math.round(hr / 24);
  if (Math.abs(day) < 30) return rtf.format(-day, "day");
  const month = Math.round(day / 30);
  if (Math.abs(month) < 12) return rtf.format(-month, "month");
  const year = Math.round(month / 12);
  return rtf.format(-year, "year");
}

function severityLevel(severity: number): string {
  return String(Math.max(1, Math.min(5, Math.round(severity))));
}

function eventMeta(event: Event): string {
  return [event.family, event.fraicheur?.libelle ?? formatRelative(event.observedAt), event.sourceId]
    .filter((part) => part && part.length > 0)
    .join(" · ");
}

export default function EventList({
  events,
  byFamily,
  family,
  onFamily,
  selectedEventId,
  onSelectEvent,
  loading,
  error,
}: FeedProps) {
  return (
    <section className="feed" aria-label="Fil d'événements">
      <header className="feed__header">
        <h2 className="feed__title">Fil d'événements</h2>
        <span className="feed__count" role="status" aria-live="polite">{events.length}</span>
      </header>

      <FamilyFilter byFamily={byFamily} family={family} onFamily={onFamily} />

      {loading ? <p className="feed__status" role="status" aria-live="polite">chargement</p> : null}
      {error ? <p className="feed__status feed__status--error" role="alert" aria-live="assertive">{error}</p> : null}

      <ul className="feed__list">
        {events.map((event) => {
          const selected = event.id === selectedEventId;
          const level = severityLevel(event.severity);
          return (
            <li key={event.id} className="feed__item">
              <button
                type="button"
                className="feed__row"
                aria-selected={selected}
                onClick={() => onSelectEvent(event.id)}
              >
                <span className="feed__severity" data-level={level}>
                  {level}
                </span>
                <span className="feed__body">
                  <span
                    className={event.regional ? "feed__item-title feed__regional" : "feed__item-title"}
                  >
                    {event.title}
                  </span>
                  <span className="feed__meta">{eventMeta(event)}</span>
                  {event.confiance && (
                    // La confiance se voit avant d'ouvrir quoi que ce soit : une
                    // revendication fragile ne doit pas se lire comme un fait.
                    <span
                      className="feed__confidence"
                      data-niveau={event.confiance.niveau}
                      title={event.confiance.raisons.join(" · ")}
                    >
                      {event.confiance.libelle}
                      {event.confiance.sourcesDistinctes > 1
                        ? ` · ${event.confiance.sourcesDistinctes} sources`
                        : ""}
                    </span>
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
