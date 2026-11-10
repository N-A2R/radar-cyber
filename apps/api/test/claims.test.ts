import { test } from "node:test";
import assert from "node:assert/strict";
import { parseClaimCards } from "../src/collectors/parsers/claims.js";

/**
 * Extraits réels de pages de revendication, récupérés via Tor le 10 novembre
 * 2026. Ils servent de référence : si un site change sa structure, ce test
 * casse avant la collecte.
 *
 * Cause du bug corrigé ici : le parseur générique ramenait les liens de
 * navigation de ces pages, la porte de pertinence les rejetait, et 64 sources
 * `.onion` restaient muettes alors qu'elles répondaient en 200.
 */

const MODAL_HTML = `<div class="modal" id="v-159solutions"><div class="mbox"><a class="close" href="#leaked">&times; close</a><h3>159 Solutions, Inc.</h3><div class="meta">specialty pharma data analytics &middot; United States</div><div class="summary"><h4>What will be published if no settlement is reached</h4><ul><li>A specialty patient claims warehouse of 735,022,313 measured rows for the June 2025 reporting month: 143,771,725 pharmacy claims in the five part fact table plus a 13,652,923 row extract, 342,305,857 medical claims, 193,314,289 remittance adjustment records, and 887,647 patient records with birth years and gender</li><li>Client environments for at least seventeen specialty pharma manufacturers with named prescribers, National Provider Identifiers and practice addresses</li><li>Patients identified by identifier across pharmacy and medical claims with national drug codes, diagnosis codes and payers including Medicare Advantage</li></ul></div></div>
<div class="modal" id="v-abtbos"><div class="mbox"><a class="close" href="#leaked">&times; close</a><h3>All Business Technologies (Fox Hill bookkeeping and tax practice)</h3><div class="meta">Accounting &amp; Tax Preparation (US) &middot; Massachusetts, USA</div><div class="summary"><h4>What will be published if no settlement is reached</h4><ul><li>Books and tax records of a Massachusetts bookkeeping and tax practice: live accounting company files of more than 60 client companies with all accounting backups 2014 through 2026</li><li>Per-client tax return data for tax years 2015 through 2025 and the practice billing database</li><li>Accounts receivable ledgers, client lists and scanned client legal documents: deeds, trust certifications and IRS powers of attorney</li></ul></div></div>
<div class="modal" id="v-acr"><div class="mbox"><a class="close" href="#leaked">&times; close</a><h3>Arthritis Center of Riverside</h3><div class="meta">rheumatology medical practice &middot; Riverside, California, United States</div><div class="summary"><h4>What will be published if no settlement is reached</h4><ul><li>Scanned laboratory requisitions of named patients with dates of birth, home addresses and Medicare subscriber details, April through October 2026</li><li>Accounts receivable aging with patient names, account numbers, insurers and balances</li><li>Patient billing files and records correspondence of the practice</li></ul></div></div>`;

const PROJECT_CARD_HTML = `<a href="/project/GBanBNFV7n43LsTc/" class="project-card">
            <div class="pinned-badge"><svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5v6h2v-6h5v-2z"/></svg> Pinned</div>
            <div class="card-header">
                <div class="card-logo">
                    <img src="/media/logos/logo2.png" alt="Novum Energy">
                </div>
                <div class="card-status status-fucked">
                    Fucked
                </div>
            </div>
            <div class="card-body">
                <h3 class="card-title">Novum Energy</h3>
                
                <div class="card-country"><span class="card-flag">🇺🇸</span> United States</div>
                
                
                <div class="card-revenue">$966 Million</div>
                
                <p class="card-description">Country: Texas, United States |
Website: novumenergy.com |
Revenue: $966 Million |
Industry: Convenience Stores, Gas Stations &amp; Liquor Stores |
Employees: 51-200 |
Properties: 842 GB (971,325 Files, 117,085 Folders)</p>
            </div>
            <div class="card-stats">
                <div class="stat">
                    <span class="stat-value">1,114,324</span>
                    <span class="stat-label">Files Checked</span>
                </div>
                <div class="stat">
                    <span class="stat-value">842 GB</span>
                    <span class="stat-label">Data Analyzed</span>
                </div>
            </div>
        </a>
<a href="/project/aaS7xvDRLCuA8Vwj/" class="project-card">
            <div class="pinned-badge"><svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5v6h2v-6h5v-2z"/></svg> Pinned</div>
            <div class="card-header">
                <div class="card-logo">
                    <img src="/media/logos/logo_U2wJLOj.png" alt="Spergel">
                </div>
                <div class="card-status status-fucked">
                    Fucked
                </div>
            </div>
            <div class="card-body">
                <h3 class="card-title">Spergel</h3>
                
                <div class="card-country"><span class="card-flag">🇨🇦</span> Canada</div>
                
                
                <div class="card-revenue">$28.2 Million</div>
                
                <p class="card-description">Country: Canada |
Website: spergel.ca |
Revenue: $28.2 Million |
Industry: Business Services,Project Management |
Employees: 51-200 |
Properties: 5.4 TB (7,830,792 Files, 902,844 Folders)</p>
            </div>
            <div class="card-stats">
                <div class="stat">
                    <span class="stat-value">7,830,792</span>
                    <span class="stat-label">Files Checked</span>
                </div>
                <div class="stat">
                    <span class="stat-value">5.4 TB</span>
                    <span class="stat-label">Data Analyzed</span>
                </div>
            </div>
        </a>
<a href="/project/pHGEYe5Pi29svNDf/" class="project-card">
            <div class="pinned-badge"><svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5v6h2v-6h5v-2z"/></svg> Pinned</div>
            <div class="card-header">
                <div class="card-logo">
                    <img src="/media/logos/Logo.png" alt="OFS">
                </div>
                <div class="card-status status-fucked">
                    Fucked
                </div>
            </div>
            <div class="card-body">
                <h3 class="card-title">OFS</h3>
                
                <div class="card-country"><span class="card-flag">🇺🇸</span> United States</div>
                
                
                <div class="card-revenue">$517.1 Million</div>
                
                <p class="card-description">Country: Indiana, United States |
Website: ofs.com |
Revenue: $517.1 Million |
Industry: Furniture,Manufacturing,Transportation |
Employees: 1K - 5K |
Properties: 321 GB (322,742 Files, 18,081 Folders)</p>
            </div>
            <div class="card-stats">
                <div class="stat">
                    <span class="stat-value">322,742</span>
                    <span class="stat-label">Files Checked</span>
                </div>
                <div class="stat">
                    <span class="stat-value">321 GB</span>
                    <span class="stat-label">Data Analyzed</span>
                </div>
            </div>
        </a>`;

/** Page sans carte de revendication : un menu WordPress. */
const NAVIGATION_ONLY_HTML = `
<html><body>
<nav>
  <a href="/">Accueil</a>
  <a href="/?page_id=47">Affiliate</a>
  <a href="/?page_id=14">FAQ</a>
  <h3>Bienvenue</h3>
  <p>Notre groupe publie des revendications.</p>
</nav>
</body></html>`;

test("structure modale : les victimes sont extraites avec secteur et pays", () => {
  const victims = parseClaimCards(MODAL_HTML);
  assert.ok(victims, "la page doit être reconnue");
  assert.equal(victims.length, 3);
  for (const victim of victims) {
    assert.ok(victim.name.length > 2, `nom exploitable : ${victim.name}`);
    assert.ok(!/^what will be published/i.test(victim.summary ?? ""), "le gabarit du site ne doit pas rester dans le résumé");
  }
  const first = victims[0];
  assert.ok(first?.sector, "le secteur est lu dans la ligne meta");
  assert.ok(first?.country, "la localisation est lue dans la ligne meta");
});

test("structure carte de projet : statut et pays structuré", () => {
  const victims = parseClaimCards(PROJECT_CARD_HTML);
  assert.ok(victims);
  assert.equal(victims.length, 3);
  const named = victims.find((victim) => victim.name === "Novum Energy");
  assert.ok(named, "la victime attendue est présente");
  assert.equal(named.status, "Fucked");
  assert.equal(named.country, "Texas, United States", "le champ structuré prime sur le drapeau");
  assert.ok(named.sector, "le secteur vient de la description structurée");
});

test("une page de navigation n'est pas prise pour une page de revendication", () => {
  assert.equal(parseClaimCards(NAVIGATION_ONLY_HTML), null);
});

test("les doublons de nom ne produisent qu'une victime", () => {
  // Page réaliste : une vraie page de site de fuite dépasse largement les
  // 500 octets en dessous desquels le parseur refuse de se prononcer.
  const entete = `<html><head><title>Leak site</title></head><body><nav>${"<a href=\"/\">menu</a>".repeat(60)}</nav>`;
  const doublon = entete
    + `<div class="modal"><h3>Société Test</h3><div class="meta">Santé · France</div></div>`.repeat(3)
    + `</body></html>`;
  const victims = parseClaimCards(doublon);
  assert.ok(victims);
  assert.equal(victims.length, 1);
});
