# Alias d'acteurs et de programmes rançongiciel

`actor_alias` réunit les graphies d'un même acteur ou programme rançongiciel
issues de **MISP Galaxy** :

- `clusters/ransomware.json` — programmes et groupes rançongiciel ;
- `clusters/threat-actor.json` — acteurs de la menace et leurs synonymes.

Objectif : `LockBit`, `Lockbit3`, `.LockBit` et `ABCD ransomware` ne comptent
plus comme quatre menaces distinctes.

## Table

```sql
CREATE TABLE actor_alias (
  id          bigserial PRIMARY KEY,
  canonique   text NOT NULL,
  alias       text NOT NULL,
  alias_norm  text NOT NULL,
  source      text NOT NULL,
  source_url  text NOT NULL,
  galaxy_uuid uuid,
  imported_at timestamptz NOT NULL DEFAULT now()
);
```

Chaque ligne porte sa preuve : `source` (`misp-galaxy:ransomware` ou
`misp-galaxy:threat-actor`), `source_url` (fichier Galaxy + UUID de la grappe)
et `galaxy_uuid`. Les contraintes `*_non_vide` interdisent une ligne sans
source : **aucune fusion sans source**.

## Règles de fusion

1. **Même grappe** : valeur, synonymes (`meta.synonyms`) et extensions
   (`meta.extensions`) d'une grappe décrivent le même acteur.
2. **Synonyme égal à une valeur** : si une grappe déclare `Akira` en synonyme
   et qu'une autre s'appelle `Akira`, les deux grappes sont réunies.
3. **Même clé de valeur** : `LockBit`, `LockBit 3.0` et `Lockbit3` partagent la
   clé `lockbit`.

On ne fusionne **pas** deux grappes parce qu'elles partagent un synonyme ou une
extension. MISP Galaxy réutilise des formes génériques (`.locked`, `.crypt`,
codes de suivi) : les fusionner relierait des centaines d'acteurs distincts.
La forme canonique est la valeur de grappe la plus référencée de la composante.

## Régénérer et vérifier

```bash
pnpm genere:actor-alias     # réécrit db/migrate-211-actor-alias.sql depuis MISP Galaxy
pnpm verifie:actor-alias    # crée une base de test, exécute le critère, la détruit
```

Le générateur accepte `MISP_RANSOMWARE_URL` et `MISP_THREAT_ACTOR_URL` pour lire
des fichiers locaux (tests hors ligne).

Critère de sortie :

```sql
SELECT count(*)
  FROM (
    SELECT canonique FROM actor_alias GROUP BY canonique HAVING count(*) >= 2
  ) AS groupes;
-- attendu : >= 20
```
