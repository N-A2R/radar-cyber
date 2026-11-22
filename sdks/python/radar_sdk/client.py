"""Read-only, dependency-free client for the public regional API.

No paid service and no victim personal data: the regional event projection
drops free-text titles and summaries before returning events.
"""

from __future__ import annotations

import json
import os
from dataclasses import dataclass
from typing import Any
from urllib.error import HTTPError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

NA_DEPARTMENTS = ("16", "17", "19", "23", "24", "33", "40", "47", "64", "79", "86", "87")


def is_na_department(value: str) -> bool:
    """Return whether an INSEE department code belongs to Nouvelle-Aquitaine."""
    return value in NA_DEPARTMENTS


@dataclass(frozen=True)
class Health:
    ok: bool
    sources: int


@dataclass(frozen=True)
class Stats:
    organisations: int
    events: int
    indicators: int
    sources: dict[str, int]
    by_family: list[dict[str, Any]]


@dataclass(frozen=True)
class NaDepartmentSummary:
    department: str
    organisations: int
    organisations_with_events: int
    events: int


@dataclass(frozen=True)
class NaOverview:
    departments: list[NaDepartmentSummary]
    total: dict[str, Any]
    last_collection_at: str | None


@dataclass(frozen=True)
class NaEvent:
    """Safe projection: no title, summary, victim name or other free text."""

    id: int
    family: str
    observed_at: str | None
    collected_at: str
    source: str
    org_id: int


@dataclass(frozen=True)
class SourceSummary:
    id: str
    name: str
    family: str
    kind: str
    enabled: bool
    last_ok_at: str | None


class RadarApiError(Exception):
    def __init__(self, status: int, code: str, message: str) -> None:
        super().__init__(message)
        self.status = status
        self.code = code


class RadarClient:
    def __init__(
        self,
        base_url: str | None = None,
        api_key: str | None = None,
        timeout: float = 10.0,
    ) -> None:
        root = base_url or os.environ.get("RADAR_API_BASE_URL", "http://127.0.0.1:8080/api")
        self.base_url = root.rstrip("/")
        self.api_key = api_key
        self.timeout = timeout

    def get_health(self) -> Health:
        raw = self._get("/health")
        return Health(ok=bool(raw["ok"]), sources=int(raw["sources"]))

    def get_stats(self) -> Stats:
        raw = self._get("/stats")
        return Stats(
            organisations=int(raw["orgs"]),
            events=int(raw["events"]),
            indicators=int(raw["indicators"]),
            sources={key: int(value) for key, value in raw["sources"].items()},
            by_family=raw.get("byFamily", []),
        )

    def get_na_overview(self) -> NaOverview:
        raw = self._get("/na/overview")
        departments = [
            NaDepartmentSummary(
                department=row["dept"],
                organisations=int(row["orgs"]),
                organisations_with_events=int(row["orgsAvecEvenement"]),
                events=int(row["evenements"]),
            )
            for row in raw["depts"]
        ]
        total = raw["total"]
        return NaOverview(
            departments=departments,
            total={
                "organisations": int(total["orgs"]),
                "organisations_with_events": int(total["orgsAvecEvenement"]),
                "events": int(total["evenements"]),
                "departments_without_events": list(total["deptsSansEvenement"]),
            },
            last_collection_at=raw.get("derniereCollecte"),
        )

    def get_na_events(self, department: str) -> list[NaEvent]:
        """Regional feed, restricted to Nouvelle-Aquitaine departments."""
        if not is_na_department(department):
            raise ValueError(f"department must be one of {', '.join(NA_DEPARTMENTS)}")
        raw = self._get("/na/events", {"dept": department})
        return [
            NaEvent(
                id=int(row["id"]),
                family=row["family"],
                observed_at=row["observed_at"],
                collected_at=row["collected_at"],
                source=row["source"],
                org_id=int(row["orgId"]),
            )
            for row in raw["events"]
        ]

    def get_sources(self) -> list[SourceSummary]:
        """All configured sources, including gray ones; no origin allowlist."""
        return [
            SourceSummary(
                id=row["id"],
                name=row["name"],
                family=row["family"],
                kind=row["kind"],
                enabled=bool(row["enabled"]),
                last_ok_at=row.get("lastOkAt"),
            )
            for row in self._get("/sources")
        ]

    def _get(self, path: str, query: dict[str, str] | None = None) -> Any:
        url = f"{self.base_url}{path}"
        if query:
            url = f"{url}?{urlencode(query)}"
        headers = {"Accept": "application/json"}
        if self.api_key:
            headers["X-API-Key"] = self.api_key
        request = Request(url, headers=headers, method="GET")
        try:
            with urlopen(request, timeout=self.timeout) as response:
                text = response.read().decode("utf-8")
        except HTTPError as exc:
            body = exc.read().decode("utf-8", errors="replace")
            try:
                payload = json.loads(body)
            except json.JSONDecodeError:
                payload = {}
            error = payload.get("error", {}) if isinstance(payload, dict) else {}
            raise RadarApiError(
                int(exc.code),
                str(error.get("code", "HTTP_ERROR")),
                str(error.get("message", str(exc))),
            ) from exc
        return json.loads(text) if text else None
