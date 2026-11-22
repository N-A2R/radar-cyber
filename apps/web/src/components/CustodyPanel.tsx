/**
 * Chain of custody panel — who saw what, and when.
 *
 * English labels by contract. Only source metadata and journal facts are
 * shown: the event free text is never sent to this panel, so no victim
 * personal data can leak through it.
 */
import { useEffect, useState } from "react";
import { api, type CustodyChain } from "../api";

function formatDate(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toISOString().replace("T", " ").slice(0, 19);
}

/** Pure rendering, exported so the SSR check can inspect it without a network. */
export function CustodyDetails({ chain }: { chain: CustodyChain }) {
  return (
    <section className="inspector__section" data-custody={chain.complete ? "complete" : "incomplete"}>
      <h3 className="inspector__section-title">Custody chain</h3>
      <dl className="inspector__meta">
        <dt className="inspector__meta-label">Source</dt>
        <dd className="inspector__meta-value">{chain.source ?? "unknown"}</dd>
        <dt className="inspector__meta-label">Observed at</dt>
        <dd className="inspector__meta-value">{formatDate(chain.observedAt)}</dd>
        <dt className="inspector__meta-label">Status</dt>
        <dd className="inspector__meta-value">
          {chain.complete ? "Complete" : `Incomplete: ${chain.missing.join(", ")}`}
        </dd>
      </dl>
      <ol className="inspector__text">
        {chain.links.map((link, index) => (
          <li key={`${link.recordedAt ?? index}-${link.who}`}>
            {link.who} — {formatDate(link.when)} — recorded {formatDate(link.recordedAt)}
            {link.proof.length > 0 ? ` — proof: ${link.proof.join(", ")}` : ""}
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
    return <section className="inspector__section">Loading custody chain…</section>;
  }
  if (state.status === "error") {
    return <section className="inspector__section">Custody chain unavailable.</section>;
  }
  return <CustodyDetails chain={state.chain} />;
}
