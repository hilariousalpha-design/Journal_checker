/* JournalCheck live evidence layer v9
   Each provider is checked independently. A network/CORS/API failure is
   reported as UNAVAILABLE, never as NOT FOUND.
*/
(() => {
  "use strict";
  const TIMEOUT = 12000;
  const clean = v => String(v ?? "").trim();
  const normIssn = v => clean(v).replace(/[^0-9xX]/g, "").toUpperCase();
  const normTitle = v => clean(v).toLowerCase().normalize("NFKD")
    .replace(/[^\p{L}\p{N}]+/gu, " ").replace(/\s+/g, " ").trim();
  const similarity = (a,b) => {
    const A=new Set(normTitle(a).split(" ").filter(Boolean));
    const B=new Set(normTitle(b).split(" ").filter(Boolean));
    if(!A.size||!B.size)return 0;
    let n=0; A.forEach(x=>B.has(x)&&n++); return n/Math.max(A.size,B.size);
  };
  const ids = j => [j?.issn,j?.eissn].flatMap(v=>String(v??"").split(/[,;\s]+/).map(normIssn)).filter(x=>x.length===8);
  async function getJSON(url, timeout=TIMEOUT){
    const c=new AbortController(), t=setTimeout(()=>c.abort(),timeout);
    try{
      const r=await fetch(url,{method:"GET",mode:"cors",credentials:"omit",signal:c.signal,headers:{Accept:"application/json"},cache:"no-store"});
      if(!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.json();
    } finally { clearTimeout(t); }
  }
  const unavailable=(source,url,error)=>({found:null,status:"unavailable",source,url,error:String(error?.message||error||"Network/CORS/API unavailable")});
  const notFound=(source,url)=>({found:false,status:"not_found",source,url});
  const confirmed=(source,url,extra={})=>({found:true,status:"confirmed",source,url,...extra});

  async function crossref(j){
    let lastError=null;
    for(const issn of ids(j)){
      // The works filter is an independent Crossref confirmation and is more
      // reliable than assuming /journals/{issn} exists for every serial.
      const workUrl=`https://api.crossref.org/works?filter=issn:${encodeURIComponent(issn)}&rows=0`;
      try{
        const d=await getJSON(workUrl), msg=d?.message;
        const count=Number(msg?.totalResults ?? msg?."total-results" ?? 0);
        if(count>0){
          let meta=null;
          try{ meta=(await getJSON(`https://api.crossref.org/journals/${encodeURIComponent(issn)}`))?.message||null; }catch(_){ }
          return confirmed("Crossref",meta?`https://api.crossref.org/journals/${encodeURIComponent(issn)}`:workUrl,{
            title:meta?.title||j.title||null,publisher:meta?.publisher||null,issn:meta?.ISSN||[issn],works:count,
            sourceMatch:"ISSN"
          });
        }
      }catch(e){lastError=e;}
    }
    // Crossref title search as a second route.
    if(j?.title){
      const url=`https://api.crossref.org/journals?query=${encodeURIComponent(j.title)}&rows=10`;
      try{
        const items=(await getJSON(url))?.message?.items||[];
        const best=items.map(x=>({x,score:similarity(j.title,x.title?.[0]||"")})).sort((a,b)=>b.score-a.score)[0];
        if(best?.score>=.70){const x=best.x;return confirmed("Crossref",x.resource?.primary?.URL||url,{title:x.title?.[0]||j.title,publisher:x.publisher||null,issn:x.ISSN||[],works:x.counts?.total-dois??null,matchScore:best.score,sourceMatch:"title"});}
        return notFound("Crossref",url);
      }catch(e){lastError=e;}
    }
    return unavailable("Crossref","https://search.crossref.org/",lastError);
  }

  function oaNormalize(s){return confirmed("OpenAlex",s.id||"https://openalex.org/",{
    id:s.id,title:s.display_name||null,publisher:s.host_organization_name||null,
    issns:[s.issn_l,...(s.issn||[])].filter(Boolean),works:s.works_count??null,citations:s.cited_by_count??null,
    hIndex:s.summary_stats?.h_index??null,i10Index:s.summary_stats?.i10_index??null,
    twoYearMeanCitedness:s.summary_stats?.["2yr_mean_citedness"]??null,isOA:s.is_oa??null,
    isDOAJ:s.is_in_doaj??null,country:s.country_code??null,homepage:s.homepage_url??null,apcUSD:s.apc_usd??null
  });}
  async function openAlex(j){
    let lastError=null;
    for(const issn of ids(j)){
      const url=`https://api.openalex.org/sources/issn:${encodeURIComponent(issn)}`;
      try{const d=await getJSON(url);if(d?.id)return oaNormalize(d);}catch(e){lastError=e;}
    }
    if(j?.title){
      const url=`https://api.openalex.org/sources?search=${encodeURIComponent(j.title)}&per-page=10`;
      try{
        const rs=(await getJSON(url))?.results||[];
        const best=rs.map(s=>({s,score:similarity(j.title,s.display_name)})).sort((a,b)=>b.score-a.score)[0];
        if(best?.score>=.70)return oaNormalize(best.s);
        return notFound("OpenAlex",url);
      }catch(e){lastError=e;}
    }
    return unavailable("OpenAlex","https://openalex.org/sources",lastError);
  }

  async function doaj(j){
    let lastError=null;
    // Check BOTH print and online ISSNs. Do not stop after the first zero result.
    for(const issn of ids(j)){
      const url=`https://doaj.org/api/search/journals/issn:${encodeURIComponent(issn)}`;
      try{
        const d=await getJSON(url), total=Number(d?.total||0);
        if(total>0){return confirmed("DOAJ",`https://doaj.org/toc/${encodeURIComponent(issn)}`,{total,record:d?.results?.[0]?.bibjson||null,sourceMatch:"ISSN"});}
      }catch(e){lastError=e;}
    }
    if(j?.title){
      const url=`https://doaj.org/api/search/journals/bibjson.title:${encodeURIComponent(j.title)}?page=1&pageSize=10`;
      try{
        const d=await getJSON(url),items=d?.results||[];
        const best=items.map(x=>({x,score:similarity(j.title,x?.bibjson?.title||"")})).sort((a,b)=>b.score-a.score)[0];
        if(best?.score>=.85){const bi=best.x.bibjson||{};const iss=normIssn(bi.pissn||bi.eissn||"");return confirmed("DOAJ",iss?`https://doaj.org/toc/${iss}`:"https://doaj.org/",{total:Number(d?.total||1),record:bi,matchScore:best.score,sourceMatch:"title"});}
        return notFound("DOAJ",`https://doaj.org/search/journals/${encodeURIComponent(j.title)}`);
      }catch(e){lastError=e;}
    }
    return unavailable("DOAJ","https://doaj.org/search/journals",lastError);
  }

  const googleScholar=j=>({source:"Google Scholar",automated:false,status:"manual",url:`https://scholar.google.com/scholar?q=${encodeURIComponent(`"${j?.title||""}" ${j?.issn||j?.eissn||""}`.trim())}`});
  const googleRiskSearch=j=>({source:"Google web search",automated:false,status:"manual",url:`https://www.google.com/search?q=${encodeURIComponent(`"${j?.title||""}" journal predatory OR scam OR hijacked OR fake`)}`});

  async function checkJournal(j){
    const [cr,oa,dj]=await Promise.all([
      crossref(j).catch(e=>unavailable("Crossref","https://search.crossref.org/",e)),
      openAlex(j).catch(e=>unavailable("OpenAlex","https://openalex.org/sources",e)),
      doaj(j).catch(e=>unavailable("DOAJ","https://doaj.org/search/journals",e))
    ]);
    return {found:true,result:{...j,crossref:cr,openalex:oa,doaj:dj,googleScholar:googleScholar(j),googleRiskSearch:googleRiskSearch(j)}};
  }
  window.JournalCheckSources={checkJournal};
})();
