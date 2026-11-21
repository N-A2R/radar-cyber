/**
 * Droit de réponse sur la fiche organisation.
 *
 * Deux responsabilités séparées pour rester vérifiable sans réseau :
 * `DroitReponseSection` est un composant de présentation pur (états vides,
 * erreurs, succès, liste publiée), `DroitReponseBloc` gère le formulaire et
 * les appels API. Aucune demande n'est affichée comme publiée avant la
 * décision d'un administrateur : le serveur ne renvoie que les réponses
 * `publiee`.
 */
import { useState, type FormEvent } from "react";
import { api, type ApiError, type DemandeRectification, type MotifRectification, type RectificationsOrg, type RectificationPubliee } from "../api";

export type EtatDroitReponse = "ferme" | "ouvert" | "envoi" | "succes" | "erreur";

export type ValeursDroitReponse = {
  organisation: string;
  contactNom: string;
  email: string;
  domaine: string;
  motif: MotifRectification;
  message: string;
  pieceJointeRef: string;
};

export type ErreursDroitReponse = Partial<Record<keyof ValeursDroitReponse, string>>;

const MOTIFS: { valeur: MotifRectification; libelle: string }[] = [
  { valeur: "inexactitude", libelle: "information inexacte" },
  { valeur: "omission", libelle: "information omise" },
  { valeur: "suppression", libelle: "information à supprimer" },
  { valeur: "autre", libelle: "autre motif" },
];

export function formatDateRectification(value: string | null): string | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
}

export function validerDroitReponse(v: ValeursDroitReponse): ErreursDroitReponse {
  const erreurs: ErreursDroitReponse = {};
  if (v.organisation.trim().length < 2) erreurs.organisation = "indiquez le nom de l'organisation";
  if (v.email.trim().length === 0 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v.email.trim())) {
    erreurs.email = "adresse e-mail invalide";
  }
  if (v.message.trim().length < 20) erreurs.message = "20 caractères minimum pour expliquer la demande";
  return erreurs;
}

type PropsSection = {
  organisation: string;
  domain: string | null | undefined;
  publiees: RectificationPubliee[];
  etat: EtatDroitReponse;
  valeurs: ValeursDroitReponse;
  erreurs: ErreursDroitReponse;
  messageErreur: string | null;
  reference: string | null;
  onOuvrir: () => void;
  onFermer: () => void;
  onChanger: (champ: keyof ValeursDroitReponse, valeur: string) => void;
  onEnvoyer: (event: FormEvent<HTMLFormElement>) => void;
};

/** Présentation pure : aucun effet, aucun appel réseau. */
export function DroitReponseSection({
  organisation, domain, publiees, etat, valeurs, erreurs,
  messageErreur, reference, onOuvrir, onFermer, onChanger, onEnvoyer,
}: PropsSection) {
  return (
    <section className="orgsheet__section droit-reponse" aria-label="Droit de réponse">
      <h3 className="orgsheet__section-title">
        droit de réponse <span className="orgsheet__count">{publiees.length}</span>
      </h3>

      {publiees.length === 0 ? (
        <p className="orgsheet__empty">aucune rectification publiée pour cette organisation</p>
      ) : (
        <ul className="orgsheet__list droit-reponse__liste">
          {publiees.map((r) => (
            <li key={r.id} className="droit-reponse__publication">
              <p className="droit-reponse__reference">
                {r.reference} · {MOTIFS.find((m) => m.valeur === r.motif)?.libelle ?? r.motif}
                {formatDateRectification(r.publishedAt) ? ` · publiée le ${formatDateRectification(r.publishedAt)}` : ""}
              </p>
              <p className="droit-reponse__message">{r.message}</p>
              {r.decisionMotif && (
                <p className="orgsheet__meta">motif de la décision : {r.decisionMotif}</p>
              )}
            </li>
          ))}
        </ul>
      )}

      {etat === "succes" && (
        <p className="droit-reponse__succes" role="status">
          demande enregistrée{reference ? ` sous la référence ${reference}` : ""}.
          {" "}Elle sera examinée avant toute publication.
        </p>
      )}
      {etat === "erreur" && (
        <p className="droit-reponse__erreur" role="alert">
          envoi impossible : {messageErreur ?? "erreur inconnue"}
        </p>
      )}

      {etat === "ferme" || etat === "succes" ? (
        <button type="button" className="droit-reponse__ouvrir" onClick={onOuvrir}>
          demander une rectification
        </button>
      ) : null}

      {etat === "ouvert" || etat === "envoi" || etat === "erreur" ? (
        <form className="droit-reponse__form" onSubmit={onEnvoyer} noValidate>
          <p className="orgsheet__note">
            Demande au nom de <strong>{organisation}</strong>
            {domain ? ` (${domain})` : ""}. Le nom doit correspondre à cette fiche.
          </p>

          <label className="droit-reponse__champ">
            <span>nom de l'organisation</span>
            <input
              type="text" value={valeurs.organisation} readOnly
              onChange={(event) => onChanger("organisation", event.target.value)}
              aria-invalid={Boolean(erreurs.organisation)}
            />
          </label>
          {erreurs.organisation && <p className="droit-reponse__erreur-champ" role="alert">{erreurs.organisation}</p>}

          <label className="droit-reponse__champ">
            <span>contact (nom)</span>
            <input
              type="text" value={valeurs.contactNom} maxLength={120}
              onChange={(event) => onChanger("contactNom", event.target.value)}
            />
          </label>

          <label className="droit-reponse__champ">
            <span>e-mail de contact</span>
            <input
              type="email" value={valeurs.email} maxLength={200}
              onChange={(event) => onChanger("email", event.target.value)}
              aria-invalid={Boolean(erreurs.email)}
            />
          </label>
          {erreurs.email && <p className="droit-reponse__erreur-champ" role="alert">{erreurs.email}</p>}

          <label className="droit-reponse__champ">
            <span>domaine justificatif (facultatif)</span>
            <input
              type="text" value={valeurs.domaine} maxLength={200}
              onChange={(event) => onChanger("domaine", event.target.value)}
            />
          </label>

          <label className="droit-reponse__champ">
            <span>motif</span>
            <select value={valeurs.motif} onChange={(event) => onChanger("motif", event.target.value)}>
              {MOTIFS.map((m) => <option key={m.valeur} value={m.valeur}>{m.libelle}</option>)}
            </select>
          </label>

          <label className="droit-reponse__champ">
            <span>rectification demandée</span>
            <textarea
              value={valeurs.message} maxLength={3000} rows={4}
              onChange={(event) => onChanger("message", event.target.value)}
              aria-invalid={Boolean(erreurs.message)}
            />
          </label>
          {erreurs.message && <p className="droit-reponse__erreur-champ" role="alert">{erreurs.message}</p>}

          <label className="droit-reponse__champ">
            <span>référence de pièce justificative (facultatif)</span>
            <input
              type="text" value={valeurs.pieceJointeRef} maxLength={300}
              onChange={(event) => onChanger("pieceJointeRef", event.target.value)}
            />
          </label>

          <div className="droit-reponse__actions">
            <button type="submit" disabled={etat === "envoi"}>
              {etat === "envoi" ? "envoi en cours…" : "envoyer la demande"}
            </button>
            <button type="button" onClick={onFermer} disabled={etat === "envoi"}>annuler</button>
          </div>
          <p className="orgsheet__note">
            Vos coordonnées servent uniquement à instruire la demande. Aucune publication n'est automatique :
            un administrateur décide, et sa décision est tracée.
          </p>
        </form>
      ) : null}
    </section>
  );
}

/** Conteneur : état du formulaire, validation et appels API. */
export function DroitReponseBloc({
  orgId, organisation, domain, initial,
}: {
  orgId: number;
  organisation: string;
  domain: string | null | undefined;
  initial: RectificationsOrg | undefined;
}) {
  const [publiees, setPubliees] = useState<RectificationPubliee[]>(initial?.items ?? []);
  const [etat, setEtat] = useState<EtatDroitReponse>("ferme");
  const [valeurs, setValeurs] = useState<ValeursDroitReponse>({
    organisation, contactNom: "", email: "", domaine: domain ?? "",
    motif: "inexactitude", message: "", pieceJointeRef: "",
  });
  const [erreurs, setErreurs] = useState<ErreursDroitReponse>({});
  const [messageErreur, setMessageErreur] = useState<string | null>(null);
  const [reference, setReference] = useState<string | null>(null);

  const onChanger = (champ: keyof ValeursDroitReponse, valeur: string) => {
    setValeurs((precedent) => ({ ...precedent, [champ]: valeur }));
    setErreurs((precedent) => ({ ...precedent, [champ]: undefined }));
  };

  const onEnvoyer = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const invalides = validerDroitReponse(valeurs);
    if (Object.keys(invalides).length > 0) {
      setErreurs(invalides);
      setEtat("erreur");
      setMessageErreur("corrigez les champs signalés");
      return;
    }
    setEtat("envoi");
    setMessageErreur(null);
    const corps: DemandeRectification = {
      orgId,
      organisation: valeurs.organisation.trim(),
      contactNom: valeurs.contactNom.trim() || undefined,
      email: valeurs.email.trim(),
      domaine: valeurs.domaine.trim() || undefined,
      motif: valeurs.motif,
      message: valeurs.message.trim(),
      pieceJointeRef: valeurs.pieceJointeRef.trim() || undefined,
    };
    try {
      const accuse = await api.demanderRectification(corps);
      setReference(accuse.reference);
      setEtat("succes");
      setValeurs((precedent) => ({ ...precedent, message: "" }));
      // Une demande reçue n'est pas publiée : la liste ne change normalement
      // pas. On la relit quand même pour refléter une décision concurrente.
      try {
        const relu = await api.rectificationsOrg(orgId);
        setPubliees(relu.items);
      } catch { /* la fiche reste affichée avec son dernier état connu */ }
    } catch (erreur) {
      const apiErreur = erreur as ApiError;
      setEtat("erreur");
      setMessageErreur(apiErreur.status === 429
        ? "trop de demandes, réessayez plus tard"
        : (apiErreur.message ?? "erreur inconnue"));
    }
  };

  return (
    <DroitReponseSection
      organisation={organisation}
      domain={domain}
      publiees={publiees}
      etat={etat}
      valeurs={valeurs}
      erreurs={erreurs}
      messageErreur={messageErreur}
      reference={reference}
      onOuvrir={() => setEtat("ouvert")}
      onFermer={() => { setEtat("ferme"); setErreurs({}); setMessageErreur(null); }}
      onChanger={onChanger}
      onEnvoyer={onEnvoyer}
    />
  );
}
