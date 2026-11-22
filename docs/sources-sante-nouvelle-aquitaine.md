# Sources d'information — secteur santé en Nouvelle-Aquitaine

Vérifié le **2026-11-22**. Objectif : **au moins 20 sources vérifiées en HTTP 200** ; résultat : **35 sources**, toutes en 200.

## Protocole et mesure

- Corpus : `bench/corpus/sources-sante.jsonl` — une ligne par source avec `nom`, `type`, `secteur`, `url_site`, `url_actualites`, `url_flux`, `code_http`, `exemple_cyber`.
- Vérification : `npx tsx scripts/verifier-sources-sante.mts --strict` recharge chaque URL avec `curl -L`, user-agent navigateur, redirections suivies. Une source n'est retenue que si le site, la page d'actualités, le flux déclaré et l'article cité répondent **HTTP 200 final**.
- Rapport horodaté et brut : `bench/results/validation-sante-sources.json` — 118 URLs vérifiées, 35/35 retenues, 0 doublon, 0 morte, 0 rejet, 13 flux RSS.
- Intégration : `db/migrate-052-sources-sante.sql` insère les 35 sources dans la table `source` (13 en `rss`, 22 en `html`) avec le numéro de ligne du corpus dans `parser`.

## Couverture

| Famille | Sources |
|---|---:|
| CHU (Bordeaux, Poitiers, Limoges) | 3 |
| Centre hospitalier / hôpital public / SAMU | 7 |
| ARS, santé publique, EFS, GRADeS | 4 |
| Assurance maladie (CPAM, MSA, Carsat) | 6 |
| Cliniques et groupes hospitaliers privés | 3 |
| EHPAD et fédération du grand âge | 2 |
| Fédérations hospitalières | 1 |
| Ordres professionnels (médecins, sages-femmes, chirurgiens-dentistes, infirmiers, masseurs-kinésithérapeutes, pharmaciens) | 6 |
| Laboratoire, éditeur de logiciels de santé, santé au travail | 3 |

Chaque source porte un exemple d'article réel sur la cybersécurité, une panne ou une fraude. Exemples représentatifs :

- **CHU de Bordeaux** : Cyberattaques quotidiennes contre le CHU (France 3, 2021-02-17).
- **CHU de Limoges** : « Cybermois — Une vigilance partagée » (bulletin interne, 2025-12).
- **CH Nord Deux-Sèvres** : « Information aux patients — Incident de sécurité informatique ».
- **EFS Nouvelle-Aquitaine** : incident de cybersécurité chez un prestataire frigorifique (2026-11-03).
- **CPAM de la Gironde** : bilan 2025 de la lutte contre la fraude (2026-04-30).
- **Ordre national des pharmaciens** : « Cyberattaques : deux opérateurs de tiers payant visés » (2024-02-15).

Les sources sans exemple cyber vérifié (GCS Achats Nouvelle-Aquitaine, DomusVi, EHPAD de Montbron) ont été écartées du corpus.
