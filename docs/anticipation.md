# Anticipation — état des données à J-21 et recherche de signes précurseurs
> Document généré par `scripts/rapport-anticipation.mts` à partir du corpus de couverture (50 incidents) et de
> l'instantané `bench/anticipation/J-21.jsonl`. **Ne pas éditer à la main** : modifier une entrée
> puis relancer le script, sinon le contrôle `--verifier` échouera.
> Empreintes sha256 des entrées : corpus `fee9681c3869baffa645ac20b1679edb82c45597433185923734c4cdf0397c26` · instantané `bc0c78fc022aa349ce4658c921c7c2bb0b9505e37d30f90a2cc3771dcfccc46d`.
> Dernière date d'incident du corpus : 2026-10-14. Aucune donnée postérieure à chaque J-21 n'entre dans l'analyse.

## 1. La question posée

Pour chaque incident : **qu'est-ce qui, dans les données dont le radar disposait 21 jours avant,
aurait pu l'annoncer ?** La réponse « rien » est un résultat à part entière, publié tel quel.
Ce document ne mesure pas une capacité prédictive hypothétique ; il décrit un état de fait.

## 2. Méthode et définitions

- **Instantané** : pour chaque incident, la fenêtre [J-21 − 20 j, J-21] incluse, construite sur la
  date d'incident (ou la date de publication quand la première manque, signalé dans le dossier).
- **Borne temporelle** : la fenêtre est filtrée sur `event.valid_at` uniquement, avec borne haute
  exclusive à J-21 + 1 jour. Aucun événement dont `valid_at` est postérieur à J-21 n'entre dans
  l'instantané, même s'il a été collecté plus tôt ; `observed_at`, `collected_at` et `created_at`
  ne sont jamais utilisés comme critère de disponibilité.
- **Événements** : tous ceux de la fenêtre, avec leur nature (`ambient_signal`, `confirmed_incident`, `technical_indicator`, `third_party_claim`).
- **Sources actives** : sources ayant produit au moins un événement avant J-21, et encore activées.
  Une source qui répond mais ne produit rien n'est pas une source active au sens de cette mesure.
- **Organisations citées** : organisations rattachées à un événement de la fenêtre. Un rattachement
  n'est un signal que si son nom ou le titre de l'événement recoupe l'entité ; sinon c'est un bruit.
- **Ruptures détectées** : dérives calculées sur les seuls événements qui concernent l'entité
  (`rafale` : 3 événements d'une même famille en 7 jours ; `changement-nature` : 2 familles au moins).
  Le détecteur `nouvelle-organisation` n'est pas calculable ici : l'instantané ne porte pas la date
  de première apparition de l'organisation. Il n'est pas compté pour zéro, il est signalé
  comme non calculable. Aucune alerte n'est présente dans l'instantané ; une alerte créée après
  J-21 ne peut en aucun cas compter comme signe antérieur.
- **Signal retenu** : mention nominative (au moins deux jetons distincts, ou un jeton et un
  rattachement recoupé), indicateur technique ou revendication désignant l'entité.
- **Candidat à examiner** : jeton unique, commune seule, ou élément intrinsèquement intéressant
  sans cible nominative. Un candidat n'est jamais publié comme une anticipation avérée.
- **Exclusions** : CVE génériques, veille internationale, fuites concernant d'autres victimes,
  mots partagés (« police », « service », « source », …) et rattachements approximatifs.

## 3. Ce qui était effectivement disponible à J-21

| Mesure | Valeur |
|---|---|
| Incidents examinés | 50 |
| Événements dans les fenêtres | 1170 (de 7 à 127 par incident) |
| Sources actives distinctes | 20 (de 11 à 20 par incident) |
| Incidents avec organisation citée | 5 |
| Rattachements bruités écartés | 5 |
| Incidents avec rupture détectée sur l'entité | 0 |
| Fenêtres vides | 0 |
| Incidents avec signal retenu | 0 / 50 |
| Incidents sans signal retenu | 50 / 50 (dont 1 candidat(s) écarté(s)) |
| Incidents avec « rien » franc | 49 / 50 |

Répartition des natures d'événements (chaque événement compte une fois) :

| Nature | Nombre |
|---|---:|
| `ambient_signal` | 621 |
| `confirmed_incident` | 549 |

| Famille | Nombre |
|---|---:|
| `vuln` | 670 |
| `cti` | 245 |
| `cert` | 167 |
| `leaks` | 47 |
| `cert_fr` | 40 |
| `ransomware` | 1 |

Synthèse agrégée au sens du module `analyse/anticipation.ts` (signaux retenus seulement) :

- faits : 50 ; avec signal : 0 (0 %) ;
- avance médiane : non calculable (aucun signal) ;
- par nature : indicateur 0 · revendication 0 · ambiance 0 · alerte 0 ;
- mesure indicative (moins de 10 faits) : non.

## 4. Verdict par incident

| Incident | Entité | J-21 | Événements | Sources | Organisations | Ruptures | Signal à J-21 |
|---|---|---|---:|---:|---:|---:|---|

| `na-couv-001` | Ville de Floirac | 2024-03-28 | 7 | 11 | 0 | 0 | **rien** — aucun élément antérieur ne désigne l'entité |
| `na-couv-002` | CCI Béarn et Soule : aéroport Pau-Pyrénées, école de commerce Eklore et campus numérique de Pau | 2024-04-22 | 8 | 11 | 0 | 0 | **rien** — aucun élément antérieur ne désigne l'entité |
| `na-couv-003` | Groupe scolaire Stella-Maris, Anglet | 2024-05-10 | 10 | 11 | 0 | 0 | **rien** — aucun élément antérieur ne désigne l'entité |
| `na-couv-004` | SPSTI 16 — service de prévention et de santé au travail interentreprises de la Charente | 2024-04-19 | 8 | 11 | 0 | 0 | **rien** — aucun élément antérieur ne désigne l'entité |
| `na-couv-005` | Théâtre de la Coursive (billetterie Sirius), La Rochelle | 2024-06-10 | 16 | 11 | 0 | 0 | **rien** — aucun élément antérieur ne désigne l'entité |
| `na-couv-006` | Association Accord — festival Jazzellerault (Châtellerault) | 2024-06-12 | 18 | 11 | 0 | 0 | **rien** — aucun élément antérieur ne désigne l'entité |
| `na-couv-007` | Opéra national de Bordeaux — billetterie Sirius | 2024-06-07 | 17 | 11 | 0 | 0 | **rien** — aucun élément antérieur ne désigne l'entité |
| `na-couv-008` | Cité internationale de la bande dessinée et de l'image (Angoulême) | 2024-08-04 | 10 | 11 | 0 | 0 | **rien** — aucun élément antérieur ne désigne l'entité |
| `na-couv-009` | 3AS Racing (Cestas) | 2024-07-26 | 11 | 11 | 0 | 0 | **rien** — aucun élément antérieur ne désigne l'entité |
| `na-couv-010` | Opéra de Limoges — billetterie Sirius | 2024-10-17 | 18 | 11 | 0 | 0 | **rien** — aucun élément antérieur ne désigne l'entité |
| `na-couv-011` | Mairie de La Forêt-sur-Sèvre | 2024-10-25 | 16 | 11 | 0 | 0 | **rien** — aucun élément antérieur ne désigne l'entité |
| `na-couv-012` | Safed — Service d'accompagnement des familles en difficulté, Périgueux | 2024-10-28 | 17 | 11 | 0 | 0 | **rien** — aucun élément antérieur ne désigne l'entité |
| `na-couv-013` | Synel — service d'identification des bovins et ovins (éleveurs de Haute-Vienne) | 2024-12-10 | 10 | 11 | 0 | 0 | **rien** — aucun élément antérieur ne désigne l'entité |
| `na-couv-014` | Interveb / éleveurs de Dordogne (logiciel Synel) | 2024-12-24 | 13 | 11 | 0 | 0 | **rien** — aucun élément antérieur ne désigne l'entité |
| `na-couv-015` | Établissement de l'élevage de la Corrèze (EDE 19) | 2024-11-24 | 17 | 11 | 0 | 0 | **rien** — aucun élément antérieur ne désigne l'entité |
| `na-couv-016` | Collège privé La Salle de Brive-la-Gaillarde | 2025-01-22 | 14 | 11 | 0 | 0 | **rien** — aucun élément antérieur ne désigne l'entité |
| `na-couv-017` | Corrèze Fermeture (site d'Objat) | 2025-02-05 | 9 | 11 | 0 | 0 | **rien** — 1 élément(s) ambigu(s) écarté(s), aucun recoupement suffisant |
| `na-couv-018` | Réseaux TMA (agglo du Marsan) et Couralin / SPL Trans-Landes (Grand Dax) | 2025-02-28 | 18 | 11 | 0 | 0 | **rien** — aucun élément antérieur ne désigne l'entité |
| `na-couv-019` | MAIF Solutions Financières (MAIF), Niort | 2025-02-06 | 13 | 11 | 0 | 0 | **rien** — aucun élément antérieur ne désigne l'entité |
| `na-couv-020` | Péribus — réseau de transports du Grand Périgueux | 2025-03-04 | 21 | 11 | 0 | 0 | **rien** — aucun élément antérieur ne désigne l'entité |
| `na-couv-021` | APAJH 23 — Association pour adultes et jeunes handicapés de la Creuse | 2025-04-24 | 12 | 11 | 0 | 0 | **rien** — aucun élément antérieur ne désigne l'entité |
| `na-couv-022` | Carpa — ex-salariés de Sanifirst (Angoulême) | 2025-05-23 | 21 | 11 | 0 | 0 | **rien** — aucun élément antérieur ne désigne l'entité |
| `na-couv-023` | Mairie de Sarran | 2025-05-30 | 16 | 11 | 0 | 0 | **rien** — aucun élément antérieur ne désigne l'entité |
| `na-couv-024` | Université de Limoges — faculté des lettres et des sciences humaines | 2025-06-06 | 13 | 11 | 0 | 0 | **rien** — aucun élément antérieur ne désigne l'entité |
| `na-couv-025` | Mairie d'Évaux-les-Bains — camping municipal | 2025-06-20 | 15 | 11 | 0 | 0 | **rien** — aucun élément antérieur ne désigne l'entité |
| `na-couv-026` | Ville de Bergerac — QR codes des horodateurs Q-Park | 2025-07-21 | 10 | 11 | 0 | 0 | **rien** — aucun élément antérieur ne désigne l'entité |
| `na-couv-027` | Ville de Poitiers et communauté urbaine de Grand Poitiers | 2025-08-08 | 18 | 11 | 1 | 0 | **rien** — 1 rattachement(s) bruité(s) écarté(s), aucun autre recoupement |
| `na-couv-028` | Centre hospitalier d'Angoulême — site de Girac | 2025-08-19 | 12 | 11 | 1 | 0 | **rien** — 1 rattachement(s) bruité(s) écarté(s), aucun autre recoupement |
| `na-couv-029` | Ville de Fumel | 2025-09-12 | 15 | 11 | 0 | 0 | **rien** — aucun élément antérieur ne désigne l'entité |
| `na-couv-030` | Artiga — atelier de linge basque (Magescq) | 2025-08-05 | 18 | 11 | 1 | 0 | **rien** — 1 rattachement(s) bruité(s) écarté(s), aucun autre recoupement |
| `na-couv-031` | Communauté de communes Vallée Dordogne Forêt Bessède (Saint-Cyprien) | 2025-10-17 | 23 | 11 | 0 | 0 | **rien** — aucun élément antérieur ne désigne l'entité |
| `na-couv-032` | Centre public de santé (CPDS) du Centre hospitalier Nord Deux-Sèvres — Faye-l'Abbesse, Parthenay, Thouars | 2025-10-24 | 22 | 11 | 0 | 0 | **rien** — aucun élément antérieur ne désigne l'entité |
| `na-couv-033` | Cabinet d'une rhumatologue libérale installée en Creuse — logiciel Weda | 2025-10-20 | 22 | 11 | 0 | 0 | **rien** — aucun élément antérieur ne désigne l'entité |
| `na-couv-034` | Ville de La Rochelle — prestataire Synbird | 2025-11-06 | 13 | 11 | 0 | 0 | **rien** — aucun élément antérieur ne désigne l'entité |
| `na-couv-035` | Ville de Niort | 2025-11-22 | 9 | 11 | 0 | 0 | **rien** — aucun élément antérieur ne désigne l'entité |
| `na-couv-036` | Grand Poitiers — régie des parkings | 2026-01-01 | 8 | 11 | 0 | 0 | **rien** — aucun élément antérieur ne désigne l'entité |
| `na-couv-037` | Vivaticket France (Chasseneuil-du-Poitou) | 2026-02-09 | 21 | 11 | 0 | 0 | **rien** — aucun élément antérieur ne désigne l'entité |
| `na-couv-038` | Hennessy — billetterie des Visites Hennessy (Cognac) | 2026-02-09 | 21 | 11 | 0 | 0 | **rien** — aucun élément antérieur ne désigne l'entité |
| `na-couv-039` | Ville de Gradignan — police municipale | 2026-04-19 | 31 | 11 | 0 | 0 | **rien** — aucun élément antérieur ne désigne l'entité |
| `na-couv-040` | Soluris — syndicat informatique de la Charente-Maritime (Saintes) | 2026-04-30 | 31 | 11 | 0 | 0 | **rien** — aucun élément antérieur ne désigne l'entité |
| `na-couv-041` | ARS Nouvelle-Aquitaine — plateforme d'autorisations parentales HPV/MenACWY (prestataire SYADEM) | 2026-06-17 | 28 | 12 | 0 | 0 | **rien** — aucun élément antérieur ne désigne l'entité |
| `na-couv-042` | SDIS des Landes | 2026-07-04 | 32 | 12 | 0 | 0 | **rien** — aucun élément antérieur ne désigne l'entité |
| `na-couv-043` | Hôtes Gîtes de France de la Creuse | 2026-07-15 | 33 | 12 | 0 | 0 | **rien** — aucun élément antérieur ne désigne l'entité |
| `na-couv-044` | Mairie de Marennes-Hiers-Brouage | 2026-07-27 | 45 | 12 | 0 | 0 | **rien** — aucun élément antérieur ne désigne l'entité |
| `na-couv-045` | Ville de Tarnos | 2026-08-07 | 48 | 12 | 0 | 0 | **rien** — aucun élément antérieur ne désigne l'entité |
| `na-couv-046` | Euskal Moneta (association support de la monnaie locale Eusko) | 2026-07-27 | 45 | 12 | 0 | 0 | **rien** — aucun élément antérieur ne désigne l'entité |
| `na-couv-047` | Commissariat de police de Royan (numéro usurpé) | 2026-08-17 | 35 | 12 | 0 | 0 | **rien** — aucun élément antérieur ne désigne l'entité |
| `na-couv-048` | Mairie d’Espelette | 2026-08-21 | 33 | 12 | 1 | 0 | **rien** — 1 rattachement(s) bruité(s) écarté(s), aucun autre recoupement |
| `na-couv-049` | Intermarché d'Altillac | 2026-09-21 | 122 | 20 | 1 | 0 | **rien** — 1 rattachement(s) bruité(s) écarté(s), aucun autre recoupement |
| `na-couv-050` | Climb Up Limoges (fuite touchant plusieurs salles du groupe) | 2026-09-23 | 127 | 20 | 0 | 0 | **rien** — aucun élément antérieur ne désigne l'entité |

## 5. Dossiers détaillés

Chaque dossier donne l'état brut à J-21 puis la recherche effectuée. Quand la réponse est « rien »,
le dossier dit ce qui a été cherché et pourquoi aucun élément n'a été retenu.

### `na-couv-001` — Ville de Floirac
- **Fait** : compromission, 2024-04-18 (Gironde).
- **Instantané** : J-21 = 2024-03-28 ; fenêtre [2024-03-08, 2024-03-28] (21 j) ; référence = dateIncident.
- **Événements à J-21** : 7 (1030 événements plus anciens comptés, non détaillés).
  - Familles : vuln 4 · cti 3.
  - Natures : confirmed_incident 4 · ambient_signal 3.
- **Sources actives** (11) : cat-cert-at-warnings, cat-elastic-security-labs, cat-ncsc-nl-news, cert-fr-alerte, cisa_kev, leak:ddosecrets:rss, tg-itsecalert, tg-leaked-databases, tg-marketo-leaks, tg-snatch-news, tg-techpwnews.
- **Organisations citées** (0) : aucune.
- **Ruptures détectées** (0) : aucune sur l'entité ; `nouvelle-organisation` non calculable faute d'historique.
- **Recherche** : jetons d'entité floirac ; jetons de lieu aucune ; 7 événements passés au crible, 0 signal(aux) retenu(s), 0 candidat(s), 0 rattachement(s) bruité(s).

- **Verdict** : **rien** — aucun élément antérieur ne désigne l'entité.

### `na-couv-002` — CCI Béarn et Soule : aéroport Pau-Pyrénées, école de commerce Eklore et campus numérique de Pau
- **Fait** : ransomware, 2024-05-13 (Pyrénées-Atlantiques).
- **Instantané** : J-21 = 2024-04-22 ; fenêtre [2024-04-02, 2024-04-22] (21 j) ; référence = dateIncident.
- **Événements à J-21** : 8 (1040 événements plus anciens comptés, non détaillés).
  - Familles : cert 4 · vuln 2 · cert_fr 1 · cti 1.
  - Natures : ambient_signal 6 · confirmed_incident 2.
- **Sources actives** (11) : cat-cert-at-warnings, cat-elastic-security-labs, cat-ncsc-nl-news, cert-fr-alerte, cisa_kev, leak:ddosecrets:rss, tg-itsecalert, tg-leaked-databases, tg-marketo-leaks, tg-snatch-news, tg-techpwnews.
- **Organisations citées** (0) : aucune.
- **Ruptures détectées** (0) : aucune sur l'entité ; `nouvelle-organisation` non calculable faute d'historique.
- **Recherche** : jetons d'entité cci, bearn, soule, aeroport, pau, pyrenees, ecole, commerce, eklore, campus, numerique, pau ; jetons de lieu aucune ; 8 événements passés au crible, 0 signal(aux) retenu(s), 0 candidat(s), 0 rattachement(s) bruité(s).

- **Verdict** : **rien** — aucun élément antérieur ne désigne l'entité.

### `na-couv-003` — Groupe scolaire Stella-Maris, Anglet
- **Fait** : compromission, 2024-05-31 (Pyrénées-Atlantiques).
- **Instantané** : J-21 = 2024-05-10 ; fenêtre [2024-04-20, 2024-05-10] (21 j) ; référence = dateIncident.
- **Événements à J-21** : 10 (1050 événements plus anciens comptés, non détaillés).
  - Familles : cti 5 · vuln 4 · cert 1.
  - Natures : ambient_signal 6 · confirmed_incident 4.
- **Sources actives** (11) : cat-cert-at-warnings, cat-elastic-security-labs, cat-ncsc-nl-news, cert-fr-alerte, cisa_kev, leak:ddosecrets:rss, tg-itsecalert, tg-leaked-databases, tg-marketo-leaks, tg-snatch-news, tg-techpwnews.
- **Organisations citées** (0) : aucune.
- **Ruptures détectées** (0) : aucune sur l'entité ; `nouvelle-organisation` non calculable faute d'historique.
- **Recherche** : jetons d'entité scolaire, stella, maris, anglet ; jetons de lieu aucune ; 10 événements passés au crible, 0 signal(aux) retenu(s), 0 candidat(s), 0 rattachement(s) bruité(s).

- **Verdict** : **rien** — aucun élément antérieur ne désigne l'entité.

### `na-couv-004` — SPSTI 16 — service de prévention et de santé au travail interentreprises de la Charente
- **Fait** : ransomware, 2024-05-10 (Charente).
- **Instantané** : J-21 = 2024-04-19 ; fenêtre [2024-03-30, 2024-04-19] (21 j) ; référence = dateIncident.
- **Événements à J-21** : 8 (1040 événements plus anciens comptés, non détaillés).
  - Familles : cert 4 · vuln 2 · cert_fr 1 · cti 1.
  - Natures : ambient_signal 6 · confirmed_incident 2.
- **Sources actives** (11) : cat-cert-at-warnings, cat-elastic-security-labs, cat-ncsc-nl-news, cert-fr-alerte, cisa_kev, leak:ddosecrets:rss, tg-itsecalert, tg-leaked-databases, tg-marketo-leaks, tg-snatch-news, tg-techpwnews.
- **Organisations citées** (0) : aucune.
- **Ruptures détectées** (0) : aucune sur l'entité ; `nouvelle-organisation` non calculable faute d'historique.
- **Recherche** : jetons d'entité spsti, prevention, sante, travail, interentreprises, charente ; jetons de lieu aucune ; 8 événements passés au crible, 0 signal(aux) retenu(s), 0 candidat(s), 0 rattachement(s) bruité(s).

- **Verdict** : **rien** — aucun élément antérieur ne désigne l'entité.

### `na-couv-005` — Théâtre de la Coursive (billetterie Sirius), La Rochelle
- **Fait** : fuite, 2024-07-01 (Charente-Maritime).
- **Instantané** : J-21 = 2024-06-10 ; fenêtre [2024-05-21, 2024-06-10] (21 j) ; référence = dateIncident.
- **Événements à J-21** : 16 (1071 événements plus anciens comptés, non détaillés).
  - Familles : cert 6 · vuln 6 · cti 3 · leaks 1.
  - Natures : ambient_signal 10 · confirmed_incident 6.
- **Sources actives** (11) : cat-cert-at-warnings, cat-elastic-security-labs, cat-ncsc-nl-news, cert-fr-alerte, cisa_kev, leak:ddosecrets:rss, tg-itsecalert, tg-leaked-databases, tg-marketo-leaks, tg-snatch-news, tg-techpwnews.
- **Organisations citées** (0) : aucune.
- **Ruptures détectées** (0) : aucune sur l'entité ; `nouvelle-organisation` non calculable faute d'historique.
- **Recherche** : jetons d'entité theatre, coursive, billetterie, sirius, rochelle ; jetons de lieu aucune ; 16 événements passés au crible, 0 signal(aux) retenu(s), 0 candidat(s), 0 rattachement(s) bruité(s).

- **Verdict** : **rien** — aucun élément antérieur ne désigne l'entité.

### `na-couv-006` — Association Accord — festival Jazzellerault (Châtellerault)
- **Fait** : fuite, 2024-07-03 (Vienne).
- **Instantané** : J-21 = 2024-06-12 ; fenêtre [2024-05-23, 2024-06-12] (21 j) ; référence = dateIncident.
- **Événements à J-21** : 18 (1075 événements plus anciens comptés, non détaillés).
  - Familles : vuln 8 · cert 5 · cti 3 · leaks 2.
  - Natures : ambient_signal 10 · confirmed_incident 8.
- **Sources actives** (11) : cat-cert-at-warnings, cat-elastic-security-labs, cat-ncsc-nl-news, cert-fr-alerte, cisa_kev, leak:ddosecrets:rss, tg-itsecalert, tg-leaked-databases, tg-marketo-leaks, tg-snatch-news, tg-techpwnews.
- **Organisations citées** (0) : aucune.
- **Ruptures détectées** (0) : aucune sur l'entité ; `nouvelle-organisation` non calculable faute d'historique.
- **Recherche** : jetons d'entité accord, festival, jazzellerault, chatellerault ; jetons de lieu aucune ; 18 événements passés au crible, 0 signal(aux) retenu(s), 0 candidat(s), 0 rattachement(s) bruité(s).

- **Verdict** : **rien** — aucun élément antérieur ne désigne l'entité.

### `na-couv-007` — Opéra national de Bordeaux — billetterie Sirius
- **Fait** : fuite, 2024-06-28 (Gironde).
- **Instantané** : J-21 = 2024-06-07 ; fenêtre [2024-05-18, 2024-06-07] (21 j) ; référence = dateIncident.
- **Événements à J-21** : 17 (1070 événements plus anciens comptés, non détaillés).
  - Familles : vuln 8 · cert 5 · cti 3 · leaks 1.
  - Natures : ambient_signal 9 · confirmed_incident 8.
- **Sources actives** (11) : cat-cert-at-warnings, cat-elastic-security-labs, cat-ncsc-nl-news, cert-fr-alerte, cisa_kev, leak:ddosecrets:rss, tg-itsecalert, tg-leaked-databases, tg-marketo-leaks, tg-snatch-news, tg-techpwnews.
- **Organisations citées** (0) : aucune.
- **Ruptures détectées** (0) : aucune sur l'entité ; `nouvelle-organisation` non calculable faute d'historique.
- **Recherche** : jetons d'entité opera, national, bordeaux, billetterie, sirius ; jetons de lieu aucune ; 17 événements passés au crible, 0 signal(aux) retenu(s), 0 candidat(s), 0 rattachement(s) bruité(s).

- **Verdict** : **rien** — aucun élément antérieur ne désigne l'entité.

### `na-couv-008` — Cité internationale de la bande dessinée et de l'image (Angoulême)
- **Fait** : ransomware, 2024-08-25 (Charente).
- **Instantané** : J-21 = 2024-08-04 ; fenêtre [2024-07-15, 2024-08-04] (21 j) ; référence = dateIncident.
- **Événements à J-21** : 10 (1099 événements plus anciens comptés, non détaillés).
  - Familles : vuln 8 · cert 1 · cti 1.
  - Natures : confirmed_incident 8 · ambient_signal 2.
- **Sources actives** (11) : cat-cert-at-warnings, cat-elastic-security-labs, cat-ncsc-nl-news, cert-fr-alerte, cisa_kev, leak:ddosecrets:rss, tg-itsecalert, tg-leaked-databases, tg-marketo-leaks, tg-snatch-news, tg-techpwnews.
- **Organisations citées** (0) : aucune.
- **Ruptures détectées** (0) : aucune sur l'entité ; `nouvelle-organisation` non calculable faute d'historique.
- **Recherche** : jetons d'entité cite, internationale, bande, dessinee, image, angouleme ; jetons de lieu aucune ; 10 événements passés au crible, 0 signal(aux) retenu(s), 0 candidat(s), 0 rattachement(s) bruité(s).

- **Verdict** : **rien** — aucun élément antérieur ne désigne l'entité.

### `na-couv-009` — 3AS Racing (Cestas)
- **Fait** : compromission, 2024-08-16 (Gironde).
- **Instantané** : J-21 = 2024-07-26 ; fenêtre [2024-07-06, 2024-07-26] (21 j) ; référence = dateIncident.
- **Événements à J-21** : 11 (1094 événements plus anciens comptés, non détaillés).
  - Familles : vuln 7 · leaks 2 · cert 1 · cti 1.
  - Natures : confirmed_incident 7 · ambient_signal 4.
- **Sources actives** (11) : cat-cert-at-warnings, cat-elastic-security-labs, cat-ncsc-nl-news, cert-fr-alerte, cisa_kev, leak:ddosecrets:rss, tg-itsecalert, tg-leaked-databases, tg-marketo-leaks, tg-snatch-news, tg-techpwnews.
- **Organisations citées** (0) : aucune.
- **Ruptures détectées** (0) : aucune sur l'entité ; `nouvelle-organisation` non calculable faute d'historique.
- **Recherche** : jetons d'entité 3as, racing, cestas ; jetons de lieu aucune ; 11 événements passés au crible, 0 signal(aux) retenu(s), 0 candidat(s), 0 rattachement(s) bruité(s).

- **Verdict** : **rien** — aucun élément antérieur ne désigne l'entité.

### `na-couv-010` — Opéra de Limoges — billetterie Sirius
- **Fait** : fuite, 2024-11-07 (Haute-Vienne).
- **Instantané** : J-21 = 2024-10-17 ; fenêtre [2024-09-27, 2024-10-17] (21 j) ; référence = datePublique.
- **Événements à J-21** : 18 (1154 événements plus anciens comptés, non détaillés).
  - Familles : vuln 9 · cert 5 · cti 2 · cert_fr 1 · leaks 1.
  - Natures : ambient_signal 9 · confirmed_incident 9.
- **Sources actives** (11) : cat-cert-at-warnings, cat-elastic-security-labs, cat-ncsc-nl-news, cert-fr-alerte, cisa_kev, leak:ddosecrets:rss, tg-itsecalert, tg-leaked-databases, tg-marketo-leaks, tg-snatch-news, tg-techpwnews.
- **Organisations citées** (0) : aucune.
- **Ruptures détectées** (0) : aucune sur l'entité ; `nouvelle-organisation` non calculable faute d'historique.
- **Recherche** : jetons d'entité opera, limoges, billetterie, sirius ; jetons de lieu aucune ; 18 événements passés au crible, 0 signal(aux) retenu(s), 0 candidat(s), 0 rattachement(s) bruité(s).

- **Anomalies** : DATE_PUBLIQUE (voir §7).

- **Verdict** : **rien** — aucun élément antérieur ne désigne l'entité.

### `na-couv-011` — Mairie de La Forêt-sur-Sèvre
- **Fait** : phishing, 2024-11-15 (Deux-Sèvres).
- **Instantané** : J-21 = 2024-10-25 ; fenêtre [2024-10-05, 2024-10-25] (21 j) ; référence = datePublique.
- **Événements à J-21** : 16 (1164 événements plus anciens comptés, non détaillés).
  - Familles : vuln 8 · cert 3 · cert_fr 2 · cti 2 · leaks 1.
  - Natures : ambient_signal 8 · confirmed_incident 8.
- **Sources actives** (11) : cat-cert-at-warnings, cat-elastic-security-labs, cat-ncsc-nl-news, cert-fr-alerte, cisa_kev, leak:ddosecrets:rss, tg-itsecalert, tg-leaked-databases, tg-marketo-leaks, tg-snatch-news, tg-techpwnews.
- **Organisations citées** (0) : aucune.
- **Ruptures détectées** (0) : aucune sur l'entité ; `nouvelle-organisation` non calculable faute d'historique.
- **Recherche** : jetons d'entité foret, sevre ; jetons de lieu aucune ; 16 événements passés au crible, 0 signal(aux) retenu(s), 0 candidat(s), 0 rattachement(s) bruité(s).

- **Anomalies** : DATE_PUBLIQUE (voir §7).

- **Verdict** : **rien** — aucun élément antérieur ne désigne l'entité.

### `na-couv-012` — Safed — Service d'accompagnement des familles en difficulté, Périgueux
- **Fait** : compromission, 2024-11-18 (Dordogne).
- **Instantané** : J-21 = 2024-10-28 ; fenêtre [2024-10-08, 2024-10-28] (21 j) ; référence = dateIncident.
- **Événements à J-21** : 17 (1165 événements plus anciens comptés, non détaillés).
  - Familles : vuln 8 · cert 3 · cti 3 · cert_fr 2 · leaks 1.
  - Natures : ambient_signal 9 · confirmed_incident 8.
- **Sources actives** (11) : cat-cert-at-warnings, cat-elastic-security-labs, cat-ncsc-nl-news, cert-fr-alerte, cisa_kev, leak:ddosecrets:rss, tg-itsecalert, tg-leaked-databases, tg-marketo-leaks, tg-snatch-news, tg-techpwnews.
- **Organisations citées** (0) : aucune.
- **Ruptures détectées** (0) : aucune sur l'entité ; `nouvelle-organisation` non calculable faute d'historique.
- **Recherche** : jetons d'entité safed, accompagnement, familles, difficulte, perigueux ; jetons de lieu aucune ; 17 événements passés au crible, 0 signal(aux) retenu(s), 0 candidat(s), 0 rattachement(s) bruité(s).

- **Verdict** : **rien** — aucun élément antérieur ne désigne l'entité.

### `na-couv-013` — Synel — service d'identification des bovins et ovins (éleveurs de Haute-Vienne)
- **Fait** : compromission, 2024-12-31 (Haute-Vienne).
- **Instantané** : J-21 = 2024-12-10 ; fenêtre [2024-11-20, 2024-12-10] (21 j) ; référence = datePublique.
- **Événements à J-21** : 10 (1187 événements plus anciens comptés, non détaillés).
  - Familles : vuln 6 · cert 2 · cti 1 · leaks 1.
  - Natures : confirmed_incident 6 · ambient_signal 4.
- **Sources actives** (11) : cat-cert-at-warnings, cat-elastic-security-labs, cat-ncsc-nl-news, cert-fr-alerte, cisa_kev, leak:ddosecrets:rss, tg-itsecalert, tg-leaked-databases, tg-marketo-leaks, tg-snatch-news, tg-techpwnews.
- **Organisations citées** (0) : aucune.
- **Ruptures détectées** (0) : aucune sur l'entité ; `nouvelle-organisation` non calculable faute d'historique.
- **Recherche** : jetons d'entité synel, identification, bovins, ovins, eleveurs, haute, vienne ; jetons de lieu aucune ; 10 événements passés au crible, 0 signal(aux) retenu(s), 0 candidat(s), 0 rattachement(s) bruité(s).

- **Anomalies** : DATE_PUBLIQUE (voir §7).

- **Verdict** : **rien** — aucun élément antérieur ne désigne l'entité.

### `na-couv-014` — Interveb / éleveurs de Dordogne (logiciel Synel)
- **Fait** : compromission, 2025-01-14 (Dordogne).
- **Instantané** : J-21 = 2024-12-24 ; fenêtre [2024-12-04, 2024-12-24] (21 j) ; référence = datePublique.
- **Événements à J-21** : 13 (1197 événements plus anciens comptés, non détaillés).
  - Familles : vuln 8 · cti 3 · cert 2.
  - Natures : confirmed_incident 8 · ambient_signal 5.
- **Sources actives** (11) : cat-cert-at-warnings, cat-elastic-security-labs, cat-ncsc-nl-news, cert-fr-alerte, cisa_kev, leak:ddosecrets:rss, tg-itsecalert, tg-leaked-databases, tg-marketo-leaks, tg-snatch-news, tg-techpwnews.
- **Organisations citées** (0) : aucune.
- **Ruptures détectées** (0) : aucune sur l'entité ; `nouvelle-organisation` non calculable faute d'historique.
- **Recherche** : jetons d'entité interveb, eleveurs, dordogne, logiciel, synel ; jetons de lieu aucune ; 13 événements passés au crible, 0 signal(aux) retenu(s), 0 candidat(s), 0 rattachement(s) bruité(s).

- **Anomalies** : DATE_PUBLIQUE (voir §7).

- **Verdict** : **rien** — aucun élément antérieur ne désigne l'entité.

### `na-couv-015` — Établissement de l'élevage de la Corrèze (EDE 19)
- **Fait** : ransomware, 2024-12-15 (Corrèze).
- **Instantané** : J-21 = 2024-11-24 ; fenêtre [2024-11-04, 2024-11-24] (21 j) ; référence = dateIncident.
- **Événements à J-21** : 17 (1182 événements plus anciens comptés, non détaillés).
  - Familles : vuln 12 · cert 3 · cert_fr 1 · leaks 1.
  - Natures : confirmed_incident 12 · ambient_signal 5.
- **Sources actives** (11) : cat-cert-at-warnings, cat-elastic-security-labs, cat-ncsc-nl-news, cert-fr-alerte, cisa_kev, leak:ddosecrets:rss, tg-itsecalert, tg-leaked-databases, tg-marketo-leaks, tg-snatch-news, tg-techpwnews.
- **Organisations citées** (0) : aucune.
- **Ruptures détectées** (0) : aucune sur l'entité ; `nouvelle-organisation` non calculable faute d'historique.
- **Recherche** : jetons d'entité elevage, correze, ede ; jetons de lieu aucune ; 17 événements passés au crible, 0 signal(aux) retenu(s), 0 candidat(s), 0 rattachement(s) bruité(s).

- **Verdict** : **rien** — aucun élément antérieur ne désigne l'entité.

### `na-couv-016` — Collège privé La Salle de Brive-la-Gaillarde
- **Fait** : ransomware, 2025-02-12 (Corrèze).
- **Instantané** : J-21 = 2025-01-22 ; fenêtre [2025-01-02, 2025-01-22] (21 j) ; référence = datePublique.
- **Événements à J-21** : 14 (1213 événements plus anciens comptés, non détaillés).
  - Familles : vuln 10 · cert_fr 2 · cert 1 · leaks 1.
  - Natures : confirmed_incident 10 · ambient_signal 4.
- **Sources actives** (11) : cat-cert-at-warnings, cat-elastic-security-labs, cat-ncsc-nl-news, cert-fr-alerte, cisa_kev, leak:ddosecrets:rss, tg-itsecalert, tg-leaked-databases, tg-marketo-leaks, tg-snatch-news, tg-techpwnews.
- **Organisations citées** (0) : aucune.
- **Ruptures détectées** (0) : aucune sur l'entité ; `nouvelle-organisation` non calculable faute d'historique.
- **Recherche** : jetons d'entité college, prive, salle, brive, gaillarde ; jetons de lieu aucune ; 14 événements passés au crible, 0 signal(aux) retenu(s), 0 candidat(s), 0 rattachement(s) bruité(s).

- **Anomalies** : DATE_PUBLIQUE (voir §7).

- **Verdict** : **rien** — aucun élément antérieur ne désigne l'entité.

### `na-couv-017` — Corrèze Fermeture (site d'Objat)
- **Fait** : ransomware, 2025-02-26 (Corrèze).
- **Instantané** : J-21 = 2025-02-05 ; fenêtre [2025-01-16, 2025-02-05] (21 j) ; référence = datePublique.
- **Événements à J-21** : 9 (1221 événements plus anciens comptés, non détaillés).
  - Familles : vuln 7 · cert 2.
  - Natures : confirmed_incident 7 · ambient_signal 2.
- **Sources actives** (11) : cat-cert-at-warnings, cat-elastic-security-labs, cat-ncsc-nl-news, cert-fr-alerte, cisa_kev, leak:ddosecrets:rss, tg-itsecalert, tg-leaked-databases, tg-marketo-leaks, tg-snatch-news, tg-techpwnews.
- **Organisations citées** (0) : aucune.
- **Ruptures détectées** (0) : aucune sur l'entité ; `nouvelle-organisation` non calculable faute d'historique.
- **Recherche** : jetons d'entité correze, fermeture, site, objat ; jetons de lieu aucune ; 9 événements passés au crible, 0 signal(aux) retenu(s), 1 candidat(s), 0 rattachement(s) bruité(s).

  - **Candidats non retenus** :
    - CVE-2020-11023 — JQuery Cross-Site Scripting (XSS) Vulnerability — un seul jeton d'entité (site), à confirmer.
- **Anomalies** : DATE_PUBLIQUE (voir §7).

- **Verdict** : **rien** — 1 élément(s) ambigu(s) écarté(s), aucun recoupement suffisant.

### `na-couv-018` — Réseaux TMA (agglo du Marsan) et Couralin / SPL Trans-Landes (Grand Dax)
- **Fait** : phishing, 2025-03-21 (Landes).
- **Instantané** : J-21 = 2025-02-28 ; fenêtre [2025-02-08, 2025-02-28] (21 j) ; référence = datePublique.
- **Événements à J-21** : 18 (1245 événements plus anciens comptés, non détaillés).
  - Familles : vuln 12 · cti 3 · cert 2 · leaks 1.
  - Natures : confirmed_incident 12 · ambient_signal 6.
- **Sources actives** (11) : cat-cert-at-warnings, cat-elastic-security-labs, cat-ncsc-nl-news, cert-fr-alerte, cisa_kev, leak:ddosecrets:rss, tg-itsecalert, tg-leaked-databases, tg-marketo-leaks, tg-snatch-news, tg-techpwnews.
- **Organisations citées** (0) : aucune.
- **Ruptures détectées** (0) : aucune sur l'entité ; `nouvelle-organisation` non calculable faute d'historique.
- **Recherche** : jetons d'entité reseaux, tma, agglo, marsan, couralin, spl, trans, landes, grand, dax ; jetons de lieu aucune ; 18 événements passés au crible, 0 signal(aux) retenu(s), 0 candidat(s), 0 rattachement(s) bruité(s).

- **Anomalies** : DATE_PUBLIQUE (voir §7).

- **Verdict** : **rien** — aucun élément antérieur ne désigne l'entité.

### `na-couv-019` — MAIF Solutions Financières (MAIF), Niort
- **Fait** : fuite, 2025-02-27 (Deux-Sèvres).
- **Instantané** : J-21 = 2025-02-06 ; fenêtre [2025-01-17, 2025-02-06] (21 j) ; référence = dateIncident.
- **Événements à J-21** : 13 (1226 événements plus anciens comptés, non détaillés).
  - Familles : vuln 10 · cert 3.
  - Natures : confirmed_incident 10 · ambient_signal 3.
- **Sources actives** (11) : cat-cert-at-warnings, cat-elastic-security-labs, cat-ncsc-nl-news, cert-fr-alerte, cisa_kev, leak:ddosecrets:rss, tg-itsecalert, tg-leaked-databases, tg-marketo-leaks, tg-snatch-news, tg-techpwnews.
- **Organisations citées** (0) : aucune.
- **Ruptures détectées** (0) : aucune sur l'entité ; `nouvelle-organisation` non calculable faute d'historique.
- **Recherche** : jetons d'entité maif, solutions, financieres, maif, niort ; jetons de lieu aucune ; 13 événements passés au crible, 0 signal(aux) retenu(s), 0 candidat(s), 0 rattachement(s) bruité(s).

- **Verdict** : **rien** — aucun élément antérieur ne désigne l'entité.

### `na-couv-020` — Péribus — réseau de transports du Grand Périgueux
- **Fait** : phishing, 2025-03-25 (Dordogne).
- **Instantané** : J-21 = 2025-03-04 ; fenêtre [2025-02-12, 2025-03-04] (21 j) ; référence = dateIncident.
- **Événements à J-21** : 21 (1251 événements plus anciens comptés, non détaillés).
  - Familles : vuln 14 · cti 4 · cert 2 · leaks 1.
  - Natures : confirmed_incident 14 · ambient_signal 7.
- **Sources actives** (11) : cat-cert-at-warnings, cat-elastic-security-labs, cat-ncsc-nl-news, cert-fr-alerte, cisa_kev, leak:ddosecrets:rss, tg-itsecalert, tg-leaked-databases, tg-marketo-leaks, tg-snatch-news, tg-techpwnews.
- **Organisations citées** (0) : aucune.
- **Ruptures détectées** (0) : aucune sur l'entité ; `nouvelle-organisation` non calculable faute d'historique.
- **Recherche** : jetons d'entité peribus, reseau, transports, grand, perigueux ; jetons de lieu aucune ; 21 événements passés au crible, 0 signal(aux) retenu(s), 0 candidat(s), 0 rattachement(s) bruité(s).

- **Verdict** : **rien** — aucun élément antérieur ne désigne l'entité.

### `na-couv-021` — APAJH 23 — Association pour adultes et jeunes handicapés de la Creuse
- **Fait** : phishing, 2025-05-15 (Creuse).
- **Instantané** : J-21 = 2025-04-24 ; fenêtre [2025-04-04, 2025-04-24] (21 j) ; référence = datePublique.
- **Événements à J-21** : 12 (1283 événements plus anciens comptés, non détaillés).
  - Familles : vuln 8 · cert 3 · cert_fr 1.
  - Natures : confirmed_incident 8 · ambient_signal 4.
- **Sources actives** (11) : cat-cert-at-warnings, cat-elastic-security-labs, cat-ncsc-nl-news, cert-fr-alerte, cisa_kev, leak:ddosecrets:rss, tg-itsecalert, tg-leaked-databases, tg-marketo-leaks, tg-snatch-news, tg-techpwnews.
- **Organisations citées** (0) : aucune.
- **Ruptures détectées** (0) : aucune sur l'entité ; `nouvelle-organisation` non calculable faute d'historique.
- **Recherche** : jetons d'entité apajh, pour, adultes, jeunes, handicapes, creuse ; jetons de lieu aucune ; 12 événements passés au crible, 0 signal(aux) retenu(s), 0 candidat(s), 0 rattachement(s) bruité(s).

- **Anomalies** : DATE_PUBLIQUE (voir §7).

- **Verdict** : **rien** — aucun élément antérieur ne désigne l'entité.

### `na-couv-022` — Carpa — ex-salariés de Sanifirst (Angoulême)
- **Fait** : phishing, 2025-06-13 (Charente).
- **Instantané** : J-21 = 2025-05-23 ; fenêtre [2025-05-03, 2025-05-23] (21 j) ; référence = datePublique.
- **Événements à J-21** : 21 (1310 événements plus anciens comptés, non détaillés).
  - Familles : vuln 15 · cert 2 · cert_fr 2 · cti 1 · leaks 1.
  - Natures : confirmed_incident 15 · ambient_signal 6.
- **Sources actives** (11) : cat-cert-at-warnings, cat-elastic-security-labs, cat-ncsc-nl-news, cert-fr-alerte, cisa_kev, leak:ddosecrets:rss, tg-itsecalert, tg-leaked-databases, tg-marketo-leaks, tg-snatch-news, tg-techpwnews.
- **Organisations citées** (0) : aucune.
- **Ruptures détectées** (0) : aucune sur l'entité ; `nouvelle-organisation` non calculable faute d'historique.
- **Recherche** : jetons d'entité carpa, salaries, sanifirst, angouleme ; jetons de lieu aucune ; 21 événements passés au crible, 0 signal(aux) retenu(s), 0 candidat(s), 0 rattachement(s) bruité(s).

- **Anomalies** : DATE_PUBLIQUE (voir §7).

- **Verdict** : **rien** — aucun élément antérieur ne désigne l'entité.

### `na-couv-023` — Mairie de Sarran
- **Fait** : compromission, 2025-06-20 (Corrèze).
- **Instantané** : J-21 = 2025-05-30 ; fenêtre [2025-05-10, 2025-05-30] (21 j) ; référence = datePublique.
- **Événements à J-21** : 16 (1311 événements plus anciens comptés, non détaillés).
  - Familles : vuln 11 · cert_fr 2 · cert 1 · cti 1 · leaks 1.
  - Natures : confirmed_incident 11 · ambient_signal 5.
- **Sources actives** (11) : cat-cert-at-warnings, cat-elastic-security-labs, cat-ncsc-nl-news, cert-fr-alerte, cisa_kev, leak:ddosecrets:rss, tg-itsecalert, tg-leaked-databases, tg-marketo-leaks, tg-snatch-news, tg-techpwnews.
- **Organisations citées** (0) : aucune.
- **Ruptures détectées** (0) : aucune sur l'entité ; `nouvelle-organisation` non calculable faute d'historique.
- **Recherche** : jetons d'entité sarran ; jetons de lieu aucune ; 16 événements passés au crible, 0 signal(aux) retenu(s), 0 candidat(s), 0 rattachement(s) bruité(s).

- **Anomalies** : DATE_PUBLIQUE (voir §7).

- **Verdict** : **rien** — aucun élément antérieur ne désigne l'entité.

### `na-couv-024` — Université de Limoges — faculté des lettres et des sciences humaines
- **Fait** : fuite, 2025-06-27 (Haute-Vienne).
- **Instantané** : J-21 = 2025-06-06 ; fenêtre [2025-05-17, 2025-06-06] (21 j) ; référence = datePublique.
- **Événements à J-21** : 13 (1317 événements plus anciens comptés, non détaillés).
  - Familles : vuln 10 · cert_fr 1 · cti 1 · leaks 1.
  - Natures : confirmed_incident 10 · ambient_signal 3.
- **Sources actives** (11) : cat-cert-at-warnings, cat-elastic-security-labs, cat-ncsc-nl-news, cert-fr-alerte, cisa_kev, leak:ddosecrets:rss, tg-itsecalert, tg-leaked-databases, tg-marketo-leaks, tg-snatch-news, tg-techpwnews.
- **Organisations citées** (0) : aucune.
- **Ruptures détectées** (0) : aucune sur l'entité ; `nouvelle-organisation` non calculable faute d'historique.
- **Recherche** : jetons d'entité universite, limoges, faculte, lettres, sciences, humaines ; jetons de lieu aucune ; 13 événements passés au crible, 0 signal(aux) retenu(s), 0 candidat(s), 0 rattachement(s) bruité(s).

- **Anomalies** : DATE_PUBLIQUE (voir §7).

- **Verdict** : **rien** — aucun élément antérieur ne désigne l'entité.

### `na-couv-025` — Mairie d'Évaux-les-Bains — camping municipal
- **Fait** : defacement, 2025-07-11 (Creuse).
- **Instantané** : J-21 = 2025-06-20 ; fenêtre [2025-05-31, 2025-06-20] (21 j) ; référence = datePublique.
- **Événements à J-21** : 15 (1326 événements plus anciens comptés, non détaillés).
  - Familles : vuln 10 · cti 2 · cert 1 · cert_fr 1 · leaks 1.
  - Natures : confirmed_incident 10 · ambient_signal 5.
- **Sources actives** (11) : cat-cert-at-warnings, cat-elastic-security-labs, cat-ncsc-nl-news, cert-fr-alerte, cisa_kev, leak:ddosecrets:rss, tg-itsecalert, tg-leaked-databases, tg-marketo-leaks, tg-snatch-news, tg-techpwnews.
- **Organisations citées** (0) : aucune.
- **Ruptures détectées** (0) : aucune sur l'entité ; `nouvelle-organisation` non calculable faute d'historique.
- **Recherche** : jetons d'entité evaux, bains, camping, municipal ; jetons de lieu aucune ; 15 événements passés au crible, 0 signal(aux) retenu(s), 0 candidat(s), 0 rattachement(s) bruité(s).

- **Anomalies** : DATE_PUBLIQUE (voir §7).

- **Verdict** : **rien** — aucun élément antérieur ne désigne l'entité.

### `na-couv-026` — Ville de Bergerac — QR codes des horodateurs Q-Park
- **Fait** : phishing, 2025-08-11 (Dordogne).
- **Instantané** : J-21 = 2025-07-21 ; fenêtre [2025-07-01, 2025-07-21] (21 j) ; référence = dateIncident.
- **Événements à J-21** : 10 (1344 événements plus anciens comptés, non détaillés).
  - Familles : vuln 4 · cert 2 · cert_fr 2 · cti 2.
  - Natures : ambient_signal 6 · confirmed_incident 4.
- **Sources actives** (11) : cat-cert-at-warnings, cat-elastic-security-labs, cat-ncsc-nl-news, cert-fr-alerte, cisa_kev, leak:ddosecrets:rss, tg-itsecalert, tg-leaked-databases, tg-marketo-leaks, tg-snatch-news, tg-techpwnews.
- **Organisations citées** (0) : aucune.
- **Ruptures détectées** (0) : aucune sur l'entité ; `nouvelle-organisation` non calculable faute d'historique.
- **Recherche** : jetons d'entité bergerac, codes, horodateurs, park ; jetons de lieu aucune ; 10 événements passés au crible, 0 signal(aux) retenu(s), 0 candidat(s), 0 rattachement(s) bruité(s).

- **Verdict** : **rien** — aucun élément antérieur ne désigne l'entité.

### `na-couv-027` — Ville de Poitiers et communauté urbaine de Grand Poitiers
- **Fait** : ransomware, 2025-08-29 (Vienne).
- **Instantané** : J-21 = 2025-08-08 ; fenêtre [2025-07-19, 2025-08-08] (21 j) ; référence = dateIncident.
- **Événements à J-21** : 18 (1359 événements plus anciens comptés, non détaillés).
  - Familles : vuln 10 · cert 3 · cert_fr 2 · leaks 2 · cti 1.
  - Natures : confirmed_incident 10 · ambient_signal 8.
- **Sources actives** (11) : cat-cert-at-warnings, cat-elastic-security-labs, cat-ncsc-nl-news, cert-fr-alerte, cisa_kev, leak:ddosecrets:rss, tg-itsecalert, tg-leaked-databases, tg-marketo-leaks, tg-snatch-news, tg-techpwnews.
- **Organisations citées** (1) : PARTIE SON (#378660).
- **Ruptures détectées** (0) : aucune sur l'entité ; `nouvelle-organisation` non calculable faute d'historique.
- **Recherche** : jetons d'entité poitiers, communaute, urbaine, grand, poitiers ; jetons de lieu aucune ; 18 événements passés au crible, 0 signal(aux) retenu(s), 0 candidat(s), 1 rattachement(s) bruité(s).

  - **Rattachements écartés** :
    - Incidents de sécurité dans les pare-feux SonicWall (05 août 2025) — rattachement à « PARTIE SON » sans recoupement avec l'entité.
- **Verdict** : **rien** — 1 rattachement(s) bruité(s) écarté(s), aucun autre recoupement.

### `na-couv-028` — Centre hospitalier d'Angoulême — site de Girac
- **Fait** : compromission, 2025-09-09 (Charente).
- **Instantané** : J-21 = 2025-08-19 ; fenêtre [2025-07-30, 2025-08-19] (21 j) ; référence = datePublique.
- **Événements à J-21** : 12 (1364 événements plus anciens comptés, non détaillés).
  - Familles : vuln 7 · cert 2 · leaks 2 · cert_fr 1.
  - Natures : confirmed_incident 7 · ambient_signal 5.
- **Sources actives** (11) : cat-cert-at-warnings, cat-elastic-security-labs, cat-ncsc-nl-news, cert-fr-alerte, cisa_kev, leak:ddosecrets:rss, tg-itsecalert, tg-leaked-databases, tg-marketo-leaks, tg-snatch-news, tg-techpwnews.
- **Organisations citées** (1) : PARTIE SON (#378660).
- **Ruptures détectées** (0) : aucune sur l'entité ; `nouvelle-organisation` non calculable faute d'historique.
- **Recherche** : jetons d'entité hospitalier, angouleme, site, girac ; jetons de lieu aucune ; 12 événements passés au crible, 0 signal(aux) retenu(s), 0 candidat(s), 1 rattachement(s) bruité(s).

  - **Rattachements écartés** :
    - Incidents de sécurité dans les pare-feux SonicWall (05 août 2025) — rattachement à « PARTIE SON » sans recoupement avec l'entité.
- **Anomalies** : DATE_PUBLIQUE (voir §7).

- **Verdict** : **rien** — 1 rattachement(s) bruité(s) écarté(s), aucun autre recoupement.

### `na-couv-029` — Ville de Fumel
- **Fait** : ransomware, 2025-10-03 (Lot-et-Garonne).
- **Instantané** : J-21 = 2025-09-12 ; fenêtre [2025-08-23, 2025-09-12] (21 j) ; référence = dateIncident.
- **Événements à J-21** : 15 (1379 événements plus anciens comptés, non détaillés).
  - Familles : vuln 11 · cert 1 · cert_fr 1 · leaks 1 · ransomware 1.
  - Natures : confirmed_incident 11 · ambient_signal 4.
- **Sources actives** (11) : cat-cert-at-warnings, cat-elastic-security-labs, cat-ncsc-nl-news, cert-fr-alerte, cisa_kev, leak:ddosecrets:rss, tg-itsecalert, tg-leaked-databases, tg-marketo-leaks, tg-snatch-news, tg-techpwnews.
- **Organisations citées** (0) : aucune.
- **Ruptures détectées** (0) : aucune sur l'entité ; `nouvelle-organisation` non calculable faute d'historique.
- **Recherche** : jetons d'entité fumel ; jetons de lieu aucune ; 15 événements passés au crible, 0 signal(aux) retenu(s), 0 candidat(s), 0 rattachement(s) bruité(s).

- **Anomalies** : TITRE_TRONQUE (voir §7).

- **Verdict** : **rien** — aucun élément antérieur ne désigne l'entité.

### `na-couv-030` — Artiga — atelier de linge basque (Magescq)
- **Fait** : phishing, 2025-08-26 (Landes).
- **Instantané** : J-21 = 2025-08-05 ; fenêtre [2025-07-16, 2025-08-05] (21 j) ; référence = dateIncident.
- **Événements à J-21** : 18 (1358 événements plus anciens comptés, non détaillés).
  - Familles : vuln 11 · cert 3 · cert_fr 2 · cti 1 · leaks 1.
  - Natures : confirmed_incident 11 · ambient_signal 7.
- **Sources actives** (11) : cat-cert-at-warnings, cat-elastic-security-labs, cat-ncsc-nl-news, cert-fr-alerte, cisa_kev, leak:ddosecrets:rss, tg-itsecalert, tg-leaked-databases, tg-marketo-leaks, tg-snatch-news, tg-techpwnews.
- **Organisations citées** (1) : PARTIE SON (#378660).
- **Ruptures détectées** (0) : aucune sur l'entité ; `nouvelle-organisation` non calculable faute d'historique.
- **Recherche** : jetons d'entité artiga, atelier, linge, basque, magescq ; jetons de lieu aucune ; 18 événements passés au crible, 0 signal(aux) retenu(s), 0 candidat(s), 1 rattachement(s) bruité(s).

  - **Rattachements écartés** :
    - Incidents de sécurité dans les pare-feux SonicWall (05 août 2025) — rattachement à « PARTIE SON » sans recoupement avec l'entité.
- **Verdict** : **rien** — 1 rattachement(s) bruité(s) écarté(s), aucun autre recoupement.

### `na-couv-031` — Communauté de communes Vallée Dordogne Forêt Bessède (Saint-Cyprien)
- **Fait** : phishing, 2025-11-07 (Dordogne).
- **Instantané** : J-21 = 2025-10-17 ; fenêtre [2025-09-27, 2025-10-17] (21 j) ; référence = datePublique.
- **Événements à J-21** : 23 (1407 événements plus anciens comptés, non détaillés).
  - Familles : vuln 17 · cert 3 · cti 3.
  - Natures : confirmed_incident 17 · ambient_signal 6.
- **Sources actives** (11) : cat-cert-at-warnings, cat-elastic-security-labs, cat-ncsc-nl-news, cert-fr-alerte, cisa_kev, leak:ddosecrets:rss, tg-itsecalert, tg-leaked-databases, tg-marketo-leaks, tg-snatch-news, tg-techpwnews.
- **Organisations citées** (0) : aucune.
- **Ruptures détectées** (0) : aucune sur l'entité ; `nouvelle-organisation` non calculable faute d'historique.
- **Recherche** : jetons d'entité communaute, communes, vallee, dordogne, foret, bessede, saint, cyprien ; jetons de lieu aucune ; 23 événements passés au crible, 0 signal(aux) retenu(s), 0 candidat(s), 0 rattachement(s) bruité(s).

- **Anomalies** : DATE_PUBLIQUE (voir §7).

- **Verdict** : **rien** — aucun élément antérieur ne désigne l'entité.

### `na-couv-032` — Centre public de santé (CPDS) du Centre hospitalier Nord Deux-Sèvres — Faye-l'Abbesse, Parthenay, Thouars
- **Fait** : fuite, 2025-11-14 (Deux-Sèvres).
- **Instantané** : J-21 = 2025-10-24 ; fenêtre [2025-10-04, 2025-10-24] (21 j) ; référence = dateIncident.
- **Événements à J-21** : 22 (1414 événements plus anciens comptés, non détaillés).
  - Familles : vuln 15 · cert 4 · cti 3.
  - Natures : confirmed_incident 15 · ambient_signal 7.
- **Sources actives** (11) : cat-cert-at-warnings, cat-elastic-security-labs, cat-ncsc-nl-news, cert-fr-alerte, cisa_kev, leak:ddosecrets:rss, tg-itsecalert, tg-leaked-databases, tg-marketo-leaks, tg-snatch-news, tg-techpwnews.
- **Organisations citées** (0) : aucune.
- **Ruptures détectées** (0) : aucune sur l'entité ; `nouvelle-organisation` non calculable faute d'historique.
- **Recherche** : jetons d'entité public, sante, cpds, hospitalier, nord, deux, sevres, faye, abbesse, parthenay, thouars ; jetons de lieu aucune ; 22 événements passés au crible, 0 signal(aux) retenu(s), 0 candidat(s), 0 rattachement(s) bruité(s).

- **Verdict** : **rien** — aucun élément antérieur ne désigne l'entité.

### `na-couv-033` — Cabinet d'une rhumatologue libérale installée en Creuse — logiciel Weda
- **Fait** : compromission, 2025-11-10 (Creuse).
- **Instantané** : J-21 = 2025-10-20 ; fenêtre [2025-09-30, 2025-10-20] (21 j) ; référence = dateIncident.
- **Événements à J-21** : 22 (1409 événements plus anciens comptés, non détaillés).
  - Familles : vuln 16 · cert 3 · cti 3.
  - Natures : confirmed_incident 16 · ambient_signal 6.
- **Sources actives** (11) : cat-cert-at-warnings, cat-elastic-security-labs, cat-ncsc-nl-news, cert-fr-alerte, cisa_kev, leak:ddosecrets:rss, tg-itsecalert, tg-leaked-databases, tg-marketo-leaks, tg-snatch-news, tg-techpwnews.
- **Organisations citées** (0) : aucune.
- **Ruptures détectées** (0) : aucune sur l'entité ; `nouvelle-organisation` non calculable faute d'historique.
- **Recherche** : jetons d'entité une, rhumatologue, liberale, installee, creuse, logiciel, weda ; jetons de lieu aucune ; 22 événements passés au crible, 0 signal(aux) retenu(s), 0 candidat(s), 0 rattachement(s) bruité(s).

- **Verdict** : **rien** — aucun élément antérieur ne désigne l'entité.

### `na-couv-034` — Ville de La Rochelle — prestataire Synbird
- **Fait** : fuite, 2025-11-27 (Charente-Maritime).
- **Instantané** : J-21 = 2025-11-06 ; fenêtre [2025-10-17, 2025-11-06] (21 j) ; référence = datePublique.
- **Événements à J-21** : 13 (1420 événements plus anciens comptés, non détaillés).
  - Familles : vuln 10 · cti 2 · cert 1.
  - Natures : confirmed_incident 10 · ambient_signal 3.
- **Sources actives** (11) : cat-cert-at-warnings, cat-elastic-security-labs, cat-ncsc-nl-news, cert-fr-alerte, cisa_kev, leak:ddosecrets:rss, tg-itsecalert, tg-leaked-databases, tg-marketo-leaks, tg-snatch-news, tg-techpwnews.
- **Organisations citées** (0) : aucune.
- **Ruptures détectées** (0) : aucune sur l'entité ; `nouvelle-organisation` non calculable faute d'historique.
- **Recherche** : jetons d'entité rochelle, prestataire, synbird ; jetons de lieu aucune ; 13 événements passés au crible, 0 signal(aux) retenu(s), 0 candidat(s), 0 rattachement(s) bruité(s).

- **Anomalies** : DATE_PUBLIQUE (voir §7).

- **Verdict** : **rien** — aucun élément antérieur ne désigne l'entité.

### `na-couv-035` — Ville de Niort
- **Fait** : phishing, 2025-12-13 (Deux-Sèvres).
- **Instantané** : J-21 = 2025-11-22 ; fenêtre [2025-11-02, 2025-11-22] (21 j) ; référence = datePublique.
- **Événements à J-21** : 9 (1427 événements plus anciens comptés, non détaillés).
  - Familles : vuln 8 · leaks 1.
  - Natures : confirmed_incident 8 · ambient_signal 1.
- **Sources actives** (11) : cat-cert-at-warnings, cat-elastic-security-labs, cat-ncsc-nl-news, cert-fr-alerte, cisa_kev, leak:ddosecrets:rss, tg-itsecalert, tg-leaked-databases, tg-marketo-leaks, tg-snatch-news, tg-techpwnews.
- **Organisations citées** (0) : aucune.
- **Ruptures détectées** (0) : aucune sur l'entité ; `nouvelle-organisation` non calculable faute d'historique.
- **Recherche** : jetons d'entité niort ; jetons de lieu aucune ; 9 événements passés au crible, 0 signal(aux) retenu(s), 0 candidat(s), 0 rattachement(s) bruité(s).

- **Anomalies** : DATE_PUBLIQUE (voir §7).

- **Verdict** : **rien** — aucun élément antérieur ne désigne l'entité.

### `na-couv-036` — Grand Poitiers — régie des parkings
- **Fait** : escroquerie, 2026-01-22 (Vienne).
- **Instantané** : J-21 = 2026-01-01 ; fenêtre [2025-12-12, 2026-01-01] (21 j) ; référence = dateIncident.
- **Événements à J-21** : 8 (1443 événements plus anciens comptés, non détaillés).
  - Familles : vuln 6 · cert 2.
  - Natures : confirmed_incident 6 · ambient_signal 2.
- **Sources actives** (11) : cat-cert-at-warnings, cat-elastic-security-labs, cat-ncsc-nl-news, cert-fr-alerte, cisa_kev, leak:ddosecrets:rss, tg-itsecalert, tg-leaked-databases, tg-marketo-leaks, tg-snatch-news, tg-techpwnews.
- **Organisations citées** (0) : aucune.
- **Ruptures détectées** (0) : aucune sur l'entité ; `nouvelle-organisation` non calculable faute d'historique.
- **Recherche** : jetons d'entité grand, poitiers, regie, parkings ; jetons de lieu aucune ; 8 événements passés au crible, 0 signal(aux) retenu(s), 0 candidat(s), 0 rattachement(s) bruité(s).

- **Verdict** : **rien** — aucun élément antérieur ne désigne l'entité.

### `na-couv-037` — Vivaticket France (Chasseneuil-du-Poitou)
- **Fait** : compromission, 2026-03-02 (Vienne).
- **Instantané** : J-21 = 2026-02-09 ; fenêtre [2026-01-20, 2026-02-09] (21 j) ; référence = dateIncident.
- **Événements à J-21** : 21 (1471 événements plus anciens comptés, non détaillés).
  - Familles : vuln 14 · cert 3 · cti 3 · cert_fr 1.
  - Natures : confirmed_incident 14 · ambient_signal 7.
- **Sources actives** (11) : cat-cert-at-warnings, cat-elastic-security-labs, cat-ncsc-nl-news, cert-fr-alerte, cisa_kev, leak:ddosecrets:rss, tg-itsecalert, tg-leaked-databases, tg-marketo-leaks, tg-snatch-news, tg-techpwnews.
- **Organisations citées** (0) : aucune.
- **Ruptures détectées** (0) : aucune sur l'entité ; `nouvelle-organisation` non calculable faute d'historique.
- **Recherche** : jetons d'entité vivaticket, france, chasseneuil, poitou ; jetons de lieu aucune ; 21 événements passés au crible, 0 signal(aux) retenu(s), 0 candidat(s), 0 rattachement(s) bruité(s).

- **Verdict** : **rien** — aucun élément antérieur ne désigne l'entité.

### `na-couv-038` — Hennessy — billetterie des Visites Hennessy (Cognac)
- **Fait** : ransomware, 2026-03-02 (Charente).
- **Instantané** : J-21 = 2026-02-09 ; fenêtre [2026-01-20, 2026-02-09] (21 j) ; référence = dateIncident.
- **Événements à J-21** : 21 (1471 événements plus anciens comptés, non détaillés).
  - Familles : vuln 14 · cert 3 · cti 3 · cert_fr 1.
  - Natures : confirmed_incident 14 · ambient_signal 7.
- **Sources actives** (11) : cat-cert-at-warnings, cat-elastic-security-labs, cat-ncsc-nl-news, cert-fr-alerte, cisa_kev, leak:ddosecrets:rss, tg-itsecalert, tg-leaked-databases, tg-marketo-leaks, tg-snatch-news, tg-techpwnews.
- **Organisations citées** (0) : aucune.
- **Ruptures détectées** (0) : aucune sur l'entité ; `nouvelle-organisation` non calculable faute d'historique.
- **Recherche** : jetons d'entité hennessy, billetterie, visites, hennessy, cognac ; jetons de lieu aucune ; 21 événements passés au crible, 0 signal(aux) retenu(s), 0 candidat(s), 0 rattachement(s) bruité(s).

- **Verdict** : **rien** — aucun élément antérieur ne désigne l'entité.

### `na-couv-039` — Ville de Gradignan — police municipale
- **Fait** : fuite, 2026-05-10 (Gironde).
- **Instantané** : J-21 = 2026-04-19 ; fenêtre [2026-03-30, 2026-04-19] (21 j) ; référence = dateIncident.
- **Événements à J-21** : 31 (1556 événements plus anciens comptés, non détaillés).
  - Familles : vuln 14 · leaks 6 · cert 5 · cti 5 · cert_fr 1.
  - Natures : ambient_signal 17 · confirmed_incident 14.
- **Sources actives** (11) : cat-cert-at-warnings, cat-elastic-security-labs, cat-ncsc-nl-news, cert-fr-alerte, cisa_kev, leak:ddosecrets:rss, tg-itsecalert, tg-leaked-databases, tg-marketo-leaks, tg-snatch-news, tg-techpwnews.
- **Organisations citées** (0) : aucune.
- **Ruptures détectées** (0) : aucune sur l'entité ; `nouvelle-organisation` non calculable faute d'historique.
- **Recherche** : jetons d'entité gradignan, police, municipale ; jetons de lieu aucune ; 31 événements passés au crible, 0 signal(aux) retenu(s), 0 candidat(s), 0 rattachement(s) bruité(s).

- **Verdict** : **rien** — aucun élément antérieur ne désigne l'entité.

### `na-couv-040` — Soluris — syndicat informatique de la Charente-Maritime (Saintes)
- **Fait** : compromission, 2026-05-21 (Charente-Maritime).
- **Instantané** : J-21 = 2026-04-30 ; fenêtre [2026-04-10, 2026-04-30] (21 j) ; référence = dateIncident.
- **Événements à J-21** : 31 (1572 événements plus anciens comptés, non détaillés).
  - Familles : vuln 22 · cert 5 · leaks 3 · cti 1.
  - Natures : confirmed_incident 22 · ambient_signal 9.
- **Sources actives** (11) : cat-cert-at-warnings, cat-elastic-security-labs, cat-ncsc-nl-news, cert-fr-alerte, cisa_kev, leak:ddosecrets:rss, tg-itsecalert, tg-leaked-databases, tg-marketo-leaks, tg-snatch-news, tg-techpwnews.
- **Organisations citées** (0) : aucune.
- **Ruptures détectées** (0) : aucune sur l'entité ; `nouvelle-organisation` non calculable faute d'historique.
- **Recherche** : jetons d'entité soluris, informatique, charente, maritime, saintes ; jetons de lieu aucune ; 31 événements passés au crible, 0 signal(aux) retenu(s), 0 candidat(s), 0 rattachement(s) bruité(s).

- **Verdict** : **rien** — aucun élément antérieur ne désigne l'entité.

### `na-couv-041` — ARS Nouvelle-Aquitaine — plateforme d'autorisations parentales HPV/MenACWY (prestataire SYADEM)
- **Fait** : fuite, 2026-07-08 (Gironde).
- **Instantané** : J-21 = 2026-06-17 ; fenêtre [2026-05-28, 2026-06-17] (21 j) ; référence = datePublique.
- **Événements à J-21** : 28 (1626 événements plus anciens comptés, non détaillés).
  - Familles : vuln 20 · cert 7 · cti 1.
  - Natures : ambient_signal 14 · confirmed_incident 14.
- **Sources actives** (12) : cat-cert-at-warnings, cat-cert-pl, cat-elastic-security-labs, cat-ncsc-nl-news, cert-fr-alerte, cisa_kev, leak:ddosecrets:rss, tg-itsecalert, tg-leaked-databases, tg-marketo-leaks, tg-snatch-news, tg-techpwnews.
- **Organisations citées** (0) : aucune.
- **Ruptures détectées** (0) : aucune sur l'entité ; `nouvelle-organisation` non calculable faute d'historique.
- **Recherche** : jetons d'entité ars, nouvelle, aquitaine, plateforme, autorisations, parentales, hpv, menacwy, prestataire, syadem ; jetons de lieu aucune ; 28 événements passés au crible, 0 signal(aux) retenu(s), 0 candidat(s), 0 rattachement(s) bruité(s).

- **Anomalies** : DATE_PUBLIQUE (voir §7).

- **Verdict** : **rien** — aucun élément antérieur ne désigne l'entité.

### `na-couv-042` — SDIS des Landes
- **Fait** : fuite, 2026-07-25 (Landes).
- **Instantané** : J-21 = 2026-07-04 ; fenêtre [2026-06-14, 2026-07-04] (21 j) ; référence = dateIncident.
- **Événements à J-21** : 32 (1652 événements plus anciens comptés, non détaillés).
  - Familles : vuln 26 · cert 3 · cti 3.
  - Natures : ambient_signal 21 · confirmed_incident 11.
- **Sources actives** (12) : cat-cert-at-warnings, cat-cert-pl, cat-elastic-security-labs, cat-ncsc-nl-news, cert-fr-alerte, cisa_kev, leak:ddosecrets:rss, tg-itsecalert, tg-leaked-databases, tg-marketo-leaks, tg-snatch-news, tg-techpwnews.
- **Organisations citées** (0) : aucune.
- **Ruptures détectées** (0) : aucune sur l'entité ; `nouvelle-organisation` non calculable faute d'historique.
- **Recherche** : jetons d'entité sdis, landes ; jetons de lieu aucune ; 32 événements passés au crible, 0 signal(aux) retenu(s), 0 candidat(s), 0 rattachement(s) bruité(s).

- **Verdict** : **rien** — aucun élément antérieur ne désigne l'entité.

### `na-couv-043` — Hôtes Gîtes de France de la Creuse
- **Fait** : phishing, 2026-08-05 (Creuse).
- **Instantané** : J-21 = 2026-07-15 ; fenêtre [2026-06-25, 2026-07-15] (21 j) ; référence = datePublique.
- **Événements à J-21** : 33 (1671 événements plus anciens comptés, non détaillés).
  - Familles : vuln 29 · cert 2 · cert_fr 1 · cti 1.
  - Natures : ambient_signal 20 · confirmed_incident 13.
- **Sources actives** (12) : cat-cert-at-warnings, cat-cert-pl, cat-elastic-security-labs, cat-ncsc-nl-news, cert-fr-alerte, cisa_kev, leak:ddosecrets:rss, tg-itsecalert, tg-leaked-databases, tg-marketo-leaks, tg-snatch-news, tg-techpwnews.
- **Organisations citées** (0) : aucune.
- **Ruptures détectées** (0) : aucune sur l'entité ; `nouvelle-organisation` non calculable faute d'historique.
- **Recherche** : jetons d'entité hotes, gites, france, creuse ; jetons de lieu aucune ; 33 événements passés au crible, 0 signal(aux) retenu(s), 0 candidat(s), 0 rattachement(s) bruité(s).

- **Anomalies** : DATE_PUBLIQUE (voir §7).

- **Verdict** : **rien** — aucun élément antérieur ne désigne l'entité.

### `na-couv-044` — Mairie de Marennes-Hiers-Brouage
- **Fait** : compromission, 2026-08-17 (Charente-Maritime).
- **Instantané** : J-21 = 2026-07-27 ; fenêtre [2026-07-07, 2026-07-27] (21 j) ; référence = dateIncident.
- **Événements à J-21** : 45 (1698 événements plus anciens comptés, non détaillés).
  - Familles : vuln 32 · cti 6 · cert 4 · cert_fr 3.
  - Natures : ambient_signal 27 · confirmed_incident 18.
- **Sources actives** (12) : cat-cert-at-warnings, cat-cert-pl, cat-elastic-security-labs, cat-ncsc-nl-news, cert-fr-alerte, cisa_kev, leak:ddosecrets:rss, tg-itsecalert, tg-leaked-databases, tg-marketo-leaks, tg-snatch-news, tg-techpwnews.
- **Organisations citées** (0) : aucune.
- **Ruptures détectées** (0) : aucune sur l'entité ; `nouvelle-organisation` non calculable faute d'historique.
- **Recherche** : jetons d'entité marennes, hiers, brouage ; jetons de lieu aucune ; 45 événements passés au crible, 0 signal(aux) retenu(s), 0 candidat(s), 0 rattachement(s) bruité(s).

- **Verdict** : **rien** — aucun élément antérieur ne désigne l'entité.

### `na-couv-045` — Ville de Tarnos
- **Fait** : ransomware, 2026-08-28 (Landes).
- **Instantané** : J-21 = 2026-08-07 ; fenêtre [2026-07-18, 2026-08-07] (21 j) ; référence = dateIncident.
- **Événements à J-21** : 48 (1722 événements plus anciens comptés, non détaillés).
  - Familles : vuln 26 · cti 12 · cert 8 · cert_fr 2.
  - Natures : ambient_signal 36 · confirmed_incident 12.
- **Sources actives** (12) : cat-cert-at-warnings, cat-cert-pl, cat-elastic-security-labs, cat-ncsc-nl-news, cert-fr-alerte, cisa_kev, leak:ddosecrets:rss, tg-itsecalert, tg-leaked-databases, tg-marketo-leaks, tg-snatch-news, tg-techpwnews.
- **Organisations citées** (0) : aucune.
- **Ruptures détectées** (0) : aucune sur l'entité ; `nouvelle-organisation` non calculable faute d'historique.
- **Recherche** : jetons d'entité tarnos ; jetons de lieu aucune ; 48 événements passés au crible, 0 signal(aux) retenu(s), 0 candidat(s), 0 rattachement(s) bruité(s).

- **Verdict** : **rien** — aucun élément antérieur ne désigne l'entité.

### `na-couv-046` — Euskal Moneta (association support de la monnaie locale Eusko)
- **Fait** : compromission, 2026-08-17 (Pyrénées-Atlantiques).
- **Instantané** : J-21 = 2026-07-27 ; fenêtre [2026-07-07, 2026-07-27] (21 j) ; référence = dateIncident.
- **Événements à J-21** : 45 (1698 événements plus anciens comptés, non détaillés).
  - Familles : vuln 32 · cti 6 · cert 4 · cert_fr 3.
  - Natures : ambient_signal 27 · confirmed_incident 18.
- **Sources actives** (12) : cat-cert-at-warnings, cat-cert-pl, cat-elastic-security-labs, cat-ncsc-nl-news, cert-fr-alerte, cisa_kev, leak:ddosecrets:rss, tg-itsecalert, tg-leaked-databases, tg-marketo-leaks, tg-snatch-news, tg-techpwnews.
- **Organisations citées** (0) : aucune.
- **Ruptures détectées** (0) : aucune sur l'entité ; `nouvelle-organisation` non calculable faute d'historique.
- **Recherche** : jetons d'entité euskal, moneta, support, monnaie, locale, eusko ; jetons de lieu aucune ; 45 événements passés au crible, 0 signal(aux) retenu(s), 0 candidat(s), 0 rattachement(s) bruité(s).

- **Verdict** : **rien** — aucun élément antérieur ne désigne l'entité.

### `na-couv-047` — Commissariat de police de Royan (numéro usurpé)
- **Fait** : phishing, 2026-09-07 (Charente-Maritime).
- **Instantané** : J-21 = 2026-08-17 ; fenêtre [2026-07-28, 2026-08-17] (21 j) ; référence = dateIncident.
- **Événements à J-21** : 35 (1733 événements plus anciens comptés, non détaillés).
  - Familles : vuln 20 · cert 8 · cti 7.
  - Natures : ambient_signal 28 · confirmed_incident 7.
- **Sources actives** (12) : cat-cert-at-warnings, cat-cert-pl, cat-elastic-security-labs, cat-ncsc-nl-news, cert-fr-alerte, cisa_kev, leak:ddosecrets:rss, tg-itsecalert, tg-leaked-databases, tg-marketo-leaks, tg-snatch-news, tg-techpwnews.
- **Organisations citées** (0) : aucune.
- **Ruptures détectées** (0) : aucune sur l'entité ; `nouvelle-organisation` non calculable faute d'historique.
- **Recherche** : jetons d'entité commissariat, police, royan, numero, usurpe ; jetons de lieu aucune ; 35 événements passés au crible, 0 signal(aux) retenu(s), 0 candidat(s), 0 rattachement(s) bruité(s).

- **Verdict** : **rien** — aucun élément antérieur ne désigne l'entité.

### `na-couv-048` — Mairie d’Espelette
- **Fait** : phishing, 2026-09-11 (Pyrénées-Atlantiques).
- **Instantané** : J-21 = 2026-08-21 ; fenêtre [2026-08-01, 2026-08-21] (21 j) ; référence = dateIncident.
- **Événements à J-21** : 33 (1747 événements plus anciens comptés, non détaillés).
  - Familles : vuln 22 · cert 8 · cti 3.
  - Natures : ambient_signal 20 · confirmed_incident 13.
- **Sources actives** (12) : cat-cert-at-warnings, cat-cert-pl, cat-elastic-security-labs, cat-ncsc-nl-news, cert-fr-alerte, cisa_kev, leak:ddosecrets:rss, tg-itsecalert, tg-leaked-databases, tg-marketo-leaks, tg-snatch-news, tg-techpwnews.
- **Organisations citées** (1) : OPEN SOURCE (#482872).
- **Ruptures détectées** (0) : aucune sur l'entité ; `nouvelle-organisation` non calculable faute d'historique.
- **Recherche** : jetons d'entité espelette ; jetons de lieu aucune ; 33 événements passés au crible, 0 signal(aux) retenu(s), 0 candidat(s), 1 rattachement(s) bruité(s).

  - **Rattachements écartés** :
    - Kritieke SQL-injectie in GeoTools open source Java-bibliotheek: update onmiddellijk — rattachement à « OPEN SOURCE » sans recoupement avec l'entité.
- **Verdict** : **rien** — 1 rattachement(s) bruité(s) écarté(s), aucun autre recoupement.

### `na-couv-049` — Intermarché d'Altillac
- **Fait** : compromission, 2026-10-12 (Corrèze).
- **Instantané** : J-21 = 2026-09-21 ; fenêtre [2026-09-01, 2026-09-21] (21 j) ; référence = dateIncident.
- **Événements à J-21** : 122 (1894 événements plus anciens comptés, non détaillés).
  - Familles : cti 63 · vuln 39 · cert 11 · leaks 7 · cert_fr 2.
  - Natures : ambient_signal 92 · confirmed_incident 30.
- **Sources actives** (20) : actu-infosecurity-magazine, actu-welivesecurity, cat-cert-at-warnings, cat-cert-lv, cat-cert-pl, cat-cisa-ics-medical, cat-drupal-sa, cat-elastic-security-labs, cat-ncsc-nl-news, cat-sentinelone-labs, cert-fr-alerte, cisa_kev … (+8).
- **Organisations citées** (1) : lyon.co.uk (#2423931).
- **Ruptures détectées** (0) : aucune sur l'entité ; `nouvelle-organisation` non calculable faute d'historique.
- **Recherche** : jetons d'entité intermarche, altillac ; jetons de lieu aucune ; 122 événements passés au crible, 0 signal(aux) retenu(s), 0 candidat(s), 1 rattachement(s) bruité(s).

  - **Rattachements écartés** :
    - Questel - 1,226,209 breached accounts — rattachement à « lyon.co.uk » sans recoupement avec l'entité.
- **Verdict** : **rien** — 1 rattachement(s) bruité(s) écarté(s), aucun autre recoupement.

### `na-couv-050` — Climb Up Limoges (fuite touchant plusieurs salles du groupe)
- **Fait** : fuite, 2026-10-14 (Haute-Vienne).
- **Instantané** : J-21 = 2026-09-23 ; fenêtre [2026-09-03, 2026-09-23] (21 j) ; référence = datePublique.
- **Événements à J-21** : 127 (1913 événements plus anciens comptés, non détaillés).
  - Familles : cti 72 · vuln 38 · cert 10 · leaks 6 · cert_fr 1.
  - Natures : ambient_signal 100 · confirmed_incident 27.
- **Sources actives** (20) : actu-infosecurity-magazine, actu-welivesecurity, cat-cert-at-warnings, cat-cert-lv, cat-cert-pl, cat-cisa-ics-medical, cat-drupal-sa, cat-elastic-security-labs, cat-ncsc-nl-news, cat-sentinelone-labs, cert-fr-alerte, cisa_kev … (+8).
- **Organisations citées** (0) : aucune.
- **Ruptures détectées** (0) : aucune sur l'entité ; `nouvelle-organisation` non calculable faute d'historique.
- **Recherche** : jetons d'entité climb, limoges, fuite, touchant, plusieurs, salles ; jetons de lieu aucune ; 127 événements passés au crible, 0 signal(aux) retenu(s), 0 candidat(s), 0 rattachement(s) bruité(s).

- **Anomalies** : DATE_PUBLIQUE (voir §7).

- **Verdict** : **rien** — aucun élément antérieur ne désigne l'entité.

## 6. Presque-signaux et faux positifs

Les rattachements d'organisation sont le seul endroit où un signal aurait pu apparaître par erreur.
Ils sont listés ici avec le motif exact du rejet.

| Incident | Organisation(s) | Titre de l'événement | Motif du rejet |
|---|---|---|---|
| `na-couv-027` | PARTIE SON | Incidents de sécurité dans les pare-feux SonicWall (05 août 2025) | rattachement à « PARTIE SON » sans recoupement avec l'entité |
| `na-couv-028` | PARTIE SON | Incidents de sécurité dans les pare-feux SonicWall (05 août 2025) | rattachement à « PARTIE SON » sans recoupement avec l'entité |
| `na-couv-030` | PARTIE SON | Incidents de sécurité dans les pare-feux SonicWall (05 août 2025) | rattachement à « PARTIE SON » sans recoupement avec l'entité |
| `na-couv-048` | OPEN SOURCE | Kritieke SQL-injectie in GeoTools open source Java-bibliotheek: update onmiddellijk | rattachement à « OPEN SOURCE » sans recoupement avec l'entité |
| `na-couv-049` | lyon.co.uk | Questel - 1,226,209 breached accounts | rattachement à « lyon.co.uk » sans recoupement avec l'entité |

Motifs, agrégés :

- 3 × rattachement à « PARTIE SON » sans recoupement avec l'entité
- 1 × rattachement à « OPEN SOURCE » sans recoupement avec l'entité
- 1 × rattachement à « lyon.co.uk » sans recoupement avec l'entité

## 7. Cas d'erreur, états vides et anomalies détectées

Le script distingue les erreurs bloquantes (le document serait faux) des anomalies signalées
(le document reste publiable mais sa limite est explicite).

**Erreurs bloquantes** : corpus JSON illisible ou sans tableau `incidents` ; corpus JSONL illisible
ou incomplet (identifiant, organisation et date requis) ; ligne d'instantané illisible ;
identifiant manquant, dupliqué ou inconnu ; instantané manquant pour un incident du corpus ;
date de référence absente ou invalide ; fenêtre J-21 mal formée. Le script s'arrête avec un code
d'erreur explicite au lieu de publier un chiffre partiel.

**États vides pris en charge** : corpus vide (document « mesure vide », pas « 0 % ») ; fenêtre
sans événement (dossier « rien — fenêtre vide ») ; aucune source active ; aucune organisation citée ;
aucun signal, aucun candidat et aucune rupture (listes vides affichées comme telles). Aucune division
par zéro : médiane et pourcentage passent par `resumerAnticipation`, qui les rend `null`/`0`.

**Contrôles appliqués aux entrées** : cohérence des comptes, dates dans la fenêtre, source et
organisation présentes dans les listes, nature d'assertion connue, titre complet ou tronqué.

**20 anomalie(s) signalée(s)** :

| Code | Nombre | Exemples |
|---|---:|---|
| `DATE_PUBLIQUE` | 19 | na-couv-010 : aucune date d'incident : J-21 calculé depuis la date de publication ; na-couv-011 : aucune date d'incident : J-21 calculé depuis la date de publication ; na-couv-013 : aucune date d'incident : J-21 calculé depuis la date de publication |
| `TITRE_TRONQUE` | 1 | na-couv-029 : événement 129067 : titre tronqué à 200 caractères |

Fenêtres partagées : plusieurs incidents peuvent avoir le même J-21, donc exactement la même
fenêtre d'observation. Leurs verdicts ne sont pas indépendants et ne doivent pas être comptés
comme des confirmations mutuelles.

| J-21 | Incidents |
|---|---|
| 2026-02-09 | `na-couv-037`, `na-couv-038` |
| 2026-07-27 | `na-couv-044`, `na-couv-046` |

## 8. Pourquoi ce zéro

1. **Couverture.** Les incidents du corpus sont révélés par la presse locale et régionale
   (Sud Ouest, France 3 Nouvelle-Aquitaine, Charente Libre, La Nouvelle République) puis par des
   communiqués d'établissements. Les sources actives des fenêtres sont : actu-infosecurity-magazine, actu-welivesecurity, cat-cert-at-warnings, cat-cert-lv, cat-cert-pl, cat-cisa-ics-medical, cat-drupal-sa, cat-elastic-security-labs, cat-ncsc-nl-news, cat-sentinelone-labs, cert-fr-alerte, cisa_kev, leak:ddosecrets:rss, leak:hibp:breaches-index, leak:hibp:latest-breaches, tg-itsecalert, tg-leaked-databases, tg-marketo-leaks, tg-snatch-news, tg-techpwnews. Aucune n'est un média local de Nouvelle-Aquitaine : l'information qui aurait pu alerter
   n'était pas dans le système à J-21.
2. **Nature des données.** Sur 1170 événements examinés : technical_indicator 0, third_party_claim 0, alerte 0. Les natures les plus proches d'un avertissement sont absentes de l'instantané.
3. **Le rattachement automatique ne compense pas.** 5 rattachements
   sur 5 incidents viennent de trois motifs : « OPEN SOURCE » (avis CERT-NL sur GeoTools), « lyon.co.uk » (publication HIBP sur Questel) et « PARTIE SON »
   (avis CERT-FR sur SonicWall). Aucun ne désigne une entité du corpus. Les compter comme des
   signaux ferait passer le taux de 0/50 à 5/50 avec du bruit pur.

## 9. Limites et conditions de changement

- Les titres de l'instantané sont tronqués à 200 caractères : une mention en fin de titre
  pourrait échapper au crible.
- Les événements antérieurs à la fenêtre sont comptés mais non détaillés : un signal très ancien
  ne peut pas être retrouvé par ce document.
- L'instantané ne contient ni indicateur technique, ni revendication tierce, ni alerte, ni historique
  de première apparition d'organisation : trois des quatre pistes de détection sont donc vides par
  construction, et la quatrième est partielle.
- Une fenêtre partagée réduit le nombre d'observations réellement indépendantes.
- Le défaut est de couverture, pas de modèle : classer du bruit avec un score ne créerait pas de signal.
- Pour faire changer le verdict : brancher des sources locales et régionales, extraire les entités
  et alias, capter indicateurs et revendications, puis régénérer l'instantané et relancer ce script.

## 10. Reproduction

```bash
# régénérer l'instantané des 50 incidents depuis PostgreSQL (filtre strict sur valid_at) :
apps/api/node_modules/.bin/tsx scripts/anticipation.mts
# produire / vérifier ce document sans base :
apps/api/node_modules/.bin/tsx scripts/rapport-anticipation.mts
apps/api/node_modules/.bin/tsx scripts/rapport-anticipation.mts --verifier
```

Le résultat est déterministe : mêmes entrées (empreintes ci-dessus), même octets en sortie.
