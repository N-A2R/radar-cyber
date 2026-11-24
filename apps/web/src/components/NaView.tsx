/**
 * Vue Nouvelle-Aquitaine — la région entière sur un seul écran.
 *
 * Ce que la carte 3D ne dit pas : les douze départements côte à côte, colorés
 * par volume d'événements rattachés, avec le trou écrit en clair — un
 * département à zéro est une information, pas un espace vide. La carte est un
 * SVG projeté depuis `departements-na.geojson` : pas de WebGL, rendu testable
 * côté serveur, et les douze formes tiennent dans un viewBox fixe.
 *
 * Le filtre département vit dans l'URL (`?naDept=33`) : la vue se partage.
 */
import { useMemo, useState } from "react";
import departementsGeojson from "../map/departements-na.geojson";
import type { NaOverview, NaFil, Org } from "../api";
import type { NaViewProps } from "../contracts";
import { EmptyState, LoadingSkeleton } from "./Skeleton";
import "./na.css";
import { Badge } from "@astryxdesign/core/Badge";
/** Les douze départements, dans l'ordre du geojson (props : code, nom). */
const FEATURES = departementsGeojson.features as {
  properties: { code: string; nom: string };
  geometry: { type: string; coordinates: unknown };
}[];

const DEPTS = ["16", "17", "19", "23", "24", "33", "40", "47", "64", "79", "86", "87"];

/**
 * Palette honnête : zéro événement n'est pas une couleur d'alerte.
 * Les cinq bleus (et le gris du zéro) sont des jetons `--na-niveau-*`
 * déclarés dans `na.css` ; aucun hexadécimal ne vit dans ce fichier.
 */
const NIVEAUX = 5;

/** Niveau 1..5 d'un département ; 0 = aucun événement (gris neutre). */
export function niveauPour(v: number, max: number): number {
  if (v <= 0) return 0;
  // Échelle sqrt : un département à 20 évts ne doit pas écraser celui à 3.
  const t = max > 0 ? Math.sqrt(v) / Math.sqrt(max) : 0;
  return Math.min(NIVEAUX, Math.floor(t * NIVEAUX) + 1);
}

/**
 * Bornes entières de chaque niveau, dans l'ordre de `niveauPour`.
 * Les niveaux vides (petit maximum) sont omis : la légende n'affiche
 * jamais une borne que la carte ne peut pas produire.
 */
export function bornesEchelle(max: number): { niveau: number; lo: number; hi: number }[] {
  const m = Math.max(1, max);
  const bornes: { niveau: number; lo: number; hi: number }[] = [];
  for (let i = 0; i < NIVEAUX; i++) {
    const lo = Math.max(1, Math.ceil((m * i * i) / (NIVEAUX * NIVEAUX)));
    const suite = Math.ceil((m * (i + 1) * (i + 1)) / (NIVEAUX * NIVEAUX));
    const hi = i === NIVEAUX - 1 ? m : Math.min(m, suite - 1);
    if (lo <= hi) bornes.push({ niveau: i + 1, lo, hi });
  }
  return bornes;
}

/** « 4 événements », « 1 événement » — jamais « 0 événement(s) ». */
function libelleEvenements(n: number): string {
  return n <= 1 ? `${n} événement` : `${n} événements`;
}

/** Bornes des douze départements : une projection équirectangulaire suffit. */
const LON_MIN = -1.85;
const LON_MAX = 2.65;
const LAT_MIN = 42.75;
const LAT_MAX = 47.2;
const COS = Math.cos(((LAT_MIN + LAT_MAX) / 2) * (Math.PI / 180));
const SVG_W = (LON_MAX - LON_MIN) * COS * 100;
const SVG_H = (LAT_MAX - LAT_MIN) * 100;

function projeter(lonLat: [number, number]): [number, number] {
  return [(lonLat[0] - LON_MIN) * COS * 100, (LAT_MAX - lonLat[1]) * 100];
}

/** Chemin SVG d'une géométrie Polygon ou MultiPolygon, en coordonnées projetées. */
function cheminDe(geometry: { type: string; coordinates: unknown }): string {
  const polygones: number[][][][] =
    geometry.type === "MultiPolygon"
      ? (geometry.coordinates as number[][][][])
      : [geometry.coordinates as number[][][]];
  const parties: string[] = [];
  for (const poly of polygones) {
    for (const anneau of poly) {
      const points = anneau.map((c) => projeter([c[0], c[1]]));
      parties.push(`M ${points.map((p) => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" L ")} Z`);
    }
  }
  return parties.join(" ");
}

/**
 * « Dernière collecte il y a X » — calculé, jamais affirmé. Renvoie null si la
 * date est absente : on n'invente pas une fraîcheur.
 */
export function ilYA(iso: string | null): string | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  const minutes = Math.max(1, Math.round((Date.now() - t) / 60000));
  if (minutes < 60) return `dernière collecte il y a ${minutes} min`;
  const heures = Math.round(minutes / 60);
  if (heures < 24) return `dernière collecte il y a ${heures} h`;
  const jours = Math.round(heures / 24);
  return `dernière collecte il y a ${jours} j`;
}

/** Date lisible du fil : observée si elle existe, sinon collectée. */
function dateFil(e: { observedAt: string | null; collectedAt: string }): string {
  const d = e.observedAt ?? e.collectedAt;
  const t = new Date(d);
  return Number.isNaN(t.getTime()) ? d : t.toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" });
}

/** Construit les agrégats par département depuis la liste d'organisations seule. */
export function overviewDepuisOrgs(orgs: Org[]): NaOverview {
  const parDept = new Map<string, { orgs: number; orgsAvecEvenement: number; evenements: number }>();
  for (const d of DEPTS) parDept.set(d, { orgs: 0, orgsAvecEvenement: 0, evenements: 0 });
  for (const o of orgs) {
    if (o.dept === null || o.dept === undefined) continue;
    const c = parDept.get(o.dept);
    if (!c) continue;
    c.orgs += 1;
    c.evenements += o.eventCount;
    if (o.eventCount > 0) c.orgsAvecEvenement += 1;
  }
  const depts = DEPTS.map((dept) => ({
    dept,
    ...(parDept.get(dept) as { orgs: number; orgsAvecEvenement: number; evenements: number }),
  }));
  return {
    depts,
    // Le calcul local ne sait rien de la collecte : null, pas une fraîcheur inventée.
    derniereCollecte: null,
    total: {
      orgs: depts.reduce((a, d) => a + d.orgs, 0),
      orgsAvecEvenement: depts.reduce((a, d) => a + d.orgsAvecEvenement, 0),
      evenements: depts.reduce((a, d) => a + d.evenements, 0),
      deptsSansEvenement: depts.filter((d) => d.evenements === 0).map((d) => d.dept),
    },
  };
}

export default function NaView({ orgs, overview, fil, loading, error, dept, onSelectDept, onOpenOrg, onRetry }: NaViewProps) {
  const compteParDept = useMemo(() => {
    const m = new Map<string, { nom: string; evenements: number; orgs: number; orgsAvecEvenement: number }>();
    for (const f of FEATURES) {
      m.set(f.properties.code, { nom: f.properties.nom, evenements: 0, orgs: 0, orgsAvecEvenement: 0 });
    }
    const source = overview ?? overviewDepuisOrgs(orgs);
    for (const d of source.depts) {
      const c = m.get(d.dept);
      if (c) {
        c.evenements = d.evenements;
        c.orgs = d.orgs;
        c.orgsAvecEvenement = d.orgsAvecEvenement;
      }
    }
    return m;
  }, [overview, orgs]);

  const total = overview?.total ?? overviewDepuisOrgs(orgs).total;
  const maxReel = Math.max(0, ...[...compteParDept.values()].map((c) => c.evenements));
  const maxEvts = Math.max(1, maxReel);
  const nomDept = dept ? (compteParDept.get(dept)?.nom ?? dept) : null;
  const bornes = useMemo(() => bornesEchelle(maxEvts), [maxEvts]);

  /**
   * Département survolé ou focalisé : il alimente la lecture chiffrée sous la
   * carte et met en évidence la ligne correspondante. Aucun autre état.
   */
  const [survol, setSurvol] = useState<string | null>(null);
  const quitterSurvol = (code: string) => setSurvol((s) => (s === code ? null : s));
  const survole = survol ? compteParDept.get(survol) : null;

  /** Organisations du département sélectionné, touchées d'abord. */
  const orgsDept = useMemo(() => {
    if (!dept) return [];
    return orgs
      .filter((o) => o.dept === dept)
      .sort(
        (a, b) =>
          b.eventCount - a.eventCount || a.name.localeCompare(b.name),
      );
  }, [orgs, dept]);
  const orgsDeptTouchees = orgsDept.filter((o) => o.eventCount > 0);
  const evtsDept = dept ? (compteParDept.get(dept)?.evenements ?? 0) : 0;

  if (loading && !overview && orgs.length === 0) {
    return (
      <section className="na-view">
        <LoadingSkeleton label="Chargement du référentiel Nouvelle-Aquitaine…" />
      </section>
    );
  }

  return (
    <section className="na-view">
      <header className="na-header">
        <h2>Nouvelle-Aquitaine</h2>
        <Badge label="12 départements" className="na-badge" />
        <p className="na-totaux" role="status" aria-live="polite">
          {total.orgs.toLocaleString("fr-FR")} organisations · {total.orgsAvecEvenement} touchées · {total.evenements}{" "}
          événements
          {total.deptsSansEvenement.length > 0 && (
            <>
              {" · "}départements à zéro : <strong>{total.deptsSansEvenement.join(", ")}</strong>
            </>
          )}
        </p>
        {ilYA(overview?.derniereCollecte ?? null) && (
          <p className="na-fraicheur" data-testid="na-fraicheur">
            {ilYA(overview?.derniereCollecte ?? null)}
          </p>
        )}
        {error && <p className="na-erreur">{error}</p>}
        {dept && (
          <button type="button" className="na-reset" onClick={() => onSelectDept(null)}>
            ← toute la région (filtre actuel : {nomDept})
          </button>
        )}
      </header>

      <div className="na-corps">
        <div className="na-carte-bloc">
          <svg
            className="na-carte"
            viewBox={`0 0 ${SVG_W.toFixed(0)} ${SVG_H.toFixed(0)}`}
            role="group"
            aria-label="Carte des douze départements de Nouvelle-Aquitaine. Chaque département est un bouton ; sa couleur encode le nombre d'événements rattachés, la légende chiffrée est sous la carte."
          >
            {FEATURES.map((f) => {
              const code = f.properties.code;
              const c = compteParDept.get(code);
              const evts = c?.evenements ?? 0;
              const actif = dept === code;
              const niveau = niveauPour(evts, maxEvts);
              return (
                <path
                  key={code}
                  className={`na-dept na-niveau-${niveau}${actif ? " na-dept-actif" : ""}${
                    survol === code ? " na-dept-survol" : ""
                  }`}
                  data-dept={code}
                  d={cheminDe(f.geometry)}
                  role="button"
                  tabIndex={0}
                  aria-pressed={actif}
                  aria-label={`${c?.nom ?? code} (${code}) : ${libelleEvenements(evts)}, ${c?.orgsAvecEvenement ?? 0} org. touchées sur ${c?.orgs ?? 0} organisations`}
                  onMouseEnter={() => setSurvol(code)}
                  onMouseLeave={() => quitterSurvol(code)}
                  onFocus={() => setSurvol(code)}
                  onBlur={() => quitterSurvol(code)}
                  onClick={() => onSelectDept(actif ? null : code)}
                  onKeyDown={(e) => {
                    if (e.key !== "Enter" && e.key !== " ") return;
                    e.preventDefault();
                    onSelectDept(actif ? null : code);
                  }}
                >
                  <title>{`${c?.nom ?? code} (${code}) — ${libelleEvenements(evts)} · ${c?.orgsAvecEvenement ?? 0} org. touchée(s) sur ${c?.orgs ?? 0}`}</title>
                </path>
              );
            })}
          </svg>

          <p className="na-survol" aria-live="polite">
            {survol && survole
              ? `${survole.nom} (${survol}) : ${libelleEvenements(survole.evenements)} · ${survole.orgsAvecEvenement} org. touchée${
                  survole.orgsAvecEvenement > 1 ? "s" : ""
                } sur ${survole.orgs} organisations`
              : "Survolez la carte ou une ligne pour lire le détail d'un département."}
          </p>

          <figure className="na-legende" aria-labelledby="na-legende-titre">
            <figcaption id="na-legende-titre">
              Couleur = nombre d'événements rattachés au département (échelle racine carrée,{" "}
              {libelleEvenements(maxReel)} au maximum en région).
            </figcaption>
            <ul className="na-legende-echelle">
              <li className="na-legende-item">
                <span className="na-legende-pastille na-niveau-0" aria-hidden="true" />
                <span>0 événement</span>
              </li>
              {bornes.map((b) => (
                <li key={b.niveau} className="na-legende-item">
                  <span className={`na-legende-pastille na-niveau-${b.niveau}`} aria-hidden="true" />
                  <span>{b.lo === b.hi ? libelleEvenements(b.lo) : `${b.lo}–${b.hi} événements`}</span>
                </li>
              ))}
            </ul>
          </figure>
        </div>

        <div className="na-panneau">
          <h3>{dept ? `${nomDept} (${dept})` : "Les douze départements"}</h3>
          <ul className="na-liste">
            {[...compteParDept.entries()].map(([code, c]) => {
              const actif = dept === code;
              return (
                <li key={code}>
                  <button
                    type="button"
                    className={`na-ligne${actif ? " na-ligne-actif" : ""}${
                      survol === code ? " na-ligne-survol" : ""
                    }`}
                    data-dept={code}
                    aria-current={actif ? "true" : undefined}
                    onMouseEnter={() => setSurvol(code)}
                    onMouseLeave={() => quitterSurvol(code)}
                    onFocus={() => setSurvol(code)}
                    onBlur={() => quitterSurvol(code)}
                    onClick={() => onSelectDept(actif ? null : code)}
                  >
                    <span className="na-ligne-nom">
                      {c.nom} ({code})
                    </span>
                    <span className="na-ligne-compte">
                      {libelleEvenements(c.evenements)}
                      {" · "}
                      {c.orgsAvecEvenement} org. touchée{c.orgsAvecEvenement > 1 ? "s" : ""}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          {dept !== null && (
            <>
              {evtsDept === 0 && (
                <div data-testid="na-vide-dept">
                  <EmptyState
                    className="na-vide"
                    message={`Aucun événement sur ce département. ${compteParDept.get(dept)?.orgs.toLocaleString("fr-FR")} organisations au référentiel, aucune touchée à ce jour — le trou est affiché, pas caché.`}
                    actionLabel={onRetry ? "Recharger la région" : "Voir toute la région"}
                    onAction={onRetry ?? (() => onSelectDept(null))}
                  />
                </div>
              )}
              {fil && fil.dept === dept && fil.events.length > 0 && (
                <>
                  <p className="na-note">Fil des événements (50 derniers) :</p>
                  <ul className="na-fil" data-testid="na-fil">
                    {fil.events.map((e) => (
                      <li key={e.id} className="na-fil-ligne">
                        <span className="na-fil-date">{dateFil(e)}</span>
                        <span className="na-fil-titre">{e.title}</span>
                        <span className="na-fil-meta">
                          {e.family} · source {e.source}
                          {e.orgName ? " · " : ""}
                        </span>
                        {e.orgName && (
                          <button
                            type="button"
                            className="na-ligne-org-bouton"
                            data-org={e.orgId}
                            onClick={() => onOpenOrg(e.orgId)}
                          >
                            {e.orgName}
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                </>
              )}
              {orgsDeptTouchees.length > 0 ? (
                <>
                  <p className="na-note">
                    {orgsDeptTouchees.length} organisation(s) touchée(s) sur{" "}
                    {orgsDept.length.toLocaleString("fr-FR")} du référentiel :
                  </p>
                  <ul className="na-liste">
                    {orgsDeptTouchees.map((o) => (
                      <li key={o.id}>
                        <button
                          type="button"
                          className="na-ligne na-ligne-org"
                          data-org={o.id}
                          onClick={() => onOpenOrg(o.id)}
                        >
                          <span className="na-ligne-nom">{o.name}</span>
                          <span className="na-ligne-compte">
                            {o.eventCount} événement(s)
                            {o.city ? ` · ${o.city}` : ""}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                evtsDept > 0 && (
                  <EmptyState
                    className="na-vide"
                    message="Des événements régionaux concernent ce département sans être rattachés à une organisation du référentiel — voir le fil « toute la région »."
                    actionLabel="Voir toute la région"
                    onAction={() => onSelectDept(null)}
                  />
                )
              )}
            </>
          )}
        </div>
      </div>
    </section>
  );
}
