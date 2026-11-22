# Gold corpus — 500 Nouvelle-Aquitaine incidents

Frozen, annotated corpus produced by `pnpm gold:build`; measured by `pnpm gold:measure`.
The French method report is `docs/rapport-gold-500.md`.

## Files

- `incidents-na-500.jsonl` — one annotated incident per line, sorted by `id`.
- `manifest.json` — seed, source population, tier counts and SHA-256 of the frozen file.

## Record shape

```json
{
  "id": "gold-na-00001",
  "sourceRef": "curated:incidents-gironde.jsonl:4",
  "title": "redacted title",
  "organisation": "public registry organisation name",
  "department": "33",
  "observedAt": "2026-04-19",
  "incidentType": "intrusion",
  "evidenceTier": "verified",
  "sourceKind": "press",
  "sourceUrl": "https://…",
  "sourceLabel": "France 3 Nouvelle-Aquitaine",
  "annotation": {
    "rule": "curated.verified.v1",
    "confidence": "high",
    "reviewedAt": "2026-11-22",
    "note": "why this label was applied"
  }
}
```

`evidenceTier` is `verified`, `reported` or `claimed`; `claimed` never asserts that an
incident was independently confirmed. `sourceKind` is `official`, `press` or `grey`.
Personal contact details and explicitly named individuals are redacted by the builder.

## Reproduce

```bash
export DATABASE_URL=postgres://radar:radar@localhost:5433/radar
pnpm gold:build
pnpm gold:measure
```

`gold:measure` is offline: it reads only the frozen JSONL file.
