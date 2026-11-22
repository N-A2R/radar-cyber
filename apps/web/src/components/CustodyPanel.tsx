/**
 * Panneau de chaîne de traçabilité — qui a vu quoi, et quand.
 *
 * Seules les métadonnées de source et les faits du journal sont affichés :
 * le texte libre de l'événement n'est jamais transmis à ce panneau, donc
 * aucune donnée personnelle de victime ne peut fuiter par lui.
 */
import { useEffect, useState } from "react";
import { api, type CustodyChain } from "../api";

function formatDate(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toISOString().replace("T", " ").slice(0, 19);
}

/** Rendu pur, exporté pour que le contrôle SSR l'inspecte sans réseau. */
export function CustodyDetails({ chain }: { chain: CustodyChain }) {
  return (
    <section className="inspector__section" data-custody={chain.complete ? "complete" : "incomplete"}>
      <h3 className="inspector__section-title">Chaîne de traçabilité</h3>
      <dl className="inspector__meta">
        <dt className="inspector__meta-label">Source</dt>
        <dd className="inspector__meta-value">{chain.source ?? "inconnue"}</dd>
        <dt className="inspector__meta-label">Observé le</dt>
        <dd className="inspector__meta-value">{formatDate(chain.observedAt)}</dd>
        <dt className="inspector__meta-label">Statut</dt>
        <dd className="inspector__meta-value">
          {chain.complete ? "Complète" : `Incomplète : ${chain.missing.join(", ")}`}
        </dd>
      </dl>
      <ol className="inspector__text">
        {chain.links.map((link, index) => (
          <li key={`${link.recordedAt ?? index}-${link.who}`}>
            {link.who} — {formatDate(link.when)} — enregistré le {formatDate(link.recordedAt)}
            {link.proof.length > 0 ? ` — preuve : ${link.proof.join(", ")}` : ""}
          </li>
        ))}
      </ol>
    </section>
  );
}

type State =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; chain: CustodyChain };

export default function CustodyPanel({ subject }: { subject: string }) {
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    const controller = new AbortController();
    setState({ status: "loading" });
    api.custody(subject, controller.signal)
      .then((chain) => setState({ status: "ready", chain }))
      .catch(() => setState({ status: "error" }));
    return () => controller.abort();
  }, [subject]);

  if (state.status === "loading") {
    return <section className="inspector__section">Chargement de la chaîne de traçabilité…</section>;
  }
  if (state.status === "error") {
    return <section className="inspector__section">Chaîne de traçabilité indisponible.</section>;
  }
  return <CustodyDetails chain={state.chain} />;
}
