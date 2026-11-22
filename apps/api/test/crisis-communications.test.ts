/** One test per behaviour of the crisis-communication detector (no network, no database). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { detectCrisisCommunications } from "../src/crisis-communications/detect.js";
import { loadIncidentCorpus, parseIncidentLine } from "../src/crisis-communications/load.js";
import {
	classifySource,
	delayInDays,
	isCrisisCommunication,
	isNaDepartment,
	type CommunicationRecord,
} from "../src/crisis-communications/model.js";
import { assessObjective, OBJECTIVE } from "../src/crisis-communications/objective.js";

function record(overrides: Partial<CommunicationRecord> = {}): CommunicationRecord {
	return {
		id: "test-1",
		department: "Gironde",
		organisation: "Ville de Floirac",
		incidentDate: "2024-04-18",
		publicationDate: "2024-04-19",
		title: "Information aux usagers — incident de sécurité informatique",
		url: "https://www.ville-floirac.fr/actualites/cyberattaque",
		sourceLabel: "Mairie de Floirac (communiqué officiel)",
		...overrides,
	};
}

test("an official first-party crisis page is detected", () => {
	const candidate = record();
	assert.equal(classifySource(candidate), "official");
	assert.equal(isCrisisCommunication(candidate), true);
});

test("a press article about an incident is not a communication", () => {
	const article = record({
		sourceLabel: "Sud Ouest",
		url: "https://www.sudouest.fr/gironde/cyberattaque",
	});
	assert.equal(classifySource(article), "press");
	assert.equal(isCrisisCommunication(article), false);
});

test("a page outside Nouvelle-Aquitaine is rejected", () => {
	assert.equal(isNaDepartment("75"), false);
	assert.equal(isCrisisCommunication(record({ department: "Paris" })), false);
	assert.equal(isCrisisCommunication(record({ department: "33" })), true);
});

test("a page without an explicit publication date is rejected", () => {
	assert.equal(isCrisisCommunication(record({ publicationDate: null })), false);
	assert.equal(isCrisisCommunication(record({ publicationDate: "récemment" })), false);
});

test("the delay is measured in whole UTC days, never negative or invented", () => {
	assert.equal(delayInDays("2024-04-18", "2024-04-21"), 3);
	assert.equal(delayInDays("2026-01-20", "2026-01-23"), 3);
	assert.equal(delayInDays(null, "2026-01-23"), null);
	assert.equal(delayInDays("2026-01-23", "2026-01-20"), null);
	assert.equal(isCrisisCommunication(record({
		incidentDate: "2024-04-21",
		publicationDate: "2024-04-18",
	})), false);
});

test("a grey first-party union page is accepted", () => {
	const unionPage = record({
		sourceLabel: "UNSA Éducation",
		url: "https://www.unsa-education.com/articles-regional-/poitiers-cyberattaque",
		department: "Vienne",
		organisation: "Académie de Poitiers — rectorat",
		incidentDate: "2026-08-01",
		publicationDate: "2026-08-31",
	});
	assert.equal(classifySource(unionPage), "grey");
	assert.equal(isCrisisCommunication(unionPage), true);
	assert.equal(delayInDays(unionPage.incidentDate, unionPage.publicationDate), 30);
});

test("a first-party host matching the organisation is accepted without a label", () => {
	const page = record({
		sourceLabel: null,
		url: "https://www.cigusto.com/content/informations-concernant-vos-donnees-personnelles",
		organisation: "Cigusto Limoges",
		department: "Haute-Vienne",
		incidentDate: "2026-09-22",
		publicationDate: "2026-09-29",
	});
	assert.equal(classifySource(page), "grey");
	assert.equal(isCrisisCommunication(page), true);
});

test("the exported detection never carries a victim identity", () => {
	const pages = [record({
		organisation: "Christophe et Nathalie Paulet",
		title: "Cyberattaque — Christophe et Nathalie Paulet",
		url: "https://www.charentelibre.fr/charente/paulet-cyberattaque",
		sourceLabel: "Charente Libre",
	})];
	const result = detectCrisisCommunications(pages);
	const serialized = JSON.stringify(result);
	assert.equal(serialized.includes("Christophe"), false);
	assert.equal(serialized.includes("Paulet"), false);
	assert.equal(serialized.includes("title"), false);
	assert.equal(result.detections.length, 0);
});

test("the dated corpus loader keeps only rows with a real publication date", () => {
	assert.equal(parseIncidentLine("not json"), null);
	assert.equal(parseIncidentLine(JSON.stringify({ id: "x", date_publication: "hier" })), null);
	const row = parseIncidentLine(JSON.stringify({
		id: "x", date_publication: "2026-03-04", date_incident: "2026-03-03",
		departement: "Gironde", titre: "Incident de sécurité", url: "https://example.test/incident",
	}));
	assert.equal(row?.publicationDate, "2026-03-04");
});

test("the real Nouvelle-Aquitaine corpus yields detections and measured delays", async () => {
	const records = await loadIncidentCorpus();
	assert.ok(records.length >= 120, `expected the real corpus, got ${records.length} records`);
	const result = detectCrisisCommunications(records);
	assert.ok(result.detections.length >= OBJECTIVE.minDetections);
	assert.ok(result.datedDetections >= OBJECTIVE.minDatedDelays);
	assert.equal(result.pressPagesAccepted, 0);
	assert.equal(result.outsideNaAccepted, 0);
	assert.equal(result.negativeDelays, 0);
});

test("the objective rejects a result that accepts press pages or omits delays", () => {
	const passing = assessObjective({
		detections: OBJECTIVE.minDetections,
		datedDetections: OBJECTIVE.minDatedDelays,
		pressPagesAccepted: 0,
		outsideNaAccepted: 0,
	});
	assert.equal(passing.met, true);
	const failing = assessObjective({
		detections: OBJECTIVE.minDetections,
		datedDetections: OBJECTIVE.minDatedDelays - 1,
		pressPagesAccepted: 1,
		outsideNaAccepted: 0,
	});
	assert.equal(failing.met, false);
});
