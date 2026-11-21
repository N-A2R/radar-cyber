/**
 * Carte « Organisations reliées » de l'écran Aujourd'hui.
 *
 * Les chiffres viennent de GET /api/orgs/liees : aucun nombre par défaut.
 * Tant que la réponse n'est pas là, on affiche un état de chargement ; en cas
 * d'erreur, le message d'API ; quand la base ne mesure rien, le mot « aucune ».
 */
import { useEffect, useState } from "react";
import { authHeaders } from "../api";
import "./liees.css";

export type OrgsLiees = {
  semaine: number;
  total: number;
  enAttente: number;
  examinees: number;
  parDepartement: { dept: string; n: number }[];
};

/** Un relevé quotidien, tel que renvoyé par GET /api/orgs/liees/historique. */
export type HistoriquePoint = {
  jour: string;
  semaine: number;
  total: number;
  enAttente: number;
  examinees: number;
};

type LieesContenuProps = LieesEtat & {
  /** Vide quand aucun relevé n'a encore été écrit : aucune courbe affichée. */
  historique?: HistoriquePoint[];
};

export type LieesEtat = {
  data: OrgsLiees | null;
  loading: boolean;
  error: string | null;
};

function nombre(value: number): string {
  return Number.isFinite(value) ? value.toLocaleString("fr-FR") : "—";
}

/** Micro-courbe des relevés quotidiens : un seul point ne trace pas une ligne. */
function MicroCourbe({ points }: { points: HistoriquePoint[] }) {
  if (points.length === 0) return null;

  const largeur = 120;
  const hauteur = 28;
  const marge = 2;
  const valeurs = points.map((p) => p.semaine);
  const min = Math.min(...valeurs);
  const max = Math.max(...valeurs);
  const y = (valeur: number) =>
    max === min
      ? hauteur / 2
      : marge + (1 - (valeur - min) / (max - min)) * (hauteur - 2 * marge);
  const coordonnees = points.map((p, i) => ({
    x: points.length === 1
      ? largeur / 2
      : marge + (i / (points.length - 1)) * (largeur - 2 * marge),
    y: y(p.semaine),
  }));
  const dernier = coordonnees[coordonnees.length - 1];

  return (
    <div className="liees__historique">
      <p className="liees__historique-label">reliées · 30 derniers jours</p>
      <svg className="liees__courbe" viewBox={`0 0 ${largeur} ${hauteur}`}
        role="img" aria-label={`${points.length} relevé(s) des 30 derniers jours`}>
        {coordonnees.length > 1 ? (
          <polyline
            className="liees__courbe-trait"
            points={coordonnees.map((c) => `${c.x},${c.y}`).join(" ")}
          />
        ) : null}
        {dernier ? (
          <circle className="liees__courbe-point" cx={dernier.x} cy={dernier.y} r={2.5} />
        ) : null}
      </svg>
    </div>
  );
}

/** Présentation pure : permet de vérifier chaque état sans réseau. */
export function LieesContenu({ data, loading, error, historique = [] }: LieesContenuProps) {
  const vide = !loading && !error && data !== null
    && data.semaine === 0 && data.total === 0
    && data.enAttente === 0 && data.examinees === 0;
  const mesure = data !== null && !loading && !error && !vide;

  return (
    <article className="liees" aria-labelledby="liees-titre">
      <header className="liees__head">
        <h2 className="liees__titre" id="liees-titre">Organisations reliées — 7 jours</h2>
        <p className="liees__kicker">rattachements mesurés en base</p>
      </header>

      {loading ? <p className="liees__statut" role="status">chargement des organisations reliées…</p> : null}
      {error ? <p className="liees__statut liees__erreur" role="alert">API : {error}</p> : null}
      {vide ? (
        <p className="liees__vide" role="status">aucune organisation reliée mesurée</p>
      ) : null}

      {mesure && data ? (
        <>
          <p className="liees__grand">{nombre(data.semaine)}</p>
          <p className="liees__grand-label">reliées sur 7 jours</p>

          <dl className="liees__chiffres">
            <div className="liees__chiffre">
              <dt>depuis toujours</dt>
              <dd>{nombre(data.total)}</dd>
            </div>
            <div className="liees__chiffre">
              <dt>en attente</dt>
              <dd>{nombre(data.enAttente)}</dd>
            </div>
            <div className="liees__chiffre">
              <dt>examinées</dt>
              <dd>{nombre(data.examinees)}</dd>
            </div>
          </dl>

          <h3 className="liees__sous-titre">top 5 départements</h3>
          {data.parDepartement.length > 0 ? (
            <ol className="liees__depts">
              {data.parDepartement.slice(0, 5).map((d) => (
                <li className="liees__dept" key={d.dept}>
                  <span className="liees__dept-code">{d.dept}</span>
                  <span className="liees__dept-n">{nombre(d.n)}</span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="liees__vide">aucun département renseigné</p>
          )}
        </>
      ) : null}

      {!loading && !error && historique.length > 1 ? (
        <MicroCourbe points={historique} />
      ) : null}
    </article>
  );
}

/** Carte autonome : lit son propre compteur avec le jeton de session courant. */
export default function LieesCard() {
  const [data, setData] = useState<OrgsLiees | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [historique, setHistorique] = useState<HistoriquePoint[]>([]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setHistorique([]);
    setError(null);
    fetch("/api/orgs/liees", { headers: authHeaders(), signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) {
          throw new Error(
            res.status === 401
              ? "/api/orgs/liees → 401 (authentification requise)"
              : `/api/orgs/liees → ${res.status}`,
          );
        }
        return await res.json() as OrgsLiees;
      })
      .then((json) => { if (!controller.signal.aborted) setData(json); })
      .catch((err: unknown) => {
        if (!controller.signal.aborted) {
          setError(err instanceof Error ? err.message : "erreur inconnue");
        }
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    fetch("/api/orgs/liees/historique?jours=30", { headers: authHeaders(), signal: controller.signal })
      .then(async (res) => res.ok
        ? await res.json() as { points?: HistoriquePoint[] }
        : { points: [] })
      .then((json) => {
        if (controller.signal.aborted) return;
        const points = Array.isArray(json?.points) ? json.points : [];
        setHistorique(points.filter((p) =>
          p && typeof p.jour === "string" && Number.isFinite(p.semaine)));
      })
      .catch(() => { /* historique indisponible : aucune courbe, pas un tracé vide */ });
    return () => controller.abort();
  }, []);

  return <LieesContenu data={data} loading={loading} error={error} historique={historique} />;
}
