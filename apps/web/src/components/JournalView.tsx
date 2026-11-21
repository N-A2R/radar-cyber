/**
 * Écran Journal : lit GET /api/journal/review en lecture seule.
 *
 * Le curseur de requête (`curseur`) est distinct du curseur de réponse
 * (`suivant`) : confondre les deux relancerait la requête dès qu'une page
 * arrive. La pile des curseurs précédents donne un « Précédent » sans
 * recalculer de numéro de page côté serveur.
 */
import { useCallback, useEffect, useState } from "react";
import { api, type JournalDecision } from "../api";
import { ErrorRetry } from "./ErrorRetry";
import JournalListe from "./JournalListe";

const LIMITE = 100;

type Props = {
  onUnauthorized?: () => void;
};

export default function JournalView({ onUnauthorized }: Props) {
  const [rows, setRows] = useState<JournalDecision[]>([]);
  const [curseur, setCurseur] = useState<number | null>(null);
  const [suivant, setSuivant] = useState<number | null>(null);
  const [precedents, setPrecedents] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryTick, setRetryTick] = useState(0);
  const retry = useCallback(() => setRetryTick((n) => n + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    api.journalReview(LIMITE, curseur, controller.signal)
      .then((data) => {
        setRows(data.rows);
        setSuivant(data.avant);
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        if (typeof err === "object" && err !== null && "status" in err && err.status === 401) {
          onUnauthorized?.();
        }
        setError(err instanceof Error ? err.message : "journal indisponible");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [curseur, onUnauthorized, retryTick]);

  const allerSuivant = useCallback(() => {
    if (suivant === null) return;
    setPrecedents((pile) => (curseur === null ? pile : [...pile, curseur]));
    setCurseur(suivant);
  }, [curseur, suivant]);

  const allerPrecedent = useCallback(() => {
    if (precedents.length === 0) return;
    setCurseur(precedents[precedents.length - 1]);
    setPrecedents(precedents.slice(0, -1));
  }, [precedents]);

  return (
    <JournalListe
      rows={rows}
      loading={loading}
      error={error}
      onRetry={retry}
      suivant={suivant}
      page={precedents.length + 1}
      onPrecedent={allerPrecedent}
      onSuivant={allerSuivant}
    />
  );
}
