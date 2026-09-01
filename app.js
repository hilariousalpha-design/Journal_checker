/* ============================================================
   JournalCheck — Production Search Engine
   Version: 3.0

   PRIMARY DATA:
     ./data/journals.json

   EXTERNAL VERIFICATION:
     OpenAlex
     Crossref
     DOAJ
     ISSN Portal
     SCImago
     Google investigation links

   IMPORTANT:
     External services NEVER block the local search.
     Missing information is NEVER treated as misconduct.
   ============================================================ */

(() => {
  "use strict";

  /* ==========================================================
     BASIC HELPERS
     ========================================================== */

  const $ = id => document.getElementById(id);

  const esc = value =>
    String(value ?? "").replace(/[&<>"']/g, c => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    }[c]));

  const clean = value =>
    String(value ?? "")
      .normalize("NFKC")
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .replace(/\s+/g, " ")
      .trim();

  const digits = value =>
    String(value ?? "")
      .replace(/[^0-9xX]/g, "")
      .toUpperCase();

  const text = value => {
    if (
      value === null ||
      value === undefined ||
      String(value).trim() === ""
    ) {
      return "Not available";
    }
    return String(value);
  };

  const has = value =>
    value !== null &&
    value !== undefined &&
    String(value).trim() !== "";

  /* ==========================================================
     DATABASE
     ========================================================== */

  let DB = {
    version: "—",
    record_count: 0,
    records: []
  };

  let databaseLoaded = false;
  let currentRecord = null;

  let titleIndex = [];
  let issnIndex = new Map();

  /* ==========================================================
     FIELD MAPPING
     Supports both compact JSON and descriptive column names.
     ========================================================== */

  const FIELD = {

    title: [
      "t",
      "title",
      "journal",
      "journal_title",
      "journalTitle",
      "name"
    ],

    issn: [
      "i",
      "issn",
      "ISSN",
      "pissn",
      "print_issn",
      "printISSN"
    ],

    eissn: [
      "e",
      "eissn",
      "EISSN",
      "online_issn",
      "electronic_issn",
      "onlineISSN"
    ],

    publisher: [
      "p",
      "publisher",
      "publisher_name",
      "publisherName"
    ],

    country: [
      "c",
      "country",
      "publisher_country",
      "publisherCountry"
    ],

    language: [
      "l",
      "language",
      "lang"
    ],

    /* Web of Science */

    scie: [
      "scie",
      "SCIE",
      "sci",
      "web_of_science_scie"
    ],

    ssci: [
      "ssci",
      "SSCI",
      "web_of_science_ssci"
    ],

    ahci: [
      "ahci",
      "AHCI",
      "web_of_science_ahci"
    ],

    esci: [
      "esci",
      "ESCI",
      "web_of_science_esci"
    ],

    jcr: [
      "jcr",
      "jcr_2025",
      "JCR 2025",
      "jcr2025"
    ],

    /* Scopus */

    scopus: [
      "scopus",
      "Scopus",
      "sco",
      "scopus_indexed"
    ],

    scopusActive: [
      "scopus_active",
      "scopusActive",
      "scopus_active_status",
      "scopusActiveStatus",
      "sa",
      "active"
    ],

    scopusId: [
      "scopus_id",
      "source_id",
      "scopus_source_id",
      "sourceid"
    ],

    scopusCoverage: [
      "scopus_coverage",
      "coverage_years",
      "scopus_coverage_years",
      "coverage",
      "cov"
    ],

    scopusType: [
      "scopus_source_type",
      "source_type",
      "scopus_type",
      "st"
    ],

    scopusOA: [
      "scopus_oa",
      "scopusOA",
      "open_access",
      "oa"
    ],

    citeScore: [
      "citescore",
      "cite_score",
      "CiteScore",
      "cs",
      "citescore_2025",
      "citescore_2024"
    ],

    snip: [
      "snip",
      "SNIP",
      "snip_2025",
      "snip_2024"
    ],

    sjr: [
      "sjr",
      "SJR",
      "scimago_sjr",
      "sjr_2025",
      "sjr_2024"
    ],

    quartile: [
      "quartile",
      "best_quartile",
      "sjr_quartile",
      "scimago_quartile",
      "q",
      "sjr_q",
      "scimago_q",
      "quartile_2025",
      "quartile_2024"
    ],

    hindex: [
      "h_index",
      "hindex",
      "H_index",
      "h_index_2025",
      "h_index_2024"
    ],

    subject: [
      "subject",
      "subject_area",
      "subject_area_name",
      "scimago_subject",
      "scopus_subject",
      "asjc"
    ],

    /* External databases */

    doaj: [
      "doaj",
      "DOAJ",
      "doaj_indexed"
    ],

    openalex: [
      "openalex",
      "OpenAlex",
      "openalex_id"
    ],

    crossref: [
      "crossref",
      "Crossref"
    ],

    cope: [
      "cope",
      "COPE"
    ],

    /* Transparency */

    peerReview: [
      "peer_review",
      "peer_review_policy",
      "peer_review_type"
    ],

    editorialBoard: [
      "editorial_board",
      "editorialBoard",
      "editors"
    ],

    apc: [
      "apc",
      "apc_info",
      "article_processing_charge",
      "fees"
    ],

    license: [
      "license",
      "licence",
      "license_policy"
    ],

    copyright: [
      "copyright",
      "copyright_policy"
    ],

    ethics: [
      "ethics",
      "publication_ethics",
      "ethics_policy"
    ],

    retraction: [
      "retraction",
      "correction_policy",
      "retractions"
    ],

    archiving: [
      "archiving",
      "preservation",
      "digital_archiving"
    ],

    doi: [
      "doi",
      "doi_prefix",
      "persistent_identifier"
    ],

    website: [
      "website",
      "url",
      "journal_url",
      "homepage",
      "homepage_url",
      "official_site",
      "official_website"
    ],

    warning: [
      "warning",
      "risk_warning",
      "risk_flags",
      "risk_signals",
      "predatory_warning"
    ]
  };

  function value(record, key) {

    if (!record) return null;

    for (const field of FIELD[key] || [key]) {

      if (
        Object.prototype.hasOwnProperty.call(record, field) &&
        has(record[field])
      ) {
        return record[field];
      }
    }

    return null;
  }

  /* ==========================================================
     BOOLEAN STATUS
     ========================================================== */

  function boolState(value) {

    if (!has(value)) return "unknown";

    if (typeof value === "boolean") {
      return value ? "yes" : "no";
    }

    const s = clean(value);

    if (
      [
        "yes",
        "y",
        "true",
        "1",
        "active",
        "indexed",
        "included",
        "verified",
        "present"
      ].includes(s)
    ) {
      return "yes";
    }

    if (
      [
        "no",
        "n",
        "false",
        "0",
        "inactive",
        "not indexed",
        "not included",
        "discontinued",
        "stopped",
        "absent"
      ].includes(s)
    ) {
      return "no";
    }

    return "unknown";
  }

  function statusBadge(value) {

    const state = boolState(value);

    if (state === "yes") {
      return `<span class="status yes">✓ Yes</span>`;
    }

    if (state === "no") {
      return `<span class="status no">× No</span>`;
    }

    return `<span class="status unknown">— Not available</span>`;
  }

  function stateBadge(state) {

    if (state === "yes") {
      return `<span class="status yes">✓ Confirmed</span>`;
    }

    if (state === "no") {
      return `<span class="status no">× Not found</span>`;
    }

    return `<span class="status unknown">— Unknown</span>`;
  }

  /* ==========================================================
     FETCH WITH TIMEOUT
     ========================================================== */

  async function fetchJSON(url, timeout = 6000) {

    const controller = new AbortController();

    const timer = setTimeout(
      () => controller.abort(),
      timeout
    );

    try {

      const response = await fetch(url, {
        signal: controller.signal,
        cache: "no-store",
        headers: {
          Accept: "application/json"
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      return await response.json();

    } finally {

      clearTimeout(timer);
    }
  }

  /* ==========================================================
     DATABASE LOADING
     ========================================================== */

  async function loadDatabase() {

    if (databaseLoaded) {
      return true;
    }

    try {

      setStatus("Loading database…");

      const response = await fetch(
        `./data/journals.json?v=${Date.now()}`,
        {
          cache: "no-store"
        }
      );

      if (!response.ok) {
        throw new Error(
          `Database HTTP ${response.status}`
        );
      }

      const data = await response.json();

      if (Array.isArray(data)) {

        DB = {
          version: "1.0",
          record_count: data.length,
          records: data
        };

      } else {

        DB = {
          version: data.version ?? "1.0",
          record_count:
            data.record_count ??
            data.records?.length ??
            0,
          records:
            Array.isArray(data.records)
              ? data.records
              : []
        };
      }

      if (!DB.records.length) {
        throw new Error(
          "journals.json contains no journal records."
        );
      }

      buildIndexes();

      databaseLoaded = true;

      setStatus("Ready");

      if ($("recordCount")) {
        $("recordCount").textContent =
          Number(DB.record_count).toLocaleString();
      }

      if ($("datasetVersion")) {
        $("datasetVersion").textContent =
          DB.version;
      }

      if ($("dbStatus")) {
        $("dbStatus").textContent = "Ready";
      }

      if ($("dbDot")) {
        $("dbDot").style.background =
          "#20a66f";
      }

      return true;

    } catch (error) {

      console.error(
        "JournalCheck database error:",
        error
      );

      databaseLoaded = false;

      if ($("dbStatus")) {
        $("dbStatus").textContent =
          "Database error";
      }

      if ($("recordCount")) {
        $("recordCount").textContent = "—";
      }

      if ($("datasetVersion")) {
        $("datasetVersion").textContent = "—";
      }

      if ($("dbDot")) {
        $("dbDot").style.background =
          "#c53b42";
      }

      showMessage(
        "Database could not be loaded.",
        `${error.message}. Check that journals.json exists at data/journals.json.`
      );

      return false;
    }
  }

  /* ==========================================================
     SEARCH INDEX
     ========================================================== */

  function buildIndexes() {

    titleIndex = [];

    issnIndex = new Map();

    DB.records.forEach(record => {

      const title =
        clean(value(record, "title"));

      const issn =
        digits(value(record, "issn"));

      const eissn =
        digits(value(record, "eissn"));

      titleIndex.push({
        record,
        title
      });

      if (issn) {
        issnIndex.set(issn, record);
      }

      if (eissn) {
        issnIndex.set(eissn, record);
      }
    });
  }

  /* ==========================================================
     SEARCH SCORING
     ========================================================== */

  function tokenSimilarity(a, b) {

    if (!a || !b) return 0;

    if (a === b) return 1;

    const A =
      new Set(a.split(" ").filter(Boolean));

    const B =
      new Set(b.split(" ").filter(Boolean));

    let matches = 0;

    A.forEach(token => {

      if (B.has(token)) {
        matches++;
      }
    });

    return (
      matches /
      Math.max(A.size, B.size)
    );
  }

  function compactTitle(value) {

    return clean(value)
      .replace(
        /\b(the|journal|of|and|in|for|a|an|on|to|from)\b/g,
        " "
      )
      .replace(/\s+/g, " ")
      .trim();
  }

  function findMatches(query) {

    const raw = String(query || "").trim();

    const normalized =
      clean(raw);

    const queryISSN =
      digits(raw);

    if (!normalized && !queryISSN) {
      return [];
    }

    /* Exact ISSN match */

    if (queryISSN.length >= 7) {

      const exact =
        issnIndex.get(queryISSN);

      if (exact) {
        return [exact];
      }
    }

    const compactQuery =
      compactTitle(raw);

    const scored = [];

    for (const item of titleIndex) {

      const record = item.record;

      const title =
        item.title;

      const compact =
        compactTitle(
          value(record, "title")
        );

      let score = 0;

      if (title === normalized) {
        score += 200;
      }

      if (
        normalized.length > 3 &&
        title.includes(normalized)
      ) {
        score += 100;
      }

      if (
        title.length > 3 &&
        normalized.includes(title)
      ) {
        score += 50;
      }

      if (
        compactQuery &&
        compact === compactQuery
      ) {
        score += 150;
      }

      if (
        compactQuery.length > 3 &&
        compact.includes(compactQuery)
      ) {
        score += 70;
      }

      score +=
        tokenSimilarity(
          title,
          normalized
        ) * 60;

      const publisher =
        clean(
          value(record, "publisher")
        );

      if (
        publisher &&
        publisher === normalized
      ) {
        score += 15;
      }

      if (score >= 30) {
        scored.push({
          record,
          score
        });
      }
    }

    scored.sort(
      (a, b) =>
        b.score - a.score
    );

    return scored
      .slice(0, 20)
      .map(x => x.record);
  }

  /* ==========================================================
     NORMALIZE RECORD
     ========================================================== */

  function normalizeRecord(record) {

    return {

      raw: record,

      title:
        value(record, "title"),

      issn:
        value(record, "issn"),

      eissn:
        value(record, "eissn"),

      publisher:
        value(record, "publisher"),

      country:
        value(record, "country"),

      language:
        value(record, "language"),

      scie:
        value(record, "scie"),

      ssci:
        value(record, "ssci"),

      ahci:
        value(record, "ahci"),

      esci:
        value(record, "esci"),

      jcr:
        value(record, "jcr"),

      scopus:
        value(record, "scopus"),

      scopusActive:
        value(record, "scopusActive"),

      scopusId:
        value(record, "scopusId"),

      scopusCoverage:
        value(record, "scopusCoverage"),

      scopusType:
        value(record, "scopusType"),

      scopusOA:
        value(record, "scopusOA"),

      citeScore:
        value(record, "citeScore"),

      snip:
        value(record, "snip"),

      sjr:
        value(record, "sjr"),

      quartile:
        value(record, "quartile"),

      hindex:
        value(record, "hindex"),

      subject:
        value(record, "subject"),

      doaj:
        value(record, "doaj"),

      openalex:
        value(record, "openalex"),

      crossref:
        value(record, "crossref"),

      cope:
        value(record, "cope"),

      peerReview:
        value(record, "peerReview"),

      editorialBoard:
        value(record, "editorialBoard"),

      apc:
        value(record, "apc"),

      license:
        value(record, "license"),

      copyright:
        value(record, "copyright"),

      ethics:
        value(record, "ethics"),

      retraction:
        value(record, "retraction"),

      archiving:
        value(record, "archiving"),

      doi:
        value(record, "doi"),

      website:
        value(record, "website"),

      warning:
        value(record, "warning")
    };
  }

  /* ==========================================================
     EXTERNAL VERIFICATION
     
     IMPORTANT:
     These are optional enrichment checks.
     They can NEVER prevent local results from appearing.
     ========================================================== */

  async function externalChecks(journal) {

    const result = {

      openalex: null,

      crossref: null,

      doaj: null,

      retractions: null
    };

    const identifiers = [
      journal.issn,
      journal.eissn
    ]
      .filter(Boolean)
      .map(x => norm(x))
      .filter(Boolean);

    if (!identifiers.length) {
      return result;
    }

    /* -------------------------
       OpenAlex
       ------------------------- */

    const openAlexJob = (async () => {

      for (const issn of identifiers) {

        try {

          /*
             IMPORTANT:
             Use the filter endpoint rather than
             /sources/issn:XXXX which can return 404.
          */

          const url =
            `https://api.openalex.org/sources?filter=issn:${encodeURIComponent(
              issn
            )}&per-page=1`;

          const data =
            await fetchJSON(
              url,
              5000
            );

          const source =
            data?.results?.[0];

          if (source?.id) {

            const sourceISSNs = [
              source.issn_l,
              ...(source.issn || [])
            ]
              .filter(Boolean)
              .map(digits);

            result.openalex = {

              found: true,

              id: source.id,

              displayName:
                source.display_name || "",

              issns:
                sourceISSNs,

              works:
                source.works_count ?? null,

              citations:
                source.cited_by_count ?? null,

              homepage:
                source.homepage_url || "",

              publisher:
                source.host_organization_name || "",

              country:
                source.country_code || "",

              isOA:
                source.is_oa === true,

              isInDOAJ:
                source.is_in_doaj === true,

              hIndex:
                source.summary_stats?.h_index ??
                null,

              citedness:
                source.summary_stats?.[
                  "2yr_mean_citedness"
                ] ?? null,

              type:
                source.type || "",

              issnMismatch:
                !sourceISSNs.some(
                  x =>
                    identifiers
                      .map(digits)
                      .includes(x)
                )
            };

            return;
          }

        } catch (error) {

          console.warn(
            "OpenAlex check failed:",
            error.message
          );
        }
      }

      result.openalex = {
        found: null,
        error:
          "OpenAlex could not be reached or no matching source was returned."
      };

    })();

    /* -------------------------
       Crossref
       ------------------------- */

    const crossrefJob = (async () => {

      for (const issn of identifiers) {

        try {

          const data =
            await fetchJSON(
              `https://api.crossref.org/journals/${encodeURIComponent(
                issn
              )}`,
              5000
            );

          const message =
            data?.message;

          if (message?.title) {

            const crossISSNs =
              (message.ISSN || [])
                .map(digits);

            const title =
              Array.isArray(message.title)
                ? message.title.join(" ")
                : message.title;

            result.crossref = {

              found: true,

              title,

              issn:
                message.ISSN || [],

              publisher:
                message.publisher || "",

              works:
                message.counts?.[
                  "total-dois"
                ] ??
                message.count ??
                null,

              titleMismatch:
                !!journal.title &&
                tokenSimilarity(
                  clean(title),
                  clean(journal.title)
                ) < 0.55,

              issnMismatch:
                crossISSNs.length > 0 &&
                !identifiers
                  .map(digits)
                  .some(x =>
                    crossISSNs.includes(x)
                  )
            };

            return;
          }

        } catch (error) {

          console.warn(
            "Crossref check failed:",
            error.message
          );
        }
      }

      result.crossref = {
        found: null,
        error:
          "Crossref could not be reached or no journal record was returned."
      };

    })();

    /* -------------------------
       DOAJ
       -------------------------

       DOAJ API availability can vary by browser/CORS.
       We therefore do not let it block anything.
       ------------------------- */

    const doajJob = (async () => {

      for (const issn of identifiers) {

        try {

          const url =
            `https://doaj.org/api/search/journals/issn:${encodeURIComponent(
              issn
            )}?page=1&pageSize=1`;

          const data =
            await fetchJSON(
              url,
              5000
            );

          const total =
            Number(data?.total || 0);

          result.doaj = {

            found:
              total > 0,

            total,

            record:
              data?.results?.[0]?.bibjson ||
              null
          };

          return;

        } catch (error) {

          console.warn(
            "DOAJ check unavailable:",
            error.message
          );
        }
      }

      result.doaj = {
        found: null,
        error:
          "DOAJ could not be queried directly from this browser."
      };

    })();

    /* -------------------------
       Crossref retraction metadata
       ------------------------- */

    const retractionJob = (async () => {

      try {

        const issn =
          identifiers[0];

        const data =
          await fetchJSON(
            `https://api.crossref.org/journals/${encodeURIComponent(
              issn
            )}/works?filter=update-type:retraction&rows=0`,
            5000
          );

        result.retractions = {

          count:
            Number(
              data?.message?.[
                "total-results"
              ] ??
              data?.message?.total_results ??
              0
            ),

          source:
            "Crossref update metadata"
        };

      } catch (error) {

        result.retractions = {

          count: null,

          error:
            "Retraction metadata unavailable."
        };
      }

    })();

    /*
       Wait for all checks, but NEVER throw.
    */

    await Promise.allSettled([
      openAlexJob,
      crossrefJob,
      doajJob,
      retractionJob
    ]);

    return result;
  }

  /* ==========================================================
     CONCERN SCREENING
     ========================================================== */

  function calculateRisk(journal, external) {

    const signals = [];

    const add =
      (points, title, detail) => {

        signals.push({
          points,
          title,
          detail
        });
      };

    /*
       IMPORTANT:
       We deliberately DO NOT assign concern points merely
       because SCOPUS / WoS / DOAJ information is missing.
    */

    if (
      external.crossref?.titleMismatch
    ) {

      add(
        30,
        "Crossref identity mismatch",
        "The journal title returned by Crossref does not align sufficiently with the local journal record. Verify the ISSN/title relationship."
      );
    }

    if (
      external.openalex?.issnMismatch
    ) {

      add(
        30,
        "OpenAlex identifier mismatch",
        "OpenAlex returned identifiers that do not align cleanly with the searched journal."
      );
    }

    if (
      external.retractions?.count > 0
    ) {

      add(
        8,
        "Retraction-related metadata signal",
        `${external.retractions.count} retraction-related Crossref update record(s) were found. This is a screening signal and is not proof of misconduct.`
      );
    }

    if (has(journal.warning)) {

      const warnings =
        Array.isArray(journal.warning)
          ? journal.warning
          : [journal.warning];

      warnings.forEach(warning => {

        add(
          15,
          "Recorded warning signal",
          String(warning)
        );
      });
    }

    const score =
      Math.min(
        100,
        signals.reduce(
          (sum, signal) =>
            sum + signal.points,
          0
        )
      );

    let band = "low";

    if (score >= 75) {
      band = "extreme";
    } else if (score >= 50) {
      band = "high";
    } else if (score >= 25) {
      band = "moderate";
    }

    return {
      score,
      band,
      signals
    };
  }

  /* ==========================================================
     CRITERIA
     ========================================================== */

  function criteria(journal, external) {

    return [

      /* Identity */

      [
        "Journal title",
        has(journal.title)
          ? "yes"
          : "unknown",
        "Identity"
      ],

      [
        "ISSN",
        has(journal.issn)
          ? "yes"
          : "unknown",
        "Identity"
      ],

      [
        "eISSN",
        has(journal.eissn)
          ? "yes"
          : "unknown",
        "Identity"
      ],

      [
        "Publisher",
        has(journal.publisher)
          ? "yes"
          : "unknown",
        "Identity"
      ],

      [
        "Country",
        has(journal.country)
          ? "yes"
          : "unknown",
        "Identity"
      ],

      [
        "Language",
        has(journal.language)
          ? "yes"
          : "unknown",
        "Identity"
      ],

      /* Web of Science */

      [
        "SCIE",
        boolState(journal.scie),
        "Web of Science"
      ],

      [
        "SSCI",
        boolState(journal.ssci),
        "Web of Science"
      ],

      [
        "AHCI",
        boolState(journal.ahci),
        "Web of Science"
      ],

      [
        "ESCI",
        boolState(journal.esci),
        "Web of Science"
      ],

      [
        "JCR",
        boolState(journal.jcr),
        "Web of Science"
      ],

      /* Scopus */

      [
        "Scopus",
        boolState(journal.scopus),
        "Scopus"
      ],

      [
        "Scopus Active",
        boolState(journal.scopusActive),
        "Scopus"
      ],

      /* External */

      [
        "DOAJ",
        external.doaj?.found === true
          ? "yes"
          : external.doaj?.found === false
            ? "no"
            : "unknown",
        "External verification"
      ],

      [
        "OpenAlex",
        external.openalex?.found === true
          ? "yes"
          : external.openalex?.found === false
            ? "no"
            : "unknown",
        "External verification"
      ],

      [
        "Crossref",
        external.crossref?.found === true
          ? "yes"
          : external.crossref?.found === false
            ? "no"
            : "unknown",
        "External verification"
      ],

      /* Metrics */

      [
        "SCImago SJR",
        has(journal.sjr)
          ? "yes"
          : "unknown",
        "Journal metrics"
      ],

      [
        "SCImago quartile",
        has(journal.quartile)
          ? "yes"
          : "unknown",
        "Journal metrics"
      ],

      [
        "CiteScore",
        has(journal.citeScore)
          ? "yes"
          : "unknown",
        "Journal metrics"
      ],

      [
        "SNIP",
        has(journal.snip)
          ? "yes"
          : "unknown",
        "Journal metrics"
      ],

      [
        "H-index",
        has(journal.hindex)
          ? "yes"
          : "unknown",
        "Journal metrics"
      ],

      /* Transparency */

      [
        "Peer-review policy",
        has(journal.peerReview)
          ? "yes"
          : "unknown",
        "Transparency"
      ],

      [
        "Editorial board",
        has(journal.editorialBoard)
          ? "yes"
          : "unknown",
        "Transparency"
      ],

      [
        "APC / fees",
        has(journal.apc)
          ? "yes"
          : "unknown",
        "Transparency"
      ],

      [
        "License",
        has(journal.license)
          ? "yes"
          : "unknown",
        "Transparency"
      ],

      [
        "Copyright policy",
        has(journal.copyright)
          ? "yes"
          : "unknown",
        "Transparency"
      ],

      [
        "Publication ethics",
        has(journal.ethics)
          ? "yes"
          : "unknown",
        "Transparency"
      ],

      [
        "Retraction/correction policy",
        has(journal.retraction)
          ? "yes"
          : "unknown",
        "Transparency"
      ],

      [
        "Digital preservation",
        has(journal.archiving)
          ? "yes"
          : "unknown",
        "Transparency"
      ],

      [
        "DOI / persistent identifier",
        has(journal.doi)
          ? "yes"
          : "unknown",
        "Transparency"
      ]
    ];
  }

  /* ==========================================================
     OFFICIAL / EXTERNAL LINKS
     ========================================================== */

  function externalLinks(journal, external, query) {

    const title =
      journal.title ||
      query;

    const identifier =
      journal.issn ||
      journal.eissn ||
      "";

    const encoded =
      encodeURIComponent(
        `${title} ${identifier}`
      );

    const google =
      `https://www.google.com/search?q=${encoded}`;

    const googlePredatory =
      `https://www.google.com/search?q=${encodeURIComponent(
        `"${title}" ${identifier} (predatory OR hijacked OR fake OR fraudulent OR scam OR warning)`
      )}`;

    const googleIndexing =
      `https://www.google.com/search?q=${encodeURIComponent(
        `"${title}" ${identifier} (Scopus OR "Web of Science" OR DOAJ OR SCImago)`
      )}`;

    const googleRetraction =
      `https://www.google.com/search?q=${encodeURIComponent(
        `"${title}" ${identifier} (retraction OR "expression of concern" OR correction)`
      )}`;

    const scimago =
      `https://www.scimagojr.com/journalsearch.php?q=${encodeURIComponent(
        digits(identifier)
      )}&tip=issn`;

    const scopus =
      `https://www.scopus.com/sources`;

    const doaj =
      `https://doaj.org/search/journals?q=${encodeURIComponent(
        identifier || title
      )}`;

    const openalex =
      external.openalex?.id ||
      `https://openalex.org/sources?search=${encodeURIComponent(
        title
      )}`;

    const crossref =
      `https://search.crossref.org/?q=${encodeURIComponent(
        identifier || title
      )}`;

    const issn =
      `https://portal.issn.org/resource/ISSN/${encodeURIComponent(
        identifier
      )}`;

    return {

      google,

      googlePredatory,

      googleIndexing,

      googleRetraction,

      scimago,

      scopus,

      doaj,

      openalex,

      crossref,

      issn
    };
  }

  /* ==========================================================
     RENDER HELPERS
     ========================================================== */

  function setStatus(status) {

    if ($("searchStatus")) {
      $("searchStatus").textContent =
        status;
    }
  }

  function showMessage(title, detail) {

    let box =
      $("resultsBox") ||
      $("emptyBox");

    if (!box) {

      box =
        document.createElement("div");

      box.id =
        "journalcheckEmergency";

      document.body.appendChild(box);
    }

    box.classList.remove("hide");

    box.innerHTML = `
      <div class="notice error">
        <strong>${esc(title)}</strong>
        <br>
        ${esc(detail)}
      </div>
    `;
  }

  function renderStatus(value) {

    if (value === "yes") {
      return `
        <span class="status yes">
          ✓ Confirmed
        </span>
      `;
    }

    if (value === "no") {
      return `
        <span class="status no">
          × No
        </span>
      `;
    }

    return `
      <span class="status unknown">
        — Not available
      </span>
    `;
  }

  function renderMetric(label, value) {

    return `
      <div class="metric">
        <small>${esc(label)}</small>
        <strong>${esc(text(value))}</strong>
      </div>
    `;
  }

  /* ==========================================================
     MAIN RESULT RENDERER
     ========================================================== */

  function renderResults(
    journal,
    external,
    matches,
    query
  ) {

    /*
       EVERYTHING BELOW IS SELF-CONTAINED.
       No element is assumed to exist.
    */

    const risk =
      calculateRisk(
        journal,
        external
      );

    const checklist =
      criteria(
        journal,
        external
      );

    const links =
      externalLinks(
        journal,
        external,
        query
      );

    const confirmed =
      checklist.filter(
        item => item[1] === "yes"
      ).length;

    const negative =
      checklist.filter(
        item => item[1] === "no"
      ).length;

    const unknown =
      checklist.filter(
        item => item[1] === "unknown"
      ).length;

    const riskLabel = {

      low: "LOW CONCERN",

      moderate:
        "MODERATE CONCERN",

      high:
        "HIGH CONCERN",

      extreme:
        "EXTREME CONCERN"

    }[risk.band];

    /* Indexing */

    const indexing = [

      ["SCIE", journal.scie],

      ["SSCI", journal.ssci],

      ["AHCI", journal.ahci],

      ["ESCI", journal.esci],

      ["JCR 2025", journal.jcr],

      ["Scopus", journal.scopus],

      [
        "Scopus Active",
        journal.scopusActive
      ]

    ];

    const indexingHTML =
      indexing.map(
        ([name, value]) => `

          <div class="index-card">

            <div class="index-name">
              ${esc(name)}
            </div>

            ${statusBadge(value)}

            ${
              name === "Scopus"
                ? `<small>${esc(
                    text(
                      journal.scopusCoverage
                    )
                  )}</small>`
                : ""
            }

            ${
              name === "Scopus Active"
                ? `<small>${esc(
                    text(
                      journal.scopusType
                    )
                  )}</small>`
                : ""
            }

          </div>

        `
      ).join("");

    /* Metrics */

    const metricsHTML = [

      [
        "SCImago SJR",
        journal.sjr
      ],

      [
        "SCImago Quartile",
        journal.quartile
      ],

      [
        "CiteScore",
        journal.citeScore
      ],

      [
        "SNIP",
        journal.snip
      ],

      [
        "H-index",
        journal.hindex
      ],

      [
        "Subject area",
        journal.subject
      ],

      [
        "OpenAlex works",
        external.openalex?.works
      ],

      [
        "OpenAlex citations",
        external.openalex?.citations
      ],

      [
        "OpenAlex H-index",
        external.openalex?.hIndex
      ]

    ].map(
      ([label, value]) =>
        renderMetric(
          label,
          value
        )
    ).join("");

    /* External */

    const externalHTML = [

      [
        "DOAJ",

        external.doaj?.found === true
          ? "yes"
          : external.doaj?.found === false
            ? "no"
            : "unknown",

        external.doaj?.record?.title ||
          "Official DOAJ verification"
      ],

      [
        "OpenAlex",

        external.openalex?.found === true
          ? "yes"
          : external.openalex?.found === false
            ? "no"
            : "unknown",

        external.openalex?.displayName ||
          "Official OpenAlex verification"
      ],

      [
        "Crossref",

        external.crossref?.found === true
          ? "yes"
          : external.crossref?.found === false
            ? "no"
            : "unknown",

        external.crossref?.title ||
          "Official Crossref verification"
      ]

    ].map(
      ([source, state, evidence]) => `

        <tr>

          <td>
            <strong>
              ${esc(source)}
            </strong>
          </td>

          <td>
            ${renderStatus(state)}
          </td>

          <td>
            ${esc(evidence)}
          </td>

        </tr>

      `
    ).join("");

    /* Criteria */

    const criteriaHTML =
      checklist.map(
        ([name, state, group]) => `

          <div class="criterion">

            <div>

              <strong>
                ${esc(name)}
              </strong>

              <small>
                ${esc(group)}
              </small>

            </div>

            ${renderStatus(state)}

          </div>

        `
      ).join("");

    /* Risk signals */

    let signalsHTML = "";

    if (
      risk.signals.length
    ) {

      signalsHTML =
        risk.signals.map(
          signal => `

            <div class="risk-signal">

              <strong>
                +${signal.points}
                ${esc(signal.title)}
              </strong>

              <p>
                ${esc(signal.detail)}
              </p>

            </div>

          `
        ).join("");

    } else {

      signalsHTML = `

        <div class="notice">

          <strong>
            No major concern signal was triggered.
          </strong>

          <br>

          Missing information is not treated
          as evidence of misconduct.

        </div>

      `;
    }

    /* Transparency */

    const transparency = [

      [
        "Peer-review policy",
        journal.peerReview
      ],

      [
        "Editorial board",
        journal.editorialBoard
      ],

      [
        "APC / fees",
        journal.apc
      ],

      [
        "License",
        journal.license
      ],

      [
        "Copyright",
        journal.copyright
      ],

      [
        "Publication ethics",
        journal.ethics
      ],

      [
        "Retraction / correction",
        journal.retraction
      ],

      [
        "Digital preservation",
        journal.archiving
      ]

    ];

    const transparencyHTML =
      transparency.map(
        ([name, value]) => `

          <tr>

            <td>
              <strong>
                ${esc(name)}
              </strong>
            </td>

            <td>
              ${
                has(value)
                  ? `<span class="status yes">
                       ✓ Recorded
                     </span>`
                  : `<span class="status unknown">
                       — Not available
                     </span>`
              }
            </td>

            <td>
              ${esc(text(value))}
            </td>

          </tr>

        `
      ).join("");

    /* Official site */

    const official =
      journal.website ||
      external.openalex?.homepage ||
      "";

    const officialHTML =
      official
        ? `
          <a
            href="${esc(official)}"
            target="_blank"
            rel="noopener noreferrer"
          >
            Open journal website ↗
          </a>
        `
        : "Not available";

    /* Result HTML */

    const html = `

      <div class="jc-result">

        <!-- RESULT HEADER -->

        <div class="result-top">

          <div>

            <div class="eyebrow">
              BEST MATCH
            </div>

            <h2>
              ${esc(
                text(journal.title)
              )}
            </h2>

            <p class="publisher">
              ${esc(
                text(journal.publisher)
              )}
            </p>

          </div>

          <div class="risk-box ${risk.band}">

            <small>
              CONCERN SCORE
            </small>

            <strong>
              ${risk.score}
              <span>/100</span>
            </strong>

            <div class="risk-label">
              ${riskLabel}
            </div>

          </div>

        </div>

        <!-- IDENTITY -->

        <section class="result-section">

          <h3>
            Journal identity
          </h3>

          <div class="metrics-grid">

            ${renderMetric(
              "ISSN",
              journal.issn
            )}

            ${renderMetric(
              "eISSN",
              journal.eissn
            )}

            ${renderMetric(
              "Publisher",
              journal.publisher
            )}

            ${renderMetric(
              "Country",
              journal.country
            )}

            ${renderMetric(
              "Language",
              journal.language
            )}

            ${renderMetric(
              "DOI / identifier",
              journal.doi
            )}

            <div class="metric">

              <small>
                Official website
              </small>

              <strong>
                ${officialHTML}
              </strong>

            </div>

          </div>

        </section>

        <!-- INDEXING -->

        <section class="result-section">

          <h3>
            Indexing profile
          </h3>

          <div class="index-grid">

            ${indexingHTML}

          </div>

        </section>

        <!-- METRICS -->

        <section class="result-section">

          <h3>
            Journal metrics & quality
          </h3>

          <div class="metrics-grid">

            ${metricsHTML}

          </div>

          <div class="notice">

            <strong>
              Quartile:
            </strong>

            Q1 is the highest quartile,
            followed by Q2, Q3 and Q4
            within the relevant subject category.

            <br><br>

            Values are shown only when supported
            by the local dataset or an external
            verification source.

          </div>

          <div class="external-links">

            <a
              href="${esc(links.scimago)}"
              target="_blank"
              rel="noopener"
            >
              Verify on SCImago ↗
            </a>

            <a
              href="${esc(links.scopus)}"
              target="_blank"
              rel="noopener"
            >
              Verify Scopus Sources ↗
            </a>

          </div>

        </section>

        <!-- EXTERNAL -->

        <section class="result-section">

          <h3>
            Independent confirmations
          </h3>

          <table class="data-table">

            <thead>

              <tr>

                <th>
                  Source
                </th>

                <th>
                  Status
                </th>

                <th>
                  Evidence
                </th>

              </tr>

            </thead>

            <tbody>

              ${externalHTML}

            </tbody>

          </table>

          <div class="external-links">

            <a
              href="${esc(links.doaj)}"
              target="_blank"
              rel="noopener"
            >
              Check DOAJ ↗
            </a>

            <a
              href="${esc(links.openalex)}"
              target="_blank"
              rel="noopener"
            >
              Check OpenAlex ↗
            </a>

            <a
              href="${esc(links.crossref)}"
              target="_blank"
              rel="noopener"
            >
              Check Crossref ↗
            </a>

            <a
              href="${esc(links.issn)}"
              target="_blank"
              rel="noopener"
            >
              Check ISSN Portal ↗
            </a>

          </div>

        </section>

        <!-- GOOGLE -->

        <section class="result-section">

          <h3>
            Web & Google investigation
          </h3>

          <p class="muted">

            These searches are designed to help
            investigate claims and warnings.
            Google results are discovery evidence;
            important claims should be confirmed
            at the original source.

          </p>

          <div class="external-links">

            <a
              href="${esc(links.googleIndexing)}"
              target="_blank"
              rel="noopener"
            >
              Investigate indexing claims ↗
            </a>

            <a
              href="${esc(links.googlePredatory)}"
              target="_blank"
              rel="noopener"
            >
              Investigate predatory / hijacked warnings ↗
            </a>

            <a
              href="${esc(links.googleRetraction)}"
              target="_blank"
              rel="noopener"
            >
              Investigate retractions ↗
            </a>

            <a
              href="${esc(links.google)}"
              target="_blank"
              rel="noopener"
            >
              General Google search ↗
            </a>

          </div>

        </section>

        <!-- RISK -->

        <section class="result-section">

          <h3>
            Concern screening
          </h3>

          <div class="risk-meter">

            <div
              class="risk-fill ${risk.band}"
              style="width:${risk.score}%"
            ></div>

          </div>

          <div class="risk-scale">

            <span>
              Low
            </span>

            <span>
              Moderate
            </span>

            <span>
              High
            </span>

            <span>
              Extreme
            </span>

          </div>

          <div class="risk-explanation">

            ${signalsHTML}

          </div>

        </section>

        <!-- TRANSPARENCY -->

        <section class="result-section">

          <h3>
            Publication transparency
          </h3>

          <table class="data-table">

            <thead>

              <tr>

                <th>
                  Criterion
                </th>

                <th>
                  Status
                </th>

                <th>
                  Recorded information
                </th>

              </tr>

            </thead>

            <tbody>

              ${transparencyHTML}

            </tbody>

          </table>

        </section>

        <!-- COMPLETE CRITERIA -->

        <section class="result-section">

          <h3>
            Complete verification checklist
          </h3>

          <p class="muted">

            This section shows exactly what
            JournalCheck found, what it did not find,
            and what remains unavailable.

          </p>

          <div class="criteria-list">

            ${criteriaHTML}

          </div>

          <div class="summary-strip">

            <strong>
              ${confirmed}
            </strong>
            confirmed

            &nbsp; · &nbsp;

            <strong>
              ${negative}
            </strong>
            explicit negative

            &nbsp; · &nbsp;

            <strong>
              ${unknown}
            </strong>
            unavailable

          </div>

        </section>

        <!-- DECISION -->

        <section class="decision-box">

          <h3>
            Researcher decision summary
          </h3>

          <p>

            JournalCheck is a
            <strong>
              due-diligence and verification aid
            </strong>,
            not an automatic predatory-journal verdict.

          </p>

          <p>

            A low concern score does not certify
            journal quality, while a high score does
            not by itself prove misconduct.

            Critical submission requirements should
            always be confirmed against the relevant
            official indexing or journal source.

          </p>

        </section>

      </div>

    `;

    /* ========================================================
       SAFE RESULT TARGET
       ======================================================== */

    let resultTarget =
      $("resultsBox");

    if (!resultTarget) {

      /*
         Older/newer index.html versions may not have
         resultsBox. Create one automatically.
      */

      resultTarget =
        document.createElement("div");

      resultTarget.id =
        "resultsBox";

      resultTarget.className =
        "results-box";

      document.body.appendChild(
        resultTarget
      );
    }

    resultTarget.innerHTML =
      html;

    resultTarget.classList.remove(
      "hide"
    );

    if ($("emptyBox")) {
      $("emptyBox").classList.add(
        "hide"
      );
    }

    if ($("resultHead")) {
      $("resultHead").classList.remove(
        "hide"
      );
    }

    if ($("resultTitle")) {
      $("resultTitle").textContent =
        `${matches.length} result${
          matches.length === 1
            ? ""
            : "s"
        } for “${query}”`;
    }

    if ($("matchSummary")) {

      $("matchSummary").textContent =
        matches.length === 1
          ? "Best match selected from the JournalCheck master database."
          : `${matches.length} close matches found. The strongest match is shown first.`;
    }

    setStatus(
      "Complete"
    );

    /*
       Scroll after rendering.
       This is the requested automatic result redirect.
    */

    setTimeout(
      () => {

        const target =
          document.getElementById(
            "resultsBox"
          ) ||
          document.getElementById(
            "results"
          );

        if (target) {

          target.scrollIntoView({
            behavior: "smooth",
            block: "start"
          });

        }

      },
      100
    );
  }

  /* ==========================================================
     SEARCH
     ========================================================== */

  async function runSearch(
    query,
    autoScroll = true
  ) {

    const q =
      String(query || "").trim();

    if (!q) {

      if ($("journalInput")) {
        $("journalInput").focus();
      }

      return;
    }

    /*
       NEVER leave "Searching…" indefinitely.
    */

    setStatus(
      "Searching local database…"
    );

    try {

      /*
         Database must be ready first.
      */

      const loaded =
        await loadDatabase();

      if (!loaded) {

        setStatus(
          "Database error"
        );

        return;
      }

      /*
         LOCAL SEARCH — always first.
      */

      const matches =
        findMatches(q);

      if (!matches.length) {

        if ($("resultHead")) {
          $("resultHead")
            .classList
            .remove("hide");
        }

        if ($("resultsBox")) {
          $("resultsBox")
            .classList
            .add("hide");
        }

        if ($("emptyBox")) {

          $("emptyBox")
            .classList
            .remove("hide");

          $("emptyBox").innerHTML = `

            <div class="empty">

              <strong>
                No strong match found.
              </strong>

              <br><br>

              Try:

              <ul>

                <li>
                  the complete journal title
                </li>

                <li>
                  print ISSN
                </li>

                <li>
                  eISSN
                </li>

                <li>
                  publisher name
                </li>

              </ul>

            </div>

          `;
        }

        if ($("resultTitle")) {
          $("resultTitle").textContent =
            "No strong match found";
        }

        if ($("matchSummary")) {
          $("matchSummary").textContent =
            `No record matched “${q}”.`;
        }

        setStatus(
          "No match"
        );

        return;
      }

      /*
         IMPORTANT:
         Render immediately.
         The user gets a result even if every
         external API is offline.
      */

      currentRecord =
        normalizeRecord(
          matches[0]
        );

      const emptyExternal = {

        openalex: null,

        crossref: null,

        doaj: null,

        retractions: null
      };

      renderResults(
        currentRecord,
        emptyExternal,
        matches,
        q
      );

      setStatus(
        "Local result ready"
      );

      /*
         URL update immediately.
      */

      try {

        const url =
          new URL(
            window.location.href
          );

        url.searchParams.set(
          "q",
          q
        );

        history.replaceState(
          {},
          "",
          url
        );

      } catch {}

      saveRecent(q);

      /*
         EXTERNAL ENRICHMENT.
         Never allowed to replace the local result
         with an error.
      */

      setStatus(
        "Checking external sources…"
      );

      try {

        const external =
          await externalChecks(
            currentRecord
          );

        renderResults(
          currentRecord,
          external,
          matches,
          q
        );

        setStatus(
          "Complete"
        );

      } catch (error) {

        console.warn(
          "External enrichment failed:",
          error
        );

        /*
           Local result remains visible.
        */

        setStatus(
          "Complete — local database"
        );
      }

      if (autoScroll) {

        setTimeout(
          () => {

            const target =
              $("resultsBox");

            if (target) {

              target.scrollIntoView({
                behavior: "smooth",
                block: "start"
              });

            }

          },
          150
        );
      }

    } catch (error) {

      console.error(
        "JournalCheck search error:",
        error
      );

      setStatus(
        "Search error"
      );

      showMessage(
        "Search could not be completed.",
        error.message
      );
    }
  }

  /* ==========================================================
     RECENT SEARCHES
     ========================================================== */

  function saveRecent(query) {

    try {

      const existing =
        JSON.parse(
          localStorage.getItem(
            "journalcheck_recent"
          ) || "[]"
        );

      const updated =
        [
          query,
          ...existing.filter(
            item =>
              item !== query
          )
        ].slice(0, 8);

      localStorage.setItem(
        "journalcheck_recent",
        JSON.stringify(updated)
      );

      renderRecent();

    } catch {}
  }

  function renderRecent() {

    const container =
      $("recent");

    if (!container) {
      return;
    }

    try {

      const items =
        JSON.parse(
          localStorage.getItem(
            "journalcheck_recent"
          ) || "[]"
        );

      if (!items.length) {

        container.innerHTML =
          "";

        return;
      }

      container.innerHTML = `

        <span class="recent-label">
          Recent
        </span>

        ${items.map(
          item => `

            <button
              type="button"
              data-query="${esc(item)}"
            >
              ${esc(item)}
            </button>

          `
        ).join("")}

      `;

      container
        .querySelectorAll(
          "button"
        )
        .forEach(button => {

          button.addEventListener(
            "click",
            () => {

              const q =
                button.dataset.query ||
                "";

              if ($("journalInput")) {

                $("journalInput").value =
                  q;

              }

              runSearch(q);

            }
          );

        });

    } catch {}
  }

  /* ==========================================================
     CLEAR
     ========================================================== */

  function clearSearch() {

    try {

      const url =
        new URL(
          window.location.href
        );

      url.searchParams.delete(
        "q"
      );

      history.replaceState(
        {},
        "",
        url
      );

    } catch {}

    if ($("journalInput")) {
      $("journalInput").value =
        "";
    }

    if ($("resultHead")) {
      $("resultHead")
        .classList
        .add("hide");
    }

    if ($("resultsBox")) {
      $("resultsBox")
        .classList
        .add("hide");
    }

    if ($("emptyBox")) {

      $("emptyBox")
        .classList
        .remove("hide");

      $("emptyBox").innerHTML = `

        <div class="empty">

          Search for a journal title,
          ISSN or eISSN to begin.

        </div>

      `;
    }

    setStatus(
      "Ready"
    );
  }

  /* ==========================================================
     THEME
     ========================================================== */

  function setupTheme() {

    const saved =
      localStorage.getItem(
        "journalcheck_theme"
      );

    if (saved === "dark") {

      document.body.classList.add(
        "dark"
      );
    }

    $("themeBtn")?.addEventListener(
      "click",
      () => {

        document.body.classList.toggle(
          "dark"
        );

        localStorage.setItem(
          "journalcheck_theme",
          document.body.classList.contains(
            "dark"
          )
            ? "dark"
            : "light"
        );
      }
    );
  }

  /* ==========================================================
     INITIALIZATION
     ========================================================== */

  document.addEventListener(
    "DOMContentLoaded",
    async () => {

      /*
         SEARCH FORM
      */

      const form =
        $("searchForm");

      if (form) {

        form.addEventListener(
          "submit",
          event => {

            event.preventDefault();

            const input =
              $("journalInput");

            runSearch(
              input?.value || ""
            );

          }
        );

      } else {

        /*
           Fallback for HTML versions that
           don't have a form.
        */

        const button =
          document.querySelector(
            "#checkJournalBtn, .check-journal, [data-search]"
          );

        button?.addEventListener(
          "click",
          event => {

            event.preventDefault();

            runSearch(
              $("journalInput")?.value ||
              ""
            );

          }
        );
      }

      /*
         CLEAR
      */

      $("clearBtn")?.addEventListener(
        "click",
        clearSearch
      );

      /*
         PRINT
      */

      $("printBtn")?.addEventListener(
        "click",
        () => window.print()
      );

      /*
         THEME
      */

      setupTheme();

      /*
         RECENT
      */

      renderRecent();

      /*
         DATABASE
      */

      const loaded =
        await loadDatabase();

      /*
         URL QUERY
      */

      const query =
        new URL(
          window.location.href
        )
          .searchParams
          .get("q");

      if (
        loaded &&
        query
      ) {

        if ($("journalInput")) {

          $("journalInput").value =
            query;
        }

        await runSearch(
          query,
          true
        );
      }

    }
  );

})();
