"""One test per SDK behavior; local stub server, no network or paid service."""

from __future__ import annotations

import json
import sys
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from radar_sdk import RadarApiError, RadarClient  # noqa: E402

RESPONSE: dict = {}
SEEN: dict = {}


class StubHandler(BaseHTTPRequestHandler):
    def do_GET(self) -> None:  # noqa: N802
        parsed = urlparse(self.path)
        SEEN["path"] = parsed.path
        SEEN["query"] = parse_qs(parsed.query)
        SEEN["headers"] = {key.lower(): value for key, value in self.headers.items()}
        body = json.dumps(RESPONSE.get("body", {})).encode("utf-8")
        self.send_response(RESPONSE.get("status", 200))
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *_args: object) -> None:
        pass


class RadarClientTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.server = ThreadingHTTPServer(("127.0.0.1", 0), StubHandler)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.port = cls.server.server_address[1]

    @classmethod
    def tearDownClass(cls) -> None:
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join(timeout=2)

    def setUp(self) -> None:
        RESPONSE.clear()
        SEEN.clear()
        self.client = RadarClient(
            base_url=f"http://127.0.0.1:{self.port}/api",
            timeout=2,
        )

    def test_builds_configured_url_with_department_query(self) -> None:
        RESPONSE["body"] = {"dept": "33", "events": []}
        self.assertEqual(self.client.get_na_events("33"), [])
        self.assertEqual(SEEN["path"], "/api/na/events")
        self.assertEqual(SEEN["query"], {"dept": ["33"]})

    def test_sends_api_key_header_when_configured(self) -> None:
        RESPONSE["body"] = {"ok": True, "sources": 312}
        client = RadarClient(
            base_url=f"http://127.0.0.1:{self.port}/api",
            api_key="rk_test",
            timeout=2,
        )
        self.assertEqual(client.get_health().sources, 312)
        self.assertEqual(SEEN["headers"].get("x-api-key"), "rk_test")

    def test_raises_typed_api_error_with_status_and_code(self) -> None:
        RESPONSE.update(status=403, body={"error": {"code": "FORBIDDEN", "message": "denied"}})
        with self.assertRaises(RadarApiError) as caught:
            self.client.get_stats()
        self.assertEqual((caught.exception.status, caught.exception.code), (403, "FORBIDDEN"))
        self.assertEqual(str(caught.exception), "denied")

    def test_drops_free_text_fields_that_could_name_a_victim(self) -> None:
        RESPONSE["body"] = {
            "dept": "33",
            "events": [{
                "id": 7,
                "title": "Victim name appears here",
                "summary": "Personal details",
                "family": "leaks",
                "observedAt": "2026-11-21T10:00:00Z",
                "collectedAt": "2026-11-21T10:01:00Z",
                "source": "gray-source",
                "orgId": 42,
                "orgName": "Example Org",
            }],
        }
        event = self.client.get_na_events("33")[0]
        self.assertEqual(
            set(vars(event)),
            {"id", "family", "observed_at", "collected_at", "source", "org_id"},
        )
        self.assertEqual(event.observed_at, "2026-11-21T10:00:00Z")
        self.assertEqual(event.collected_at, "2026-11-21T10:01:00Z")
        self.assertNotIn("Victim", repr(event))

    def test_keeps_gray_sources_without_an_origin_allowlist(self) -> None:
        RESPONSE["body"] = [
            {"id": "ctlog", "name": "CT log", "family": "cti", "kind": "indicator", "enabled": True, "lastOkAt": None},
            {"id": "onion:gray", "name": "Gray feed", "family": "leaks", "kind": "quarantine", "enabled": False, "lastOkAt": None},
        ]
        sources = self.client.get_sources()
        self.assertEqual([source.id for source in sources], ["ctlog", "onion:gray"])

    def test_rejects_departments_outside_nouvelle_aquitaine(self) -> None:
        with self.assertRaises(ValueError):
            self.client.get_na_events("75")


if __name__ == "__main__":
    unittest.main()
