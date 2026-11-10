import type { ReactNode } from "react";
import { FAMILIES } from "@radar/shared";
import "./panels.css";

/** Famille d'événement du Radar, partagée avec les collecteurs. */
type Family = (typeof FAMILIES)[number];

const FAMILY_LABEL: Record<Family, string> = {
  ransomware: "rançongiciel",
  vuln: "vulnérabilité",
  phishing: "hameçonnage",
  malware: "maliciel",
  cert: "certificats",
  cert_fr: "CERT-FR",
  typosquat: "typosquatting",
  reputation: "réputation",
  cti: "CTI",
  presse: "presse",
};

const SEVERITY_LABEL = "Sévérité";

/** Événement tel qu'attendu par {@link EventList} — sous-ensemble structurel de l'API. */
export interface EventListItem {
  /** Identifiant stable (id numérique de l'API). */
  id?: string | number;
  /** Clé de déduplication, utilisée en secours pour la clé de rendu. */
  dedupKey?: string;
  /** Famille du Radar (voir `FAMILIES`). */
  family: string;
  /** Titre court de l'événement. */
  title: string;
  /** Date d'observation ISO 8601, si connue. */
  observedAt?: string | null;
  /** Sévérité de 1 (faible) à 5 (critique). Défaut : 3. */
  severity?: number | null;
  /** Identifiant de la source (table `source`). */
  sourceId?: string | null;
  /** URL source publique, si disponible. */
  sourceUrl?: string | null;
}

export interface EventListProps {
  /** Événements de la page courante ; le découpage est réalisé par l'appelant. */
  events: EventListItem[];
  /** Numéro de page courant, base 1. */
  page: number;
  /** Nombre total d'événements toutes pages confondues. Défaut : `events.length`. */
  total?: number;
  /** Nombre d'événements par page, utilisé pour le nombre de pages. Défaut : 20. */
  pageSize?: number;
  /** Noms d'affichage des sources (`sourceId` → nom). Défaut : `sourceId`. */
  sourcesById?: Record<string, string | { name?: string; family?: string; url?: string }>;
  /** Appelé avec le nouveau numéro de page (base 1) lors d'un changement. */
  onChange: (page: number) => void;
  /** Contenu inséré entre l'en-tête et la liste (chips de familles). */
  filters?: ReactNode;
  /** Classe CSS ajoutée à la racine du panneau. */
  className?: string;
}

type Severity = 1 | 2 | 3 | 4 | 5;

function normalizeSeverity(value: number | null | undefined): Severity {
  if (typeof value !== "number" || Number.isNaN(value)) return 3;
  const rounded = Math.round(value);
  if (rounded < 1) return 1;
  if (rounded > 5) return 5;
  return rounded as Severity;
}

/** Date relative compacte en français (colonne d'heure du fil, 84 px). */
function formatRelativeFr(iso: string | null | undefined, now: number): string {
  if (!iso) return "unknown";
  const time = Date.parse(iso);
  if (Number.isNaN(time)) return "unknown";
  const minutes = Math.floor(Math.max(0, now - time) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} j`;
  return new Date(time).toLocaleDateString("en-US", { day: "2-digit", month: "short" });
}

/**
 * Liste paginée d'événements du Radar (composant pur : aucune requête réseau).
 *
 * Props :
 * - `events` : événements de la page courante (`EventListItem[]`) ;
 * - `page` : numéro de page courant, base 1 ;
 * - `total` : nombre total d'événements toutes pages confondues (défaut `events.length`) ;
 * - `pageSize` : taille de page pour le calcul du nombre de pages (défaut `20`) ;
 * - `sourcesById` : correspondance `sourceId` → nom affiché (défaut : `sourceId`) ;
 * - `onChange` : appelé avec le nouveau numéro de page (base 1) ;
 * - `className` : classe CSS additionnelle sur la racine.
 */
export default function EventList({
  events,
  page,
  total,
  pageSize = 20,
  sourcesById,
  onChange,
  filters,
  className,
}: EventListProps) {
  const now = Date.now();
  const totalItems = total ?? events.length;
  const pageCount = Math.max(1, Math.ceil(totalItems / pageSize));
  const current = Math.min(Math.max(1, Math.trunc(page) || 1), pageCount);
  const hasPrev = current > 1;
  const hasNext = current < pageCount;
  const rootClassName = ["event-list", className].filter(Boolean).join(" ");

  return (
    <section className={rootClassName} aria-label="Events">
      <header className="event-list__header">
        <span className="micro">event feed</span>
        <span className="micro">
          <b>{Math.min(current * pageSize, totalItems).toLocaleString("en-US")}</b> /{" "}
          {totalItems.toLocaleString("en-US")}
        </span>
      </header>

      {filters ? <div className="event-list__filters">{filters}</div> : null}

      {events.length === 0 ? (
        <div className="event-list__empty">
          <span className="event-list__empty-icon" aria-hidden="true">
            ◌
          </span>
          <strong>No events</strong>
          <span>No events match the active filters. Widen the selection or come back later.</span>
        </div>
      ) : (
        <ul className="event-list__items">
          {events.map((event) => {
            const key =
              event.id != null
                ? `id:${event.id}`
                : event.dedupKey != null
                  ? `dedup:${event.dedupKey}`
                  : `title:${event.title}`;
            const severity = normalizeSeverity(event.severity);
            const sourceId = event.sourceId ?? null;
            const src = sourceId ? sourcesById?.[sourceId] : undefined;
            const source = typeof src === 'string' ? src : (src?.name ?? sourceId ?? 'source inconnue');
            const observedAt = event.observedAt ?? null;

            return (
              <li key={key} className="event-list__item">
                <span
                  className="event-list__sev"
                  data-sev={severity}
                  aria-label={`${SEVERITY_LABEL} ${severity} sur 5`}
                />
                <time
                  className="event-list__time"
                  dateTime={observedAt ?? undefined}
                  title={observedAt ?? undefined}
                >
                  {formatRelativeFr(observedAt, now)}
                </time>
                <div className="event-list__body">
                  <p className="event-list__title">{event.title}</p>
                  <div className="event-list__meta">
                    <span className="event-list__family" data-family={event.family}>
                      <span className="swatch" aria-hidden="true" />
                      {FAMILY_LABEL[event.family as Family] ?? event.family}
                    </span>
                    <span className="event-list__source">{source}</span>
                    {event.sourceUrl ? (
                      <a
                        className="event-list__link"
                        href={event.sourceUrl}
                        target="_blank"
                        rel="noreferrer noopener"
                      >
                        source ↗
                      </a>
                    ) : null}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <nav className="event-list__pager" aria-label="Pagination des événements">
        <button
          type="button"
          className="event-list__pager-btn"
          onClick={() => onChange(current - 1)}
          disabled={!hasPrev}
        >
          Précédent
        </button>
        <span className="event-list__page-info" aria-live="polite">
          Page {current} / {pageCount}
        </span>
        <button
          type="button"
          className="event-list__pager-btn"
          onClick={() => onChange(current + 1)}
          disabled={!hasNext}
        >
          Suivant
        </button>
      </nav>
    </section>
  );
}
