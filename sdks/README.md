# Radar SDKs

Two read-only clients for the public Radar Cyber Nouvelle-Aquitaine API:

| SDK | Source | Example | Tests |
|---|---|---|---|
| TypeScript | `typescript/src/index.ts` | `typescript/examples/overview.ts` | `typescript/test/client.test.ts` |
| Python | `python/radar_sdk/client.py` | `python/examples/overview.py` | `python/tests/test_client.py` |

Both use only the platform standard library (`fetch` / `urllib`), need no paid
service, and expose the same interface: `getHealth`, `getStats`,
`getNaOverview`, `getNaEvents(department)`, `getSources`.

## Run an example against a live API

```bash
# Terminal 1: API only, no collectors (dev database on port 5433)
DATABASE_URL='postgres://radar:radar@localhost:5433/radar' \
  PORT=8099 RADAR_COLLECT=0 \
  apps/api/node_modules/.bin/tsx apps/api/src/server.ts

# Terminal 2
RADAR_API_BASE_URL=http://127.0.0.1:8099/api \
  apps/api/node_modules/.bin/tsx sdks/typescript/examples/overview.ts
RADAR_API_BASE_URL=http://127.0.0.1:8099/api \
  python3 sdks/python/examples/overview.py
```

Each example prints `sdk=<name> scope=NA`, the live counters, and `status=OK`.
It exits non-zero if the API is unreachable or the counters disagree.

## Tests

```bash
cd sdks/typescript && ../../apps/api/node_modules/.bin/tsx --test test/*.test.ts
python3 -m unittest discover -s sdks/python/tests -v
```

Six behaviors are covered per SDK: URL construction, API-key header, typed
HTTP error, victim-PII projection, gray-source retention, and regional scope.
The tests use a local stub server; they never call an external service.

## Scope and privacy

- `getNaEvents` accepts only the twelve Nouvelle-Aquitaine department codes
  and rejects anything else before making a request.
- The event projection keeps identifiers, family, timestamps, source and
  organisation id. Free-text titles, summaries and names are dropped: victim
  personal data never enters the SDK result.
- `getSources` returns every configured source, including gray sources. No
  origin allowlist or paid enrichment is applied.
- The SDK is read-only: no write endpoint is exposed.

## Reproducible measurement

```bash
RADAR_API_BASE_URL=http://127.0.0.1:8099/api \
  pnpm measure:sdks --json=bench/results/sdk-examples.json
```

The command runs both examples and both suites against the live API, checks
that the counters agree, and reports `examples_executable=2/2` plus
`tests_passed=12/12`. Every spawned process has a 45-second bound.
