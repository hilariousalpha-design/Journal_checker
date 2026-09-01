/* JournalCheck live evidence layer
   Static GitHub Pages compatible. The master journal database and SJR dataset
   remain local; this file only enriches the already-matched journal.

   Live sources:
   - Crossref REST API: journal identity, publisher, DOI counts
   - OpenAlex Sources API: identity, works, citations, H-index, OA and DOAJ flag
   - DOAJ API v4 search: OA directory confirmation
   - Google Scholar: official manual search link only (no scraping)

   IMPORTANT: a browser/API/network failure is reported as "Unavailable";
   it is never converted into "Not found". Missing evidence is not a
   predatory-journal verdict.
*/
(() => {
  "use strict";
  const TIMEOUT = 9000;
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
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  async function getJSON(url, timeout = TIMEOUT) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), timeout);
    try {
      const r = await fetch(url, {
        method: "GET",
        mode: "cors",
        credentials: "omit",
        signal: ctl.signal,
        headers: { Accept: "application/json" },
        cache: "no-store"
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.json();
    } finally { clearTimeout(timer); }
  }

  function unavailable(source, url, error) {
    return { found:null, status:"unavailable", source, url, error:String(error?.message || error || "Network/API unavailable") };
  }
  function notFound(source, url) { return { found:false, status:"not_found", source, url }; }
  function confirmed(source, url, extra={}) { return { found:true, status:"confirmed", source, url, ...extra }; }

  function ids(j) {
    return [j?.issn, j?.eissn]
      .flatMap(v => String(v ?? "").split(/[,:\s;]+/))
      .map(normIssn).filter(x => x.length === 8);
  }

  async function crossref(j) {
    const list = ids(j);
    let lastError = null;
    for (const issn of list) {
      const url = `https://api.crossref.org/journals/${encodeURIComponent(issn)}`;
      try {
        const m = (await getJSON(url))?.message;
        if (m) return confirmed("Crossref", url, {
          title:m.title || null, publisher:m.publisher || null,
          issn:m.ISSN || [], works:m.counts?.total-dois ?? null,
          worksLastYear:m.counts?.['total-dois-current-year'] ?? null
        });
      } catch(e) { lastError=e; }
    }
    if (j?.title) {
      const url = `https://api.crossref.org/journals?query=${encodeURIComponent(j.title)}&rows=5`;
      try {
        const items = (await getJSON(url))?.message?.items || [];
        const best = items.map(x => ({x,score:tokenSimilarity(j.title,x.title?.[0]||"")}))
          .sort((a,b)=>b.score-a.score)[0];
        if (best && best.score >= .70) {
          const x=best.x;
          return confirmed("Crossref", x.resource?.primary?.URL || url, {
            title:x.title?.[0]||null,publisher:x.publisher||null,issn:x.ISSN||[],
            works:x.counts?.total-dois??null,matchScore:best.score
          });
        }
        return notFound("Crossref", url);
      } catch(e) { lastError=e; }
    }
    return unavailable("Crossref", "https://search.crossref.org/", lastError);
  }

  function normalizeOpenAlex(s) {
    return confirmed("OpenAlex", s.id || "https://openalex.org/", {
      id:s.id, title:s.display_name||null,
      publisher:s.host_organization_name||s.publisher||null,
      issns:[s.issn_l, ...(s.issn||[])].filter(Boolean),
      works:s.works_count??null, citations:s.cited_by_count??null,
      hIndex:s.summary_stats?.h_index??null,
      i10Index:s.summary_stats?.i10_index??null,
      twoYearMeanCitedness:s.summary_stats?.['2yr_mean_citedness']??null,
      isOA:s.is_oa??null, isDOAJ:s.is_in_doaj??null,
      country:s.country_code??null, homepage:s.homepage_url??null,
      apcUSD:s.apc_usd??null
    });
  }

  async function openAlex(j) {
    let lastError=null;
    for (const issn of ids(j)) {
      const direct=`https://api.openalex.org/sources/issn:${encodeURIComponent(issn)}`;
      try { const d=await getJSON(direct); if(d?.id) return normalizeOpenAlex(d); }
      catch(e){lastError=e;}
    }
    if(j?.title){
      const url=`https://api.openalex.org/sources?search=${encodeURIComponent(j.title)}&per-page=10`;
      try{
        const results=(await getJSON(url))?.results||[];
        const best=results.map(s=>({s,score:tokenSimilarity(j.title,s.display_name)})).sort((a,b)=>b.score-a.score)[0];
        if(best && best.score>=.70) return normalizeOpenAlex(best.s);
        return notFound("OpenAlex", url);
      }catch(e){lastError=e;}
    }
    return unavailable("OpenAlex","https://openalex.org/sources",lastError);
  }

  async function doaj(j) {
    let lastError=null;
    for(const issn of ids(j)){
      // DOAJ documents this exact ISSN query form.
      const url=`https://doaj.org/api/search/journals/issn%3A${encodeURIComponent(issn)}`;
      try{
        const d=await getJSON(url);
        const total=Number(d?.total ?? 0);
        if(total>0) return confirmed("DOAJ",`https://doaj.org/toc/${encodeURIComponent(issn)}`,{
          total,record:d?.results?.[0]?.bibjson||null
        });
        return notFound("DOAJ",`https://doaj.org/search/journals/issn%3A${encodeURIComponent(issn)}`);
      }catch(e){lastError=e;}
    }
    if(j?.title){
      const q=`title:${j.title}`;
      const url=`https://doaj.org/api/search/journals/${encodeURIComponent(q)}?page=1&pageSize=10`;
      try{
        const d=await getJSON(url), items=d?.results||[];
        const best=items.map(x=>({x,score:tokenSimilarity(j.title,x?.bibjson?.title||"")})).sort((a,b)=>b.score-a.score)[0];
        if(best && best.score>=.85) return confirmed("DOAJ",`https://doaj.org/toc/${encodeURIComponent(normIssn(best.x?.bibjson?.pissn||best.x?.bibjson?.eissn||""))}`,{total:Number(d?.total||1),record:best.x?.bibjson||null,matchScore:best.score});
        return notFound("DOAJ",`https://doaj.org/search/journals/${encodeURIComponent(j.title)}`);
      }catch(e){lastError=e;}
    }
    return unavailable("DOAJ","https://doaj.org/search/journals",lastError);
  }

  function googleScholar(j){
    const q=`"${j?.title||""}" ${j?.issn||j?.eissn||""}`.trim();
    return {source:"Google Scholar",automated:false,status:"manual",url:`https://scholar.google.com/scholar?q=${encodeURIComponent(q)}`};
  }
  function googleRiskSearch(j){
    const q=`"${j?.title||""}" journal predatory OR scam OR hijacked`;
    return {source:"Google web search",automated:false,status:"manual",url:`https://www.google.com/search?q=${encodeURIComponent(q)}`};
  }

  function concernProfile(result){
    const signals=[];
    if(result.crossref?.found && result.title && result.crossref.title && tokenSimilarity(result.title,result.crossref.title)<.55)
      signals.push({points:30,level:"high",label:"Crossref identity mismatch",detail:"The Crossref title differs substantially from the matched master record."});
    if(result.openalex?.found){
      const expected=ids(result),actual=(result.openalex.issns||[]).map(normIssn);
      if(expected.length&&actual.length&&!expected.some(x=>actual.includes(x)))
        signals.push({points:30,level:"high",label:"OpenAlex identifier mismatch",detail:"OpenAlex returned a source whose ISSN identifiers do not align with the matched journal."});
    }
    if(result.doaj?.found===false && result.openalex?.isDOAJ===true)
      signals.push({points:15,level:"moderate",label:"DOAJ evidence conflict",detail:"OpenAlex flags the source as in DOAJ, while the direct DOAJ query did not confirm it. Verify both records."});
    return {score:Math.min(100,signals.reduce((a,x)=>a+x.points,0)),signals};
  }
  const concernBand=score=>score>=75?"Extreme concern":score>=50?"High concern":score>=25?"Moderate concern":"Low concern";

  async function checkJournal(j){
    if(!j||typeof j!=="object")return{found:false};
    // Run independently so one provider can fail without cancelling the others.
    const [cr,oa,dj]=await Promise.all([
      crossref(j).catch(e=>unavailable("Crossref","https://search.crossref.org/",e)),
      openAlex(j).catch(e=>unavailable("OpenAlex","https://openalex.org/sources",e)),
      doaj(j).catch(e=>unavailable("DOAJ","https://doaj.org/search/journals",e))
    ]);
    const result={...j,crossref:cr,openalex:oa,doaj:dj,googleScholar:googleScholar(j),googleRiskSearch:googleRiskSearch(j)};
    const risk=concernProfile(result);
    return {found:true,result,risk:{...risk,band:concernBand(risk.score)}};
  }
  window.JournalCheckSources={checkJournal};
})();
