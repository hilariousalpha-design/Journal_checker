/* ============================================================
   JournalCheck — live data enrichment layer
   Works with GitHub Pages / static hosting.

   Local files expected:
     data/journals.json
     data/scimagojr-2025-journalcheck.csv
     (optional) data/scopus.csv

   Sources:
     - Local JournalCheck master database
     - SCImago 2025 CSV supplied by the project owner
     - Crossref REST API
     - OpenAlex Sources API
     - DOAJ API (when browser access is allowed)
     - Google Scholar: LINK ONLY; no scraping

   IMPORTANT:
   Never treat "not found" in one source as proof that a journal is
   predatory. Missing data is reported separately from negative evidence.
   ============================================================ */

(() => {
  "use strict";

  const CFG = {
    master: "./data/journals.json",
    sjr: "./data/scimagojr-2025-journalcheck.csv",
    timeout: 8000
  };

  const $ = (id) => document.getElementById(id);

  function clean(v) {
    return String(v ?? "").trim();
  }

  function normTitle(v) {
    return clean(v)
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function normIssn(v) {
    return clean(v).replace(/[^0-9xX]/g, "").toUpperCase();
  }

  function esc(v) {
    return String(v ?? "").replace(/[&<>"']/g, c => ({
      "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;"
    }[c]));
  }

  async function getJSON(url, timeout = CFG.timeout) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), timeout);
    try {
      const r = await fetch(url, {
        signal: ctl.signal,
        headers: { Accept: "application/json" },
        cache: "no-store"
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.json();
    } finally {
      clearTimeout(timer);
    }
  }

  async function getText(url, timeout = 15000) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), timeout);
    try {
      const r = await fetch(url, { signal: ctl.signal, cache: "no-store" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.text();
    } finally {
      clearTimeout(timer);
    }
  }

  /* -------- CSV parser: handles quoted semicolon-separated SJR data -------- */
  function parseSemicolonCSV(text) {
    const rows = [];
    let row = [], cell = "", quoted = false;

    for (let i = 0; i < text.length; i++) {
      const ch = text[i], next = text[i + 1];

      if (quoted) {
        if (ch === '"' && next === '"') {
          cell += '"'; i++;
        } else if (ch === '"') {
          quoted = false;
        } else {
          cell += ch;
        }
      } else {
        if (ch === '"') quoted = true;
        else if (ch === ";") {
          row.push(cell); cell = "";
        } else if (ch === "\n") {
          row.push(cell); rows.push(row); row = []; cell = "";
        } else if (ch !== "\r") {
          cell += ch;
        }
      }
    }
    if (cell.length || row.length) {
      row.push(cell); rows.push(row);
    }

    if (!rows.length) return [];
    const headers = rows[0].map(x => x.trim());
    return rows.slice(1)
      .filter(r => r.some(x => clean(x)))
      .map(r => Object.fromEntries(headers.map((h, i) => [h, r[i] ?? ""])));
  }

  function addIssn(index, issnValue, record) {
    String(issnValue ?? "")
      .split(/[,\s;]+/)
      .map(normIssn)
      .filter(x => x.length >= 7)
      .forEach(x => index.set(x, record));
  }

  async function loadLocalSJR() {
    try {
      const text = await getText(CFG.sjr, 20000);
      const rows = parseSemicolonCSV(text);
      const byIssn = new Map();

      for (const r of rows) {
        const item = {
          source: "SCImago Journal & Country Rank",
          year: "2025",
          rank: r["Rank"] || null,
          sourceId: r["Sourceid"] || null,
          title: r["Title"] || null,
          issn: r["Issn"] || null,
          publisher: r["Publisher"] || null,
          openAccess: r["Open Access"] || null,
          sjr: r["SJR"] || null,
          quartile: r["SJR Best Quartile"] || null,
          hIndex: r["H index"] || null,
          coverage: r["Coverage"] || null,
          categories: r["Categories"] || null,
          areas: r["Areas"] || null,
          country: r["Country"] || null
        };
        addIssn(byIssn, item.issn, item);
      }

      return { ok: true, count: rows.length, byIssn };
    } catch (error) {
      return { ok: false, count: 0, byIssn: new Map(), error: error.message };
    }
  }

  async function loadMaster() {
    const data = await getJSON(CFG.master, 20000);
    return Array.isArray(data)
      ? { version: "1.0", record_count: data.length, records: data }
      : {
          version: data.version ?? "1.0",
          record_count: data.record_count ?? data.records?.length ?? 0,
          records: Array.isArray(data.records) ? data.records : []
        };
  }

  function getField(r, names) {
    for (const n of names) {
      if (r && r[n] !== undefined && r[n] !== null && clean(r[n]) !== "") return r[n];
    }
    return null;
  }

  function masterRecord(r) {
    return {
      raw: r,
      title: getField(r, ["t","title","journal","journal_title","journalTitle","name"]),
      issn: getField(r, ["i","issn","ISSN","pissn","print_issn"]),
      eissn: getField(r, ["e","eissn","EISSN","online_issn","electronic_issn"]),
      publisher: getField(r, ["p","publisher","publisher_name","publisherName"]),
      country: getField(r, ["c","country","publisher_country","publisherCountry"]),
      language: getField(r, ["l","language","lang"]),

      scie: getField(r, ["scie","SCIE"]),
      ssci: getField(r, ["ssci","SSCI"]),
      ahci: getField(r, ["ahci","AHCI"]),
      esci: getField(r, ["esci","ESCI"]),
      jcr: getField(r, ["jcr","jcr_2025","JCR 2025"]),

      scopus: getField(r, ["scopus","Scopus","sco","scopus_indexed"]),
      scopusActive: getField(r, ["scopus_active","scopusActive","scopus_active_status","active"]),
      scopusId: getField(r, ["scopus_id","source_id","scopus_source_id","sourceid"]),
      scopusCoverage: getField(r, ["scopus_coverage","coverage_years","scopus_coverage_years","coverage","cov"]),
      scopusType: getField(r, ["scopus_source_type","source_type","scopus_type","st"]),
      scopusOA: getField(r, ["scopus_oa","scopusOA","open_access","oa"]),
      citeScore: getField(r, ["citescore","cite_score","CiteScore","cs","citescore_2025","citescore_2024"]),
      snip: getField(r, ["snip","SNIP","snip_2025","snip_2024"]),

      doaj: getField(r, ["doaj","DOAJ","doaj_indexed"]),
      cope: getField(r, ["cope","COPE"]),
      website: getField(r, ["website","url","journal_url","homepage","homepage_url","official_site","official_website"])
    };
  }

  function tokenSimilarity(a, b) {
    const A = new Set(normTitle(a).split(" ").filter(Boolean));
    const B = new Set(normTitle(b).split(" ").filter(Boolean));
    if (!A.size || !B.size) return 0;
    let same = 0;
    A.forEach(x => { if (B.has(x)) same++; });
    return same / Math.max(A.size, B.size);
  }

  function findMaster(records, query) {
    const q = clean(query);
    const qIssn = normIssn(q);

    if (qIssn.length >= 7) {
      for (const r of records) {
        const x = masterRecord(r);
        const all = [x.issn, x.eissn].flatMap(v =>
          String(v ?? "").split(/[,\s;]+/).map(normIssn)
        );
        if (all.includes(qIssn)) return x;
      }
    }

    const nq = normTitle(q);
    let best = null;

    for (const r of records) {
      const x = masterRecord(r);
      const nt = normTitle(x.title);
      if (!nt) continue;

      let score = tokenSimilarity(nt, nq) * 100;
      if (nt === nq) score += 150;
      if (nt.includes(nq) && nq.length > 4) score += 70;

      if (!best || score > best.score) best = { score, journal: x };
    }

    return best && best.score >= 25 ? best.journal : null;
  }

  /* -------- Crossref -------- */
  async function crossref(j) {
    const issns = [j.issn, j.eissn]
      .flatMap(v => String(v ?? "").split(/[,\s;]+/))
      .filter(Boolean);

    for (const raw of issns) {
      const issn = normIssn(raw);
      if (issn.length < 7) continue;

      try {
        const d = await getJSON(
          `https://api.crossref.org/journals/${encodeURIComponent(issn)}`,
          7000
        );
        const m = d.message || {};
        return {
          found: !!m.title,
          title: Array.isArray(m.title) ? m.title.join(" ") : m.title || null,
          publisher: m.publisher || null,
          issns: m.ISSN || [],
          works: m.counts?.["total-dois"] ?? m.count ?? null,
          source: "Crossref REST API",
          url: `https://api.crossref.org/journals/${encodeURIComponent(issn)}`
        };
      } catch (_) {}
    }

    return { found: false, source: "Crossref REST API" };
  }

  /* -------- OpenAlex --------
     The direct ISSN endpoint is valid, but a 404 can simply mean the
     ISSN is absent from OpenAlex. Therefore we fall back to filter and
     then title search. */
  async function openAlex(j) {
    const issns = [j.issn, j.eissn]
      .flatMap(v => String(v ?? "").split(/[,\s;]+/))
      .map(normIssn)
      .filter(x => x.length >= 7);

    for (const issn of issns) {
      try {
        const d = await getJSON(
          `https://api.openalex.org/sources/issn:${encodeURIComponent(issn)}`,
          7000
        );
        if (d?.id) return normalizeOpenAlex(d);
      } catch (_) {}

      try {
        const d = await getJSON(
          `https://api.openalex.org/sources?filter=issn:${encodeURIComponent(issn)}&per-page=5`,
          7000
        );
        const s = d?.results?.[0];
        if (s?.id) return normalizeOpenAlex(s);
      } catch (_) {}
    }

    if (j.title) {
      try {
        const d = await getJSON(
          `https://api.openalex.org/sources?search=${encodeURIComponent(j.title)}&per-page=10`,
          7000
        );

        const candidates = d?.results || [];
        const best = candidates
          .map(s => ({ s, score: tokenSimilarity(j.title, s.display_name) }))
          .sort((a,b) => b.score - a.score)[0];

        if (best && best.score >= 0.55) return normalizeOpenAlex(best.s);
      } catch (_) {}
    }

    return { found: false, source: "OpenAlex" };
  }

  function normalizeOpenAlex(s) {
    return {
      found: true,
      id: s.id,
      title: s.display_name || null,
      publisher: s.host_organization_name || s.publisher || null,
      issns: [s.issn_l, ...(s.issn || [])].filter(Boolean),
      works: s.works_count ?? null,
      citations: s.cited_by_count ?? null,
      hIndex: s.summary_stats?.h_index ?? null,
      i10Index: s.summary_stats?.i10_index ?? null,
      twoYearMeanCitedness: s.summary_stats?.["2yr_mean_citedness"] ?? null,
      isOA: s.is_oa ?? null,
      isDOAJ: s.is_in_doaj ?? null,
      country: s.country_code ?? null,
      homepage: s.homepage_url ?? null,
      apcUSD: s.apc_usd ?? null,
      source: "OpenAlex",
      url: s.id || "https://openalex.org/"
    };
  }

  /* -------- DOAJ -------- */
  async function doaj(j) {
    const issns = [j.issn, j.eissn]
      .flatMap(v => String(v ?? "").split(/[,\s;]+/))
      .map(normIssn)
      .filter(x => x.length >= 7);

    for (const issn of issns) {
      const urls = [
        `https://doaj.org/api/search/journals/issn:${encodeURIComponent(issn)}?page=1&pageSize=1`,
        `https://doaj.org/api/search/journal.issn:${encodeURIComponent(issn)}?page=1&pageSize=1`
      ];

      for (const url of urls) {
        try {
          const d = await getJSON(url, 7000);
          const total = Number(d.total ?? d.meta?.count ?? 0);
          const item = d.results?.[0]?.bibjson || d.results?.[0] || null;

          return {
            found: total > 0,
            total,
            record: item,
            source: "DOAJ API",
            url: `https://doaj.org/toc/${encodeURIComponent(issn)}`
          };
        } catch (_) {}
      }
    }

    return {
      found: false,
      source: "DOAJ",
      url: j.eissn || j.issn
        ? `https://doaj.org/search/journals?ref=issn%3A${encodeURIComponent(normIssn(j.eissn || j.issn))}`
        : "https://doaj.org/"
    };
  }

  /* -------- Google Scholar --------
     There is no official public Google Scholar journal API. Do NOT scrape
     Scholar from a GitHub Pages browser. Instead provide a transparent
     Scholar search link and label citation/H-index figures from OpenAlex
     or SJR separately. */
  function googleScholar(j) {
    const q = `"${j.title || ""}" ${j.issn || j.eissn || ""}`.trim();
    return {
      source: "Google Scholar",
      automated: false,
      url: `https://scholar.google.com/scholar?q=${encodeURIComponent(q)}`
    };
  }

  function merge(j, sjr, cr, oa, dj) {
    const result = {
      ...j,
      sjr: sjr || null,
      crossref: cr,
      openalex: oa,
      doaj: dj,
      googleScholar: googleScholar(j)
    };

    /* Use SJR as the authoritative source for SJR / quartile / SJR H-index.
       Never replace SJR with OpenAlex. */
    if (sjr) {
      result.sjrValue = sjr.sjr;
      result.sjrQuartile = sjr.quartile;
      result.sjrHIndex = sjr.hIndex;
      result.sjrRank = sjr.rank;
      result.sjrCoverage = sjr.coverage;
      result.sjrCategories = sjr.categories;
    }

    return result;
  }

  /* -------- Evidence / concern screening --------
     This is a screening system, NOT a predatory-journal verdict. */
  function concernProfile(j) {
    const signals = [];

    if (j.crossref?.found && j.title && j.crossref.title) {
      if (tokenSimilarity(j.title, j.crossref.title) < 0.55) {
        signals.push({
          points: 30,
          level: "high",
          label: "Crossref identity mismatch",
          detail: "The title returned for the ISSN differs substantially from the master record."
        });
      }
    }

    if (j.openalex?.found) {
      const expected = [j.issn, j.eissn]
        .flatMap(v => String(v ?? "").split(/[,\s;]+/))
        .map(normIssn)
        .filter(x => x.length >= 7);

      const actual = (j.openalex.issns || []).map(normIssn);
      if (expected.length && actual.length && !expected.some(x => actual.includes(x))) {
        signals.push({
          points: 30,
          level: "high",
          label: "OpenAlex identifier mismatch",
          detail: "OpenAlex returned a source whose ISSN identifiers do not align with the searched journal."
        });
      }
    }

    /* Missing DOAJ / Scopus / SJR is NOT automatically a risk signal. */
    return {
      score: Math.min(100, signals.reduce((a, x) => a + x.points, 0)),
      signals
    };
  }

  function concernBand(score) {
    if (score >= 75) return "Extreme concern";
    if (score >= 50) return "High concern";
    if (score >= 25) return "Moderate concern";
    return "Low concern";
  }

  /* -------- Main public function -------- */
  async function checkJournal(query) {
    const master = await loadMaster();
    const sjrDB = await loadLocalSJR();

    const j = findMaster(master.records, query);

    if (!j) {
      return {
        found: false,
        query,
        database: {
          records: master.record_count,
          version: master.version,
          sjrRecords: sjrDB.count
        }
      };
    }

    /* External services run in parallel. One failure must never stop the
       result page from rendering. */
    const [cr, oa, dj] = await Promise.all([
      crossref(j).catch(e => ({ found: false, error: e.message, source: "Crossref" })),
      openAlex(j).catch(e => ({ found: false, error: e.message, source: "OpenAlex" })),
      doaj(j).catch(e => ({ found: null, error: e.message, source: "DOAJ" }))
    ]);

    const ids = [j.issn, j.eissn]
      .flatMap(v => String(v ?? "").split(/[,\s;]+/))
      .map(normIssn)
      .filter(x => x.length >= 7);

    let sjr = null;
    for (const id of ids) {
      if (sjrDB.byIssn.has(id)) {
        sjr = sjrDB.byIssn.get(id);
        break;
      }
    }

    const result = merge(j, sjr, cr, oa, dj);
    const risk = concernProfile(result);

    return {
      found: true,
      result,
      risk: {
        ...risk,
        band: concernBand(risk.score)
      },
      database: {
        records: master.record_count,
        version: master.version,
        sjrRecords: sjrDB.count,
        sjrLoaded: sjrDB.ok
      }
    };
  }

  window.JournalCheckSources = {
    checkJournal,
    loadLocalSJR,
    loadMaster,
    concernProfile,
    concernBand
  };
})();
