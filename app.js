(() => {
  "use strict";

  /*
   * JournalCheck — final app.js
   * Compatible with the current index.html structure.
   *
   * Required files:
   *   ./data/journals.json
   *   ./data/scimagojr-2025-journalcheck.csv
   *   ./journalcheck-data-sources.js
   *
   * The data-source module is loaded automatically if it has not already
   * been loaded. A failure in any external source NEVER prevents the local
   * JournalCheck result from rendering.
   */

  const DATABASE_URL = "./data/journals.json";
  const SOURCES_JS = "./journalcheck-data-sources.js";
  const MAX_RESULTS = 20;
  const RECENT_KEY = "journalcheck_recent_searches_v2";

  const state = {
    database: null,
    records: [],
    entries: [],
    byISSN: new Map(),
    byTitle: new Map(),
    prepared: false,
    loadingPromise: null,
    sourcePromise: null,
    lastQuery: ""
  };

  const $ = (selector, root = document) => root.querySelector(selector);

  function normalize(value) {
    return String(value ?? "")
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "")
      .trim();
  }

  function issn(value) {
    return String(value ?? "")
      .replace(/[^0-9xX]/g, "")
      .toUpperCase();
  }

  function titleNormalize(value) {
    return String(value ?? "")
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function tokens(value) {
    return titleNormalize(value).split(" ").filter(Boolean);
  }

  function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, ch => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
    }[ch]));
  }

  function value(v) {
    if (v === undefined || v === null || String(v).trim() === "") return "Not available";
    return String(v).trim();
  }

  function rawValue(record, keys) {
    for (const key of keys) {
      if (record && record[key] !== undefined && record[key] !== null &&
          String(record[key]).trim() !== "") return record[key];
    }
    return null;
  }

  function boolState(raw) {
    const s = String(raw ?? "").trim().toLowerCase();
    if (["true", "yes", "active", "indexed", "included", "present"].includes(s)) return "yes";
    if (["false", "no", "inactive", "not indexed", "not included", "absent"].includes(s)) return "no";
    return "neutral";
  }

  function statusText(raw) {
    const s = boolState(raw);
    if (s === "yes") return "Yes";
    if (s === "no") return "No";
    return value(raw);
  }

  function statusBadge(raw, positiveLabel = "Yes") {
    const s = boolState(raw);
    const label = s === "yes" ? `✓ ${positiveLabel}` : s === "no" ? "✕ No" : value(raw);
    return `<span class="badge ${s}">${escapeHTML(label)}</span>`;
  }

  function setLoading(message, active = true) {
    const el = $("#loading-status");
    if (!el) return;
    el.textContent = message;
    el.classList.toggle("is-hidden", !active);
  }

  function setDatabaseUI(ready, database) {
    const status = $("#database-status");
    const label = $("#database-status-label");
    const count = $("#database-count");
    const version = $("#database-version");

    if (label) label.textContent = ready ? "Ready" : "Unavailable";
    if (status) status.className = `status-dot ${ready ? "ready" : "error"}`;
    if (count) count.textContent = ready ? Number(database?.record_count ?? state.records.length).toLocaleString() : "—";
    if (version) version.textContent = ready ? value(database?.version) : "—";
  }

  async function fetchJSON(url, timeout = 12000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const response = await fetch(url, {
        cache: "no-store",
        signal: controller.signal,
        headers: { "Accept": "application/json" }
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } finally {
      clearTimeout(timer);
    }
  }

  async function loadDatabase() {
    if (state.prepared) return state.database;
    if (state.loadingPromise) return state.loadingPromise;

    state.loadingPromise = (async () => {
      setLoading("Loading the JournalCheck master database…", true);
      try {
        const database = await fetchJSON(`${DATABASE_URL}?v=${Date.now()}`, 20000);

        const normalized = Array.isArray(database)
          ? { version: "1.0", record_count: database.length, records: database }
          : {
              version: database?.version ?? "1.0",
              record_count: database?.record_count ?? database?.records?.length ?? 0,
              records: Array.isArray(database?.records) ? database.records : []
            };

        if (!normalized.records.length) {
          throw new Error("journals.json contains no journal records.");
        }

        prepareDatabase(normalized);
        setDatabaseUI(true, normalized);
        setLoading("Database loaded.", false);
        return normalized;
      } catch (error) {
        console.error("JournalCheck database error:", error);
        setDatabaseUI(false, null);
        setLoading("The JournalCheck database could not be loaded.", true);
        throw error;
      } finally {
        state.loadingPromise = null;
      }
    })();

    return state.loadingPromise;
  }

  function prepareDatabase(database) {
    state.database = database;
    state.records = database.records;
    state.entries = [];
    state.byISSN.clear();
    state.byTitle.clear();

    state.records.forEach((journal, index) => {
      const i = issn(rawValue(journal, ["i", "issn", "ISSN"]));
      const e = issn(rawValue(journal, ["e", "eissn", "EISSN"]));
      const t = titleNormalize(rawValue(journal, ["t", "title", "journal", "journal_title"]));

      const entry = {
        journal,
        index,
        title: t,
        titleTokens: tokens(rawValue(journal, ["t", "title", "journal", "journal_title"]))
      };

      state.entries.push(entry);
      if (i) state.byISSN.set(i, entry);
      if (e) state.byISSN.set(e, entry);
      if (t && !state.byTitle.has(t)) state.byTitle.set(t, entry);
    });

    state.prepared = true;
  }

  function scoreJournal(entry, query) {
    const j = entry.journal;
    const qCompact = normalize(query);
    const qTitle = titleNormalize(query);
    const qTokens = tokens(query);

    const jIssn = issn(rawValue(j, ["i", "issn"]));
    const jEissn = issn(rawValue(j, ["e", "eissn"]));

    if (qCompact && (qCompact === jIssn || qCompact === jEissn)) return 100000;
    if (entry.title === qTitle) return 90000;

    let score = 0;
    if (entry.title.startsWith(qTitle)) score += 4000;
    if (entry.title.includes(qTitle) && qTitle.length >= 3) score += 2500;

    let matched = 0;
    for (const token of qTokens) {
      if (entry.titleTokens.includes(token)) matched++;
      else if (entry.titleTokens.some(t => t.startsWith(token) || t.includes(token))) score += 80;
    }
    score += matched * 500;

    const publisher = titleNormalize(rawValue(j, ["p", "publisher"]));
    if (publisher && publisher.includes(qTitle) && qTitle.length >= 3) score += 250;

    return score;
  }

  function searchDatabase(query) {
    const q = String(query ?? "").trim();
    const nq = normalize(q);
    const nt = titleNormalize(q);
    if (!nq) return [];

    const exactId = state.byISSN.get(nq);
    if (exactId) return [{ ...exactId, score: 100000 }];

    const exactTitle = state.byTitle.get(nt);
    if (exactTitle) return [{ ...exactTitle, score: 90000 }];

    const results = state.entries
      .map(entry => ({ ...entry, score: scoreJournal(entry, q) }))
      .filter(x => x.score > 0)
      .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title));

    return results.slice(0, MAX_RESULTS);
  }

  function normalizeLocalRecord(record) {
    return {
      raw: record,
      title: rawValue(record, ["t", "title", "journal", "journal_title"]),
      issn: rawValue(record, ["i", "issn", "ISSN"]),
      eissn: rawValue(record, ["e", "eissn", "EISSN"]),
      publisher: rawValue(record, ["p", "publisher", "publisher_name"]),
      country: rawValue(record, ["c", "country"]),
      language: rawValue(record, ["l", "language"]),
      scie: rawValue(record, ["scie", "SCIE"]),
      ssci: rawValue(record, ["ssci", "SSCI"]),
      ahci: rawValue(record, ["ahci", "AHCI"]),
      esci: rawValue(record, ["esci", "ESCI"]),
      jcr: rawValue(record, ["jcr", "JCR", "jcr_2025"]),
      scopus: rawValue(record, ["sco", "scopus", "Scopus"]),
      scopusActive: rawValue(record, ["sa", "scopusActive", "scopus_active"]),
      scopusId: rawValue(record, ["sourceid", "scopusId", "scopus_id"]),
      scopusCoverage: rawValue(record, ["cov", "scopusCoverage", "scopus_coverage"]),
      scopusType: rawValue(record, ["st", "scopusType", "scopus_type"]),
      scopusOA: rawValue(record, ["oa", "scopusOA", "scopus_oa"]),
      citeScore: rawValue(record, ["cs", "citescore", "citeScore"]),
      snip: rawValue(record, ["snip", "SNIP"]),
      sjr: rawValue(record, ["sjr", "SJR"]),
      quartile: rawValue(record, ["quartile", "SJR Best Quartile"]),
      hindex: rawValue(record, ["hindex", "h_index", "H index"]),
      doaj: rawValue(record, ["doaj", "DOAJ"]),
      cope: rawValue(record, ["cope", "COPE"]),
      peerReview: rawValue(record, ["peerReview", "peer_review"]),
      editorialBoard: rawValue(record, ["editorialBoard", "editorial_board"]),
      apc: rawValue(record, ["apc", "APC"]),
      license: rawValue(record, ["license", "licence"]),
      ethics: rawValue(record, ["ethics", "publication_ethics"]),
      archiving: rawValue(record, ["archiving", "archive"]),
      website: rawValue(record, ["website", "url", "homepage"])
    };
  }

  async function loadSourceModule() {
    if (window.JournalCheckSources?.checkJournal) return window.JournalCheckSources;
    if (state.sourcePromise) return state.sourcePromise;

    state.sourcePromise = new Promise((resolve) => {
      const existing = document.querySelector('script[data-journalcheck-sources="1"]');
      if (existing) {
        const wait = () => window.JournalCheckSources?.checkJournal
          ? resolve(window.JournalCheckSources)
          : setTimeout(wait, 50);
        wait();
        return;
      }

      const script = document.createElement("script");
      script.src = `${SOURCES_JS}?v=${Date.now()}`;
      script.async = true;
      script.dataset.journalcheckSources = "1";

      script.onload = () => resolve(window.JournalCheckSources || null);
      script.onerror = () => {
        console.warn("JournalCheck: external source module could not be loaded.");
        resolve(null);
      };

      document.head.appendChild(script);
    });

    return state.sourcePromise;
  }

  function findLocalSJR(result) {
    return result?.result?.sjr || null;
  }

  function dataSourceLabel(available, source) {
    if (available) return `<span class="source-pill available">Available · ${escapeHTML(source)}</span>`;
    return `<span class="source-pill unavailable">Not confirmed</span>`;
  }

  function criterionRow(label, result, source, note = "") {
    const available = result !== null && result !== undefined && result !== "" &&
      String(result).toLowerCase() !== "not available";

    const display = available ? value(result) : "Not available";
    return `
      <div class="criterion-row">
        <div class="criterion-name">${escapeHTML(label)}</div>
        <div class="criterion-value">${escapeHTML(display)}</div>
        <div class="criterion-source">${dataSourceLabel(available, source)}${note ? `<small>${escapeHTML(note)}</small>` : ""}</div>
      </div>`;
  }

  function sourceCard(name, found, detail, url) {
    const cls = found === true ? "source-ok" : found === false ? "source-no" : "source-unknown";
    const icon = found === true ? "✓" : found === false ? "—" : "?";
    const status = found === true ? "Confirmed" : found === false ? "Not found" : "Not confirmed";

    return `
      <div class="source-card ${cls}">
        <div class="source-icon">${icon}</div>
        <div class="source-main">
          <strong>${escapeHTML(name)}</strong>
          <span>${escapeHTML(status)}</span>
          ${detail ? `<small>${escapeHTML(detail)}</small>` : ""}
        </div>
        ${url ? `<a href="${escapeHTML(url)}" target="_blank" rel="noopener noreferrer">Verify ↗</a>` : ""}
      </div>`;
  }

  function concernAnalysis(result) {
    const r = result.result;
    const signals = [];
    let score = 0;

    const cr = r.crossref;
    const oa = r.openalex;
    const sjr = r.sjr;
    const dj = r.doaj;

    if (cr?.found && r.title && cr.title) {
      const a = titleNormalize(r.title);
      const b = titleNormalize(cr.title);
      if (a !== b) {
        const overlap = tokenOverlap(a, b);
        if (overlap < 0.55) {
          score += 30;
          signals.push("Crossref returned a substantially different journal title for the supplied identifier.");
        } else {
          score += 0;
        }
      }
    }

    if (oa?.found) {
      const searched = [r.issn, r.eissn].flatMap(x => String(x ?? "").split(/[,\s;]+/)).map(issn).filter(x => x.length >= 7);
      const returned = (oa.issns || []).map(issn);
      if (searched.length && returned.length && !searched.some(x => returned.includes(x))) {
        score += 30;
        signals.push("OpenAlex identifiers do not align with the supplied ISSN/eISSN.");
      }
    }

    /*
     * Absence from a legitimate index is NOT treated as predatory evidence.
     * The following are only transparent completeness/identity signals.
     */
    if (!sjr) signals.push("No matching 2025 SCImago record was found in the supplied SJR dataset.");
    if (dj?.found === false) signals.push("No DOAJ record was confirmed through the available DOAJ check.");

    const band = score >= 75 ? "Extreme concern" :
                 score >= 50 ? "High concern" :
                 score >= 25 ? "Moderate concern" :
                 "Low concern";

    return { score, band, signals };
  }

  function tokenOverlap(a, b) {
    const A = new Set(a.split(" ").filter(Boolean));
    const B = new Set(b.split(" ").filter(Boolean));
    if (!A.size || !B.size) return 0;
    let n = 0;
    A.forEach(x => { if (B.has(x)) n++; });
    return n / Math.max(A.size, B.size);
  }

  function riskCard(risk) {
    const cls = risk.band.toLowerCase().replace(" ", "-").replace("extreme-concern", "extreme");
    const signals = risk.signals.length
      ? risk.signals.map(s => `<li>${escapeHTML(s)}</li>`).join("")
      : "<li>No identity mismatch or other automated concern signal was detected by the current screening rules.</li>";

    return `
      <div class="risk-panel risk-${escapeHTML(cls)}">
        <div class="risk-header">
          <div>
            <span class="eyebrow">Automated concern screening</span>
            <h3>${escapeHTML(risk.band)}</h3>
          </div>
          <div class="risk-score">${risk.score}<small>/100</small></div>
        </div>
        <p>This is a screening result, not a definitive declaration that a journal is predatory or legitimate.</p>
        <ul>${signals}</ul>
        <div class="risk-note">
          <strong>Important:</strong> missing Scopus, SJR, DOAJ or Web of Science data alone is not treated as evidence of predatory publishing.
        </div>
      </div>`;
  }

  function renderResults(matches, originalQuery, enriched = null) {
    const old = $("#results");
    if (old) old.remove();

    const section = document.createElement("section");
    section.id = "results";
    section.className = "results-section";

    if (!matches.length) {
      section.innerHTML = `
        <div class="container">
          <div class="empty-card">
            <span class="eyebrow">Search result</span>
            <h2>No matching journal found</h2>
            <p>Nothing matching <strong>“${escapeHTML(originalQuery)}”</strong> was found in the current JournalCheck master dataset.</p>
            <div class="tips">
              <strong>Try:</strong> the complete journal title, ISSN/eISSN, or a shorter distinctive part of the title.
            </div>
          </div>
        </div>`;
      insertResults(section);
      return;
    }

    const local = normalizeLocalRecord(matches[0].journal);
    const data = enriched?.result || {};
    const r = { ...local, ...data };
    const risk = enriched ? concernAnalysis(enriched) : {
      score: 0, band: "Low concern", signals: ["External screening is still being checked."]
    };

    const oa = data.openalex;
    const cr = data.crossref;
    const dj = data.doaj;
    const sjr = data.sjr;

    const title = value(r.title);
    const publisher = value(r.publisher);

    const sources = [
      sourceCard("JournalCheck master", true, "Local journal record", "./data/journals.json"),
      sourceCard("SCImago / SJR", !!sjr, sjr ? `2025 SJR ${sjr.sjr || "—"} · ${sjr.quartile || "Quartile unavailable"}` : "No matching record in supplied 2025 SJR file", "https://www.scimagojr.com/"),
      sourceCard("Crossref", cr?.found === true, cr?.title || "", cr?.url || "https://api.crossref.org/"),
      sourceCard("OpenAlex", oa?.found === true, oa?.title || "", oa?.url || "https://openalex.org/"),
      sourceCard("DOAJ", dj?.found === true, dj?.found === true ? "Journal record confirmed" : "No record confirmed", dj?.url || "https://doaj.org/"),
      sourceCard("Google Scholar", null, "Manual citation-profile verification", r.googleScholar?.url || `https://scholar.google.com/scholar?q=${encodeURIComponent(title)}`)
    ].join("");

    const criteria = [
      criterionRow("Journal title", title, "JournalCheck"),
      criterionRow("ISSN", value(r.issn), "JournalCheck"),
      criterionRow("eISSN", value(r.eissn), "JournalCheck"),
      criterionRow("Publisher", publisher, "JournalCheck"),
      criterionRow("Country", value(r.country), "JournalCheck"),
      criterionRow("Language", value(r.language), "JournalCheck"),

      criterionRow("SCIE", statusText(r.scie), "Web of Science dataset"),
      criterionRow("SSCI", statusText(r.ssci), "Web of Science dataset"),
      criterionRow("AHCI", statusText(r.ahci), "Web of Science dataset"),
      criterionRow("ESCI", statusText(r.esci), "Web of Science dataset"),
      criterionRow("JCR 2025", statusText(r.jcr), "JournalCheck dataset"),

      criterionRow("Scopus", statusText(r.scopus), "Scopus/JournCheck dataset"),
      criterionRow("Scopus Active", statusText(r.scopusActive), "Scopus/JournCheck dataset"),
      criterionRow("Scopus Source ID", value(r.scopusId || sjr?.sourceId), "Scopus / SJR"),
      criterionRow("Scopus coverage", value(r.scopusCoverage || sjr?.coverage), "Scopus / SJR"),
      criterionRow("Scopus source type", value(r.scopusType), "Scopus dataset"),
      criterionRow("Scopus Open Access", value(r.scopusOA || sjr?.openAccess), "Scopus / SJR"),

      criterionRow("SJR 2025", value(sjr?.sjr || r.sjr), "SCImago 2025"),
      criterionRow("SJR Best Quartile", value(sjr?.quartile || r.quartile), "SCImago 2025"),
      criterionRow("SJR H-index", value(sjr?.hIndex || r.hindex), "SCImago 2025"),
      criterionRow("SJR Rank", value(sjr?.rank), "SCImago 2025"),
      criterionRow("SJR Categories", value(sjr?.categories), "SCImago 2025"),
      criterionRow("SJR Areas", value(sjr?.areas), "SCImago 2025"),

      criterionRow("OpenAlex H-index", value(oa?.hIndex), "OpenAlex"),
      criterionRow("OpenAlex citations", value(oa?.citations), "OpenAlex"),
      criterionRow("OpenAlex works", value(oa?.works), "OpenAlex"),
      criterionRow("OpenAlex 2-year mean citedness", value(oa?.twoYearMeanCitedness), "OpenAlex"),
      criterionRow("OpenAlex DOAJ flag", oa?.isDOAJ === true ? "Yes" : oa?.isDOAJ === false ? "No" : "Not available", "OpenAlex"),

      criterionRow("Crossref DOI/work count", value(cr?.works), "Crossref"),
      criterionRow("DOAJ", dj?.found === true ? "Yes" : dj?.found === false ? "No" : "Not confirmed", "DOAJ"),
      criterionRow("COPE", statusText(r.cope), "JournalCheck dataset"),
      criterionRow("Peer review information", value(r.peerReview), "JournalCheck dataset"),
      criterionRow("Editorial board information", value(r.editorialBoard), "JournalCheck dataset"),
      criterionRow("APC information", value(r.apc), "JournalCheck dataset"),
      criterionRow("License", value(r.license), "JournalCheck dataset"),
      criterionRow("Publication ethics", value(r.ethics), "JournalCheck dataset"),
      criterionRow("Archiving", value(r.archiving), "JournalCheck dataset")
    ].join("");

    section.innerHTML = `
      <div class="container">
        <div class="result-heading">
          <div>
            <span class="eyebrow">JournalCheck evidence report</span>
            <h2>${escapeHTML(title)}</h2>
            <p>${escapeHTML(publisher)} · Search: “${escapeHTML(originalQuery)}”</p>
          </div>
          <div class="result-actions">
            <button class="secondary-btn" id="print-results" type="button">Print report</button>
          </div>
        </div>

        <article class="journal-card jc-final-card">
          <div class="card-top">
            <div>
              <span class="match-label">BEST MATCH</span>
              <h2>${escapeHTML(title)}</h2>
              <p class="publisher">${escapeHTML(publisher)}</p>
            </div>
            <button class="icon-button" id="copy-final" type="button">Copy</button>
          </div>

          <div class="info-grid">
            ${field("ISSN", value(r.issn))}
            ${field("eISSN", value(r.eissn))}
            ${field("Publisher", publisher)}
            ${field("Country", value(r.country))}
          </div>

          <div class="metric-strip">
            <div><span>SJR</span><strong>${escapeHTML(value(sjr?.sjr || r.sjr))}</strong></div>
            <div><span>Quartile</span><strong>${escapeHTML(value(sjr?.quartile || r.quartile))}</strong></div>
            <div><span>SJR H-index</span><strong>${escapeHTML(value(sjr?.hIndex || r.hindex))}</strong></div>
            <div><span>Scopus</span><strong>${escapeHTML(statusText(r.scopus))}</strong></div>
            <div><span>DOAJ</span><strong>${escapeHTML(dj?.found === true ? "Yes" : dj?.found === false ? "No" : "—")}</strong></div>
          </div>

          ${riskCard(risk)}

          <h3>Indexing & recognition</h3>
          <div class="index-grid">
            ${indexingCard("SCIE", r.scie)}
            ${indexingCard("SSCI", r.ssci)}
            ${indexingCard("AHCI", r.ahci)}
            ${indexingCard("ESCI", r.esci)}
            ${indexingCard("JCR 2025", r.jcr)}
            ${indexingCard("Scopus", r.scopus)}
            ${indexingCard("Scopus Active", r.scopusActive)}
            ${indexingCard("DOAJ", dj?.found === true ? "yes" : dj?.found === false ? "no" : null)}
          </div>

          <h3>Journal quality & metrics</h3>
          <div class="details-grid">
            ${field("SJR 2025", value(sjr?.sjr || r.sjr))}
            ${field("SJR Best Quartile", value(sjr?.quartile || r.quartile))}
            ${field("SJR H-index", value(sjr?.hIndex || r.hindex))}
            ${field("SJR Rank", value(sjr?.rank))}
            ${field("CiteScore", value(r.citeScore))}
            ${field("SNIP", value(r.snip))}
            ${field("OpenAlex H-index", value(oa?.hIndex))}
            ${field("OpenAlex citations", value(oa?.citations))}
          </div>

          <h3>All criteria & evidence</h3>
          <div class="criteria-table">
            ${criteria}
          </div>

          <h3>Independent source checks</h3>
          <div class="source-grid">
            ${sources}
          </div>

          <div class="verification-box">
            <strong>How to interpret this report</strong>
            <p>
              “Not available” means the information was not present or could not be confirmed from the source used.
              It does <strong>not</strong> mean the journal is predatory. Indexing status, journal quality and publisher-risk signals are separate questions.
            </p>
          </div>

          <div class="card-footer">
            <span>JournalCheck evidence engine</span>
            <span>Local database + available external confirmations</span>
          </div>
        </article>

        ${matches.length > 1 ? `
          <div class="alternative-results">
            <h3>Other possible matches</h3>
            ${matches.slice(1).map((m, i) => `
              <button type="button" class="alternative-btn" data-alt-index="${i + 1}">
                <strong>${escapeHTML(value(m.journal.t))}</strong>
                <span>${escapeHTML(value(m.journal.p))}</span>
              </button>`).join("")}
          </div>` : ""}

        <div class="dataset-disclaimer">
          <strong>Research-use notice:</strong> JournalCheck aggregates datasets and public-source evidence.
          It does not replace verification on official Scopus, Clarivate/Web of Science, SCImago, DOAJ,
          Crossref, OpenAlex or publisher pages when a submission, promotion, accreditation or institutional
          decision depends on current status.
        </div>
      </div>`;

    insertResults(section);

    $("#print-results", section)?.addEventListener("click", () => window.print());

    $("#copy-final", section)?.addEventListener("click", () => {
      const copyText = buildCopyText(r, sjr, oa, cr, dj, risk);
      navigator.clipboard?.writeText(copyText).then(() => {
        const btn = $("#copy-final", section);
        const old = btn.textContent;
        btn.textContent = "Copied";
        setTimeout(() => btn.textContent = old, 1200);
      }).catch(() => alert("Copy failed. Please copy the report manually."));
    });

    section.querySelectorAll("[data-alt-index]").forEach(btn => {
      btn.addEventListener("click", async () => {
        const idx = Number(btn.dataset.altIndex);
        const selected = matches[idx];
        if (!selected) return;
        renderResults([selected], originalQuery, null);
        const sourceApi = await loadSourceModule();
        if (sourceApi?.checkJournal) {
          try {
            const enriched = await sourceApi.checkJournal(value(selected.journal.t));
            renderResults([selected], originalQuery, enriched);
          } catch (e) {
            console.warn("Alternative enrichment failed:", e);
          }
        }
      });
    });
  }

  function field(label, content) {
    return `<div class="info-cell"><span>${escapeHTML(label)}</span><strong>${escapeHTML(content)}</strong></div>`;
  }

  function indexingCard(label, raw) {
    const s = boolState(raw);
    const text = s === "yes" ? "✓ Yes" : s === "no" ? "✕ No" : "Not confirmed";
    return `<div class="index-card"><span>${escapeHTML(label)}</span><span class="badge ${s}">${escapeHTML(text)}</span></div>`;
  }

  function buildCopyText(r, sjr, oa, cr, dj, risk) {
    return [
      `JournalCheck Report`,
      `Journal: ${value(r.title)}`,
      `ISSN: ${value(r.issn)}`,
      `eISSN: ${value(r.eissn)}`,
      `Publisher: ${value(r.publisher)}`,
      `SJR 2025: ${value(sjr?.sjr || r.sjr)}`,
      `SJR Quartile: ${value(sjr?.quartile || r.quartile)}`,
      `SJR H-index: ${value(sjr?.hIndex || r.hindex)}`,
      `SJR Rank: ${value(sjr?.rank)}`,
      `Scopus: ${statusText(r.scopus)}`,
      `Scopus Active: ${statusText(r.scopusActive)}`,
      `JCR 2025: ${statusText(r.jcr)}`,
      `SCIE: ${statusText(r.scie)}`,
      `SSCI: ${statusText(r.ssci)}`,
      `AHCI: ${statusText(r.ahci)}`,
      `ESCI: ${statusText(r.esci)}`,
      `DOAJ: ${dj?.found === true ? "Yes" : dj?.found === false ? "No" : "Not confirmed"}`,
      `OpenAlex H-index: ${value(oa?.hIndex)}`,
      `OpenAlex citations: ${value(oa?.citations)}`,
      `Crossref DOI/work count: ${value(cr?.works)}`,
      `Concern screening: ${risk.band} (${risk.score}/100)`,
      ``,
      `JournalCheck is a screening and evidence-aggregation tool; verify current status with official sources for high-stakes decisions.`
    ].join("\n");
  }

  function insertResults(section) {
    const features = $("#features");
    if (features) features.before(section);
    else document.body.appendChild(section);

    requestAnimationFrame(() => {
      section.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  function addRecent(query) {
    try {
      const current = JSON.parse(localStorage.getItem(RECENT_KEY) || "[]");
      const next = [
        query,
        ...current.filter(x => String(x).toLowerCase() !== query.toLowerCase())
      ].slice(0, 8);
      localStorage.setItem(RECENT_KEY, JSON.stringify(next));
      renderRecent();
    } catch (_) {}
  }

  function renderRecent() {
    const wrap = $("#recent-searches");
    if (!wrap) return;

    try {
      const items = JSON.parse(localStorage.getItem(RECENT_KEY) || "[]");
      if (!items.length) {
        wrap.innerHTML = "";
        return;
      }

      wrap.innerHTML = `
        <span>Recent:</span>
        ${items.map(q => `
          <button type="button" class="recent-btn" data-query="${escapeHTML(q)}">${escapeHTML(q)}</button>
        `).join("")}`;

      wrap.querySelectorAll(".recent-btn").forEach(btn => {
        btn.addEventListener("click", () => {
          const input = $("#journal");
          if (input) input.value = btn.dataset.query;
          checkJournal(btn.dataset.query);
        });
      });
    } catch (_) {
      wrap.innerHTML = "";
    }
  }

  function showInlineError(message) {
    const el = $("#search-error");
    if (!el) {
      console.error(message);
      return;
    }
    el.textContent = message;
    el.classList.remove("is-hidden");
  }

  function hideInlineError() {
    $("#search-error")?.classList.add("is-hidden");
  }

  async function checkJournal(explicitQuery) {
    const input = $("#journal");
    const button = $("#check-button");
    const query = String(explicitQuery ?? input?.value ?? "").trim();

    if (!query) {
      input?.focus();
      showInlineError("Enter a journal name, ISSN or eISSN.");
      return;
    }

    hideInlineError();
    state.lastQuery = query;

    if (button) {
      button.disabled = true;
      button.textContent = "Checking…";
    }

    try {
      await loadDatabase();

      /*
       * IMPORTANT FIX:
       * Render the local database result FIRST.
       * External APIs cannot keep the UI in "Searching…" state.
       */
      const matches = searchDatabase(query);
      addRecent(query);
      renderResults(matches, query, null);

      try {
        const url = new URL(window.location.href);
        url.searchParams.set("q", query);
        history.replaceState({}, "", url);
      } catch (_) {}

      if (!matches.length) {
        setLoading("No local match found.", false);
        return;
      }

      setLoading("Local result ready. Checking independent sources…", true);

      /*
       * External enrichment is optional. Every error is caught.
       */
      const sourceApi = await loadSourceModule();

      if (sourceApi?.checkJournal) {
        try {
          const enriched = await sourceApi.checkJournal(
            value(matches[0].journal.t || matches[0].journal.title)
          );

          renderResults(matches, query, enriched);
          setLoading("Complete.", false);
        } catch (error) {
          console.warn("JournalCheck external enrichment failed:", error);
          setLoading("Complete — local database result shown.", false);
        }
      } else {
        setLoading("Complete — local database result shown.", false);
      }
    } catch (error) {
      console.error("JournalCheck search error:", error);
      showInlineError(`Search could not be completed: ${error.message}`);
      setLoading("Search error.", true);
    } finally {
      if (button) {
        button.disabled = false;
        button.textContent = "Check Journal";
      }
    }
  }

  window.checkJournal = checkJournal;

  document.addEventListener("DOMContentLoaded", async () => {
    const input = $("#journal");
    const button = $("#check-button");

    input?.addEventListener("keydown", event => {
      if (event.key === "Enter") {
        event.preventDefault();
        checkJournal();
      }
    });

    button?.addEventListener("click", () => checkJournal());

    $("#clear-button")?.addEventListener("click", () => {
      if (input) input.value = "";
      hideInlineError();
      input?.focus();
    });

    document.querySelectorAll("[data-example]").forEach(btn => {
      btn.addEventListener("click", () => {
        if (input) input.value = btn.dataset.example;
        checkJournal(btn.dataset.example);
      });
    });

    renderRecent();

    try {
      await loadDatabase();
    } catch (error) {
      console.error(error);
    }

    const params = new URLSearchParams(window.location.search);
    const initialQuery = params.get("q");

    if (initialQuery) {
      if (input) input.value = initialQuery;
      checkJournal(initialQuery);
    }
  });
})();
