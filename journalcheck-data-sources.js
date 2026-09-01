/* JournalCheck external evidence layer
   Static-hosting safe: does NOT reload the 50,608-record master database or
   a second SJR CSV during every search. The main app loads local JSON once,
   then passes the matched journal here for external confirmation.

   Sources:
   - Crossref REST API: journal metadata / works count
   - OpenAlex Sources API: source identity, works, citations, H-index
   - DOAJ API: open-access directory confirmation when browser access allows
   - Google Scholar: official search link only; no scraping / fabricated metrics

   Missing data is not a predatory-journal verdict.
*/
(() => {
  "use strict";

  const TIMEOUT = 7000;
  const clean = v => String(v ?? "").trim();
  const normIssn = v => clean(v).replace(/[^0-9xX]/g, "").toUpperCase();
  const normTitle = v => clean(v).toLowerCase().normalize("NFKD")
    .replace(/[^\p{L}\p{N}]+/gu, " ").replace(/\s+/g, " ").trim();
  const tokenSimilarity = (a,b) => {
    const A = new Set(normTitle(a).split(" ").filter(Boolean));
    const B = new Set(normTitle(b).split(" ").filter(Boolean));
    if (!A.size || !B.size) return 0;
    let same = 0; A.forEach(x => { if (B.has(x)) same++; });
    return same / Math.max(A.size, B.size);
  };

  async function getJSON(url, timeout = TIMEOUT) {
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
    } finally { clearTimeout(timer); }
  }

  function ids(j) {
    return [j?.issn, j?.eissn]
      .flatMap(v => String(v ?? "").split(/[,\s;]+/))
      .map(normIssn).filter(x => x.length >= 7);
  }

  async function crossref(j) {
    const list = ids(j);
    for (const issn of list) {
      try {
        const d = await getJSON(`https://api.crossref.org/journals/${encodeURIComponent(issn)}`);
        const m = d?.message;
        if (m) return {
          found: true,
          title: m.title || null,
          publisher: m.publisher || null,
          issn: m.ISSN || [],
          works: m.counts?.total-dois ?? null,
          worksLastYear: m.counts?.total-dois-current-year ?? null,
          url: `https://api.crossref.org/journals/${encodeURIComponent(issn)}`,
          source: "Crossref"
        };
      } catch (_) {}
    }
    if (j?.title) {
      try {
        const d = await getJSON(`https://api.crossref.org/journals?query=${encodeURIComponent(j.title)}&rows=5`);
        const candidates = d?.message?.items || [];
        const best = candidates
          .map(x => ({x, score: tokenSimilarity(j.title, x.title?.[0] || "")}))
          .sort((a,b) => b.score-a.score)[0];
        if (best && best.score >= .55) {
          const x = best.x;
          return { found:true, title:x.title?.[0]||null, publisher:x.publisher||null,
            issn:x.ISSN||[], works:x.counts?.total-dois??null,
            url:x.resource?.primary?.URL || "https://search.crossref.org/", source:"Crossref" };
        }
      } catch (_) {}
    }
    return { found:false, source:"Crossref" };
  }

  function normalizeOpenAlex(s) {
    return {
      found:true, id:s.id, title:s.display_name||null,
      publisher:s.host_organization_name||s.publisher||null,
      issns:[s.issn_l, ...(s.issn||[])].filter(Boolean),
      works:s.works_count??null, citations:s.cited_by_count??null,
      hIndex:s.summary_stats?.h_index??null,
      i10Index:s.summary_stats?.i10_index??null,
      twoYearMeanCitedness:s.summary_stats?.["2yr_mean_citedness"]??null,
      isOA:s.is_oa??null, isDOAJ:s.is_in_doaj??null,
      country:s.country_code??null, homepage:s.homepage_url??null,
      apcUSD:s.apc_usd??null, source:"OpenAlex", url:s.id||"https://openalex.org/"
    };
  }

  async function openAlex(j) {
    for (const issn of ids(j)) {
      try {
        const d = await getJSON(`https://api.openalex.org/sources/issn:${encodeURIComponent(issn)}`);
        if (d?.id) return normalizeOpenAlex(d);
      } catch (_) {}
      try {
        const d = await getJSON(`https://api.openalex.org/sources?filter=issn:${encodeURIComponent(issn)}&per-page=5`);
        if (d?.results?.[0]?.id) return normalizeOpenAlex(d.results[0]);
      } catch (_) {}
    }
    if (j?.title) {
      try {
        const d = await getJSON(`https://api.openalex.org/sources?search=${encodeURIComponent(j.title)}&per-page=10`);
        const best = (d?.results||[]).map(s=>({s,score:tokenSimilarity(j.title,s.display_name)}))
          .sort((a,b)=>b.score-a.score)[0];
        if (best && best.score >= .70) return normalizeOpenAlex(best.s);
      } catch (_) {}
    }
    return { found:false, source:"OpenAlex" };
  }

  async function doaj(j) {
    for (const issn of ids(j)) {
      const urls = [
        `https://doaj.org/api/search/journals/issn:${encodeURIComponent(issn)}?page=1&pageSize=1`,
        `https://doaj.org/api/search/journal.issn:${encodeURIComponent(issn)}?page=1&pageSize=1`
      ];
      for (const url of urls) {
        try {
          const d = await getJSON(url);
          const total = Number(d?.total ?? d?.meta?.count ?? 0);
          return { found:total>0, total, record:d?.results?.[0]?.bibjson||d?.results?.[0]||null,
            source:"DOAJ", url:`https://doaj.org/toc/${encodeURIComponent(issn)}` };
        } catch (_) {}
      }
    }
    return { found:null, source:"DOAJ", url:j?.issn ? `https://doaj.org/search/journals?ref=issn%3A${encodeURIComponent(normIssn(j.issn))}` : "https://doaj.org/" };
  }

  function googleScholar(j) {
    const q = `"${j?.title||""}" ${j?.issn||j?.eissn||""}`.trim();
    return { source:"Google Scholar", automated:false,
      url:`https://scholar.google.com/scholar?q=${encodeURIComponent(q)}` };
  }

  function concernProfile(result) {
    const signals=[];
    if (result.crossref?.found && result.title && result.crossref.title && tokenSimilarity(result.title,result.crossref.title)<.55)
      signals.push({points:30,level:"high",label:"Crossref identity mismatch",detail:"The Crossref title differs substantially from the matched master record."});
    if (result.openalex?.found) {
      const expected=ids(result), actual=(result.openalex.issns||[]).map(normIssn);
      if(expected.length && actual.length && !expected.some(x=>actual.includes(x)))
        signals.push({points:30,level:"high",label:"OpenAlex identifier mismatch",detail:"OpenAlex returned a source whose ISSN identifiers do not align with the matched journal."});
    }
    return {score:Math.min(100,signals.reduce((a,x)=>a+x.points,0)),signals};
  }
  const concernBand = score => score>=75?"Extreme concern":score>=50?"High concern":score>=25?"Moderate concern":"Low concern";

  async function checkJournal(j) {
    if (!j || typeof j !== "object") return {found:false};
    const [cr,oa,dj] = await Promise.all([
      crossref(j).catch(e=>({found:false,error:e.message,source:"Crossref"})),
      openAlex(j).catch(e=>({found:false,error:e.message,source:"OpenAlex"})),
      doaj(j).catch(e=>({found:null,error:e.message,source:"DOAJ"}))
    ]);
    const result={...j,crossref:cr,openalex:oa,doaj:dj,googleScholar:googleScholar(j)};
    const risk=concernProfile(result);
    return {found:true,result,risk:{...risk,band:concernBand(risk.score)}};
  }

  window.JournalCheckSources={checkJournal};
})();
