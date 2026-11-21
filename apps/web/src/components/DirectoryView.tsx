import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { api, type DirectoryFacet, type DirectoryResponse, type DirectoryRow } from "../api";
import { DEFAULT_DIRECTORY, type DirectoryUrlState } from "../url-state";
import type { DirectoryProps } from "../contracts";
import "./directory.css";

/**
 * Annuaire des organisations — pagination, facettes et recherche côté serveur.
 *
 * Deux modes, un seul rendu :
 *  - **serveur** : l'API filtre, classe, pagine et compte. Le navigateur ne
 *    reçoit que la page affichée (12 Ko au lieu de 22 Mo à 100 000 orgs) ;
 *  - **local** (démonstration hors ligne) : les mêmes opérations en mémoire.
 *
 * Le rendu est virtualisé au-delà de 100 lignes : seules les lignes visibles
 * sont dans le DOM, ce qui garde le défilement fluide à 200 lignes par page.
 *
 * Accès clavier : un seul arrêt de tabulation, flèches pour parcourir, Entrée
 * ouvre la fiche, Échap efface la recherche. La ligne active est amenée dans
 * la vue quand on navigue au clavier.
 */

const KIND_LABEL: Record<string, string> = {
	sante: "Santé",
	collectivite: "Collectivité",
	entreprise: "Entreprise",
	enseignement: "Enseignement",
	recherche: "Recherche",
	operateur: "Opérateur",
	operateur_critique: "Opérateur critique",
};

const SECTOR_LABEL: Record<string, string> = {
	commune: "Commune",
	epci: "Intercommunalité",
	departement: "Département",
	region: "Région",
};

const REASON_LABEL: Record<string, string> = {
	exact: "exact",
	"exact-alias": "alias",
	prefix: "préfixe",
	"prefix-alias": "alias",
	tokens: "mots",
	substring: "partiel",
	fuzzy: "approximatif",
};

const COLUMNS = [
	{ id: "name", label: "Organisation", sortable: true },
	{ id: "kind", label: "Nature", sortable: false },
	{ id: "entityCode", label: "Identifiant", sortable: false },
	{ id: "city", label: "Commune", sortable: true },
	{ id: "dept", label: "Dépt", sortable: true },
	{ id: "eventCount", label: "Événements", sortable: true },
	{ id: "located", label: "Carte", sortable: false },
] as const;

const ROW_HEIGHT = 34;
const VIRTUALIZE_ABOVE = 100;
const SIZES = [25, 50, 100, 200];

function useDebounced<T>(value: T, delay: number): T {
	const [debounced, setDebounced] = useState(value);
	useEffect(() => {
		const timer = setTimeout(() => setDebounced(value), delay);
		return () => clearTimeout(timer);
	}, [value, delay]);
	return debounced;
}

function facetsOf(rows: readonly DirectoryRow[], pick: (row: DirectoryRow) => string | null): DirectoryFacet[] {
	const counts = new Map<string, number>();
	for (const row of rows) {
		const value = pick(row);
		if (!value) continue;
		counts.set(value, (counts.get(value) ?? 0) + 1);
	}
	return [...counts.entries()]
		.map(([value, count]) => ({ value, count }))
		.sort((a, b) => b.count - a.count || a.value.localeCompare(b.value, "fr"));
}

export default function DirectoryView({
	orgs,
	loading,
	error,
	onOpenOrg,
	server = false,
	urlState,
	onUrlStateChange,
	onCopyLink,
}: DirectoryProps) {
	const [query, setQuery] = useState(urlState?.q ?? "");
	const [kind, setKind] = useState<string | null>(urlState?.kind ?? null);
	const [sector, setSector] = useState<string | null>(urlState?.sector ?? null);
	const [dept, setDept] = useState<string | null>(urlState?.dept ?? null);
	const [withEvents, setWithEvents] = useState(urlState?.withEvents ?? false);
	const [withoutEvents, setWithoutEvents] = useState(urlState?.withoutEvents ?? false);
	const [sort, setSort] = useState(urlState?.sort ?? DEFAULT_DIRECTORY.sort);
	const [dir, setDir] = useState<"asc" | "desc">(urlState?.dir ?? DEFAULT_DIRECTORY.dir);
	const [page, setPage] = useState(urlState?.page ?? 0);
	const [size, setSize] = useState(urlState?.size ?? DEFAULT_DIRECTORY.size);
	const [activeRow, setActiveRow] = useState(0);

	const [remote, setRemote] = useState<DirectoryResponse | null>(null);
	const [remoteLoading, setRemoteLoading] = useState(server);
	const [remoteError, setRemoteError] = useState<string | null>(null);

	const debouncedQuery = useDebounced(query, 220);
	const scrollRef = useRef<HTMLDivElement>(null);

	// Remise à zéro de la page dès qu'un filtre change : rester page 12 d'un
	// résultat qui n'en compte plus que deux n'a pas de sens.
	const resetPage = useCallback(() => {
		setPage(0);
		setActiveRow(0);
	}, []);

	useEffect(() => {
		if (!server) return;
		const controller = new AbortController();
		setRemoteLoading(true);
		setRemoteError(null);
		api.directory(
			{
				q: debouncedQuery,
				kind,
				sector,
				dept,
				withEvents,
				withoutEvents,
				sort: sort || undefined,
				dir,
				page,
				limit: size,
			},
			controller.signal,
		)
			.then((result) => {
				setRemote(result);
				setRemoteLoading(false);
			})
			.catch((err: Error) => {
				if (err.name === "AbortError") return;
				setRemoteError(err.message);
				setRemoteLoading(false);
			});
		return () => controller.abort();
	}, [server, debouncedQuery, kind, sector, dept, withEvents, withoutEvents, sort, dir, page, size]);

	// L'URL suit l'état : un lien se copie et se partage tel quel.
	useEffect(() => {
		onUrlStateChange?.({
			q: query, kind, sector, dept, withEvents, withoutEvents, sort, dir, page, size,
		});
	}, [onUrlStateChange, query, kind, sector, dept, withEvents, withoutEvents, sort, dir, page, size]);

	// Et l'état suit l'URL : le bouton retour et un lien collé doivent
	// réellement changer la liste, pas seulement la barre d'adresse.
	const urlKey = urlState
		? [urlState.q, urlState.kind, urlState.sector, urlState.dept, urlState.withEvents,
			urlState.withoutEvents, urlState.sort, urlState.dir, urlState.page, urlState.size].join("\u0000")
		: "";
	useEffect(() => {
		if (!urlState) return;
		setQuery(urlState.q);
		setKind(urlState.kind);
		setSector(urlState.sector);
		setDept(urlState.dept);
		setWithEvents(urlState.withEvents);
		setWithoutEvents(urlState.withoutEvents);
		setSort(urlState.sort);
		setDir(urlState.dir);
		setPage(urlState.page);
		setSize(urlState.size);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [urlKey]);

	const local = useMemo(() => {
		if (server) return null;
		const q = debouncedQuery.trim().toLowerCase();
		const filtered = orgs.filter((org) => {
			if (kind && org.kind !== kind) return false;
			if (sector && org.sector !== sector) return false;
			if (dept && org.dept !== dept) return false;
			if (withEvents && org.eventCount === 0) return false;
			if (withoutEvents && org.eventCount > 0) return false;
			if (q === "") return true;
			return [org.name, org.city ?? "", org.dept ?? "", org.kind, org.sector ?? ""]
				.join(" ").toLowerCase().includes(q);
		});
		const key = sort || DEFAULT_DIRECTORY.sort;
		const sorted = [...filtered].sort((a, b) => {
			const left = key === "eventCount" ? a.eventCount : String((a as unknown as Record<string, unknown>)[key] ?? "");
			const right = key === "eventCount" ? b.eventCount : String((b as unknown as Record<string, unknown>)[key] ?? "");
			const comparison = typeof left === "number" && typeof right === "number"
				? left - right
				: String(left).localeCompare(String(right), "fr");
			return dir === "desc" ? -comparison : comparison;
		});
		return {
			rows: sorted.slice(page * size, page * size + size) as DirectoryRow[],
			total: sorted.length,
			facets: {
				kind: facetsOf(orgs.filter((o) => (!sector || o.sector === sector) && (!dept || o.dept === dept)), (o) => o.kind),
				sector: facetsOf(orgs.filter((o) => (!kind || o.kind === kind) && (!dept || o.dept === dept)), (o) => o.sector ?? null),
				dept: facetsOf(orgs.filter((o) => (!kind || o.kind === kind) && (!sector || o.sector === sector)), (o) => o.dept ?? null),
			},
			truncated: false,
			tookMs: 0,
		};
	}, [server, orgs, debouncedQuery, kind, sector, dept, withEvents, withoutEvents, sort, dir, page, size]);

	const rows = server ? remote?.rows ?? [] : local?.rows ?? [];
	const total = server ? remote?.total ?? 0 : local?.total ?? 0;
	const facets = server ? remote?.facets : local?.facets;
	const truncated = server ? remote?.truncated ?? false : false;
	const busy = server ? remoteLoading : loading;
	const problem = server ? remoteError : error;
	const pageCount = Math.max(1, Math.ceil(total / size));

	const virtualized = rows.length > VIRTUALIZE_ABOVE;
	const virtualizer = useVirtualizer({
		count: rows.length,
		getScrollElement: () => scrollRef.current,
		estimateSize: () => ROW_HEIGHT,
		overscan: 8,
		enabled: virtualized,
		initialRect: { width: 1200, height: 600 },
	});

	function toggleSort(column: string) {
		if (sort === column) {
			setDir(dir === "asc" ? "desc" : "asc");
		} else {
			setSort(column);
			setDir(column === "eventCount" ? "desc" : "asc");
		}
		resetPage();
	}

	function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
		if (event.key === "ArrowDown") {
			event.preventDefault();
			setActiveRow((i) => {
				const next = Math.min(i + 1, rows.length - 1);
				if (virtualized) virtualizer.scrollToIndex(next, { align: "auto" });
				return next;
			});
		} else if (event.key === "ArrowUp") {
			event.preventDefault();
			setActiveRow((i) => {
				const next = Math.max(i - 1, 0);
				if (virtualized) virtualizer.scrollToIndex(next, { align: "auto" });
				return next;
			});
		} else if (event.key === "Enter") {
			const row = rows[activeRow];
			if (row) onOpenOrg(row.id);
		} else if (event.key === "Escape") {
			setQuery("");
			resetPage();
		}
	}

	const virtualItems = virtualizer.getVirtualItems();
	const paddingTop = virtualized && virtualItems.length ? virtualItems[0].start : 0;
	const paddingBottom = virtualized && virtualItems.length
		? virtualizer.getTotalSize() - virtualItems[virtualItems.length - 1].end
		: 0;
	const rendered = virtualized && virtualItems.length
		? virtualItems.map((item) => ({ row: rows[item.index], index: item.index }))
		: rows.map((row, index) => ({ row, index }));

	return (
		<section className="directory">
			<header className="directory__head">
				<div>
					<h1>Annuaire</h1>
					<p className="directory__tally">
						<b>{total.toLocaleString("fr-FR")}</b> organisation{total > 1 ? "s" : ""}
						{server ? null : <><span aria-hidden="true"> · </span>{orgs.length.toLocaleString("fr-FR")} au référentiel</>}
						{server && remote ? (
							<span className="directory__timing"> · {remote.tookMs} ms côté serveur</span>
						) : null}
					</p>
				</div>
				<div className="directory__search">
					<label className="sr-only" htmlFor="directory-q">Rechercher une organisation</label>
					<input
						id="directory-q"
						type="search"
						placeholder={server ? "Nom, alias, commune… (« mairie de … »)" : "Nom, commune, département…"}
						value={query}
						onChange={(e) => {
							setQuery(e.target.value);
							resetPage();
						}}
					/>
					{onCopyLink ? (
						<button type="button" className="directory__link" onClick={onCopyLink} title="Copier le lien de cette vue">
							copier le lien
						</button>
					) : null}
				</div>
			</header>

			<div className="directory__facets">
				<div className="directory__facet" role="group" aria-label="Filtrer par nature">
					<button type="button" aria-pressed={kind === null} onClick={() => { setKind(null); resetPage(); }}>Toutes</button>
					{(facets?.kind ?? []).map((facet) => (
						<button key={facet.value} type="button" aria-pressed={kind === facet.value}
							onClick={() => { setKind(kind === facet.value ? null : facet.value); resetPage(); }}>
							{KIND_LABEL[facet.value] ?? facet.value} <i>{facet.count}</i>
						</button>
					))}
				</div>
				<div className="directory__facet directory__facet--right">
					{(facets?.sector ?? []).length > 1 ? (
						<>
							<label className="sr-only" htmlFor="directory-sector">Échelon</label>
							<select id="directory-sector" value={sector ?? ""}
								onChange={(e) => { setSector(e.target.value || null); resetPage(); }}>
								<option value="">Tous échelons</option>
								{(facets?.sector ?? []).map((facet) => (
									<option key={facet.value} value={facet.value}>
										{SECTOR_LABEL[facet.value] ?? facet.value} ({facet.count})
									</option>
								))}
							</select>
						</>
					) : null}
					<label className="sr-only" htmlFor="directory-dept">Département</label>
					<select id="directory-dept" value={dept ?? ""}
						onChange={(e) => { setDept(e.target.value || null); resetPage(); }}>
						<option value="">Tous départements</option>
						{[...(facets?.dept ?? [])].sort((a, b) => a.value.localeCompare(b.value)).map((facet) => (
							<option key={facet.value} value={facet.value}>{facet.value} ({facet.count})</option>
						))}
					</select>
					<button type="button" aria-pressed={withEvents}
						onClick={() => { setWithEvents((v) => !v); setWithoutEvents(false); resetPage(); }}>
						Avec événements
					</button>
					<button type="button" aria-pressed={withoutEvents}
						onClick={() => { setWithoutEvents((v) => !v); setWithEvents(false); resetPage(); }}
						title="Les organisations du référentiel qu'aucune source n'a jamais citées">
						Jamais vues
					</button>
				</div>
			</div>

			{truncated ? (
				<p className="directory__truncated" role="status" aria-live="polite">
					Trop de candidats : le classement et les compteurs portent sur les premiers. Affinez la recherche.
				</p>
			) : null}

			{problem ? <p className="directory__error" role="alert" aria-live="assertive">{problem}</p> : null}

			{busy && rows.length === 0 ? (
				<p className="directory__state" role="status" aria-live="polite">Chargement du référentiel…</p>
			) : total === 0 ? (
				<p className="directory__state" role="status" aria-live="polite">
					Aucune organisation ne correspond. {query ? "Essayez un terme plus court." : "Élargissez les filtres."}
				</p>
			) : (
				<div
					className="directory__table"
					ref={scrollRef}
					tabIndex={0}
					onKeyDown={onKeyDown}
					role="region"
					aria-label="Tableau des organisations"
					data-busy={busy}
				>
					<table>
						<caption className="sr-only">
							Organisations du référentiel. Flèches pour parcourir, Entrée pour ouvrir la fiche.
						</caption>
						<thead>
							<tr>
								{COLUMNS.map((column) => {
									const active = sort === column.id;
									return (
										<th key={column.id}
											aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : "none"}>
											{column.sortable ? (
												<button type="button" className="directory__sort" onClick={() => toggleSort(column.id)}>
													{column.label}
													<span className="directory__arrow" aria-hidden="true">
														{active ? (dir === "asc" ? "▲" : "▼") : "·"}
													</span>
												</button>
											) : column.label}
										</th>
									);
								})}
							</tr>
						</thead>
						<tbody>
							{paddingTop > 0 ? <tr style={{ height: paddingTop }} aria-hidden="true"><td colSpan={COLUMNS.length} /></tr> : null}
							{rendered.map(({ row, index }) => (
								<tr
									key={row.id}
									data-active={index === activeRow}
									style={virtualized ? { height: ROW_HEIGHT } : undefined}
									onClick={() => { setActiveRow(index); onOpenOrg(row.id); }}
									onMouseEnter={() => setActiveRow(index)}
								>
									<td>
										<span className="directory__name">
											<span className="directory__bullet" data-kind={row.kind} aria-hidden="true" />
											{row.name}
										</span>
										{row.domain ? (
											<a
												className="directory__site"
												href={`https://${row.domain}`}
												target="_blank"
												rel="noreferrer noopener"
												onClick={(event) => event.stopPropagation()}
												title={`Ouvrir ${row.domain}`}
											>
												{row.domain}
											</a>
										) : null}
										{row.matchedAlias && row.matchedAlias !== row.name ? (
											<span className="directory__match">
												via « {row.matchedAlias} »
												{row.reason ? ` · ${REASON_LABEL[row.reason] ?? row.reason}` : ""}
											</span>
										) : row.reason === "fuzzy" ? (
											<span className="directory__match">correspondance approximative</span>
										) : null}
									</td>
									<td><span className="directory__kind">{KIND_LABEL[row.kind] ?? row.kind}</span></td>
									<td>
										{row.entityCode ? (
											<span className="directory__mono" title={`${row.entitySource ?? "identifiant"} ${row.entityCode}`}>
												{row.entityCode}
											</span>
										) : (
											<span className="directory__void">—</span>
										)}
									</td>
									<td>{row.city || <span className="directory__void">—</span>}</td>
									<td><span className="directory__mono">{row.dept || "—"}</span></td>
									<td><span className="directory__count" data-zero={row.eventCount === 0}>{row.eventCount}</span></td>
									<td>
										<span className="directory__flag" data-on={row.lat !== null && row.lon !== null}>
											{row.lat !== null && row.lon !== null ? "géolocalisée" : "non située"}
										</span>
									</td>
								</tr>
							))}
							{paddingBottom > 0 ? <tr style={{ height: paddingBottom }} aria-hidden="true"><td colSpan={COLUMNS.length} /></tr> : null}
						</tbody>
					</table>
				</div>
			)}

			<footer className="directory__foot">
				<span className="directory__hint">↑ ↓ parcourir · Entrée ouvrir la fiche · Échap effacer</span>
				<div className="directory__pager">
					<label className="sr-only" htmlFor="directory-size">Lignes par page</label>
					<select id="directory-size" value={size} onChange={(e) => { setSize(Number(e.target.value)); resetPage(); }}>
						{SIZES.map((value) => <option key={value} value={value}>{value} / page</option>)}
					</select>
					<button type="button" aria-label="Première page" onClick={() => setPage(0)} disabled={page === 0}>«</button>
					<button type="button" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0}>Précédent</button>
					<span className="directory__mono">{page + 1} / {pageCount}</span>
					<button type="button" onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))} disabled={page >= pageCount - 1}>Suivant</button>
					<button type="button" aria-label="Dernière page" onClick={() => setPage(pageCount - 1)} disabled={page >= pageCount - 1}>»</button>
				</div>
			</footer>
		</section>
	);
}
