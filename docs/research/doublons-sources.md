# Doublons de sources du catalogue versionné

**187 sources avant, 179 sources réellement distinctes après** (8 en moins, aucune retirée sans trace).

Périmètre : catalogue versionné des sources, db/*.sql (INSERT INTO source). Chaque ligne du catalogue figure dans `bench/results/doublons-sources.json` avec sa décision (`garder` ou `doublon de …`) et son éventuelle erreur de sonde.

## Règles

- URL canonique : schéma/www/slash final/fragment ignorés, UTM et suivi retirés, paramètres triés
- URL finale après redirection identique
- contenu : au moins 3 des 5 premiers items partagent un lien canonique identique

## Groupes de doublons

7 groupes, 8 sources fusionnables.

| Source à garder | Doublons | Preuve |
| --- | --- | --- |
| `cert-fr-feed` — CERT-FR feed | `cert-fr-avis`, `cert_fr` | cert-fr-avis ~ cert-fr-feed : contenu identique (3/5 items)<br>cert-fr-avis ~ cert_fr : contenu identique (3/5 items)<br>cert-fr-feed ~ cert_fr : contenu identique (5/5 items) |
| `leak:ransomlook:recent-api` — RansomLook — victimes récentes (API JSON) | `ransomlook` | leak:ransomlook:recent-api ~ ransomlook : contenu identique (5/5 items)<br>leak:ransomlook:recent-api ~ ransomlook : même URL après redirection<br>leak:ransomlook:recent-api ~ ransomlook : url canonique identique |
| `onion:ccw:aoqin` — aoqin | `onion:ccw:aoqin-leaks` | onion:ccw:aoqin ~ onion:ccw:aoqin-leaks : url canonique identique |
| `onion:rl:byod` — byod | `onion:ccw:byod` | onion:ccw:byod ~ onion:rl:byod : url canonique identique |
| `onion:ccw:gammax` — gammax | `onion:rl:gammax` | onion:ccw:gammax ~ onion:rl:gammax : url canonique identique |
| `onion:ccw:genesis` — genesis | `onion:rl:genesis` | onion:ccw:genesis ~ onion:rl:genesis : url canonique identique |
| `presse-sudouest` — Sud Ouest (RSS) | `presse-sudouest-rss` | presse-sudouest ~ presse-sudouest-rss : contenu identique (5/5 items)<br>presse-sudouest ~ presse-sudouest-rss : même URL après redirection<br>presse-sudouest ~ presse-sudouest-rss : url canonique identique |

## Sondes en échec

48 URL n'ont pas pu être sondées (tor, DNS, timeout…). Elles restent dans le rapport et sont regroupées sur l'URL canonique seule.

- `hermes_radar_cyber` — ValueError: unknown url type: 'box%20hermes%20/%20profil%20radar-cyber'
- `onion:ccw:anubis` — URLError: <urlopen error [Errno -2] Name or service not known>
- `onion:ccw:aoqin` — URLError: <urlopen error [Errno -2] Name or service not known>
- `onion:ccw:aoqin-leaks` — URLError: <urlopen error [Errno -2] Name or service not known>
- `onion:ccw:apt73` — URLError: <urlopen error [Errno -2] Name or service not known>
- `onion:ccw:arcusmedia` — URLError: <urlopen error [Errno -2] Name or service not known>
- `onion:ccw:atomsilo` — URLError: <urlopen error [Errno -2] Name or service not known>
- `onion:ccw:auditteam` — URLError: <urlopen error [Errno -2] Name or service not known>
- `onion:ccw:aurora` — URLError: <urlopen error [Errno -2] Name or service not known>
- `onion:ccw:barracuda` — URLError: <urlopen error [Errno -2] Name or service not known>
- `onion:ccw:bavacai` — URLError: <urlopen error [Errno -2] Name or service not known>
- `onion:ccw:blacknevas` — URLError: <urlopen error [Errno -2] Name or service not known>
- `onion:ccw:blackout` — URLError: <urlopen error [Errno -2] Name or service not known>
- `onion:ccw:booba-project` — URLError: <urlopen error [Errno -2] Name or service not known>
- `onion:ccw:byod` — URLError: <urlopen error [Errno -2] Name or service not known>
- `onion:ccw:ciphbit` — URLError: <urlopen error [Errno -2] Name or service not known>
- `onion:ccw:climax` — URLError: <urlopen error [Errno -2] Name or service not known>
- `onion:ccw:dark-project` — URLError: <urlopen error [Errno -2] Name or service not known>
- `onion:ccw:destello` — URLError: <urlopen error [Errno -2] Name or service not known>
- `onion:ccw:direwolf` — URLError: <urlopen error [Errno -2] Name or service not known>

## Contrôles

```json
{
  "sources_entrees": 187,
  "sources_dans_les_decisions": 187,
  "groupes": 179,
  "somme_groupes": 187,
  "coherent": true
}
```
