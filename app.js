const state = { db: null };

const $ = (id) => document.getElementById(id);

function norm(value) {
    return String(value || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function value(v) {
    return v === undefined || v === null || v === "" ? "—" : v;
}

function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, ch => ({
        "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
    }[ch]));
}

async function loadDatabase() {
    if (state.db) return state.db;
    const response = await fetch("/Journal_checker/data/journals.json", { cache: "no-store" });
    if (!response.ok) throw new Error("Journal database could not be loaded.");
    state.db = await response.json();
    return state.db;
}

function findMatches(db, query) {
    const q = norm(query);
    if (!q) return [];

    const exact = [];
    const seen = new Set();

    for (const id of [db.issn_index[q], db.title_index[q]]) {
        if (id !== undefined && !seen.has(id)) {
            seen.add(id);
            exact.push(db.records[id]);
        }
    }

    if (exact.length) return exact;

    const matches = [];
    for (const r of db.records) {
        if (norm(r.t).includes(q)) {
            matches.push(r);
            if (matches.length >= 20) break;
        }
    }
    return matches;
}

function status(v) {
    const s = String(v || "").toLowerCase();
    if (s === "true" || s === "yes" || s === "active" || s === "indexed") {
        return `<span class="badge yes">✓ Yes</span>`;
    }
    if (s === "false" || s === "no" || s === "inactive") {
        return `<span class="badge no">✕ No</span>`;
    }
    return `<span class="badge neutral">${escapeHtml(value(v))}</span>`;
}

function renderResults(matches, query) {
    document.getElementById("jc-results")?.remove();

    const section = document.createElement("section");
    section.id = "jc-results";
    section.className = "jc-results";

    if (!matches.length) {
        section.innerHTML = `
            <div class="container">
              <div class="jc-empty">
                <h2>No journal found</h2>
                <p>No matching record was found in the current JournalCheck database.</p>
                <p class="jc-muted">Try the full title, ISSN, or eISSN.</p>
              </div>
            </div>`;
        document.querySelector(".features")?.before(section);
        return;
    }

    const cards = matches.map((r, index) => `
      <article class="jc-card">
        <div class="jc-card-head">
          <div>
            <div class="jc-kicker">${index === 0 ? "BEST MATCH" : "MATCH"}</div>
            <h2>${escapeHtml(value(r.t))}</h2>
            <p>${escapeHtml(value(r.p))}</p>
          </div>
        </div>

        <div class="jc-grid">
          <div><strong>ISSN</strong><span>${escapeHtml(value(r.i))}</span></div>
          <div><strong>eISSN</strong><span>${escapeHtml(value(r.e))}</span></div>
          <div><strong>Country</strong><span>${escapeHtml(value(r.c))}</span></div>
          <div><strong>Language</strong><span>${escapeHtml(value(r.l))}</span></div>
        </div>

        <h3>Indexing status</h3>
        <div class="jc-indexing">
          <div><span>SCIE</span>${status(r.scie)}</div>
          <div><span>SSCI</span>${status(r.ssci)}</div>
          <div><span>AHCI</span>${status(r.ahci)}</div>
          <div><span>ESCI</span>${status(r.esci)}</div>
          <div><span>JCR 2025</span>${status(r.jcr)}</div>
          <div><span>Scopus</span>${status(r.sco)}</div>
          <div><span>Scopus Active</span>${status(r.sa)}</div>
        </div>

        <div class="jc-foot">
          <span>Scopus source type: ${escapeHtml(value(r.st))}</span>
          <span>Scopus OA: ${escapeHtml(value(r.oa))}</span>
          <span>Coverage: ${escapeHtml(value(r.cov))}</span>
        </div>
      </article>`).join("");

    section.innerHTML = `
      <div class="container">
        <div class="jc-result-title">
          <div class="tag">Verified database search</div>
          <h2>${matches.length} result${matches.length === 1 ? "" : "s"} for “${escapeHtml(query)}”</h2>
        </div>
        ${cards}
        <p class="jc-disclaimer">
          These results come from the current JournalCheck master dataset.
          They are not yet a live verification against external index websites.
        </p>
      </div>`;

    document.querySelector(".features")?.before(section);
    section.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function checkJournal() {
    const input = $("journal");
    const query = input?.value.trim();

    if (!query) {
        alert("Please enter a journal name, ISSN or eISSN.");
        input?.focus();
        return;
    }

    const button = document.querySelector(".search-row button");
    const original = button?.textContent;
    if (button) {
        button.disabled = true;
        button.textContent = "Searching…";
    }

    try {
        const db = await loadDatabase();
        renderResults(findMatches(db, query), query);
    } catch (error) {
        console.error(error);
        alert("The journal database could not be loaded. Please try again.");
    } finally {
        if (button) {
            button.disabled = false;
            button.textContent = original || "Check Journal";
        }
    }
}

document.addEventListener("DOMContentLoaded", () => {
    $("journal")?.addEventListener("keydown", e => {
        if (e.key === "Enter") checkJournal();
    });
});
