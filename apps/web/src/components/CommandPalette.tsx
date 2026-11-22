import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api";
import type { CommandPaletteProps, SearchHit } from "../contracts";
import { EmptyState, LoadingSkeleton } from "./Skeleton";
import { keepFocusInDialog } from "../a11y/dialog-focus";
import "./palette.css";

/**
 * Recherche globale (⌘K / Ctrl+K) — organisations, événements, indicateurs.
 *
 * Elle interroge `GET /api/search` (anonyme, 3 caractères minimum) avec un
 * debounce de 180 ms et annule la requête précédente : on ne veut pas qu'une
 * réponse en retard remplace la frappe en cours. En mode démonstration, la
 * recherche est locale, sur les données simulées.
 *
 * Accessibilité : rôle combobox/listbox, focus rendu à l'ouverture, flèches
 * pour parcourir, Entrée pour ouvrir, Échap pour fermer. Le focus reste dans
 * le dialogue tant qu'il est ouvert (Tab circule entre ses contrôles).
 */

const DEBOUNCE_MS = 180;
const MIN_QUERY = 3;

export default function CommandPalette({ open, onClose, onOpenOrg, onOpenEvent, mock }: CommandPaletteProps) {
	const [query, setQuery] = useState("");
	const [hits, setHits] = useState<SearchHit[]>([]);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [active, setActive] = useState(0);
	const inputRef = useRef<HTMLInputElement>(null);
	const listRef = useRef<HTMLUListElement>(null);

	useEffect(() => {
		if (open) {
			setActive(0);
			// le focus suit l'ouverture, pas la frappe
			inputRef.current?.focus();
		} else {
			setQuery("");
			setHits([]);
			setError(null);
		}
	}, [open]);

	const localHits = useMemo<SearchHit[]>(() => {
		if (!mock) return [];
		const q = query.trim().toLowerCase();
		if (q.length < MIN_QUERY) return [];
		const out: SearchHit[] = [];
		for (const org of mock.orgs) {
			if (`${org.name} ${org.city ?? ""} ${org.dept ?? ""}`.toLowerCase().includes(q)) {
				out.push({
					kind: "org",
					id: org.id,
					label: org.name,
					detail: [org.kind, org.city, org.dept].filter(Boolean).join(" · "),
				});
			}
		}
		for (const event of mock.events) {
			if (event.title.toLowerCase().includes(q)) {
				out.push({ kind: "event", id: event.id, label: event.title, detail: `${event.family} · ${event.sourceId}` });
			}
		}
		return out.slice(0, 20);
	}, [mock, query]);

	useEffect(() => {
		if (!open || mock) return;
		const q = query.trim();
		if (q.length < MIN_QUERY) {
			setHits([]);
			setLoading(false);
			setError(null);
			return;
		}
		let cancelled = false;
		setLoading(true);
		const timer = setTimeout(() => {
			api
				.search(q)
				.then((res) => {
					if (cancelled) return;
					const next: SearchHit[] = [
						...res.orgs.map((o) => ({
							kind: "org" as const,
							id: o.id,
							label: o.name,
							detail: [o.kind, o.city, o.dept, o.domain].filter(Boolean).join(" · "),
						})),
						...res.events.map((e) => ({
							kind: "event" as const,
							id: e.id,
							label: e.title,
							detail: `${e.family} · ${e.sourceId}`,
						})),
						...res.indicators.map((i) => ({
							kind: "indicator" as const,
							id: i.id,
							label: i.value,
							detail: `${i.type} · ${i.sourceId} · ${i.tlp}`,
						})),
					];
					setHits(next);
					setActive(0);
					setError(null);
				})
				.catch((err: unknown) => {
					if (!cancelled) setError(err instanceof Error ? err.message : "Recherche indisponible");
				})
				.finally(() => {
					if (!cancelled) setLoading(false);
				});
		}, DEBOUNCE_MS);
		return () => {
			cancelled = true;
			clearTimeout(timer);
		};
	}, [open, query, mock]);

	const results = mock ? localHits : hits;

	useEffect(() => {
		const node = listRef.current?.querySelector<HTMLLIElement>('[data-active="true"]');
		node?.scrollIntoView({ block: "nearest" });
	}, [active, results]);

	if (!open) return null;

	function choose(hit: SearchHit) {
		if (hit.kind === "org") onOpenOrg(hit.id);
		else if (hit.kind === "event") onOpenEvent(hit.id);
		else return; // les indicateurs n'ont pas encore de fiche : pas de faux clic
		onClose();
	}


	function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
		keepFocusInDialog(event);
		if (event.key === "Escape") {
			event.preventDefault();
			onClose();
		} else if (event.key === "ArrowDown") {
			event.preventDefault();
			setActive((i) => Math.min(i + 1, results.length - 1));
		} else if (event.key === "ArrowUp") {
			event.preventDefault();
			setActive((i) => Math.max(i - 1, 0));
		} else if (event.key === "Enter") {
			const hit = results[active];
			if (hit) {
				event.preventDefault();
				choose(hit);
			}
		}
	}

	const hint =
		query.trim().length < MIN_QUERY
			? `Saisissez au moins ${MIN_QUERY} caractères.`
			: loading
				? "Recherche…"
				: error
					? error
					: results.length === 0
						? "Aucun résultat."
						: `${results.length} résultat${results.length > 1 ? "s" : ""}`;

	return (
		<div className="palette__scrim" onClick={onClose}>
			<div
				className="palette"
				role="dialog"
				aria-modal="true"
				aria-label="Recherche globale"
				onClick={(e) => e.stopPropagation()}
				onKeyDown={onKeyDown}
			>
				<input
					ref={inputRef}
					className="palette__input"
					type="text"
					role="combobox"
					aria-expanded={results.length > 0}
					aria-controls="palette-list"
					aria-activedescendant={results[active] ? `palette-hit-${active}` : undefined}
					aria-label="Global search"
					value={query}
					onChange={(e) => setQuery(e.target.value)}
				/>
				<p className="palette__hint" role="status">{hint}</p>
				{loading && query.trim().length >= MIN_QUERY ? <LoadingSkeleton label="Recherche…" /> : null}
				{results.length > 0 ? (
					<ul className="palette__list" id="palette-list" role="listbox" ref={listRef} aria-label="Résultats">
						{results.map((hit, i) => (
							<li
								key={`${hit.kind}-${hit.id}`}
								id={`palette-hit-${i}`}
								role="option"
								aria-selected={i === active}
								data-active={i === active}
								data-kind={hit.kind}
								onMouseEnter={() => setActive(i)}
								onClick={() => choose(hit)}
							>
								<span className="palette__tag">{hit.kind === "org" ? "org" : hit.kind === "event" ? "événement" : "indicateur"}</span>
								<span className="palette__label">{hit.label}</span>
								<span className="palette__detail">{hit.detail}</span>
							</li>
						))}
					</ul>
				) : null}
				{!loading && !error && query.trim().length >= MIN_QUERY && results.length === 0 ? (
					<EmptyState
						message="Aucun résultat."
						actionLabel="Effacer la recherche"
						onAction={() => setQuery("")}
					/>
				) : null}
				<footer className="palette__foot">↑ ↓ parcourir · Entrée ouvrir · Échap fermer</footer>
			</div>
		</div>
	);
}
