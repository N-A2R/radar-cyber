import { useCallback, useEffect, useMemo, useState } from "react";
import { api, type Event, type Stats } from "../api";
import "./wallscreen.css";

/** Fenêtre d'agrégation : couvre largement les dernières 24 h sans peser. */
const WINDOW_LIMIT = 1000;
/** La répartition par famille ne regarde que les 200 derniers événements. */
const FAMILY_WINDOW = 200;
/** Une ligne par événement dans le fil vertical. */
// On sur-échantillonne : la presse est écartée après coup, il en faut 12 nets.
const FEED_LIMIT = 120;
/** Plafond de la liste d'alertes ouvertes renvoyée par l'API. */
const ALERT_LIMIT = 500;

const DAY_MS = 24 * 60 * 60 * 1000;

const FAMILY_TOKENS: Record<string, string> = {
  vuln: "var(--family-vuln)",
  cti: "var(--family-cti)",
  cert_fr: "var(--family-cert-fr)",
  ransomware: "var(--family-ransomware)",
  presse: "var(--family-presse)",
};

/** Pastille de sévérité : 1 à 5, borné pour ne jamais produire de jeton absent. */
function sevColor(severity: number): string {
  const n = Math.min(5, Math.max(1, Math.round(severity)));
  return `var(--sev-${n})`;
}

function isWithinDay(iso: string | null, now: number): boolean {
  if (!iso) return false;
  const t = Date.parse(iso);
  return Number.isFinite(t) && Math.abs(now - t) <= DAY_MS;
}

function hourOf(iso: string | null): string {
  if (!iso) return "--:--";
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return "--:--";
  return t.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

/**
 * Vue plein écran destinée à un second moniteur : elle tourne seule, sans
 * bouton ni interaction. Aucune prop obligatoire.
 */
export default function WallScreen() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [openAlerts, setOpenAlerts] = useState(0);
  const [alertsCapped, setAlertsCapped] = useState(false);
  const [feed, setFeed] = useState<Event[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [pulse, setPulse] = useState(false);

  // Compteurs : rafraîchis toutes les 60 s.
  const refreshCounters = useCallback(async () => {
    try {
      const [nextStats, alerts] = await Promise.all([
        api.stats(),
        api.alerts({ status: "open", limit: ALERT_LIMIT }),
      ]);
      setStats(nextStats);
      setOpenAlerts(alerts.length);
      setAlertsCapped(alerts.length >= ALERT_LIMIT);
      setLastRefresh(new Date());
    } catch {
      // Panne réseau passagère : on garde la dernière valeur affichée.
    }
  }, []);

  // Fil et répartition : rafraîchis toutes les 30 s.
  const refreshActivity = useCallback(async () => {
    try {
      const [recent, window] = await Promise.all([
        // Le mur est chronologique : la priorité régionale sert le fil, pas lui.
        api.events(FEED_LIMIT, "recent"),
        api.events(WINDOW_LIMIT, "recent"),
      ]);
      setFeed(recent.filter((e) => e.family !== "presse").slice(0, 12));
      setEvents(window.filter((e) => e.family !== "presse"));
      setLastRefresh(new Date());
    } catch {
      // Idem : la vue continue d'afficher le dernier état connu.
    }
  }, []);

  useEffect(() => {
    void refreshCounters();
    const timer = setInterval(() => void refreshCounters(), 60_000);
    return () => clearInterval(timer);
  }, [refreshCounters]);

  useEffect(() => {
    void refreshActivity();
    const timer = setInterval(() => void refreshActivity(), 30_000);
    return () => clearInterval(timer);
  }, [refreshActivity]);

  // Battement de vie : le point change d'opacité chaque seconde.
  useEffect(() => {
    const timer = setInterval(() => setPulse((prev) => !prev), 1_000);
    return () => clearInterval(timer);
  }, []);

  const now = lastRefresh ? lastRefresh.getTime() : Date.now();

  const dayCount = useMemo(
    () => events.filter((e) => isWithinDay(e.observedAt, now)).length,
    [events, now],
  );

  const touchedOrgs = useMemo(() => {
    const ids = new Set<number>();
    for (const e of events) {
      if (e.orgId !== null && isWithinDay(e.observedAt, now)) ids.add(e.orgId);
    }
    return ids.size > 0 ? ids.size : (stats?.orgs ?? 0);
  }, [events, now, stats]);

  const families = useMemo(() => {
    const counts = new Map<string, number>();
    for (const e of events.slice(0, FAMILY_WINDOW)) {
      counts.set(e.family, (counts.get(e.family) ?? 0) + 1);
    }
    return [...counts.entries()]
      .map(([family, n]) => ({ family, n }))
      .sort((a, b) => b.n - a.n);
  }, [events]);

  const familyMax = Math.max(1, ...families.map((f) => f.n));

  const refreshedAt = lastRefresh
    ? lastRefresh.toLocaleTimeString("fr-FR", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      })
    : "en attente de données";

  return (
    <div className="wall">
      <header className="wall-counter">
        <div className="wall-figure">{dayCount.toLocaleString("fr-FR")}</div>
        <div className="wall-figure-label">
          <span className="wall-label">Événements</span>
          <span className="wall-label">dernières 24 h</span>
        </div>
        <div className="wall-sub">
          <div className="wall-sub-item">
            <span className="wall-sub-value">{touchedOrgs.toLocaleString("fr-FR")}</span>
            <span className="wall-label">Organisations touchées</span>
          </div>
          <div className="wall-sub-item">
            <span className="wall-sub-value">
              {openAlerts.toLocaleString("fr-FR")}
              {alertsCapped ? "+" : ""}
            </span>
            <span className="wall-label">Alertes ouvertes</span>
          </div>
        </div>
      </header>

      <section className="wall-feed" aria-label="Derniers événements">
        <span className="wall-section-title">Derniers événements</span>
        {feed.length === 0 ? (
          <span className="wall-empty">Aucun événement récent.</span>
        ) : (
          feed.slice(0, FEED_LIMIT).map((e) => (
            <div className="wall-feed-row" key={e.id}>
              <span className="wall-time">{hourOf(e.observedAt)}</span>
              <span
                className="wall-pill"
                style={{ background: sevColor(e.severity) }}
                aria-hidden="true"
              />
              <span className="wall-feed-title" title={e.title}>
                {e.title}
              </span>
            </div>
          ))
        )}
      </section>

      <section className="wall-families" aria-label="Répartition par famille">
        <span className="wall-section-title">
          Répartition · {FAMILY_WINDOW} derniers
        </span>
        {families.length === 0 ? (
          <span className="wall-empty">Aucune donnée.</span>
        ) : (
          families.map((f) => (
            <div className="wall-family" key={f.family}>
              <span className="wall-family-name">{f.family}</span>
              <div className="wall-bar">
                <div
                  className="wall-bar-fill"
                  style={{
                    width: `${Math.max(2, (f.n / familyMax) * 100)}%`,
                    background: FAMILY_TOKENS[f.family] ?? "var(--accent)",
                  }}
                />
              </div>
              <span className="wall-family-count">{f.n.toLocaleString("fr-FR")}</span>
            </div>
          ))
        )}
      </section>

      <footer className="wall-footer">
        <span className="wall-freshness">
          <span
            className={pulse ? "wall-dot is-on" : "wall-dot"}
            aria-hidden="true"
          />
          Vue active
        </span>
        <span>Dernier rafraîchissement · {refreshedAt}</span>
      </footer>
    </div>
  );
}
