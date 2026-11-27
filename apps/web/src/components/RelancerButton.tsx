import { useState } from "react";
import type { ApiError } from "../api";
import "./sources-rouges.css";
import { EmptyState, LoadingSkeleton } from "./Skeleton";
import { Card } from "@astryxdesign/core/Card";

/** Résultat brut d'une relance : le nombre d'événements réellement admis. */
export type RelanceOutcome = {
  inserted: number;
  skipped?: number;
  /** Le serveur a lancé le run sans attendre son résultat (POST /collecte). */
  lancee?: boolean;
};

/** État affiché après un clic ; jamais déduit d'un espoir, seulement du retour. */
export type RelanceEtat =
  | { kind: "idle" }
  | { kind: "en-cours" }
  | { kind: "lancee" }
  | { kind: "succes"; inserted: number; skipped: number }
  | { kind: "vide" }
  | { kind: "erreur"; message: string };

export type RelancerButtonProps = {
  sourceId: string;
  sourceName: string;
  /** Appel du chemin de collecte existant, fourni par le parent. */
  onRelance: (sourceId: string) => Promise<RelanceOutcome>;
  disabled?: boolean;
};

function messageErreur(error: unknown): string {
  if (error instanceof Error) {
    const status = (error as ApiError).status;
    return status === undefined ? error.message : `${error.message} (HTTP ${status})`;
  }
  return "réponse inattendue";
}

/** Résultat d'une relance, rendu à part pour être vérifiable en SSR. */
export function RelanceResultat({ etat, onRelance }: { etat: RelanceEtat; onRelance?: () => void }) {
  if (etat.kind === "idle") return null;
  if (etat.kind === "en-cours") {
    return <Card variant="transparent" padding={0} className="relance-resultat" role="status"><LoadingSkeleton label="relance en cours…" /></Card>;
  }
  if (etat.kind === "lancee") return <span className="relance-resultat" data-resultat="lancee" role="status">collecte lancée</span>;
  if (etat.kind === "erreur") {
    return <span className="relance-resultat" data-resultat="erreur" role="alert">erreur · {etat.message}</span>;
  }
  if (etat.kind === "vide") {
    return (
      <Card variant="transparent" padding={0} className="relance-resultat" data-resultat="vide" role="status">
        {onRelance
          ? <EmptyState message="0 nouvel événement" actionLabel="Relancer" onAction={onRelance} />
          : "0 nouvel événement"}
      </Card>
    );
  }
  const n = etat.inserted;
  return (
    <span className="relance-resultat" data-resultat="succes" role="status">
      succès · {n} {n > 1 ? "nouveaux" : "nouvel"} événement{n > 1 ? "s" : ""}
      {etat.skipped > 0 ? ` · ${etat.skipped} ignoré${etat.skipped > 1 ? "s" : ""}` : ""}
    </span>
  );
}

export default function RelancerButton({ sourceId, sourceName, onRelance, disabled = false }: RelancerButtonProps) {
  const [etat, setEtat] = useState<RelanceEtat>({ kind: "idle" });

  async function relancer(): Promise<void> {
    setEtat({ kind: "en-cours" });
    try {
      const outcome = await onRelance(sourceId);
      setEtat(
        outcome.lancee
          ? { kind: "lancee" }
          : outcome.inserted > 0
            ? { kind: "succes", inserted: outcome.inserted, skipped: outcome.skipped ?? 0 }
            : { kind: "vide" },
      );
    } catch (error) {
      setEtat({ kind: "erreur", message: messageErreur(error) });
    }
  }

  return (
    <Card variant="transparent" className="relance-cellule-card">
    <Card variant="transparent" padding={0} className="relance-cellule">
      <button
        type="button"
        className="relance-bouton"
        onClick={() => void relancer()}
        disabled={disabled || etat.kind === "en-cours"}
        aria-label={`Relancer la collecte de ${sourceName}`}
      >
        Relancer
      </button>
      <RelanceResultat etat={etat} onRelance={() => void relancer()} />
    </Card>
    </Card>
  );
}
