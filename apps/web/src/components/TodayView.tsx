/**
 * Écran d'accueil : ce qui s'est passé dans les dernières 24 h.
 *
 * Tout vient de GET /api/today — compteurs compris. Aucune valeur par défaut
 * numérique : tant que la réponse n'est pas là, on affiche un tiret, pas un
 * zéro qui prétendrait mesurer quelque chose.
 */
import { useState } from "react";
import type { DeptStat, TodayEvent } from "../api";
import { ErrorRetry } from "./ErrorRetry";
import type { TodayViewProps } from "../contracts";
import { EmptyState, LoadingSkeleton } from "./Skeleton";
import "./today.css";
import LieesCard from "./LieesCard";
import { Badge } from "@astryxdesign/core/Badge";
import { Card } from "@astryxdesign/core/Card";
import { Table } from "@astryxdesign/core/Table";

/** Date lisible et sans ambiguïté : UTC affichée, jamais une heure locale devinée. */
export function dateLisible(iso: string | null): string {
  if (!iso) return "date inconnue";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

/** Date de l'API Postgres (`2026-11-21 13:37:22+01`) → millisecondes UTC. */
function horodatage(iso: string | null): number | null {
  if (!iso) return null;
  // Date.parse exige `+01:00` ; PostgreSQL renvoie `+01`.
  const normalisee = iso.replace(/([+-]\d{2})$/, "$1:00");
  const t = Date.parse(normalisee);
  return Number.isFinite(t) ? t : null;
}

/** L'API trie déjà ; on retrie pour tenir le contrat même avec un vieux serveur. */
export function triRecents(evenements: TodayEvent[]): TodayEvent[] {
  return [...evenements].sort(
    (a, b) => (horodatage(b.date) ?? Number.NEGATIVE_INFINITY) - (horodatage(a.date) ?? Number.NEGATIVE_INFINITY)
      || Number(b.id) - Number(a.id),
  );
}

const TRANCHE_MS = 2 * 60 * 60 * 1000;
const NOMBRE_TRANCHES = 12;

/** Libellés courts des cinq niveaux de sévérité, du plus calme au plus grave. */
const LIBELLES_SEVERITE: Record<number, string> = {
  1: "veille",
  2: "faible",
  3: "modérée",
  4: "élevée",
  5: "critique",
};

/** Niveau 1→5 exploitable, ou `null` si la donnée manque ou sort de l'échelle. */
export function niveauSeverite(valeur: number | null | undefined): 1 | 2 | 3 | 4 | 5 | null {
  if (typeof valeur !== "number" || !Number.isInteger(valeur) || valeur < 1 || valeur > 5) return null;
  return valeur as 1 | 2 | 3 | 4 | 5;
}

export type TrancheTimeline = {
  /** Début de la tranche, en millisecondes UTC. */
  debut: number;
  fin: number;
  /** Libellé court de l'heure de début, en UTC. */
  label: string;
  evenements: number;
};


/**
 * Répartit les événements en 12 tranches de 2 h couvrant les 24 h qui
 * précèdent `maintenant`. Les bornes sont alignées sur UTC (00h, 02h, …),
 * donc deux appels avec le même instant donnent exactement les mêmes barres.
 * Les dates invalides, absentes ou postérieures à l'instant sont écartées :
 * on ne dessine pas d'activité qui n'a pas encore eu lieu.
 */
export function aggregerTimeline(
  evenements: readonly TodayEvent[],
  maintenant: number = Date.now(),
): TrancheTimeline[] {
  const reference = Number.isFinite(maintenant) ? maintenant : Date.now();
  const fin = (Math.floor(reference / TRANCHE_MS) + 1) * TRANCHE_MS;
  const debut = fin - NOMBRE_TRANCHES * TRANCHE_MS;
  const tranches: TrancheTimeline[] = Array.from({ length: NOMBRE_TRANCHES }, (_, i) => {
    const t = debut + i * TRANCHE_MS;
    return {
      debut: t,
      fin: t + TRANCHE_MS,
      label: `${new Date(t).toISOString().slice(11, 13)}h`,
      evenements: 0,
    };
  });

  for (const evenement of evenements) {
    const t = horodatage(evenement.date);
    if (t === null || t < debut || t >= fin || t > reference) continue;
    tranches[Math.floor((t - debut) / TRANCHE_MS)].evenements += 1;
  }
  return tranches;
}

function options(valeurs: (string | null)[], courant: string | null): string[] {
  const unique = new Set(valeurs.filter((v): v is string => Boolean(v)));
  if (courant) unique.add(courant);
  return [...unique].sort((a, b) => a.localeCompare(b, "fr"));
}

export default function TodayView({
  data,
  loading,
  error,
  family,
  dept,
  departements,
  maintenant,
  onFamily,
  onDept,
  onOpenOrg,
  onOpenEvent,
  onRetry,
}: TodayViewProps) {
  const evenements = triRecents(data?.evenements ?? []);
  const familles = options(evenements.map((e) => e.famille), family);
  const parDept = new Map((departements ?? []).map((d: DeptStat) => [d.dept, d.evenements]));
  const depts = options([...parDept.keys(), ...evenements.map((e) => e.dept)], dept);
  const tranches = aggregerTimeline(evenements, maintenant);
  const maxTranche = Math.max(0, ...tranches.map((t) => t.evenements));
  const totalTranche = tranches.reduce((n, t) => n + t.evenements, 0);
  const compteurs = data?.compteurs;
  const vide = data !== null && !loading && !error && evenements.length === 0;

  // Tranche choisie au clic sur la timeline. Une tranche qui sort de la
  // fenêtre (rafraîchissement des données) ne filtre plus rien.
  const [trancheChoisie, setTrancheChoisie] = useState<number | null>(null);
  const trancheActive = tranches.some((t) => t.debut === trancheChoisie) ? trancheChoisie : null;
  let evenementsAffiches = evenements;
  if (trancheActive !== null) {
    const debut = trancheActive;
    evenementsAffiches = evenements.filter((e) => {
      const t = horodatage(e.date);
      return t !== null && t >= debut && t < debut + TRANCHE_MS;
    });
  }
  const labelTranche = trancheActive === null
    ? null
    : `${new Date(trancheActive).toISOString().slice(11, 13)}h → ${new Date(trancheActive + TRANCHE_MS).toISOString().slice(11, 13)}h`;

  return (
    <section className="today" aria-labelledby="today-titre">
      <LieesCard />
      <header className="today__head">
        <Card variant="transparent" padding={0}>
          <p className="today__kicker">veille du jour</p>
          <h1 className="today__titre" id="today-titre">Aujourd'hui</h1>
          <Badge label="24 h" className="today__badge" />
          <p className="today__sous-titre">Les 24 dernières heures, telles que collectées.</p>
        </Card>
        <Card variant="transparent" padding={0} className="today__compteurs" aria-label="Compteurs en direct">
          <Card variant="transparent" padding={0} className="today__compteur">
            <span className="today__valeur">{compteurs ? compteurs.evenements24h : "—"}</span>
            <span className="today__libelle">événements · 24 h</span>
          </Card>
        </Card>
      </header>

      <Card variant="transparent" padding={0} className="today__filtres" role="group" aria-label="Filtres de la période">
        <label className="today__filtre">
          <span>famille</span>
          <select
            value={family ?? ""}
            onChange={(e) => onFamily(e.target.value || null)}
            aria-label="Filtrer par famille"
          >
            <option value="">toutes les familles</option>
            {familles.map((f) => <option key={f} value={f}>{f}</option>)}
          </select>
        </label>
        <label className="today__filtre">
          <span>département</span>
          <select
            value={dept ?? ""}
            onChange={(e) => onDept(e.target.value || null)}
            aria-label="Filtrer par département"
          >
            <option value="">tous les départements</option>
            {depts.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </label>
        {compteurs?.derniereCollecte ? (
          <p className="today__collecte">dernière collecte : {dateLisible(compteurs.derniereCollecte)}</p>
        ) : null}
      </Card>

      {data ? (
        <section className="today__timeline" aria-labelledby="today-timeline-titre">
          <Card variant="transparent" padding={0} className="today__timeline-head">
            <h2 id="today-timeline-titre">activité · 24 h</h2>
            {labelTranche ? (
              <p className="today__timeline-filtre" role="status">
                plage filtrée : {labelTranche}
                {" "}
                <button type="button" className="today__timeline-reset" onClick={() => setTrancheChoisie(null)}>
                  toute la période
                </button>
              </p>
            ) : (
              <p>{totalTranche} événement{totalTranche > 1 ? "s" : ""} · tranches de 2 h · UTC</p>
            )}
          </Card>
          <Card variant="transparent" padding={0} className="today__timeline-graphe" role="list" aria-label="Répartition horaire des événements sur 24 heures">
            {tranches.map((t) => {
              const actif = t.debut === trancheActive;
              return (
                <Card variant="transparent" padding={0} className="today__timeline-tranche" role="listitem" key={t.debut}>
                  <button
                    type="button"
                    className="today__timeline-bouton"
                    aria-pressed={actif}
                    title={actif ? "retirer le filtre de cette tranche" : "filtrer le tableau sur cette tranche"}
                    aria-label={`${t.label} : ${t.evenements} événement${t.evenements > 1 ? "s" : ""}`}
                    onClick={() => setTrancheChoisie(actif ? null : t.debut)}
                  >
                    <span className="today__timeline-valeur">{t.evenements}</span>
                    <Card variant="transparent" padding={0} className="today__timeline-piste" aria-hidden="true">
                      <Card
                        variant="transparent"
                        padding={0}
                        className="today__timeline-barre"
                        style={{ height: maxTranche > 0 ? `${(t.evenements / maxTranche) * 100}%` : "0%" }}
                      />
                    </Card>
                    <time className="today__timeline-heure" dateTime={new Date(t.debut).toISOString()}>{t.label}</time>
                  </button>
                </Card>
              );
            })}
          </Card>
        </section>
      ) : null}

      {loading ? <LoadingSkeleton label="chargement des événements…" /> : null}
      {error ? <ErrorRetry message={`API : ${error}`} onRetry={onRetry} className="today__statut today__statut--erreur" /> : null}

      {vide ? (
        <EmptyState
          className="today__vide"
          message="Aucun incident sur cette période"
          description={family || dept
            ? `Filtres actifs : ${family ? `famille « ${family} »` : ""}${family && dept ? ", " : ""}${dept ? `département ${dept}` : ""}.`
            : "Aucun filtre actif."}
          actionLabel={onRetry ? "Recharger la période" : "Effacer les filtres"}
          onAction={onRetry ?? (() => { onFamily(null); onDept(null); })}
        />
      ) : null}

      {evenementsAffiches.length > 0 ? (
        <Card variant="transparent" padding={0} className="today__table-wrap">
          <Table className="today__table" density="compact" dividers="rows">
            <thead>
              <tr>
                <th scope="col">date</th>
                <th scope="col">titre</th>
                <th scope="col">sévérité</th>
                <th scope="col">organisation</th>
                <th scope="col">source</th>
                <th scope="col">famille</th>
                <th scope="col">lien</th>
              </tr>
            </thead>
            <tbody>
              {evenementsAffiches.map((e) => {
                const sev = niveauSeverite(e.severite);
                return (
                  <tr key={e.id}>
                    <td>
                      <time dateTime={e.date ?? undefined} title={e.dateSource === "collecte" ? "date de collecte" : "date observée"}>
                        {dateLisible(e.date)}
                      </time>
                    </td>
                    <td className="today__cellule-titre">
                      <button type="button" className="today__lien-titre" onClick={() => onOpenEvent(String(e.id))}>
                        {e.titre}
                      </button>
                    </td>
                    <td className="today__cellule-sev">
                      {sev === null ? (
                        <span className="today__sev-vide" aria-label="sévérité inconnue">—</span>
                      ) : (
                        <span className="today__sev" data-sev={sev}>
                          <span className="today__sev-pastille" style={{ background: `var(--sev-${sev})` }} aria-hidden="true" />
                          <span className="today__sev-libelle">{LIBELLES_SEVERITE[sev]}</span>
                        </span>
                      )}
                    </td>
                    <td>
                      {e.orgId !== null ? (
                        <button type="button" className="today__lien-org" onClick={() => onOpenOrg(e.orgId as number)}>
                          {e.organisation ?? `organisation ${e.orgId}`}
                        </button>
                      ) : (
                        <span>non rattaché</span>
                      )}
                    </td>
                    <td>{e.source}</td>
                    <td>{e.famille}</td>
                    <td>
                      {e.url ? (
                        <a href={e.url} target="_blank" rel="noreferrer noopener">ouvrir la source</a>
                      ) : (
                        <span>lien absent</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </Card>
      ) : null}
    </section>
  );
}
