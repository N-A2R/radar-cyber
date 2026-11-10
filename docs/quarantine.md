# Quarantaine des revendications dark web

## Branchement (à faire par le parent dans server.ts)
Ajouter l'import et l'appel :
```
import { runQuarantineCollector } from "./collectors/quarantine.collector.js";
// dans runCollectors():
await runQuarantineCollector((m) => log(m));
```

## Ce qui est stocké
- Texte de la revendication uniquement (raw_body = description/post_title).
- Métadonnées structurées (groupe, org_hint, claimed_at, extracted jsonb).
- Jamais de dump, jamais de .onion opérationnel, jamais de données personnelles.

## Règle de non-republication
- Données ransomware.live : usage interne uniquement, attribution conservée, pas d'API exposée.
- Aucun INSERT dans event/indicator sans promotion tracée.
- Revue via `npx tsx scripts/quarantine-review.mts pending`.
