# Couverture « banque-assurance » — Vienne (86)

Mesure du 2026-11-22. Objectif : au moins 5 sources vérifiées en HTTP 200 pour le couple secteur `banque-assurance` / département `86`.

## Résultat

- **22 sources intégrées** (`bench/corpus/sources-banque-assurance-86.jsonl`, une ligne JSON par source).
- **66 contrôles HTTP** (sites, pages d'actualités et flux), soit **66 URL uniques** : **66 réponses HTTP 200**, aucune URL en échec retenue.
- 22 lignes `source` et 66 lignes `source_verification` créées en base par `db/migrate-066-sources-banque-assurance-86.sql`, toutes avec `department = '86'` et `region = 'Nouvelle-Aquitaine'`.
- Preuve HTTP détaillée : `bench/results/verification-banque-assurance-86.json`.

OBJECTIF : atteint — 22 / 5

| Organisation | Type | Page actualités | Flux |
|---|---|---|---|
| Mutuelle de Poitiers Assurances — siège de Ligugé (86) | compagnie d'assurance mutuelle | https://www.assurance-mutuelle-poitiers.fr/offres-actualites | Google Actualités « requête ciblée » |
| Crédit Agricole Touraine Poitou — agences de la Vienne | banque régionale | https://www.credit-agricole.fr/ca-tourainepoitou/particulier/conseils/magazine/tout-un-mag.html | Google Actualités « requête ciblée » |
| CPAM de la Vienne — Assurance Maladie | organisme de protection sociale | https://www.ameli.fr/vienne/assure/actualites | Google Actualités « requête ciblée » |
| France Assureurs | fédération professionnelle | https://www.franceassureurs.fr/actualites/ | https://www.franceassureurs.fr/feed/ |
| ORIAS — registre des intermédiaires en assurance, banque et finance | registre professionnel | https://www.orias.fr/home/communications | Google Actualités « requête ciblée » |
| Caisse d'Épargne Loire Centre — Vienne (86) | banque régionale | https://www.caisse-epargne.fr/votre-banque/actualites/ | Google Actualités « requête ciblée » |
| Banque Populaire Grand Ouest (Poitiers/Vienne) | banque coopérative régionale | https://www.banquepopulaire.fr/bpgo/votre-banque/actualites/ | Google Actualités « requête ciblée » |
| MSA Poitou (Vienne et Deux-Sèvres) | mutuelle sociale agricole | https://poitou.msa.fr/lfp/actualites-employeur | Google Actualités « requête ciblée » |
| Groupama Centre-Atlantique (Vienne) | mutuelle d'assurance régionale | https://www.groupama.fr/regions/centre-atlantique/actualites/ | Google Actualités « requête ciblée » |
| Harmonie Mutuelle (agence de Poitiers-Biard, Vienne) | mutuelle santé et prévoyance | https://www.harmonie-mutuelle.fr/marque/actualites | Google Actualités « requête ciblée » |
| Fédération bancaire française (FBF) | fédération professionnelle | https://fbf.fr/fr/rubrique-newsroom/actualites/ | Google Actualités « requête ciblée » |
| CNCGP | chambre professionnelle | https://www.cncgp.fr/actualites | Google Actualités « requête ciblée » |
| CCI de la Vienne | chambre consulaire | https://www.poitiers.cci.fr/actualites/ | https://www.poitiers.cci.fr/actualites/feed/ |
| MEDEF Vienne | organisation patronale | https://www.medef-vienne.fr/actualite-de-lentreprise/ | https://www.medef-vienne.fr/feed/ |
| Chambre d’agriculture de la Vienne | chambre consulaire | https://vienne.chambres-agriculture.fr/actualites-1 | Google Actualités « requête ciblée » |
| ListePRO | annuaire professionnel | https://listepro.fr/blog/ | https://listepro.fr/feed/ |
| France 3 Nouvelle-Aquitaine / Vienne | télévision régionale / média public | https://france3-regions.franceinfo.fr/nouvelle-aquitaine/vienne | https://france3-regions.franceinfo.fr/nouvelle-aquitaine/vienne/rss |
| ICI Poitou | radio locale / média public (ex-France Bleu Poitou) | https://www.ici.fr/nouvelle-aquitaine/vienne-86 | https://www.ici.fr/rss/poitou/a-la-une.xml |
| Aquitaine Online – Poitou-Charentes | journal en ligne régional | https://www.aquitaineonline.com/actualites-en-aquitaine/poitou-charentes/ | https://www.aquitaineonline.com/actualites-en-aquitaine/poitou-charentes/feed/rss/ |
| Vienne Rurale / Caracterres | presse agricole départementale | https://www.caracterres.fr/vienne-rurale | https://www.caracterres.fr/rss.xml |
| Radio•REC (L’Écho des Choucas) | radio associative de Poitiers | https://radiorec.fr/lecho-des-choucas/ | https://radiorec.fr/feed/ |
| Poitiers.fr / Poitiers Mag | magazine municipal et actualités de la Ville | https://www.poitiers.fr/actualites | https://www.poitiers.fr/rss.xml |

## Exemples cyber observés

- Titre observé dans le flux : Almerys — plus de 15 millions de numéros de sécurité sociale et des centaines de mutuelles compromises (French Breaches)
- Titre observé dans le flux : Carte bancaire — votre banque fait-elle le nécessaire pour vous protéger de la fraude ? (MoneyVox)
- Titre observé dans le flux : Poitiers — ils escroquaient la CPAM avec de faux arrêts de travail, deux hommes condamnés (ici.fr)
- Cyberattaques : une deuxième ressource pour renforcer la résilience des TPE-PME (France Assureurs, 11/09/2026)
- Titre observé dans le flux : Usurpation d'identité — l'Orias simplifie les démarches pour les intermédiaires (L'Argus de l'assurance)
- Titre observé dans le flux : Arnaque au virement bancaire dans la Vienne — « les fraudeurs ont toujours un coup d'avance » (La Nouvelle République)
- 02/09/2025 (ZATAZ, 05/09/2025) : attaque DDoS revendiquée « OP France » contre Banque Populaire Grand Ouest, BNP Paribas, Crédit Agricole et RTE
- 26/06/2026 (actualité MSA Poitou) : « Alerte vigilance – Usurpation d'identité » — mails frauduleux avec RIB, invitant à vérifier la concordance avec l'espace privé
- 11/02/2025 (Faux.fr) : tentative d'escroquerie par mail usurpant l'identité de Groupama ; 5 noms de domaine litigieux transférés à Groupama après procédure UDRP OMPI D2023-1523
- 24-25/05/2026 : fuite de données chez Almerys (tiers payant), 15 millions d'assurés ; Harmonie Mutuelle publie un démenti officiel le 24/05/2026 (News Assurances Pro, 25/05/2026)

## Méthode et candidats écartés

Recherche web (annuaires professionnels, chambres consulaires, fédérations, organismes de protection sociale, presse locale), identification des pages d’actualités et des flux, puis contrôle GET de chaque URL avec User-Agent navigateur, suivi des redirections et délai maximal de 25 s. Seules les sources dont les trois URL ont répondu 200 ont été intégrées.

Écartés après vérification HTTP : ACPR (403 sur le site et les actualités avec l’UA imposé), La Nouvelle République — Vienne (403 sur les pages, seul le flux RSS répond 200), actu.fr Vienne (403), Poitiers.maville.com (401/403), RCF Poitou (403), Le7.info (aucun flux exploitable), ainsi que plusieurs URL de flux mortes en 404 (ex. `credit-agricole.fr/ca-tourainepoitou/actualites.html`, `cncgp.fr/feed`, `orias.fr/actualites`, `fbf.fr/fr/feed`). Les flux Google Actualités sont des requêtes ciblées « organisation + Vienne/86 » : leur contenu est agrégé, les pages d’actualités restant les sources primaires.
