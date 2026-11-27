import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, type ReviewAction, type ReviewQueueResponse, type ReviewRow } from "../api";
import type { ReviewViewProps } from "../contracts";
import { reduceSelection, reviewIntent, reviewTargets, type ReviewKeyState } from "../review-keys";
import { EmptyState, LoadingSkeleton } from "./Skeleton";
import "./quarantine-review.css";
import { Badge } from "@astryxdesign/core/Badge";
import { Card } from "@astryxdesign/core/Card";

/**
 * File de revue de la quarantaine — l'écran qui n'existait pas.
 *
 * La route API rendait les faits par date d'arrivée, sans interface : 16 235
 * faits dormaient sans qu'on puisse les trier. Cet écran est un poste de
 * triage au clavier, pensé pour une seule personne qui enchaîne les décisions.
 *
 * Clavier : J/K ou flèches pour parcourir, X pour cocher, P promouvoir,
 * R rejeter (motif obligatoire), M marquer revu, U annuler, Échap tout
 * désélectionner. Chaque décision est journalisée côté serveur avec son
 * auteur et son motif ; un rejet sans motif est refusé par l'API.
 *
 * Le panneau de droite montre **pourquoi** le fait est classé là : chaque
 * règle appliquée et son poids. Un classement qu'on ne peut pas contester
 * n'est pas un classement, c'est une boîte noire.
 */

const BUCKET_LABEL: Record<string, string> = { chaud: "Chaud", tiede: "Tiède", froid: "Froid" };
const SUGGESTION_LABEL: Record<string, string> = {
	promote: "promouvoir",
	review: "à vérifier",
	reject: "rejeter",
};
const ACTION_LABEL: Record<ReviewAction, string> = {
	promote: "promu(s)",
	reject: "rejeté(s)",
	review: "marqué(s) revu(s)",
	undo: "remis en attente",
};

function shortDate(iso: string | null): string {
	if (!iso) return "date inconnue";
	return iso.slice(0, 10);
}

export default function ReviewView({ canWrite, server, onUnauthorized, onOpenOrg }: ReviewViewProps) {
	const [data, setData] = useState<ReviewQueueResponse | null>(null);
	const [loading, setLoading] = useState(server);
	const [error, setError] = useState<string | null>(null);
	const [bucket, setBucket] = useState<string>("");
	const [source, setSource] = useState<string>("");
	const [status, setStatus] = useState<string>("");
	const [query, setQuery] = useState("");
	const [page, setPage] = useState(0);
	const [active, setActive] = useState(0);
	const [selected, setSelected] = useState<Set<number>>(new Set());
	const [rejecting, setRejecting] = useState(false);
	const [reason, setReason] = useState("");
	const [busy, setBusy] = useState(false);
	const [toast, setToast] = useState<{ text: string; undoable: boolean; ids: number[] } | null>(null);
	const [brut, setBrut] = useState<{ id: number; body: string | null; extrait: unknown } | null>(null);
	const [brutErreur, setBrutErreur] = useState<string | null>(null);
	const afficherBrut = useCallback(async (id: number) => {
		if (brut?.id === id) return;
		setBrutErreur(null);
		try {
			const donnees = await api.quarantineRaw(id);
			setBrut({ id, body: donnees.rawBody, extrait: donnees.extracted });
		} catch (e) {
			setBrutErreur((e as Error).message);
		}
	}, [brut]);
	const listRef = useRef<HTMLDivElement>(null);
	const reasonRef = useRef<HTMLInputElement>(null);

	const load = useCallback(() => {
		if (!server) return;
		const controller = new AbortController();
		setLoading(true);
		setError(null);
		api.reviewQueue({ bucket, source, status, q: query, page, limit: 50 }, controller.signal)
			.then((result) => {
				setData(result);
				setLoading(false);
				setActive((index) => Math.min(index, Math.max(0, result.rows.length - 1)));
			})
			.catch((err: Error & { status?: number }) => {
				if (err.name === "AbortError") return;
				if (err.status === 401) onUnauthorized();
				setError(err.message);
				setLoading(false);
			});
		return () => controller.abort();
	}, [server, bucket, source, status, query, page, onUnauthorized]);

	useEffect(() => load(), [load]);

	const reinitialiser = useCallback(() => {
		setBucket("");
		setSource("");
		setStatus("");
		setQuery("");
		setPage(0);
	}, []);

	useEffect(() => {
		if (rejecting) reasonRef.current?.focus();
	}, [rejecting]);

	const rows = useMemo(() => data?.rows ?? [], [data]);
	const current: ReviewRow | null = rows[active] ?? null;

	const act = useCallback(async (action: ReviewAction, ids: number[], motif?: string) => {
		if (!canWrite || ids.length === 0 || busy) return;
		setBusy(true);
		setError(null);
		try {
			const outcome = await api.reviewAction(ids, action, motif);
			const skipped = outcome.skipped.length ? ` · ${outcome.skipped.length} ignoré(s)` : "";
			const alerts = outcome.alerts ? ` · ${outcome.alerts} alerte(s)` : "";
			setToast({
				text: `${outcome.changed} fait(s) ${ACTION_LABEL[action]}${alerts}${skipped}`,
				undoable: action === "reject" || action === "review",
				ids,
			});
			setSelected(new Set());
			setRejecting(false);
			setReason("");
			load();
		} catch (err) {
			const e = err as Error & { status?: number };
			if (e.status === 401) onUnauthorized();
			setError(e.message);
		} finally {
			setBusy(false);
		}
	}, [canWrite, busy, load, onUnauthorized]);

	const keyState: ReviewKeyState = useMemo(() => ({
		count: rows.length,
		active,
		selected,
		ids: rows.map((row) => row.id),
		rejecting,
	}), [rows, active, selected, rejecting]);

	const targetIds = useCallback(() => reviewTargets(keyState), [keyState]);

	function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
		// Dans un champ de saisie, les lettres appartiennent au texte.
		const target = event.target as HTMLElement;
		if (target.tagName === "INPUT" || target.tagName === "SELECT" || target.tagName === "TEXTAREA") return;
		const intent = reviewIntent(event.key, event.shiftKey, keyState);
		if (intent.kind === "none") return;
		if (intent.kind !== "clear") event.preventDefault();
		switch (intent.kind) {
			case "move":
			case "toggle":
			case "selectAll":
			case "clear": {
				const next = reduceSelection(intent, keyState);
				setActive(next.active);
				setSelected(next.selected);
				break;
			}
			case "askReject":
				setRejecting(true);
				break;
			case "cancelReject":
				setRejecting(false);
				setReason("");
				break;
			case "act":
				void act(intent.action, intent.ids, intent.action === "review" ? "revu au clavier" : undefined);
				break;
		}
	}

	if (!server) {
		return (
			<section className="review">
				<h1>Revue</h1>
				<p className="review__state">
					La file de revue exige l'API : chaque décision est journalisée en base avec son auteur
					et son motif. Le mode démonstration ne simule pas de décisions.
				</p>
			</section>
		);
	}

	return (
		<section className="review" onKeyDown={onKeyDown} tabIndex={0} role="region" aria-label="File de revue">
			<header className="review__head">
				<Card variant="transparent" padding={0}>
					<h1>Revue</h1>
					<Badge label="quarantaine" className="review__badge" />
					<p className="review__tally">
						<b>{data?.counts.pending ?? 0}</b> en attente
						<span aria-hidden="true"> · </span>{data?.counts.reviewed ?? 0} revus
						<span aria-hidden="true"> · </span>{data?.counts.rejected ?? 0} rejetés
						<span aria-hidden="true"> · </span>{data?.counts.promoted ?? 0} promus
						{data ? <span className="review__timing"> · {data.tookMs} ms</span> : null}
					</p>
				</Card>
				<Card variant="transparent" padding={0} className="review__filters">
					<label className="sr-only" htmlFor="review-q">Filtrer la file</label>
					<input id="review-q" type="search" placeholder="Indice ou groupe…" value={query}
						onChange={(e) => { setQuery(e.target.value); setPage(0); }} />
					<label className="sr-only" htmlFor="review-bucket">Seau</label>
					<select id="review-bucket" value={bucket} onChange={(e) => { setBucket(e.target.value); setPage(0); }}>
						<option value="">Tous les seaux</option>
						{(data?.facets.bucket ?? []).map((facet) => (
							<option key={facet.value} value={facet.value}>
								{BUCKET_LABEL[facet.value] ?? facet.value} ({facet.count})
							</option>
						))}
					</select>
					<label className="sr-only" htmlFor="review-status">Statut</label>
					<select id="review-status" value={status} onChange={(e) => { setStatus(e.target.value); setPage(0); }}>
						<option value="">En attente et revus</option>
						<option value="pending">En attente</option>
						<option value="reviewed">Revus</option>
						<option value="rejected">Rejetés</option>
					</select>
					<label className="sr-only" htmlFor="review-source">Source</label>
					<select id="review-source" value={source} onChange={(e) => { setSource(e.target.value); setPage(0); }}>
						<option value="">Toutes sources</option>
						{(data?.facets.source ?? []).map((facet) => (
							<option key={facet.value} value={facet.value}>{facet.value} ({facet.count})</option>
						))}
					</select>
				</Card>
			</header>

			{data?.truncated ? (
				<p className="review__truncated" role="status">
					La file porte sur les {data.window} faits les plus récents. Filtrez pour atteindre le reste du stock.
				</p>
			) : null}

			<p className="review__intro">
				Chaque ligne est une revendication brute, telle que publiée par sa source. Rien n'est
				rattaché automatiquement : la revue décide si le fait entre au dossier. Les seaux
				classent par probabilité d'appartenance à la région — « froid » signifie « conservé,
				mais hors file ».
			</p>

			{error ? <p className="review__error" role="alert">{error}</p> : null}

			<Card variant="transparent" padding={0} className="review__bar">
				<span className="review__selection">
					{selected.size > 0 ? `${selected.size} coché(s)` : current ? "fait courant" : "aucun fait"}
				</span>
				{rejecting ? (
					<form className="review__reason" onSubmit={(e) => { e.preventDefault(); if (reason.trim()) void act("reject", targetIds(), reason.trim()); }}>
						<label className="sr-only" htmlFor="review-motif">Motif du rejet</label>
						<input id="review-motif" ref={reasonRef} value={reason} onChange={(e) => setReason(e.target.value)}
							onKeyDown={(e) => { if (e.key === "Escape") { setRejecting(false); setReason(""); } }}
							placeholder="Motif du rejet (obligatoire)" />
						<button type="submit" disabled={!reason.trim() || busy}>Confirmer</button>
						<button type="button" onClick={() => { setRejecting(false); setReason(""); }}>Annuler</button>
					</form>
				) : (
					<Card variant="transparent" padding={0} className="review__actions">
						<button type="button" onClick={() => void act("promote", targetIds())} disabled={!canWrite || busy || targetIds().length === 0}>
							Promouvoir <kbd>P</kbd>
						</button>
						<button type="button" onClick={() => setRejecting(true)} disabled={!canWrite || busy || targetIds().length === 0}>
							Rejeter <kbd>R</kbd>
						</button>
						<button type="button" onClick={() => void act("review", targetIds(), "revu au clavier")} disabled={!canWrite || busy || targetIds().length === 0}>
							Marquer revu <kbd>M</kbd>
						</button>
						<button type="button" onClick={() => void act("undo", targetIds())} disabled={!canWrite || busy || targetIds().length === 0}>
							Annuler la décision <kbd>U</kbd>
						</button>
					</Card>
				)}
			</Card>

			{!canWrite ? <p className="review__state">Lecture seule : connectez-vous pour décider.</p> : null}

			<Card variant="transparent" padding={0} className="review__body">
				<Card variant="transparent" padding={0} className="review__list" ref={listRef} role="listbox" aria-label="Faits à revoir">
					{loading && rows.length === 0 ? (
						<LoadingSkeleton label="Chargement de la file…" />
					) : rows.length === 0 ? (
						<EmptyState
							message="Aucun fait ne correspond. Élargissez les filtres."
							actionLabel="Effacer les filtres"
							onAction={reinitialiser}
						/>
					) : rows.map((row, index) => (
						<Card
							variant="transparent"
							padding={0}
							key={row.id}
							role="option"
							aria-selected={index === active}
							className="review__item"
							data-active={index === active}
							data-bucket={row.triage.bucket}
							onClick={() => setActive(index)}
						>
							<input
								type="checkbox"
								checked={selected.has(row.id)}
								onChange={() => setSelected((prev) => {
									const next = new Set(prev);
									if (next.has(row.id)) next.delete(row.id);
									else next.add(row.id);
									return next;
								})}
								onClick={(e) => e.stopPropagation()}
								aria-label={`Cocher le fait ${row.id}`}
							/>
							<span className="review__score">{row.triage.score}</span>
							<span className="review__hint">{row.orgHint || "(sans indice)"}</span>
							<span className="review__meta">
								{row.groupe ?? "groupe inconnu"} · {shortDate(row.claimedAt)}
							</span>
							{row.triage.referentialGap ? <span className="review__flag" data-kind="gap">référentiel</span> : null}
							{row.triage.disagreement ? <span className="review__flag" data-kind="conflict">désaccord</span> : null}
							{row.org ? <span className="review__flag" data-kind="org">{row.org.name}</span> : null}
						</Card>
					))}
				</Card>

				<aside className="review__detail" aria-label="Détail du fait">
					{current === null ? (
						<p className="review__state" role="status" aria-live="polite">Sélectionnez un fait.</p>
					) : (
						<>
							<h2>{current.orgHint || "(sans indice)"}</h2>
							<p className="review__prov">
								<span className="review__tlp" data-tlp={current.tlp}>TLP:{current.tlp}</span>
								{current.source} · {current.groupe ?? "groupe inconnu"} · revendiqué le {shortDate(current.claimedAt)}
							</p>
							<p className="review__prov">
								Entré dans la file le {shortDate(current.receivedAt)} · statut {current.status}
								{current.hasDescription ? " · description disponible" : " · pas de description"}
							</p>
							<p className="review__suggest">
								Suggestion : <b>{SUGGESTION_LABEL[current.triage.suggested]}</b>
								<span className="review__bucket" data-bucket={current.triage.bucket}>
									{BUCKET_LABEL[current.triage.bucket]} · {current.triage.score}
								</span>
							</p>

							{current.org ? (
								<p className="review__org">
									Rattaché à{" "}
									<button type="button" onClick={() => onOpenOrg(current.org!.id)}>{current.org.name}</button>
									{current.orgConfidence !== null ? ` (confiance ${current.orgConfidence.toFixed(2)})` : ""}
								</p>
							) : (
								<p className="review__org review__org--none">Aucune organisation du référentiel ne correspond.</p>
							)}

							{current.triage.referentialGap ? (
								<p className="review__gap">
									Indice français sans organisation connue : c'est un trou du référentiel, pas
									nécessairement du bruit. Envisagez d'ajouter l'entité plutôt que de rejeter.
								</p>
							) : null}

							<h3>Pourquoi ce score</h3>
							<ul className="review__reasons">
								{current.triage.reasons.map((reasonItem, index) => (
									<li key={index}>
										<span className="review__weight" data-sign={reasonItem.weight > 0 ? "plus" : reasonItem.weight < 0 ? "minus" : "zero"}>
											{reasonItem.weight > 0 ? "+" : ""}{reasonItem.weight}
										</span>
										{reasonItem.label}
									</li>
								))}
							</ul>

							{current.review.length > 0 ? (
								<>
									<h3>Journal de revue</h3>
									<ul className="review__journal">
										{current.review.map((entry, index) => (
											<li key={index}>
												<span className="review__mono">{entry.at.slice(0, 16).replace("T", " ")}</span>
												{" "}{entry.by} — {entry.action}{entry.reason ? ` : ${entry.reason}` : ""}
											</li>
										))}
									</ul>
								</>
							) : null}

							<p className="review__source">
								<a href={current.sourceUrl} target="_blank" rel="noreferrer noopener">provenance</a>
								{" · "}
								<button type="button" onClick={() => { void afficherBrut(current.id); }}>
									{brut?.id === current.id ? "Brut chargé" : "Afficher le brut"}
								</button>
							</p>
							{brutErreur ? <p className="review__error" role="alert">{brutErreur}</p> : null}
							{brut?.id === current.id ? (
								<Card variant="transparent" padding={0} className="review__raw" data-raw="level-4">
									<pre>{brut.body ?? "(aucun corps brut)"}</pre>
									<pre>{JSON.stringify(brut.extrait, null, 2)}</pre>
								</Card>
							) : null}
						</>
					)}
				</aside>
			</Card>

			<footer className="review__foot">
				<span className="review__hint">J/K parcourir · X cocher · Maj+A tout cocher · P/R/M/U décider · Échap désélectionner</span>
				<Card variant="transparent" padding={0} className="review__pager">
					<button type="button" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0}>Précédent</button>
					<span className="review__mono">{page + 1} / {Math.max(1, Math.ceil((data?.total ?? 0) / 50))}</span>
					<button type="button" onClick={() => setPage((p) => p + 1)} disabled={(page + 1) * 50 >= (data?.total ?? 0)}>Suivant</button>
				</Card>
			</footer>

			{toast ? (
				<Card variant="transparent" padding={0} className="review__toast" role="status">
					{toast.text}
					{toast.undoable ? (
						<button type="button" onClick={() => { void act("undo", toast.ids); setToast(null); }}>Annuler</button>
					) : null}
					<button type="button" onClick={() => setToast(null)} aria-label="Fermer">×</button>
				</Card>
			) : null}
		</section>
	);
}
