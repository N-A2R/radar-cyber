# Sources du secteur « numérique » — Corrèze (19)

## Résultat

**18 sources vérifiées en HTTP 200** pour le couple secteur `numerique` / département `19` (cible : au moins 5).

- Corpus : `bench/corpus/sources-numerique-19.jsonl` (18 lignes, champs `nom`, `type`, `secteur`, `departement`, `url_site`, `url_actualites`, `url_flux`, `code_http`, `exemple_cyber`).
- Preuve HTTP : `bench/results/verification-numerique-19.json` — 39 URL distinctes contrôlées, 39 en 200, plus 6 URL d'exemples cyber contrôlées, 6 en 200, le 2026-11-22 (GET réel, redirections suivies, délai 25 s, User-Agent navigateur).
- 12 flux RSS/Atom exploitables (dont 2 relais Google Actualités RSS pour des médias sans flux public direct).
- Empreinte du corpus : `580418c5f8475bc1adf83eda31e5fcced4b4e7eccf1281db5fb414fa24eab602` (`bench/corpus/HASH`).

## Organisations retenues

| Organisation | Type | Page actualités | Flux |
|---|---|---|---|
| Dorsal — service public du numérique en Limousin | syndicat mixte fibre (19, 23, 87) | https://www.dorsal.fr/actu-numerique-limousin/ | https://www.dorsal.fr/feed/ |
| Corrèze Numérique | portail public d'inclusion numérique | https://www.correzenumerique.fr/actualites | — |
| Département de la Corrèze — fibre et innovation | collectivité départementale | https://www.correze.fr/fibre | https://www.correze.fr/rss |
| NATHD | SPL du très haut débit en Nouvelle-Aquitaine | https://nathd.fr/ | https://nathd.fr/feed/ |
| Corrèze Centre de Supervision Rural | centre de supervision numérique (CD19) | https://www.supervision.correze.fr/ | — |
| CorrTech — Bains Douches Numériques (Tulle) | tiers-lieu de formation numérique | https://www.corrtech.fr/ | — |
| IUT du Limousin (Brive, Tulle) | institut universitaire (informatique) | https://www.iut.unilim.fr/tous-les-articles/ | https://www.iut.unilim.fr/feed/ |
| Sud Ouest — Corrèze | presse locale quotidienne | https://www.sudouest.fr/correze/ | https://www.sudouest.fr/correze/rss.xml |
| La Montagne — Corrèze | presse locale quotidienne | https://www.lamontagne.fr/correze/ | relais Google Actualités RSS |
| actu.fr — Corrèze | presse locale numérique | https://actu.fr/nouvelle-aquitaine/correze_19/ | relais Google Actualités RSS |
| ICI Corrèze (Radio France) | radio locale du service public | https://www.ici.fr/nouvelle-aquitaine/correze-19/actu | https://www.ici.fr/rss/limousin/rubrique/infos.xml |
| France 3 Nouvelle-Aquitaine — Corrèze | télévision locale du service public | https://france3-regions.franceinfo.fr/nouvelle-aquitaine/correze/ | https://france3-regions.franceinfo.fr/nouvelle-aquitaine/correze/rss |
| Cybermalveillance.gouv.fr | dispositif national de lutte contre la cybermalveillance | https://www.cybermalveillance.gouv.fr/blog | https://www.cybermalveillance.gouv.fr/feed/atom-flux-actualites |
| Numeum | syndicat professionnel du numérique | https://numeum.fr/les-actualites-numeum/ | https://numeum.fr/feed/ |
| La Vie Corrézienne | presse locale hebdomadaire | https://www.laviecorrezienne.fr/actualites-actualites.html | — |
| FAL19 — pôle numérique (Tulle) | fédération d'associations | https://fal19.fr/vie-associative/numerique | — |
| Les PTTs — cybercafé de Tarnac | association locale (médiation numérique) | https://lesptts.net/category/lesateliers/ | https://lesptts.net/feed/ |
| Annuaire MedNum19 | annuaire de la médiation numérique en Corrèze | https://mednum19.gogocarto.fr/ | — |

## Exemples cyber associés

Les exemples sont tirés de `bench/corpus/incidents-correze.jsonl` et des sites des organisations ; leurs URL ont été revérifiées en HTTP 200.

- Cyberattaque à la mairie de Sarran : 44 000 euros de budget perdus — [France 3](https://france3-regions.franceinfo.fr/nouvelle-aquitaine/correze/brive/j-en-ai-pleure-victime-d-une-cyberattaque-cette-mairie-perd-44-000-euros-de-son-budget-3174492.html).
- Collège La Salle de Brive : 8 000 euros de rançon et tous les bulletins perdus — [France 3](https://france3-regions.franceinfo.fr/nouvelle-aquitaine/correze/brive/le-montant-de-la-rancon-qui-etait-de-8-000-euros-ce-college-perd-tous-les-bulletins-des-eleves-apres-une-cyberattaque-3107128.html).
- Petites entreprises corréziennes victimes de cyberattaques : 50 à 60 commandes perdues — [France 3](https://france3-regions.franceinfo.fr/nouvelle-aquitaine/correze/brive/on-a-perdu-entre-50-et-60-commandes-les-petites-entreprises-victimes-de-cyberattaques-une-cible-privilegiee-pour-les-pirates-informatiques-3110353.html).
- À Altillac, Intermarché victime d'une cyberattaque — [La Montagne](https://www.lamontagne.fr/altillac-19120/actualites/a-altillac-en-correze-le-supermarche-intermarche-victime-dune-cyberattaque_15062828/).
- Le laboratoire Novabio victime de deux cyberattaques : données de santé en fuite — [Cyberattaque.org](https://www.cyberattaque.org/le-laboratoire-novabio-victime-de-deux-cyberattaques-des-donnees-de-sante-en-fuite/).
- Le cybercafé des PTTs fait peau neuve (Tarnac) — [Les PTTs](https://lesptts.net/cybercafe/).

## Limites observées

- Exa (MCP) a répondu 402 (crédits épuisés) : découverte via sites officiels, annuaires, corpus départementaux existants et Google Actualités RSS, puis contrôle HTTP direct de chaque URL retenue.
- La CCI de la Corrèze (`correze.cci.fr`) renvoie 403 sous Cloudflare : elle n'est pas comptée comme source vérifiée.
- Le flux `https://www.supervision.correze.fr/feed` répond 200 mais son canal est vide (0 item) : il n'est pas déclaré comme flux exploitable dans le corpus.
- `actu.fr` expose un flux `/nouvelle-aquitaine/correze_19/rss.xml` en 200 mais au canal vide ; un relais Google Actualités RSS ciblé est utilisé à la place.
OBJECTIF : atteint — 18 sources vérifiées HTTP 200 / 5 sources minimum
