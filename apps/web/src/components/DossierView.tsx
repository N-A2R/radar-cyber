import { useEffect, useState, type ReactNode } from "react";
import { api } from "../api";
import { EmptyState, LoadingSkeleton } from "./Skeleton";
import "./dossier.css";

type DossierPayload = {
	etat: {
		organisations: number;
		sources: number;
		sourcesActives: number;
		sourcesMuettes: number;
		evenements: number;
		evenements30j: number;
		indicateurs: number;
		alertes: number;
		journalEvenements: number;
		archives: number;
		regles: number;
		migrations: number;
		derniereMigration: string | null;
		domainesConnus: number;
	};
	dossier: {
		genere: string;
		sections: { cle: string; titre: string; points: string[] }[];
	};
};

export default function DossierView() {
	const [data, setData] = useState<DossierPayload | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [loading, setLoading] = useState(true);
	const [reloadSignal, setReloadSignal] = useState(0);
	useEffect(() => {
		let cancelled = false;
		api
			.dossier()
			.then((d) => {
				if (!cancelled) {
					setData(d as unknown as DossierPayload);
					setLoading(false);
				}
			})
			.catch((e: Error) => {
				if (!cancelled) {
					setError(e.message);
					setLoading(false);
				}
			});
		return () => {
			cancelled = true;
		};
	}, [reloadSignal]);

	if (loading) return <section className="dossier"><LoadingSkeleton label="chargement du dossier…" /></section>;
	if (error) return <section className="dossier"><p className="dossier__status dossier__status--error">{error}</p></section>;
	if (!data) return null;

	return (
		<section className="dossier" aria-label="Dossier de reprise">
			<header className="dossier__head">
				<h1>Dossier de reprise</h1>
				<p className="dossier__meta">
					Généré le {new Date(data.dossier.genere).toLocaleString("fr-FR")} — {data.etat.organisations.toLocaleString("fr-FR")} organisations, {data.etat.sources} sources, {data.etat.journalEvenements} faits au journal, {data.etat.migrations} migrations
					{data.etat.derniereMigration ? ` · dernière ${data.etat.derniereMigration}` : ""}
				</p>
				<p className="dossier__hint">Chaque chiffre vient d’une requête ; ce qui n’est pas mesuré est écrit « non mesuré ». Source : <code>GET /api/dossier</code> — <code>scripts/dossier-reprise.mts</code></p>
			</header>

			{data.dossier.sections.map((s) => (
				<section key={s.cle} className="dossier__section" aria-label={s.titre}>
					<h2 className="dossier__title">{s.titre}</h2>
					<ul className="dossier__list">
						{s.points.map((p, i) => (
							<li key={i}>{renderInline(p)}</li>
						))}
					</ul>
				</section>
			))}

			{data.dossier.sections.length === 0 ? (
				<EmptyState
					message="Aucune section dans le dossier de reprise."
					actionLabel="Recharger le dossier"
					onAction={() => setReloadSignal((n) => n + 1)}
				/>
			) : null}

			<section className="dossier__section">
				<h2 className="dossier__title">État chiffré (JSON)</h2>
				<pre className="dossier__json">{JSON.stringify(data.etat, null, 2)}</pre>
			</section>
		</section>
	);
}

function renderInline(text: string): ReactNode {
	// Le dossier arrive en markdown inline (`**gras**`, `` `code` ``) et certains
	// passages contiennent déjà du `<b>`. La chaîne précédente échappait tout
	// puis ré-ouvrait ses propres balises : le moindre `<` du texte ressortait
	// affiché tel quel. On construit des nœuds React, il n'y a plus d'HTML
	// injecté du tout.
	const motif = /\*\*(.+?)\*\*|`([^`]+)`|<b>(.+?)<\/b>/g;
	const noeuds: ReactNode[] = [];
	let dernier = 0;
	let m: RegExpExecArray | null;
	let cle = 0;
	while ((m = motif.exec(text)) !== null) {
		if (m.index > dernier) noeuds.push(text.slice(dernier, m.index));
		if (m[1] !== undefined) noeuds.push(<strong key={cle++}>{m[1]}</strong>);
		else if (m[2] !== undefined) noeuds.push(<code key={cle++}>{m[2]}</code>);
		else noeuds.push(<strong key={cle++}>{m[3]}</strong>);
		dernier = motif.lastIndex;
	}
	if (dernier < text.length) noeuds.push(text.slice(dernier));
	return noeuds;
}
