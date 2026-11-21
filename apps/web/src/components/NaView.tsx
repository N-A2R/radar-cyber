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
import { useMemo } from "react";
import departementsGeojson from "../map/departements-na.geojson";
import type { NaOverview, NaFil, Org } from "../api";
import type { NaViewProps } from "../contracts";

/** Les douze départements, dans l'ordre du geojson (props : code, nom). */
const FEATURES = departementsGeojson.features as {
  properties: { code: string; nom: string };
  geometry: { type: string; coordinates: unknown };
}[];

const DEPTS = ["16", "17", "19", "23", "24", "33", "40", "47", "64", "79", "86", "87"];

/** Palette honnête : zéro événement n'est pas une couleur d'alerte. */
const COULEUR_ZERO = "#1d222b";
const COULEURS = ["#1e3a5f", "#27537f", "#336ca3", "#4d8ec9", "#6fb1e3"];

function couleurPour(v: number, max: number): string {
  if (v <= 0) return COULEUR_ZERO;
  // Échelle sqrt : un département à 20 évts ne doit pas écraser celui à 3.
  const t = max > 0 ? Math.sqrt(v) / Math.sqrt(max) : 0;
  return COULEURS[Math.min(COULEURS.length - 1, Math.floor(t * COULEURS.length))];
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

export default function NaView({ orgs, overview, fil, loading, error, dept, onSelectDept, onOpenOrg }: NaViewProps) {
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
  const maxEvts = Math.max(1, ...[...compteParDept.values()].map((c) => c.evenements));
  const nomDept = dept ? (compteParDept.get(dept)?.nom ?? dept) : null;

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
        <p className="na-vide">Chargement du référentiel Nouvelle-Aquitaine…</p>
      </section>
    );
  }

  return (
    <section className="na-view">
      <header className="na-header">
        <h2>Nouvelle-Aquitaine</h2>
        <p className="na-totaux">
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
        <svg
          className="na-carte"
          viewBox={`0 0 ${SVG_W.toFixed(0)} ${SVG_H.toFixed(0)}`}
          role="img"
          aria-label="Carte des douze départements de Nouvelle-Aquitaine, colorés par volume d'événements"
        >
          {FEATURES.map((f) => {
            const code = f.properties.code;
            const evts = compteParDept.get(code)?.evenements ?? 0;
            const actif = dept === code;
            return (
              <path
                key={code}
                className={`na-dept${actif ? " na-dept-actif" : ""}`}
                data-dept={code}
                d={cheminDe(f.geometry)}
                fill={couleurPour(evts, maxEvts)}
                stroke={actif ? "#1d3a5f" : "#ffffff"}
                strokeWidth={actif ? 2.5 : 0.8}
                onClick={() => onSelectDept(actif ? null : code)}
              >
                <title>{`${code} — ${compteParDept.get(code)?.nom ?? code} : ${evts} événement(s)`}</title>
              </path>
            );
          })}
        </svg>

        <div className="na-panneau">
          <h3>{dept ? `${nomDept} (${dept})` : "Les douze départements"}</h3>
          {dept === null && (
            <ul className="na-liste">
              {[...compteParDept.entries()].map(([code, c]) => (
                <li key={code}>
                  <button type="button" className="na-ligne" data-dept={code} onClick={() => onSelectDept(code)}>
                    <span className="na-ligne-nom">
                      {c.nom} ({code})
                    </span>
                    <span className="na-ligne-compte">
                      {c.evenements === 0
                        ? "0 événement"
                        : `${c.evenements} événement${c.evenements > 1 ? "s" : ""}`}
                      {" · "}
                      {c.orgsAvecEvenement} org. touchée{c.orgsAvecEvenement > 1 ? "s" : ""}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {dept !== null && (
            <>
              {evtsDept === 0 && (
                <p className="na-vide" data-testid="na-vide-dept">
                  Aucun événement sur ce département. {compteParDept.get(dept)?.orgs.toLocaleString("fr-FR")}{" "}
                  organisations au référentiel, aucune touchée à ce jour — le trou est affiché, pas caché.
                </p>
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
                  <p className="na-vide">
                    Des événements régionaux concernent ce département sans être rattachés à une organisation du
                    référentiel — voir le fil « toute la région ».
                  </p>
                )
              )}
            </>
          )}
        </div>
      </div>
    </section>
  );
}
