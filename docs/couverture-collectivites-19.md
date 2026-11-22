# Couverture — sources « collectivites » de la Corrèze (19)

**Objectif : au moins 5 sources vérifiées en HTTP 200 pour le couple secteur/département.**
Résultat : **13 sources, 28 URLs toutes en HTTP 200** (dont 7 flux RSS/Atom) contrôlées le 2026-11-22.

## Sources retenues

| Organisation | Type | Site | Actualités | Flux |
| --- | --- | --- | --- | --- |
| Conseil départemental de la Corrèze | conseil départemental | https://www.correze.fr/ | https://www.correze.fr/la-correze-en-1-clic/actualites-en-direct | https://www.correze.fr/rss |
| Préfecture de la Corrèze | préfecture | https://www.correze.gouv.fr/ | https://www.correze.gouv.fr/Actualites/Toute-l-actualite | — |
| Ville de Brive-la-Gaillarde | commune | https://www.brive.fr/ | https://www.brive.fr/actualites | https://www.brive.fr/feed/ |
| Tulle agglo | intercommunalité | https://www.tulleagglo.fr/ | https://www.tulleagglo.fr/lagglo/actualites/ | https://www.tulleagglo.fr/feed/ |
| Agglomération du Bassin de Brive | intercommunalité | http://www.agglodebrive.fr/ | http://www.agglodebrive.fr/about/actualites/ | http://www.agglodebrive.fr/feed/ |
| Ville d'Égletons | commune | https://www.egletons.fr/ | https://www.egletons.fr/actualites/ | https://www.egletons.fr/feed/ |
| CC Ventadour–Égletons–Monédières | intercommunalité | https://www.cc-ventadour.fr/ | https://www.cc-ventadour.fr/communication/espace-pro-presse/ | https://www.cc-ventadour.fr/feed/ |
| Ville d'Ussel | commune | https://www.ussel.fr/ | https://www.ussel.fr/actualites | — |
| Ville de Tulle — Tulle Mag | commune | https://www.ville-tulle.fr/ | https://www.ville-tulle.fr/publications/tulle-mag | — |
| Brivemag | presse municipale | https://brivemag.brive.fr/ | https://brivemag.brive.fr/ | — |
| La Montagne — Corrèze | presse locale | https://www.lamontagne.fr/correze/ | https://www.lamontagne.fr/correze/ | — |
| ici Corrèze — Radio France | radio publique locale | https://www.ici.fr/nouvelle-aquitaine/correze-19 | https://www.ici.fr/nouvelle-aquitaine/correze-19 | — |
| actu.fr — Corrèze | presse locale | https://actu.fr/nouvelle-aquitaine/correze_19/ | https://actu.fr/nouvelle-aquitaine/correze_19/ | — |

## Exemples cyber associés

Le champ `exemple_cyber` s'appuie sur des événements corréziens déjà documentés dans `bench/corpus/incidents-correze.jsonl` : cyberattaque de la mairie de Sarran (20/06/2025, 44 000 euros de budget perdus), ransomware au collège La Salle de Brive (12/02/2025, 8 000 euros de rançon), attaque de l'Intermarché d'Altillac (13/10/2026), fuite de données du laboratoire Novabio (05/11/2026) et attaque visant des adhérents de la Fédération Française de Tir en Haute-Corrèze (21/11/2025).

## Candidats écartés

- **CCI Corrèze** (`www.correze.cci.fr`, page `/actualites`) : HTTP 403 ; non retenue malgré l'intérêt consulaire.
- **CMA Corrèze** (`correze.artisanat.fr`), **Chambre d'agriculture** (`correze.chambagri.fr`), **CDG 19** (`www.cdg19.fr`), **SDIS 19** (`www.sdis19.fr`) : NXDOMAIN ou connexion refusée.
- `www.correze.fr/actualites` et `/rss.xml` : 404 ; la page d'actualités est `/la-correze-en-1-clic/actualites-en-direct` et le flux `/rss`.
- `www.brive.fr/rss.xml` : 200 mais corps HTML ; le véritable flux est `/feed/`.
- `www.ville-tulle.fr/actualites` : 404 ; Tulle Mag (`/publications/tulle-mag`) sert de publication municipale.
- Flux RSS presse (`actu.fr`, `La Montagne`, `ici Corrèze`) : 403/404 ; seules les pages d'actualités ont été intégrées, sans URL de flux.

## Méthode et intégration

Recherche web (annuaires consulaires, sites officiels, intercommunalités, presse locale), identification des pages d'actualités et des flux, puis contrôle GET de chaque URL avec User-Agent navigateur, suivi des redirections et délai de 20 s. Les 28 URLs ont répondu 200 ; preuve détaillée dans `bench/results/verification-collectivites-19.json`.

Corpus : `bench/corpus/sources-collectivites-19.jsonl` (13 lignes, empreinte `bench/corpus/HASH` recalculée).
Base : `db/migrate-069-sources-collectivites-19.sql` insère 13 lignes dans `source` (parser pointant vers le corpus) et 28 traces `source_verification` en état `ok200`.
