import { useEffect, useState } from "react";
import type { InspectorProps } from "../contracts";
import { api, type EventEnrichment, type Org } from "../api";
import "./inspector.css";

type LoadState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready-event"; data: EventEnrichment }
  | { status: "ready-org"; org: Org };

function formatDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short" });
}

function isNonEmptyArray<T>(value: T[] | null | undefined): value is T[] {
  return Array.isArray(value) && value.length > 0;
}

function hasValue(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

export default function Inspector({ eventId, orgId, onClose }: InspectorProps) {
  const [state, setState] = useState<LoadState>({ status: "idle" });

  useEffect(() => {
    let cancelled = false;

    if (eventId) {
      const id = Number(eventId);
      if (!Number.isFinite(id)) {
        setState({ status: "error", message: "Identifiant d’événement invalide." });
        return () => {
          cancelled = true;
        };
      }
      setState({ status: "loading" });
      api
        .enrichEvent(id)
        .then((data) => {
          if (cancelled) return;
          if (data.error && !data.event) {
            setState({ status: "error", message: data.error });
          } else {
            setState({ status: "ready-event", data });
          }
        })
        .catch((err: unknown) => {
          if (cancelled) return;
          const message = err instanceof Error ? err.message : "Erreur de chargement.";
          setState({ status: "error", message });
        });
      return () => {
        cancelled = true;
      };
    }

    if (orgId !== null) {
      setState({ status: "loading" });
      api
        .orgs()
        .then((orgs) => {
          if (cancelled) return;
          const org = orgs.find((o) => o.id === orgId);
          if (!org) {
            setState({ status: "error", message: "Organisation introuvable." });
          } else {
            setState({ status: "ready-org", org });
          }
        })
        .catch((err: unknown) => {
          if (cancelled) return;
          const message = err instanceof Error ? err.message : "Erreur de chargement.";
          setState({ status: "error", message });
        });
      return () => {
        cancelled = true;
      };
    }

    setState({ status: "idle" });
    return () => {
      cancelled = true;
    };
  }, [eventId, orgId]);

  let title = "Inspecteur";
  if (state.status === "ready-event" && state.data.event) {
    title = state.data.event.title;
  } else if (state.status === "ready-org") {
    title = state.org.name;
  }

  const hasSelection = eventId !== null || orgId !== null;

  return (
    <aside className="inspector" aria-label="Inspecteur">
      <header className="inspector__header">
        <h2 className="inspector__title">{title}</h2>
        <button type="button" className="inspector__close" onClick={onClose}>
          fermer
        </button>
      </header>

      <div className="inspector__body">
        {!hasSelection && (
          <p className="inspector__empty">rien de sélectionné</p>
        )}

        {hasSelection && state.status === "loading" && (
          <p className="inspector__status" role="status">Chargement…</p>
        )}

        {hasSelection && state.status === "error" && (
          <p className="inspector__status inspector__status--error" role="alert">
            {state.message}
          </p>
        )}

        {state.status === "ready-event" && (
          <EventDetail data={state.data} />
        )}

        {state.status === "ready-org" && <OrgDetail org={state.org} />}
      </div>
    </aside>
  );
}

function EventDetail({ data }: { data: EventEnrichment }) {
  const event = data.event;
  if (!event) {
    return <p className="inspector__empty">Événement indisponible.</p>;
  }

  const observed = formatDate(event.observed_at);
  const enrichment = data.enrichment;
  const domain = enrichment?.domain;
  const dns = enrichment?.dns;
  const certs = enrichment?.certs;
  const reverse = enrichment?.reverse;

  const domainFields: { label: string; value: string }[] = [];
  if (domain) {
    if (hasValue(domain.registrar)) domainFields.push({ label: "Registrar", value: String(domain.registrar) });
    if (hasValue(domain.created)) domainFields.push({ label: "Créé", value: String(domain.created) });
    if (hasValue(domain.expires)) domainFields.push({ label: "Expire", value: String(domain.expires) });
    if (hasValue(domain.updated)) domainFields.push({ label: "Mis à jour", value: String(domain.updated) });
    if (isNonEmptyArray(domain.nameServers)) {
      domainFields.push({ label: "Serveurs de noms", value: domain.nameServers.join(", ") });
    }
    if (isNonEmptyArray(domain.status)) {
      domainFields.push({ label: "Statut", value: domain.status.join(", ") });
    }
  }

  return (
    <div className="inspector__content">
      <section className="inspector__section">
        <dl className="inspector__meta">
          <MetaRow label="Famille" value={event.family} />
          <MetaRow label="Sévérité" value={String(event.severity)} />
          {hasValue(event.confidence) && <MetaRow label="Confiance" value={String(event.confidence)} />}
          {observed && <MetaRow label="Observation" value={observed} />}
          {hasValue(event.source_id) && <MetaRow label="Source" value={event.source_id} />}
        </dl>
        {hasValue(event.source_url) && (
          <p className="inspector__link-row">
            <a
              className="inspector__link"
              href={String(event.source_url)}
              target="_blank"
              rel="noopener noreferrer"
            >
              Voir la source
            </a>
          </p>
        )}
      </section>

      {hasValue(event.summary) && (
        <section className="inspector__section">
          <h3 className="inspector__section-title">Résumé</h3>
          <p className="inspector__text">{event.summary}</p>
        </section>
      )}

      {data.org && (
        <section className="inspector__section">
          <h3 className="inspector__section-title">Organisation liée</h3>
          <dl className="inspector__meta">
            <MetaRow label="Nom" value={data.org.name} />
            {hasValue(data.org.city) && <MetaRow label="Ville" value={String(data.org.city)} />}
            {hasValue(data.org.dept) && <MetaRow label="Département" value={String(data.org.dept)} />}
          </dl>
        </section>
      )}

      {isNonEmptyArray(data.indicators) && (
        <section className="inspector__section">
          <h3 className="inspector__section-title">Indicateurs</h3>
          <ul className="inspector__indicators">
            {data.indicators.map((ind) => (
              <li key={ind.id} className="inspector__indicator">
                <span className="inspector__indicator-type">{ind.type}</span>
                <span className="inspector__indicator-value">{ind.value}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {enrichment && (
        <section className="inspector__section">
          <h3 className="inspector__section-title">Enrichissement</h3>
          <div className="inspector__enrichment">
            {domainFields.length > 0 && (
              <div className="inspector__branch">
                <h4 className="inspector__branch-title">Domaine</h4>
                <dl className="inspector__meta">
                  {domainFields.map((f) => (
                    <MetaRow key={f.label} label={f.label} value={f.value} />
                  ))}
                </dl>
              </div>
            )}

            {dns && (isNonEmptyArray(dns.a) || isNonEmptyArray(dns.aaaa)) && (
              <div className="inspector__branch">
                <h4 className="inspector__branch-title">DNS</h4>
                <dl className="inspector__meta">
                  {isNonEmptyArray(dns.a) && <MetaRow label="A" value={dns.a.join(", ")} mono />}
                  {isNonEmptyArray(dns.aaaa) && <MetaRow label="AAAA" value={dns.aaaa.join(", ")} mono />}
                </dl>
              </div>
            )}

            {isNonEmptyArray(certs) && (
              <div className="inspector__branch">
                <h4 className="inspector__branch-title">Certificats</h4>
                <ul className="inspector__certs">
                  {certs.map((cert, idx) => (
                    <li key={`${cert.name}-${idx}`} className="inspector__cert">
                      {hasValue(cert.name) && <div className="inspector__mono">{cert.name}</div>}
                      {hasValue(cert.issuer) && (
                        <div className="inspector__muted">Émetteur : {cert.issuer}</div>
                      )}
                      {(hasValue(cert.notBefore) || hasValue(cert.notAfter)) && (
                        <div className="inspector__muted">
                          {hasValue(cert.notBefore) ? cert.notBefore : ""}
                          {hasValue(cert.notBefore) && hasValue(cert.notAfter) ? " → " : ""}
                          {hasValue(cert.notAfter) ? cert.notAfter : ""}
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {isNonEmptyArray(reverse) && (
              <div className="inspector__branch">
                <h4 className="inspector__branch-title">Résolution inverse</h4>
                <ul className="inspector__list-mono">
                  {reverse.map((r, idx) => (
                    <li key={`${r}-${idx}`} className="inspector__mono">{r}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  );
}

function OrgDetail({ org }: { org: Org }) {
  const coords =
    hasValue(org.lat) && hasValue(org.lon) ? `${org.lat}, ${org.lon}` : null;
  return (
    <div className="inspector__content">
      <section className="inspector__section">
        <dl className="inspector__meta">
          <MetaRow label="Nom" value={org.name} />
          {hasValue(org.kind) && <MetaRow label="Type" value={org.kind} />}
          {hasValue(org.sector) && <MetaRow label="Secteur" value={String(org.sector)} />}
          {hasValue(org.city) && <MetaRow label="Ville" value={String(org.city)} />}
          {hasValue(org.dept) && <MetaRow label="Département" value={String(org.dept)} />}
          {hasValue((org as Org & { domain?: string | null }).domain) && <MetaRow label="Domaine" value={String((org as Org & { domain?: string | null }).domain)} />}
          {coords && <MetaRow label="Coordonnées" value={coords} mono />}
          <MetaRow label="Événements" value={String(org.eventCount)} />
        </dl>
      </section>
    </div>
  );
}

function MetaRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="inspector__meta-row">
      <dt className="inspector__meta-label">{label}</dt>
      <dd className={`inspector__meta-value${mono ? " inspector__mono" : ""}`}>{value}</dd>
    </div>
  );
}
