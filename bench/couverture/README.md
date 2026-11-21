# Corpus de couverture — incidents cyber en Nouvelle-Aquitaine

## Objet

`incidents.jsonl` contient **20 incidents cyber publics survenus en Nouvelle-Aquitaine entre 2024 et 2026**. Il sert de corpus de vérification pour un bench de couverture : chaque ligne est un événement réel, daté, localisé et adossé à une source publique consultable. Ce n'est **pas** un inventaire exhaustif : c'est un échantillon dont chaque entrée peut être re-vérée indépendamment.

## Format

Un objet JSON par ligne (JSONL, UTF-8, sans retour à la ligne interne). Champs :

| Champ | Contenu |
| --- | --- |
| `id` | Identifiant stable `na-couv-001` … `na-couv-020` |
| `date_publication` | Date de publication de la source (`AAAA-MM-JJ`), champ obligatoire |
| `date_incident` | Date de l'incident lorsque la source la donne explicitement ; absent sinon |
| `organisation` | Organisation visée, telle que nommée par la source |
| `departement` | Département de Nouvelle-Aquitaine concerné |
| `type` | `compromission`, `ransomware`, `fuite`, `phishing`, `defacement`… |
| `source` | Média ou émetteur du communiqué officiel |
| `titre` | Titre de la page source |
| `url` | URL publique de la page source (une par incident) |
| `extrait` | Citation courte, mot pour mot, tirée de la page lue |
| `resume` | Résumé en français, sans fait non attesté par la source |
| `confiance` | `etabli` (victime/autorité confirme) ou `rapporte` (presse seule) |
| `verifie_le` | Date de la dernière re-vérification de l'URL (`2026-11-21`) |

Les citations sont courtes et accompagnées d'un lien ; aucun article n'est reproduit intégralement.

## Critères d'inclusion

Un incident n'est retenu que si **tous** les points ci-dessous sont réunis :

1. **Réalité de l'incident** : la page source décrit un événement survenu, pas une simple recommandation de sécurité, une vulnérabilité théorique ou une rumeur.
2. **Ancrage en Nouvelle-Aquitaine** : organisation concernée dans un des 12 départements, ou impact régional explicitement documenté (cas des prestataires et fédérations nationales).
3. **Fenêtre 2024-2026** : publication dans la fenêtre ; l'incident lui-même est aussi daté de cette période lorsqu'il est connu.
4. **Source publique et URL vérifiables** : page ouverte et lue, avec un extrait qui prouve l'incident.
5. **Déduplication** : un même événement couvert par plusieurs médias ne donne qu'une ligne ; la source la plus solide est conservée (communiqué de la victime ou de l'autorité > presse locale > agrégateur).

Ont été **exclus** : les revendications d'attaquants sans confirmation de la victime ni d'autre source solide (Nova/UPPA, AlumnForce, Vignobles Toutigeac), les incidents hors période (Coaxis 2023, Cdiscount 2021) et les événements dont aucun élément lu ne les localise dans la région. Les tentatives bloquées sans communication sont hors de portée de la méthode.

## Méthode de constitution

1. **Recherche multi-angles** : requêtes en français et en anglais, par département (12), par secteur (santé, collectivités, entreprises, enseignement, associations, culture) et par synonymes (« cyberattaque », « rançongiciel », « piratage », « fuite de données », « phishing », « data breach »). Recherches menées avec Exa (`mcp__exa_web_search_exa`), sur plusieurs angles indépendants.
2. **Lecture des pages** (`mcp__exa_web_fetch_exa`) pour chaque candidat : vérification du titre, de la date de publication, de l'organisation visée, de la localisation et de l'extrait de preuve. Une page dont le contenu ne confirme pas l'incident est écartée, même si le titre est prometteur.
3. **Candidates préexistants recoupés** : le corpus `bench/fixtures/corpus-temoin-na.json` a servi de réservoir de candidats ; ses URL et extraits ont été relus et les dates de publication recalculées à partir des pages elles-mêmes. Les recherches complémentaires ont apporté les entrées absentes de ce fichier (Floirac, Coursive, Safed, Berson via actu.fr, Tarnos via la commune).
4. **Déduplication et cotation** : une ligne par événement ; `etabli` quand la victime ou une autorité confirme, `rapporte` quand la presse est la seule source accessible. Les faits non établis (auteur, volume exact de données, exfiltration réelle) ne sont pas affirmés dans les résumés.
5. **Contrôle final** : le 2026-11-21, les 20 URL ont été relues une à une ; la date de publication de chaque ligne a été comparée à la date affichée par la page (`Published:` ou date explicite dans le texte). Quand elles divergeaient du corpus de départ, c'est la date de la page consultée qui a été retenue.

## Sources mobilisées

Presse régionale et nationale : Sud Ouest, France 3 Nouvelle-Aquitaine, ICI / Radio France, Charente Libre, Ouest-France, actu.fr, La Dépêche, La Nouvelle République, franceinfo, Franceinfo/AFP.
Communiqués officiels : Fédération Nationale des Chasseurs, UNSS, Ville de Tarnos, Ville de Limoges, Bordeaux Sciences Agro.
Chaque ligne porte l'URL exacte de la page retenue ; la colonne `source` du JSONL indique l'émetteur.

## Limites

- Les incidents non médiatisés, traités en interne ou jamais annoncés par la victime échappent à la collecte.
- Certains articles de presse locale sont partiellement payants : seul le texte effectivement accessible a servi de preuve.
- Pour les prestataires nationaux (Synbird, Sirius, UNSS, FNC), l'incident est national mais l'entrée est ancrée sur le site ou les adhérents de Nouvelle-Aquitaine documentés par la source.
- `confiance: "rapporte"` ne signifie pas « non avéré » : l'incident est rapporté par une source publique identifiable, mais sans confirmation nominative de la victime dans la page lue.

## Re-vérifier le fichier

```bash
wc -l bench/couverture/incidents.jsonl                 # 20
jq -c . bench/couverture/incidents.jsonl > /dev/null   # JSON valide
jq -r '[.date_publication,.organisation,.source,.url] | @tsv' bench/couverture/incidents.jsonl
```

Pour re-contrôler une ligne : copier son `url` et l'ouvrir avec `mcp__exa_web_fetch_exa --urls "<URL>" --maxCharacters 2200`, puis comparer l'`extrait` et la date de publication.
