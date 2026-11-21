/**
 * Écran de revue des candidats incidents cyber issus de la presse.
 *
 * Une ligne = un article. Chaque décision retiré la ligne de la file et reste
 * visible dans le journal de la passe ; quand la dernière ligne part, l'écran
 * affiche la mesure de la passe (traités et taux de confirmation).
 */
import { useEffect, useState } from "react";
import { authHeaders } from "../api";
import "./presse-candidats.css";

export type CandidatPresse = {
  cle: string;
  titre: string;
  extrait: string;
  url: string;
  date: string | null;
  source: string | null;
  orgProposee: string | null;
  scoreConfiance: number;
};

export type StatsPresse = {
  enAttente: number;
  traites: number;
  traitesDansPasse: number;
  tauxConfirmation: number | null;
  confirme: number;
  refuse: number;
  reclasse: number;
};

export type DecisionPresse = "confirmer" | "refuser" | "reclasser";

export type DecisionEnregistree = {
  id: number;
  decision: DecisionPresse;
  auteur: string;
  horodatage: string;
  raison: string;
  org_retenue: string | null;
};

type Props = {
  canWrite?: boolean;
  fetchImpl?: typeof fetch;
  onUnauthorized?: () => void;
};

const PASSE = `passe-${new Date().toISOString().slice(0, 10)}`;
const VIDE: StatsPresse = {
  enAttente: 0, traites: 0, traitesDansPasse: 0, tauxConfirmation: null,
  confirme: 0, refuse: 0, reclasse: 0,
};

function scoreLabel(score: number): string {
  if (score >= 0.7) return "élevé";
  if (score >= 0.4) return "moyen";
  return "faible";
}

export default function PresseCandidatsView({ canWrite = false, fetchImpl, onUnauthorized }: Props) {
  const http: typeof fetch = fetchImpl ?? ((input, init) => fetch(input, init));
  const [rows, setRows] = useState<CandidatPresse[]>([]);
  const [stats, setStats] = useState<StatsPresse>(VIDE);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [decision, setDecision] = useState<DecisionPresse>("confirmer");
  const [raison, setRaison] = useState("");
  const [orgRetenue, setOrgRetenue] = useState("");
  const [enCours, setEnCours] = useState<string | null>(null);
  const [journalOuvert, setJournalOuvert] = useState(false);
  const [decisions, setDecisions] = useState<DecisionEnregistree[]>([]);

  async function chargeFile(): Promise<void> {
    setChargement(true);
    try {
      const res = await http(`/api/presse/candidats?limit=200`, { headers: authHeaders() });
      if (res.status === 401) { onUnauthorized?.(); return; }
      if (!res.ok) throw new Error(`file → ${res.status}`);
      const body = await res.json() as { rows: CandidatPresse[]; statistiques: StatsPresse };
      setRows(body.rows);
      setStats(body.statistiques);
      setErreur(null);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "lecture impossible");
    } finally {
      setChargement(false);
    }
  }

  useEffect(() => { void chargeFile(); }, []);

  async function chargeJournal(): Promise<void> {
    try {
      const res = await http(`/api/presse/candidats/decisions?passe=${encodeURIComponent(PASSE)}`, {
        headers: authHeaders(),
      });
      if (res.status === 401) { onUnauthorized?.(); return; }
      if (!res.ok) throw new Error(`décisions → ${res.status}`);
      const body = await res.json() as { rows: DecisionEnregistree[] };
      setDecisions(body.rows);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "journal indisponible");
    }
  }

  async function decidre(candidat: CandidatPresse): Promise<void> {
    if (!raison.trim() || (decision === "reclasser" && !orgRetenue.trim())) return;
    setEnCours(candidat.cle);
    try {
      const res = await http(`/api/presse/candidats/${encodeURIComponent(candidat.cle)}/decision`, {
        method: "POST",
        headers: { ...authHeaders(), "content-type": "application/json" },
        body: JSON.stringify({
          decision,
          raison: raison.trim(),
          passe: PASSE,
          ...(decision === "reclasser" ? { orgRetenue: orgRetenue.trim() } : {}),
        }),
      });
      if (res.status === 401) { onUnauthorized?.(); return; }
      if (!res.ok) throw new Error(`décision → ${res.status}`);
      setRows((precedents) => precedents.filter((row) => row.cle !== candidat.cle));
      setRaison("");
      setOrgRetenue("");
      const maj = await http(`/api/presse/candidats/stats?passe=${encodeURIComponent(PASSE)}`, {
        headers: authHeaders(),
      });
      if (maj.ok) setStats(await maj.json() as StatsPresse);
      if (journalOuvert) await chargeJournal();
      setErreur(null);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "décision impossible");
    } finally {
      setEnCours(null);
    }
  }

  const taux = stats.tauxConfirmation === null ? "—" : `${stats.tauxConfirmation} %`;

  return (
    <section className="presse-revue" aria-label="Revue des candidats presse">
      <header className="presse-revue__head">
        <div>
          <h1>Revue des candidats presse</h1>
          <p className="presse-revue__sous-titre">
            {stats.enAttente} en file · {stats.traitesDansPasse} traités dans la passe · {taux} confirmés
          </p>
        </div>
        <button type="button" onClick={() => { void chargeFile(); }}>Relire la file</button>
      </header>

      {erreur ? <p className="presse-revue__erreur" role="alert">{erreur}</p> : null}
      {chargement ? <p className="presse-revue__etat" role="status">Chargement de la file…</p> : null}

      {!chargement && rows.length === 0 ? (
        <div className="presse-revue__vide" role="status">
          <strong>File vidée</strong>
          <p>
            {stats.traitesDansPasse} candidats traités en une passe · taux de confirmation observé : {taux}.
          </p>
          <p>Confirmés {stats.confirme} · refusés {stats.refuse} · reclassés {stats.reclasse}</p>
        </div>
      ) : null}

      {rows.length > 0 ? (
        <div className="presse-revue__table-wrap">
          <table className="presse-revue__table">
            <caption className="presse-revue__caption">Candidats en attente de décision</caption>
            <thead>
              <tr>
                <th scope="col">Article</th>
                <th scope="col">Date</th>
                <th scope="col">Organisation proposée</th>
                <th scope="col">Confiance</th>
                <th scope="col">Décision</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((candidat) => (
                <tr key={candidat.cle}>
                  <td>
                    <a href={candidat.url} target="_blank" rel="noreferrer">{candidat.titre || candidat.url}</a>
                    <p className="presse-revue__extrait">{candidat.extrait}</p>
                    <p className="presse-revue__source">{candidat.source ?? "source inconnue"}</p>
                  </td>
                  <td>{candidat.date ?? "date inconnue"}</td>
                  <td>{candidat.orgProposee ?? "à préciser"}</td>
                  <td>
                    <span className="presse-revue__score">
                      {Math.round(candidat.scoreConfiance * 100)} % — {scoreLabel(candidat.scoreConfiance)}
                    </span>
                  </td>
                  <td>
                    {canWrite ? (
                      <div className="presse-revue__action">
                        <fieldset>
                          <legend>Décision pour {candidat.titre.slice(0, 40)}</legend>
                          {(["confirmer", "refuser", "reclasser"] as const).map((choix) => (
                            <label key={choix}>
                              <input
                                type="radio"
                                name={`decision-${candidat.cle}`}
                                value={choix}
                                checked={decision === choix}
                                onChange={() => { setDecision(choix); }}
                              />
                              {choix}
                            </label>
                          ))}
                        </fieldset>
                        <label>
                          Motif
                          <textarea
                            value={raison}
                            onChange={(e) => { setRaison(e.target.value); }}
                            rows={2}
                            aria-label={`Motif pour ${candidat.titre.slice(0, 40)}`}
                          />
                        </label>
                        {decision === "reclasser" ? (
                          <label>
                            Organisation retenue
                            <input
                              value={orgRetenue}
                              onChange={(e) => { setOrgRetenue(e.target.value); }}
                              aria-label={`Organisation retenue pour ${candidat.titre.slice(0, 40)}`}
                            />
                          </label>
                        ) : null}
                        <button
                          type="button"
                          disabled={enCours !== null || !raison.trim() || (decision === "reclasser" && !orgRetenue.trim())}
                          onClick={() => { void decidre(candidat); }}
                        >
                          {enCours === candidat.cle ? "Enregistrement…" : "Enregistrer"}
                        </button>
                      </div>
                    ) : <span>lecture seule</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <div className="presse-revue__audit">
        <button type="button" aria-expanded={journalOuvert} onClick={() => {
          const prochain = !journalOuvert;
          setJournalOuvert(prochain);
          if (prochain) void chargeJournal();
        }}>
          {journalOuvert ? "Masquer" : "Afficher"} le journal de la passe
        </button>
        {journalOuvert ? (
          <ol className="presse-revue__journal">
            {decisions.map((item) => (
              <li key={item.id}>
                <strong>{item.decision}</strong> — {item.auteur} — {new Date(item.horodatage).toLocaleString()}
                <span>{item.raison}</span>
                {item.org_retenue ? <span>organisation : {item.org_retenue}</span> : null}
              </li>
            ))}
            {decisions.length === 0 ? <li>Aucune décision enregistrée dans cette passe.</li> : null}
          </ol>
        ) : null}
      </div>
    </section>
  );
}
