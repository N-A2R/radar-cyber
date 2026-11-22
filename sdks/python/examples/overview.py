#!/usr/bin/env python3
"""Executable example: read the live regional observatory with the Python SDK.

Run: RADAR_API_BASE_URL=http://127.0.0.1:8080/api python3 examples/overview.py
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from radar_sdk import NA_DEPARTMENTS, RadarClient

client = RadarClient()

health = client.get_health()
stats = client.get_stats()
overview = client.get_na_overview()

if not health.ok:
    raise SystemExit("API health check failed")
if health.sources != stats.sources["total"]:
    raise SystemExit("source counts disagree between /health and /stats")
if len(overview.departments) != len(NA_DEPARTMENTS):
    raise SystemExit("regional overview is not limited to the twelve NA departments")

print("sdk=python scope=NA")
print(f"organisations={stats.organisations} sources={health.sources} events={stats.events}")
print(
    f"na_departments={len(overview.departments)} "
    f"na_organisations={overview.total['organisations']} na_events={overview.total['events']}"
)
print("status=OK")
