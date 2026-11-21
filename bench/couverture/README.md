# Corpus de couverture — incidents cyber en Nouvelle-Aquitaine

## Objet

`incidents.jsonl` contient **50 incidents cyber publics survenus en Nouvelle-Aquitaine entre 2024 et 2026**, répartis sur les 12 départements. Chaque ligne est un événement réel, daté, localisé et adossé à une page publique consultable. Ce n'est **pas** un inventaire exhaustif : c'est un échantillon dont chaque entrée peut être re-vérée indépendamment avec `scripts/valider-corpus.mts`.

| Département | Lignes | Département | Lignes |
| --- | ---: | --- | ---: |
| Charente | 5 | Haute-Vienne | 4 |
| Charente-Maritime | 5 | Landes | 4 |
| Corrèze | 5 | Lot-et-Garonne | 1 |
| Creuse | 4 | Pyrénées-Atlantiques | 4 |
| Deux-Sèvres | 4 | Vienne | 4 |
| Dordogne | 5 | Gironde | 5 |

Répartition par année de publication : 13 en 2024, 22 en 2025, 15 en 2026.

## Format

Un objet JSON par ligne (JSONL, UTF-8, sans retour à la ligne interne). Champs :

| Champ | Contenu |
| --- | --- |
| `id` | Identifiant stable `na-couv-001` … `na-couv-050` (attribué après tri chronologique) |
| `date_publication` | Date de publication de la source (`AAAA-MM-JJ`) |
| `date_incident` | Date de l'incident donnée par la source ; `null` quand la page ne la précise pas |
| `organisation` | Organisation visée, telle que nommée par la source |
| `departement` | Département de Nouvelle-Aquitaine concerné |
| `type` | `compromission`, `ransomware`, `fuite`, `phishing`, `defacement`, `escroquerie` |
| `source` | Média ou émetteur du communiqué officiel |
| `titre` | Titre de la page source |
| `url` | URL publique de la page retenue (une par incident) |
| `extrait` | Citation courte, mot pour mot, tirée de la page lue |
| `resume` | Résumé en français, sans fait non attesté par la source |
| `confiance` | `etabli` (victime/autorité confirme) ou `rapporte` (presse seule) |
| `verifie_le` | Date de la dernière re-vérification de l'URL (`2026-11-21`) |

Champ facultatif `mention` : nom court tel qu'il figure dans la page (acronyme ou raison sociale), utilisé par le validateur quand `organisation` est une description longue. Les citations sont courtes et accompagnées d'un lien ; aucun article n'est reproduit intégralement.

## Critères d'inclusion

Un incident n'est retenu que si **tous** les points ci-dessous sont réunis :

1. **Réalité de l'incident** : la page décrit un événement survenu (ou une tentative d'usurpation/hameçonnage effectivement reçue et documentée), pas une recommandation de sécurité, une vulnérabilité théorique ou une rumeur.
2. **Ancrage en Nouvelle-Aquitaine** : organisation concernée dans un des 12 départements, ou impact régional explicitement documenté (prestataires et fédérations nationales).
3. **Fenêtre 2024-2026** : publication et incident dans la période ; `date_incident` reste `null` quand la source ne la donne pas.
4. **Source publique et URL vérifiables** : page ouverte, texte lu, organisation effectivement mentionnée et extrait de preuve relevé.
5. **Déduplication** : un même événement couvert par plusieurs médias ne donne qu'une ligne ; la source la plus solide est conservée (communiqué de la victime ou de l'autorité > presse locale > agrégateur). Les vagues nationales (billetterie Sirius, Synbird, Maileva) donnent une entrée par victime documentée distincte, jamais deux entrées pour le même article.

## Méthode de constitution

1. **Réservoir existant** : les corpus par département `bench/corpus/incidents-*.jsonl` (111 lignes) et le corpus de couverture précédent (20 lignes) ont servi de point de départ. Les doublons d'URL ont été retirés, soit **112 URL uniques** soumises au validateur.
2. **Contrôle automatisé** : `scripts/valider-corpus.mts` recharge chaque URL (lecture directe, puis lecteur `r.jina.ai` si la page est bloquée ou rendue côté client), normalise le texte (accents, ponctuation, entités HTML) et exige une mention nominative de l'organisation : nom complet, segment principal ou acronyme. Un mot purement générique (« théâtre », « espace », « commissariat », « réseaux ») ne suffit jamais. Les codes 429 du lecteur sont réessayés ; un dernier recours HTTPS tolère le proxy TLS intercepteur de ce poste et le signale dans le détail.
3. **Triage et sélection** : 104 URL sur 112 passaient le contrôle lors du premier balayage (92,9 % ; 2 mortes, 6 incohérentes). Les 50 lignes retenues sont issues de ce lot, avec une représentation des 12 départements et une préférence pour les communiqués officiels et la presse locale nommément identifiable.
4. **Lecture des pages retenues** : titre, date de publication, organisation, localisation et extrait vérifiés ; les faits non établis (auteur, volume exact de données, exfiltration réelle) ne sont pas affirmés dans les résumés.
5. **Contrôle final** : le 2026-11-21, les 50 URL ont été relues une à une par le script : **50 valides / 0 morte / 0 incohérente**, soit un **taux de validité observé de 100 %**. Ce taux est un instantané : un média peut déplacer ou fermer une page ensuite.

## Ce qui a été écarté

- **URL mortes ou inexploitables** : communiqué PDF de l'UNSS (`denys-puech.mon-ent-occitanie.fr`, non extractible), page de la Ville de Limoges sur la campagne HPV (403 sur le site et dans le lecteur). Ces incidents restent documentés ailleurs mais n'ont pas été conservés sous une URL vérifiable.
- **Pages incohérentes** (6 sur 112 au tri) : titres prometteurs dont le corps ne mentionnait ni l'organisation ni l'incident (ex. pages d'actualité générale ou pages dont le contenu a été remplacé).
- **Doublons d'événements** : plusieurs articles sur le même incident (Cité de la BD, La Salle de Brive, EHPAD de Champdeniers, FNC, Novabio, Fumel, Sirius, Poitiers) ne donnent qu'une entrée, sur la source la plus solide.
- **Revendications seules** sans confirmation de la victime ni seconde source solide (Nova/UPPA, AlumnForce, Vignobles Toutigeac, FOL 23 / Apt73), ainsi que les simples alertes sans incident survenu.
- **Hors période ou hors région** : Coaxis (2023), Cdiscount (2021), et tout événement dont aucun élément lu ne le localise en Nouvelle-Aquitaine.
- **Sources non consultables** : pages payantes dont seul le texte effectivement accessible a servi de preuve, et agrégateurs sans citation d'une source primaire.

## Re-vérifier le fichier

```bash
cd /home/jolt/radar-cyber
apps/api/node_modules/.bin/tsx scripts/valider-corpus.mts bench/couverture/incidents.jsonl --json /tmp/couverture-validation.json
wc -l bench/couverture/incidents.jsonl    # 50
jq -c . bench/couverture/incidents.jsonl > /dev/null
```

Le script affiche le nombre d'`URL valides`, d'`URL mortes` et d'`URL incohérentes`, le détail de chaque anomalie, puis l'origine du contenu lu (direct / lecteur). Il quitte avec le code 1 dès qu'une ligne n'est pas valide ; le fichier JSON optionnel contient le résultat ligne par ligne, y compris la clé de correspondance trouvée dans la page.

## Limites

- Les incidents non médiatisés, traités en interne ou jamais annoncés par la victime échappent à la collecte ; un département peu couvert (Lot-et-Garonne : 1 entrée) reflète cette disponibilité documentaire, pas une absence d'incidents.
- Certaines victimes sont anonymisées par la source (« une rhumatologue libérale », « des hôtes Gîtes de France ») : la mention vérifiée est alors descriptive, pas un nom propre.
- Pour les prestataires nationaux (Sirius, Synbird, Vivaticket, FNC), l'incident est national mais l'entrée est ancrée sur le site ou les adhérents de Nouvelle-Aquitaine documentés par la page.
- `confiance: "rapporte"` ne signifie pas « non avéré » : l'incident est rapporté par une source publique identifiable, sans confirmation nominative de la victime dans la page lue.
