/**
 * Écran Journal : lit GET /api/journal/review en lecture seule.
 *
 * Les pages API de 500 lignes sont accumulées jusqu'à épuisement du curseur
 * `avant` (plafond documenté de 10 000 lignes), puis filtrées et paginées
 * côté navigateur par tranches de 50. Le AbortController annule les requêtes
 * périmées lorsque l'écran est quitté.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { api, type JournalDecision } from "../api";
import JournalListe, { DECISION_NON_PRECISEE, type JournalFiltres } from "./JournalListe";

export { DECISION_NON_PRECISEE } from "./JournalListe";
export type { JournalFiltres } from "./JournalListe";

const LIMITE_API = 500;
const PLAFOND = 10_000;
const LIGNES_PAR_PAGE = 50;

/**
 * Filtre pur : aucune mutation, ordre d'origine conservé.
 * Acteur = sous-chaîne insensible à la casse ; décision = correspondance
 * exacte (chaîne vide ou absence = aucune restriction) ; dates = bornes
 * inclusives sur les dix premiers caractères de l'horodatage (YYYY-MM-DD).
 */
export function filtrerJournal(
  rows: JournalDecision[],
  filtres: JournalFiltres,
): JournalDecision[] {
  const acteur = filtres.acteur?.toLowerCase() ?? "";
  const decision = filtres.decision === DECISION_NON_PRECISEE ? null : filtres.decision;
  const du = filtres.du ?? "";
  const au = filtres.au ?? "";

  return rows.filter((row) => {
    if (acteur && !row.acteur.toLowerCase().includes(acteur)) return false;
    if (decision !== undefined && decision !== "" && row.decision !== decision) return false;
    const jour = row.horodatage.slice(0, 10);
    if (du && jour < du) return false;
    if (au && jour > au) return false;
    return true;
  });
}

type Props = {
  onUnauthorized?: () => void;
};

export default function JournalView({ onUnauthorized }: Props) {
  const [rows, setRows] = useState<JournalDecision[]>([]);
  const [filtres, setFiltres] = useState<JournalFiltres>({});
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tronque, setTronque] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);

    (async () => {
      const charge: JournalDecision[] = [];
      let avant: number | null = null;
      let troncation = false;
      try {
        for (;;) {
          const data = await api.journalReview(LIMITE_API, avant, controller.signal);
          if (controller.signal.aborted) return;

          const reste = PLAFOND - charge.length;
          charge.push(...data.rows.slice(0, reste));
          if (data.rows.length > reste) troncation = true;
          if (data.avant === null || data.rows.length === 0) break;
          if (charge.length >= PLAFOND || data.avant === avant) {
            // Curseur épuisé par le plafond ou non progressif : on s'arrête.
            troncation = true;
            break;
          }
          avant = data.avant;
        }
        setRows(charge);
        setTronque(troncation);
      } catch (err: unknown) {
        if (controller.signal.aborted) return;
        if (typeof err === "object" && err !== null && "status" in err && err.status === 401) {
          onUnauthorized?.();
        }
        setError(err instanceof Error ? err.message : "journal indisponible");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();

    return () => controller.abort();
  }, [onUnauthorized]);

  const filtrees = useMemo(() => filtrerJournal(rows, filtres), [rows, filtres]);
  const pageCount = Math.max(1, Math.ceil(filtrees.length / LIGNES_PAR_PAGE));
  const pageCourante = Math.min(page, pageCount);
  const visibles = filtrees.slice(
    (pageCourante - 1) * LIGNES_PAR_PAGE,
    pageCourante * LIGNES_PAR_PAGE,
  );

  const changerFiltre = useCallback((patch: JournalFiltres) => {
    setFiltres((precedents) => ({ ...precedents, ...patch }));
    setPage(1);
  }, []);

  const reinitialiser = useCallback(() => {
    setFiltres({});
    setPage(1);
  }, []);

  const allerPrecedent = useCallback(() => setPage((p) => Math.max(1, p - 1)), []);
  const allerSuivant = useCallback(() => setPage((p) => Math.min(pageCount, p + 1)), [pageCount]);

  return (
    <JournalListe
      rows={visibles}
      resultats={filtrees.length}
      filtres={filtres}
      onFiltre={changerFiltre}
      onReset={reinitialiser}
      tronque={tronque}
      loading={loading}
      error={error}
      page={pageCourante}
      pageCount={pageCount}
      onPrecedent={allerPrecedent}
      onSuivant={allerSuivant}
    />
  );
}
