(() => {
  "use strict";

  const DATABASE_URL = "./data/journals.json";
  const MAX_RESULTS = 20;
  const RECENT_KEY = "journalcheck_recent_searches_v1";

  const state = {
    database: null,
    records: [],
    byISSN: new Map(),
    byTitle: new Map(),
    prepared: false,
    loadingPromise: null,
    entries: []
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

  function tokens(value) {
    return String(value ?? "")
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(Boolean);
  }

  function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, ch => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    })[ch]);
  }

  function value(value) {
    if (value === undefined || value === null || String(value).trim() === "") return "Not available";
    return String(value).trim();
  }

  function booleanState(raw) {
    const s = String(raw ?? "").trim().toLowerCase();
    if (["true", "yes", "active", "indexed"].includes(s)) return "yes";
    if (["false", "no", "inactive", "not indexed"].includes(s)) return "no";
    return "neutral";
  }

  function badge(raw) {
    const s = booleanState(raw);
    const text = s === "yes" ? "✓ Yes" : s === "no" ? "✕ No" : value(raw);
    return `<span class="badge ${s}">${escapeHTML(text)}</span>`;
  }

  function statusLabel(raw) {
    const s = booleanState(raw);
    if (s === "yes") return "Yes";
    if (s === "no") return "No";
    return value(raw);
  }

  function setLoading(message, active = true) {
    const el = $("#loading-status");
    if (!el) return;
    el.textContent = message;
    el.classList.toggle("is-hidden", !active);
  }

  function prepareDatabase(database) {
    state.database = database;
    state.records = Array.isArray(database.records) ? database.records : [];
    state.entries = [];
    state.byISSN.clear();
    state.byTitle.clear();

    state.records.forEach((journal, index) => {
      const issn = normalize(journal.i);
      const eissn = normalize(journal.e);
      const title = normalize(journal.t);
      const entry = { journal, index, title, titleTokens: tokens(journal.t) };
      state.entries.push(entry);
      if (issn) state.byISSN.set(issn, entry);
      if (eissn) state.byISSN.set(eissn, entry);
      if (title && !state.byTitle.has(title)) state.byTitle.set(title, entry);
    });

    state.prepared = true;
    const count = state.records.length.toLocaleString();
    $("#database-count").textContent = count;
    $("#database-version").textContent = value(database.version);
    $("#database-status-label").textContent = "Ready";
    $("#database-status").className = "status-dot ready";
  }

  async function loadDatabase() {
    if (state.prepared) return state.database;
    if (state.loadingPromise) return state.loadingPromise;

    state.loadingPromise = (async () => {
      setLoading("Loading the JournalCheck master database…");
      try {
        const response = await fetch(`${DATABASE_URL}?v=${Date.now()}`, { cache: "no-store" });
        if (!response.ok) throw new Error(`Database request failed (HTTP ${response.status}).`);
        const database = await response.json();
        if (!database || !Array.isArray(database.records)) throw new Error("Invalid JournalCheck database format.");
        prepareDatabase(database);
        setLoading("Database loaded.", false);
        return database;
      } catch (error) {
        $("#database-status-label").textContent = "Unavailable";
        $("#database-status").className = "status-dot error";
        setLoading("The database could not be loaded.", true);
        throw error;
      } finally {
        state.loadingPromise = null;
      }
    })();

    return state.loadingPromise;
  }

  function scoreJournal(entry, query, normalizedQuery, queryTokens) {
    const j = entry.journal;
    const title = entry.title;
    const issn = normalize(j.i);
    const eissn = normalize(j.e);

    if (issn === normalizedQuery || eissn === normalizedQuery) return 10000;
    if (title === normalizedQuery) return 9000;

    let score = 0;
    if (title.startsWith(normalizedQuery)) score += 2200;
    if (title.includes(normalizedQuery)) score += 1500;

    const titleTokens = entry.titleTokens;
    let matchedTokens = 0;
    queryTokens.forEach(t => {
      if (titleTokens.includes(t)) matchedTokens += 1;
      else if (titleTokens.some(tt => tt.startsWith(t) || tt.includes(t))) score += 60;
    });
    score += matchedTokens * 260;

    const publisher = normalize(j.p);
    if (publisher.includes(normalizedQuery)) score += 180;

    // Small prefix similarity bonus for common misspellings/partial titles.
    const compact = normalize(query);
    if (compact.length >= 5) {
      let common = 0;
      const limit = Math.min(compact.length, title.length);
      while (common < limit && compact[common] === title[common]) common++;
      score += Math.min(common * 8, 120);
    }

    return score;
  }

  function searchDatabase(query) {
    const normalizedQuery = normalize(query);
    if (!normalizedQuery) return [];

    const exactId = state.byISSN.get(normalizedQuery);
    if (exactId) return [{ ...exactId, score: 10000 }];

    const exactTitle = state.byTitle.get(normalizedQuery);
    if (exactTitle) return [{ ...exactTitle, score: 9000 }];

    const queryTokens = tokens(query);
    const matches = [];

    for (const entry of state.entries) {
      const score = scoreJournal(entry, query, normalizedQuery, queryTokens);
      if (score > 0) matches.push({ ...entry, score });
    }

    matches.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title));
    return matches.slice(0, MAX_RESULTS);
  }

  function field(label, content) {
    return `<div class="info-cell"><span>${escapeHTML(label)}</span><strong>${escapeHTML(content)}</strong></div>`;
  }

  function indexingCard(label, raw) {
    return `<div class="index-card"><span>${escapeHTML(label)}</span>${badge(raw)}</div>`;
  }

  function completeness(journal) {
    const fields = ["t", "i", "e", "p", "c", "l", "st", "oa", "cov", "scie", "ssci", "ahci", "esci", "jcr", "sco", "sa"];
    const present = fields.filter(k => journal[k] !== undefined && journal[k] !== null && String(journal[k]).trim() !== "").length;
    return Math.round((present / fields.length) * 100);
  }

  function interpretation(journal) {
    const points = [];
    if (booleanState(journal.sa) === "yes") points.push("The dataset marks this source as Scopus Active.");
    else if (booleanState(journal.sco) === "yes") points.push("The dataset marks this source as Scopus-listed, while the separate Scopus Active field is not positive.");
    if (booleanState(journal.jcr) === "yes") points.push("The dataset marks this journal as present in JCR 2025.");
    if (booleanState(journal.scie) === "yes" || booleanState(journal.ssci) === "yes" || booleanState(journal.ahci) === "yes" || booleanState(journal.esci) === "yes") points.push("At least one Web of Science collection field is marked positive in the dataset.");
    if (booleanState(journal.sa) !== "yes" && booleanState(journal.sco) !== "yes") points.push("The current dataset does not mark this journal as Scopus-listed.");
    return points;
  }

  function renderResults(matches, originalQuery) {
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
            <div class="tips"><strong>Try:</strong> the full journal title, ISSN/eISSN, or a shorter distinctive part of the title.</div>
          </div>
        </div>`;
      insertResults(section);
      return;
    }

    const cards = matches.map((match, index) => {
      const j = match.journal;
      const points = interpretation(j);
      const complete = completeness(j);
      const dataPoints = points.map(p => `<li>${escapeHTML(p)}</li>`).join("");
      const title = value(j.t);

      return `
      <article class="journal-card">
        <div class="card-top">
          <div>
            <span class="match-label">${index === 0 ? "BEST MATCH" : "MATCH"}</span>
            <h2>${escapeHTML(title)}</h2>
            <p class="publisher">${escapeHTML(value(j.p))}</p>
          </div>
          <button class="icon-button copy-btn" type="button" data-index="${index}" title="Copy journal result" aria-label="Copy journal result">Copy</button>
        </div>

        <div class="info-grid">
          ${field("ISSN", value(j.i))}
          ${field("eISSN", value(j.e))}
          ${field("Country", value(j.c))}
          ${field("Language", value(j.l))}
        </div>

        <h3>Indexing profile</h3>
        <div class="index-grid">
          ${indexingCard("SCIE", j.scie)}
          ${indexingCard("SSCI", j.ssci)}
          ${indexingCard("AHCI", j.ahci)}
          ${indexingCard("ESCI", j.esci)}
          ${indexingCard("JCR 2025", j.jcr)}
          ${indexingCard("Scopus", j.sco)}
          ${indexingCard("Scopus Active", j.sa)}
        </div>

        <h3>Publication information</h3>
        <div class="details-grid">
          ${field("Scopus source type", value(j.st))}
          ${field("Scopus OA", value(j.oa))}
          ${field("Coverage", value(j.cov))}
          ${field("Dataset completeness", `${complete}%`)}
        </div>

        <div class="interpretation">
          <div>
            <span class="section-label">Evidence-based interpretation</span>
            <ul>${dataPoints || "<li>No additional interpretation is generated from missing data.</li>"}</ul>
          </div>
          <div class="scope-note">
            <strong>Risk screening</strong>
            <p>The current master dataset does not contain enough independent evidence to label a journal predatory or safe. Missing fields are not treated as proof of misconduct.</p>
          </div>
        </div>

        <div class="card-footer">
          <span>Source: JournalCheck master dataset</span>
          <span>Record ${index + 1} of ${matches.length}</span>
        </div>
      </article>`;
    }).join("");

    section.innerHTML = `
      <div class="container">
        <div class="result-heading">
          <div>
            <span class="eyebrow">JournalCheck database search</span>
            <h2>${matches.length} result${matches.length === 1 ? "" : "s"} for “${escapeHTML(originalQuery)}”</h2>
          </div>
          <button class="secondary-btn" id="print-results" type="button">Print results</button>
        </div>
        ${cards}
        <div class="dataset-disclaimer">
          <strong>Important:</strong> these results come from the current JournalCheck master dataset. They are not a live verification against Scopus, Clarivate/Web of Science, publishers, or other external services. Always confirm critical submission requirements with the relevant official source before submitting.
        </div>
      </div>`;

    insertResults(section);

    section.querySelectorAll(".copy-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        const match = matches[Number(btn.dataset.index)];
        copyJournal(match.journal, btn);
      });
    });

    $("#print-results", section)?.addEventListener("click", () => window.print());
  }

  function insertResults(section) {
    const features = $("#features");
    if (features) features.before(section); else document.body.appendChild(section);
    requestAnimationFrame(() => section.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  function addRecent(query) {
    try {
      const current = JSON.parse(localStorage.getItem(RECENT_KEY) || "[]");
      const next = [query, ...current.filter(x => x.toLowerCase() !== query.toLowerCase())].slice(0, 5);
      localStorage.setItem(RECENT_KEY, JSON.stringify(next));
      renderRecent();
    } catch (_) {}
  }

  function renderRecent() {
    const wrap = $("#recent-searches");
    if (!wrap) return;
    try {
      const items = JSON.parse(localStorage.getItem(RECENT_KEY) || "[]");
      if (!items.length) { wrap.innerHTML = ""; return; }
      wrap.innerHTML = `<span>Recent:</span>${items.map(q => `<button type="button" class="recent-btn" data-query="${escapeHTML(q)}">${escapeHTML(q)}</button>`).join("")}`;
      wrap.querySelectorAll(".recent-btn").forEach(btn => btn.addEventListener("click", () => {
        $("#journal").value = btn.dataset.query;
        checkJournal(btn.dataset.query);
      }));
    } catch (_) { wrap.innerHTML = ""; }
  }

  async function copyJournal(journal, button) {
    const text = [
      value(journal.t),
      `Publisher: ${value(journal.p)}`,
      `ISSN: ${value(journal.i)}`,
      `eISSN: ${value(journal.e)}`,
      `Country: ${value(journal.c)}`,
      `Language: ${value(journal.l)}`,
      `SCIE: ${statusLabel(journal.scie)}`,
      `SSCI: ${statusLabel(journal.ssci)}`,
      `AHCI: ${statusLabel(journal.ahci)}`,
      `ESCI: ${statusLabel(journal.esci)}`,
      `JCR 2025: ${statusLabel(journal.jcr)}`,
      `Scopus: ${statusLabel(journal.sco)}`,
      `Scopus Active: ${statusLabel(journal.sa)}`,
      `Coverage: ${value(journal.cov)}`,
      `JournalCheck master dataset`
    ].join("\n");

    try {
      await navigator.clipboard.writeText(text);
      const old = button.textContent;
      button.textContent = "Copied";
      setTimeout(() => button.textContent = old, 1200);
    } catch (_) {
      alert("Copy failed. Please copy the result manually.");
    }
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
    button.disabled = true;
    button.textContent = "Checking…";
    try {
      await loadDatabase();
      const matches = searchDatabase(query);
      addRecent(query);
      renderResults(matches, query);
      const url = new URL(window.location.href);
      url.searchParams.set("q", query);
      history.replaceState({}, "", url);
    } catch (error) {
      console.error("JournalCheck ERROR:", error);
      showInlineError("The journal database could not be loaded. Please refresh and try again.");
    } finally {
      button.disabled = false;
      button.textContent = "Check Journal";
    }
  }

  function showInlineError(message) {
    const el = $("#search-error");
    if (el) { el.textContent = message; el.classList.remove("is-hidden"); }
  }
  function hideInlineError() {
    const el = $("#search-error");
    if (el) el.classList.add("is-hidden");
  }

  window.checkJournal = checkJournal;

  document.addEventListener("DOMContentLoaded", async () => {
    const input = $("#journal");
    const button = $("#check-button");
    input?.addEventListener("keydown", event => {
      if (event.key === "Enter") { event.preventDefault(); checkJournal(); }
    });
    button?.addEventListener("click", () => checkJournal());
    $("#clear-button")?.addEventListener("click", () => {
      input.value = "";
      hideInlineError();
      input.focus();
    });
    document.querySelectorAll("[data-example]").forEach(btn => btn.addEventListener("click", () => {
      input.value = btn.dataset.example;
      checkJournal(btn.dataset.example);
    }));
    renderRecent();

    const params = new URLSearchParams(window.location.search);
    const initialQuery = params.get("q");
    if (initialQuery) {
      input.value = initialQuery;
      checkJournal(initialQuery);
    } else {
      try { await loadDatabase(); } catch (error) { console.error(error); }
    }
  });
})();
