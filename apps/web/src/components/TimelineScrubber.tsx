import { useCallback, useMemo, useRef } from "react";
import type { KeyboardEvent, PointerEvent } from "react";
import "./timeline.css";

/* ── Constantes de découpage ────────────────────────────────────── */
/** Nombre minimal de compartiments, quel que soit le volume d'événements. */
const MIN_BUCKETS = 60;
/** Nombre maximal de compartiments : la frise reste lisible et le DOM léger. */
const MAX_BUCKETS = 120;
/** Sous cette amplitude, les compartiments sont horaires (3 jours). */
const HOUR_SPAN_MS = 3 * 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/* ── Formatage français ─────────────────────────────────────────── */
const SHORT_DATE = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short" });
const LONG_DATE = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric" });

/** Événement minimal lu par la frise ; l'appelant peut fournir un objet plus riche. */
export interface TimelineEvent {
  /** Identifiant stable (id numérique ou clé de déduplication de l'API). */
  id?: string | number;
  /** Date d'observation : ISO 8601 ou `Date`. Les valeurs absentes sont ignorées. */
  observedAt?: string | Date | null;
}

/** Plage de sélection, bornes incluses. */
export interface TimelineRange {
  /** Début de la plage (borne basse). */
  from: Date;
  /** Fin de la plage (borne haute). */
  to: Date;
}

export interface TimelineScrubberProps {
  /**
   * Événements à représenter. Seuls `id` et `observedAt` sont exploités, tout
   * autre champ est ignoré. Les événements sans date valide sont écartés de
   * l'histogramme et du compteur.
   */
  events: TimelineEvent[];
  /**
   * Plage actuellement sélectionnée (composant contrôlé). Le composant n'écrit
   * jamais cette prop : il émet une nouvelle plage via `onRangeChange`.
   */
  range: TimelineRange;
  /**
   * Appelé à chaque déplacement de poignée (souris, tactile ou clavier) avec la
   * nouvelle plage. `from <= to` et les bornes incluses sont garantis.
   */
  onRangeChange: (range: TimelineRange) => void;
  /**
   * Hauteur de la piste (histogramme + poignées) en pixels.
   * Défaut : `64`.
   */
  height?: number;
  /** Classe CSS ajoutée à la racine du composant. */
  className?: string;
}

/** Convertit une date d'observation en millisecondes, ou `null` si illisible. */
function toTimeMs(value: string | Date | null | undefined): number | null {
  if (value instanceof Date) {
    const ms = value.getTime();
    return Number.isFinite(ms) ? ms : null;
  }
  if (typeof value === "string" && value.trim() !== "") {
    const ms = Date.parse(value);
    return Number.isFinite(ms) ? ms : null;
  }
  return null;
}

/** Date courte en français (« 3 nov. »), année ajoutée si elle diffère du contexte. */
function formatShortDate(date: Date, forceYear: boolean): string {
  const withYear = forceYear || date.getFullYear() !== new Date().getFullYear();
  return (withYear ? LONG_DATE : SHORT_DATE).format(date);
}

/** Bornes en français : « 3 nov. → 10 nov. » (année ajoutée si elle change). */
function formatBoundsFr(from: Date, to: Date): string {
  const currentYear = new Date().getFullYear();
  const forceYear =
    from.getFullYear() !== to.getFullYear() ||
    from.getFullYear() !== currentYear ||
    to.getFullYear() !== currentYear;
  return `${formatShortDate(from, forceYear)} → ${formatShortDate(to, forceYear)}`;
}

/**
 * Frise temporelle de filtrage (composant pur : aucune requête réseau).
 *
 * Props :
 * - `events` : événements à représenter, au minimum `{ id, observedAt }` ;
 * - `range` : plage sélectionnée contrôlée, bornes incluses ;
 * - `onRangeChange` : appelé avec la nouvelle plage à chaque déplacement ;
 * - `height` : hauteur de la piste en pixels (défaut `64`) ;
 * - `className` : classe CSS additionnelle sur la racine.
 *
 * L'histogramme est découpé en 60 à 120 compartiments (horaires sous 3 jours,
 * quotidiens au-delà) quel que soit le volume. Les deux poignées se déplacent à
 * la souris, au tactile et au clavier (flèches, PagePréc/Suiv, Début/Fin).
 */
export default function TimelineScrubber({
  events,
  range,
  onRangeChange,
  height = 64,
  className,
}: TimelineScrubberProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const dragEdgeRef = useRef<"from" | "to" | null>(null);

  /* Bornes de la piste = union des dates d'événements et de la plage courante. */
  const model = useMemo(() => {
    let minEventMs = Infinity;
    let maxEventMs = -Infinity;
    for (const event of events) {
      const ms = toTimeMs(event.observedAt);
      if (ms === null) continue;
      if (ms < minEventMs) minEventMs = ms;
      if (ms > maxEventMs) maxEventMs = ms;
    }
    const hasEvents = Number.isFinite(minEventMs) && Number.isFinite(maxEventMs);

    const rawFrom = toTimeMs(range.from);
    const rawTo = toTimeMs(range.to);
    const fallbackFrom = hasEvents ? minEventMs : 0;
    const fallbackTo = hasEvents ? maxEventMs : fallbackFrom + DAY_MS;
    const fromMs = rawFrom ?? fallbackFrom;
    const toMs = rawTo ?? fallbackTo;
    const displayFromMs = Math.min(fromMs, toMs);
    const displayToMs = Math.max(fromMs, toMs);

    const trackMin = hasEvents ? Math.min(minEventMs, displayFromMs, displayToMs) : displayFromMs;
    const trackMax = hasEvents ? Math.max(maxEventMs, displayFromMs, displayToMs) : displayToMs;
    const spanMs = Math.max(trackMax - trackMin, 1);

    const granularityMs = spanMs <= HOUR_SPAN_MS ? HOUR_MS : DAY_MS;
    const idealBuckets = Math.ceil(spanMs / granularityMs);
    const bucketCount = Math.min(MAX_BUCKETS, Math.max(MIN_BUCKETS, idealBuckets));
    const bucketMs = spanMs / bucketCount;

    const counts = new Array<number>(bucketCount).fill(0);
    let inRangeCount = 0;
    for (const event of events) {
      const ms = toTimeMs(event.observedAt);
      if (ms === null) continue;
      if (ms >= displayFromMs && ms <= displayToMs) inRangeCount += 1;
      const index = Math.min(bucketCount - 1, Math.max(0, Math.floor((ms - trackMin) / bucketMs)));
      counts[index] += 1;
    }

    return {
      displayFromMs,
      displayToMs,
      trackMin,
      trackMax,
      spanMs,
      bucketCount,
      bucketMs,
      counts,
      inRangeCount,
    };
  }, [events, range.from, range.to]);

  const { displayFromMs, displayToMs, trackMin, trackMax, spanMs, bucketCount, bucketMs, counts, inRangeCount } =
    model;

  const fromPct = spanMs > 0 ? ((displayFromMs - trackMin) / spanMs) * 100 : 0;
  const toPct = spanMs > 0 ? ((displayToMs - trackMin) / spanMs) * 100 : 100;
  const maxCount = Math.max(0, ...counts);
  const scale = maxCount > 0 ? maxCount : 1;

  /* Émet la nouvelle plage en garantissant from <= to et les bornes incluses. */
  const commit = useCallback(
    (edge: "from" | "to", ms: number) => {
      const clamped = Math.min(Math.max(ms, trackMin), trackMax);
      const nextFrom = edge === "from" ? Math.min(clamped, displayToMs) : displayFromMs;
      const nextTo = edge === "to" ? Math.max(clamped, displayFromMs) : displayToMs;
      onRangeChange({ from: new Date(nextFrom), to: new Date(nextTo) });
    },
    [displayFromMs, displayToMs, trackMin, trackMax, onRangeChange],
  );

  /** Convertit une position X de souris en temps, bornée à la piste. */
  const positionToTime = useCallback(
    (clientX: number): number => {
      const rect = trackRef.current?.getBoundingClientRect();
      if (!rect || rect.width <= 0) return trackMin;
      const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
      return trackMin + ratio * spanMs;
    },
    [trackMin, spanMs],
  );


  const onTrackPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    const handle = (event.target as HTMLElement).closest<HTMLElement>("[data-edge]");
    const clickedMs = positionToTime(event.clientX);
    let edge: "from" | "to";
    if (handle?.dataset.edge === "to") edge = "to";
    else if (handle != null) edge = "from";
    else
      edge =
        Math.abs(clickedMs - displayFromMs) <= Math.abs(clickedMs - displayToMs) ? "from" : "to";
    dragEdgeRef.current = edge;
    trackRef.current?.setPointerCapture(event.pointerId);
    trackRef.current?.querySelector<HTMLElement>(`[data-edge="${edge}"]`)?.focus();
    commit(edge, clickedMs);
  };

  const onTrackPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const edge = dragEdgeRef.current;
    if (edge === null) return;
    commit(edge, positionToTime(event.clientX));
  };

  const endDrag = (event: PointerEvent<HTMLDivElement>) => {
    if (dragEdgeRef.current === null) return;
    dragEdgeRef.current = null;
    if (trackRef.current?.hasPointerCapture(event.pointerId)) {
      trackRef.current.releasePointerCapture(event.pointerId);
    }
  };

  const onHandleKeyDown = (event: KeyboardEvent<HTMLDivElement>, edge: "from" | "to") => {
    const current = edge === "from" ? displayFromMs : displayToMs;
    const step = bucketMs * (event.shiftKey ? 10 : 1);
    let next: number;
    switch (event.key) {
      case "ArrowLeft":
      case "ArrowDown":
        next = current - step;
        break;
      case "ArrowRight":
      case "ArrowUp":
        next = current + step;
        break;
      case "PageUp":
        next = current - step * 10;
        break;
      case "PageDown":
        next = current + step * 10;
        break;
      case "Home":
        next = trackMin;
        break;
      case "End":
        next = trackMax;
        break;
      default:
        return;
    }
    event.preventDefault();
    commit(edge, next);
  };

  const rootClassName = ["timeline-scrubber", className].filter(Boolean).join(" ");
  const selectionWidth = Math.max(0, toPct - fromPct);
  const tickMidMs = trackMin + spanMs / 2;

  return (
    <section className={rootClassName} aria-label="Frise temporelle de filtrage">
      <header className="timeline-scrubber__header">
        <span className="timeline-scrubber__bounds">{formatBoundsFr(new Date(displayFromMs), new Date(displayToMs))}</span>
        <span className="timeline-scrubber__count">
          <strong>{inRangeCount.toLocaleString("fr-FR")}</strong> événement{inRangeCount > 1 ? "s" : ""} dans la plage
        </span>
      </header>

      <div
        ref={trackRef}
        className="timeline-scrubber__track"
        style={{ height }}
        onPointerDown={onTrackPointerDown}
        onPointerMove={onTrackPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onLostPointerCapture={() => {
          dragEdgeRef.current = null;
        }}
      >
        <div className="timeline-scrubber__bars" aria-hidden="true">
          {counts.map((count, index) => {
            const center = trackMin + (index + 0.5) * bucketMs;
            const active = center >= displayFromMs && center <= displayToMs;
            const pct = count > 0 ? (count / scale) * 100 : 0;
            return (
              <span
                key={index}
                className="timeline-scrubber__bar"
                data-active={active}
                style={{ height: `${pct}%` }}
              />
            );
          })}
        </div>

        <div
          className="timeline-scrubber__selection"
          aria-hidden="true"
          style={{ left: `${fromPct}%`, width: `${selectionWidth}%` }}
        />

        <div
          role="slider"
          tabIndex={0}
          className="timeline-scrubber__handle"
          data-edge="from"
          aria-label="Date de début de la sélection"
          aria-valuemin={trackMin}
          aria-valuemax={trackMax}
          aria-valuenow={displayFromMs}
          aria-valuetext={LONG_DATE.format(new Date(displayFromMs))}
          style={{ left: `${fromPct}%` }}
          onKeyDown={(event) => onHandleKeyDown(event, "from")}
        />
        <div
          role="slider"
          tabIndex={0}
          className="timeline-scrubber__handle"
          data-edge="to"
          aria-label="Date de fin de la sélection"
          aria-valuemin={trackMin}
          aria-valuemax={trackMax}
          aria-valuenow={displayToMs}
          aria-valuetext={LONG_DATE.format(new Date(displayToMs))}
          style={{ left: `${toPct}%` }}
          onKeyDown={(event) => onHandleKeyDown(event, "to")}
        />
      </div>

      <div className="timeline-scrubber__ticks" aria-hidden="true">
        <span>{formatShortDate(new Date(trackMin), false)}</span>
        <span>{formatShortDate(new Date(tickMidMs), false)}</span>
        <span>{formatShortDate(new Date(trackMax), false)}</span>
      </div>
    </section>
  );
}
