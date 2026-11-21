# Détection de langue fr/en — sans dépendance externe

`apps/api/src/collectors/filter.ts` expose `detectLanguage()`, `configuredLanguages()`
et `languageVerdict()`. Aucun modèle, aucun service, aucun paquet npm : deux
listes exclusives de mots outils/mots cyber, un bonus plafonné pour les lettres
accentuées, et un score par langue.

## Règle

- Le texte examiné est `titre + résumé`, tokenisé en minuscules (accentué).
- Chaque token ne compte que pour une langue : `FR_WORDS` d'abord, sinon
  `EN_WORDS`. Un mot accentué apporte en plus un point, plafonné à 3 au total,
  pour qu'un nom propre ne décide pas seul.
- À score égal, l'anglais gagne : c'est la langue par défaut des flux techniques.
- `confidence = |fr − en| / (fr + en)`, ou 0 si aucun token n'est reconnu.
  Texte vide, chiffres ou emoji seuls : `language='en'`, `scores={0,0}`,
  `confidence=0` — jamais d'exception, même avec `null`/`undefined`.
- `RADAR_LANGUAGES=fr,en` (défaut) décide des langues admises. Une valeur vide
  ou inconnue garde les deux langues ; la casse et les séparateurs sont
  normalisés (`"EN, fr"` → `en, fr`).

`event.langue` est renseigné à tous les points d'écriture ; la migration 047 pose
la contrainte `CHECK (langue IN ('fr','en'))`. Les lignes antérieures restent
NULL. Les événements refusés pour langue sont comptés dans les motifs de rejet
du run (`langue_fr` / `langue_en`) et dans `collector_run.items_rejected`.

## Mesure

`apps/api/test/language.test.ts` porte un corpus de **30 textes** (dépêches
locales, avis techniques, variantes avec accents, elisions et titres mixtes) :
**30/30 (100 %)**. Il vérifie aussi les états vides, la confiance et le
comportement de `RADAR_LANGUAGES`.

```bash
apps/api/node_modules/.bin/tsx --test apps/api/test/language.test.ts
```

Limite connue : un titre très court ou purement technique (« CVE-2026-1234 »)
ne contient aucun indice linguistique. La confiance vaut alors 0 et l'anglais
est retenu par défaut ; c'est un choix de flux, pas une reconnaissance.
