import { useEffect, useState } from "react";
import { api } from "../api";
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
	}, []);

	if (loading) return <section className="dossier"><p className="dossier__status">chargement du dossier…</p></section>;
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
							<li key={i} dangerouslySetInnerHTML={{ __html: renderInline(p) }} />
						))}
					</ul>
				</section>
			))}

			<section className="dossier__section">
				<h2 className="dossier__title">État chiffré (JSON)</h2>
				<pre className="dossier__json">{JSON.stringify(data.etat, null, 2)}</pre>
			</section>
		</section>
	);
}

function renderInline(text: string): string {
	// Minimal markdown inline : **gras** → <b>, `code` → <code>
	return text
		.replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")
		.replace(/`(.+?)`/g, "<code>$1</code>")
		.replace(/</g, "&lt;") // will be undone for our tags, so do careful
		.replace(/&lt;b&gt;/g, "<b>")
		.replace(/&lt;\/b&gt;/g, "</b>")
		.replace(/&lt;code&gt;/g, "<code>")
		.replace(/&lt;\/code&gt;/g, "</code>");
}
