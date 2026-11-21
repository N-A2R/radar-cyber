import type { CorpusViewProps } from "../contracts";
import { FAMILY_LABEL, formatNumber } from "./SourcesView";
import "./corpus.css";

/** Une barre compare les lignes entre elles, elle ne dit pas un pourcentage global. */
function largeur(part: number, max: number): string {
	return `${max > 0 ? Math.round((part / max) * 100) : 0}%`;
}

function taux(produites: number, total: number, pct: number | null): string {
	if (pct === null) return "—";
	const valeur = pct.toLocaleString("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
	return `${valeur} % · ${formatNumber(produites)} / ${formatNumber(total)}`;
}

/** Vue « corpus » : quatre états (chargement, erreur, vide, plein), chiffres serveur. */
export default function CorpusView({ data, loading, error, onRefresh }: CorpusViewProps) {
	if (!data && loading) {
		return (
			<section className="corpus" role="status" aria-live="polite">
				<h1 className="corpus__titre">Corpus</h1>
				<p className="corpus__attente">Chargement des statistiques du corpus…</p>
				<span className="corpus__squelette" />
				<span className="corpus__squelette" />
			</section>
		);
	}
	if (!data && error) {
		return (
			<section className="corpus" role="alert">
				<h1 className="corpus__titre">Corpus</h1>
				<p>Les statistiques n'ont pas pu être chargées : {error}</p>
				<button className="corpus__action" type="button" onClick={onRefresh}>réessayer</button>
			</section>
		);
	}
	if (!data) {
		return (
			<section className="corpus">
				<h1 className="corpus__titre">Corpus</h1>
				<p>Aucune statistique disponible.</p>
				<button className="corpus__action" type="button" onClick={onRefresh}>charger</button>
			</section>
		);
	}

	const maxFamille = Math.max(1, ...data.sourcesParFamille.map((f) => f.sources));
	const maxDept = Math.max(1, ...data.sourcesParDepartement.map((d) => d.sources));

	return (
		<section className="corpus" aria-labelledby="corpus-titre">
			<header className="corpus__tete">
				<div>
					<h1 className="corpus__titre" id="corpus-titre">Corpus</h1>
					<p className="corpus__intro">Ce que le radar a collecté : organisations identifiées, incidents établis et rendement des sources.</p>
				</div>
				<button className="corpus__action" type="button" onClick={onRefresh} disabled={loading}>
					{loading ? "actualisation…" : "actualiser"}
				</button>
			</header>

			{error ? <p className="corpus__alerte" role="alert">Chiffres périmés : {error}</p> : null}

			<dl className="corpus__chiffres">
				<div className="corpus__chiffre">
					<dt>organisations avec domaine</dt>
					<dd>{formatNumber(data.organisationsAvecDomaine)}</dd>
				</div>
				<div className="corpus__chiffre">
					<dt>incidents du corpus</dt>
					<dd>{formatNumber(data.incidentsCorpus)}</dd>
				</div>
				<div className="corpus__chiffre">
					<dt>sources productives</dt>
					<dd>{taux(data.sourcesProductives, data.sourcesTotales, data.tauxSourcesProductives)}</dd>
					<p className="corpus__detail">sur {data.windowDays} jours glissants</p>
				</div>
			</dl>

			<div className="corpus__grille">
				<section className="corpus__panneau" aria-labelledby="corpus-familles">
					<h2 className="corpus__sous-titre" id="corpus-familles">Sources par famille</h2>
					<table className="corpus__table">
						<thead>
							<tr><th scope="col">famille</th><th scope="col" className="corpus__num">sources</th></tr>
						</thead>
						<tbody>
							{data.sourcesParFamille.map((f) => (
								<tr key={f.family}>
									<td>
										<span className="corpus__libelle">{FAMILY_LABEL[f.family] ?? f.family}</span>
										<span className="corpus__barre"><span style={{ width: largeur(f.sources, maxFamille) }} /></span>
									</td>
									<td className="corpus__num">{formatNumber(f.sources)}</td>
								</tr>
							))}
						</tbody>
					</table>
					{data.sourcesParFamille.length === 0 ? <p className="corpus__vide">Aucune source déclarée.</p> : null}
				</section>

				<section className="corpus__panneau" aria-labelledby="corpus-departements">
					<h2 className="corpus__sous-titre" id="corpus-departements">Sources par département</h2>
					<table className="corpus__table">
						<thead>
							<tr><th scope="col">département</th><th scope="col" className="corpus__num">sources</th></tr>
						</thead>
						<tbody>
							{data.sourcesParDepartement.map((d) => (
								<tr key={d.departement}>
									<td>
										<span className="corpus__libelle">{d.departement}</span>
										<span className="corpus__barre"><span style={{ width: largeur(d.sources, maxDept) }} /></span>
									</td>
									<td className="corpus__num">{formatNumber(d.sources)}</td>
								</tr>
							))}
						</tbody>
					</table>
					{data.sourcesParDepartement.length === 0 ? <p className="corpus__vide">Aucun département renseigné.</p> : null}
				</section>
			</div>

			<p className="corpus__note">
				Les barres comparent les lignes entre elles. Le département d'une source est inféré de son nom,
				de son URL ou de son identifiant : une source sans indice exploitable ne compte dans aucun département.
				Un incident est un événement dont l'assertion est confirmée.
			</p>
		</section>
	);
}
