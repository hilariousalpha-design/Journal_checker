/* JournalCheck v3
   Static GitHub Pages build.
   - Keeps the existing journals.json compatible with compact keys such as t/i/e/p.
   - Reads optional enrichment fields when present.
   - Uses OpenAlex + Crossref as external metadata confirmations.
   - DOAJ is attempted as a public lookup but failure is shown as Unknown, never No.
   - Scopus/SJR/JCR data must come from the local verified dataset; the app never invents it.
*/

(() => {
  "use strict";

  const $ = (s) => document.querySelector(s);
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const norm = (v) => String(v ?? "").trim();
  const digits = (v) => norm(v).replace(/[^0-9Xx]/g, "").toUpperCase();
  const cleanTitle = (v) => norm(v).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").replace(/\s+/g," ").trim();
  const compactTitle = (v) => cleanTitle(v).replace(/\b(the|journal|of|and|in|for|a|an)\b/g," ").replace(/\s+/g," ").trim();

  let DB = {version:"—", record_count:0, records:[]};
  let current = null;

  const FIELD = {
    title: ["t","title","journal","journal_title","name"],
    issn: ["i","issn","pissn","print_issn"],
    eissn: ["e","eissn","online_issn","electronic_issn"],
    publisher: ["p","publisher","publisher_name"],
    country: ["c","country","publisher_country"],
    language: ["l","language","lang"],
    scie: ["scie","SCIE"],
    ssci: ["ssci","SSCI"],
    ahci: ["ahci","AHCI"],
    esci: ["esci","ESCI"],
    jcr: ["jcr","jcr_2025","JCR 2025"],
    scopus: ["scopus","Scopus","sco"],
    scopusActive: ["scopus_active","scopusActive","scopus_active_status","sa"],
    scopusId: ["scopus_id","source_id","scopus_source_id"],
    scopusCoverage: ["scopus_coverage","coverage_years","scopus_coverage_years","cov"],
    scopusType: ["scopus_source_type","source_type","st"],
    scopusOA: ["scopus_oa","oa","scopusOA"],
    citescore: ["citescore","cite_score","CiteScore","cs","citescore_2025"],
    snip: ["snip","SNIP"],
    sjr: ["sjr","SJR","scimago_sjr","sjr_2024","sjr_2025"],
    quartile: ["quartile","best_quartile","sjr_quartile","scimago_quartile","q","sjr_q","scimago_q"],
    hindex: ["h_index","hindex","H_index"],
    subject: ["subject","subject_area","scimago_subject","scopus_subject","asjc","scopus_asjc"],
    doaj: ["doaj","DOAJ","doaj_indexed"],
    openalex: ["openalex","OpenAlex","openalex_id"],
    crossref: ["crossref","Crossref"],
    cope: ["cope","COPE"],
    peerReview: ["peer_review","peer_review_policy","peer_review_type"],
    editorialBoard: ["editorial_board","editors","editorial_board_info"],
    apc: ["apc","apc_info","article_processing_charge","fees"],
    license: ["license","licence","license_policy"],
    copyright: ["copyright","copyright_policy"],
    ethics: ["ethics","publication_ethics","ethics_policy"],
    retraction: ["retraction","correction_policy","retractions"],
    archiving: ["archiving","preservation","digital_archiving"],
    doi: ["doi","doi_prefix","persistent_identifier"],
    website: ["website","url","journal_url","homepage","homepage_url"],
    official: ["official_site","official_website"],
    warning: ["warning","risk_warning","risk_flags","risk_signals"]
  };

  function val(r, key) {
    const keys = FIELD[key] || [key];
    for (const k of keys) if (r && r[k] !== undefined && r[k] !== null && norm(r[k]) !== "") return r[k];
    return null;
  }

  function boolState(v) {
    if (v === null || v === undefined || v === "") return "unknown";
    if (typeof v === "boolean") return v ? "yes" : "no";
    const s = norm(v).toLowerCase();
    if (["yes","y","true","1","active","indexed","included","verified"].includes(s)) return "yes";
    if (["no","n","false","0","inactive","not indexed","not included","discontinued","stopped"].includes(s)) return "no";
    return "unknown";
  }

  function status(v, yesLabel="Yes", noLabel="No") {
    const s = boolState(v);
    if (s==="yes") return `<span class="status yes">✓ ${yesLabel}</span>`;
    if (s==="no") return `<span class="status no">× ${noLabel}</span>`;
    return `<span class="status unknown">— Not available</span>`;
  }

  function textOrNA(v) { return v === null || v === undefined || norm(v)==="" ? "Not available" : esc(v); }

  async function fetchJSON(url, timeout=10000) {
    const controller = new AbortController();
    const timer = setTimeout(()=>controller.abort(), timeout);
    try {
      const res = await fetch(url, {signal:controller.signal, headers:{"Accept":"application/json"}});
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } finally { clearTimeout(timer); }
  }

  async function loadDatabase() {
    const paths = ["./data/journals.json","./journals.json","data/journals.json","journals.json"];
    let lastError = null;
    for (const path of paths) {
      try {
        const data = await fetchJSON(path, 20000);
        if (Array.isArray(data)) DB = {version:"1.0",record_count:data.length,records:data};
        else DB = {version:data.version ?? "1.0",record_count:data.record_count ?? data.records?.length ?? 0,records:Array.isArray(data.records)?data.records:[]};
        if (!DB.records.length) throw new Error("Database contains no records");
        $("#dbStatus").textContent = "Ready";
        $("#recordCount").textContent = Number(DB.record_count).toLocaleString();
        $("#datasetVersion").textContent = DB.version;
        $("#dbDot").style.background = "#20a66f";
        return true;
      } catch(e) { lastError = e; }
    }
    $("#dbStatus").textContent = "Error";
    $("#dbDot").style.background = "#c53b42";
    $("#emptyBox").innerHTML = `<div class="error"><strong>Database could not be loaded.</strong><br>${esc(lastError?.message || "Unknown error")}<br><small>Check that journals.json is committed under <code>data/journals.json</code>.</small></div>`;
    return false;
  }

  function record(r) {
    return {
      raw:r,title:val(r,"title"),issn:val(r,"issn"),eissn:val(r,"eissn"),publisher:val(r,"publisher"),
      country:val(r,"country"),language:val(r,"language"),scie:val(r,"scie"),ssci:val(r,"ssci"),ahci:val(r,"ahci"),esci:val(r,"esci"),
      jcr:val(r,"jcr"),scopus:val(r,"scopus"),scopusActive:val(r,"scopusActive"),scopusId:val(r,"scopusId"),
      scopusCoverage:val(r,"scopusCoverage"),scopusType:val(r,"scopusType"),scopusOA:val(r,"scopusOA"),citescore:val(r,"citescore"),snip:val(r,"snip"),
      sjr:val(r,"sjr"),quartile:val(r,"quartile"),hindex:val(r,"hindex"),subject:val(r,"subject"),
      doaj:val(r,"doaj"),openalex:val(r,"openalex"),crossref:val(r,"crossref"),cope:val(r,"cope"),
      peerReview:val(r,"peerReview"),editorialBoard:val(r,"editorialBoard"),apc:val(r,"apc"),license:val(r,"license"),
      copyright:val(r,"copyright"),ethics:val(r,"ethics"),retraction:val(r,"retraction"),archiving:val(r,"archiving"),
      doi:val(r,"doi"),website:val(r,"website") || val(r,"official"),warning:val(r,"warning")
    };
  }

  function scoreConcern(j, ext={}) {
    const signals=[];
    const add=(points,title,detail)=>signals.push({points,title,detail});

    // Important design rule: absence from a database is NOT a predatory-journal signal.
    // We only score explicit contradictions or independently evidenced warning signals.
    if (ext.crossref?.titleMismatch) add(30,"Crossref identity mismatch","Crossref returned a substantially different title for the same ISSN. Check the ISSN/title relationship before relying on the record.");
    if (ext.openalex?.issnMismatch) add(30,"OpenAlex identifier mismatch","OpenAlex returned a source whose ISSN identifiers do not align cleanly with this journal record.");
    if (ext.identityConflict) add(25,"Source identity conflict","Independent sources disagree materially about the journal identity, publisher, or identifiers.");
    if (ext.retractions?.count > 0) add(8,"Retraction/update evidence","Crossref/Retraction Watch metadata indicates at least one retraction-related update associated with this journal. This is a review signal, not proof of misconduct.");
    if (j.warning) {
      const arr=Array.isArray(j.warning)?j.warning:[j.warning];
      arr.forEach(x=>add(15,"Recorded warning signal",String(x)));
    }

    // Transparency is reported separately. Missing transparency data is NOT scored as misconduct.
    const score=Math.min(100,signals.reduce((a,s)=>a+s.points,0));
    let band="low"; if(score>=75) band="extreme"; else if(score>=50) band="high"; else if(score>=25) band="moderate";
    return {score,band,signals};
  }

  function criteria(j, ext) {
    const items=[
      ["Journal title", j.title ? "yes":"unknown","Identity"],
      ["ISSN", j.issn ? "yes":"unknown","Identity"],
      ["eISSN", j.eissn ? "yes":"unknown","Identity"],
      ["Publisher", j.publisher ? "yes":"unknown","Identity"],
      ["Country", j.country ? "yes":"unknown","Identity"],
      ["Language", j.language ? "yes":"unknown","Identity"],
      ["SCIE", boolState(j.scie),"Indexing"], ["SSCI", boolState(j.ssci),"Indexing"],
      ["AHCI", boolState(j.ahci),"Indexing"], ["ESCI", boolState(j.esci),"Indexing"],
      ["Scopus", boolState(j.scopus),"Indexing"], ["Scopus active", boolState(j.scopusActive),"Indexing"],
      ["JCR", boolState(j.jcr),"Indexing"],
      ["DOAJ", ext.doaj?.found===true ? "yes":(ext.doaj?.found===false?"no":"unknown"),"External"],
      ["OpenAlex", ext.openalex?.found===true ? "yes":(ext.openalex?.found===false?"no":"unknown"),"External"],
      ["Crossref", ext.crossref?.found===true ? "yes":(ext.crossref?.found===false?"no":"unknown"),"External"],
      ["Retraction Watch / Crossref", ext.retractions?.count!=null ? "yes":"unknown","Integrity checks"],
      ["SJR", j.sjr ? "yes":"unknown","Metrics"], ["Quartile", j.quartile ? "yes":"unknown","Metrics"],
      ["CiteScore", j.citescore ? "yes":"unknown","Metrics"], ["SNIP", j.snip ? "yes":"unknown","Metrics"],
      ["H-index", j.hindex ? "yes":"unknown","Metrics"],
      ["Peer-review policy", j.peerReview ? "yes":"unknown","Transparency"],
      ["Editorial board", j.editorialBoard ? "yes":"unknown","Transparency"],
      ["Fees/APC", j.apc ? "yes":"unknown","Transparency"], ["Licensing", j.license ? "yes":"unknown","Transparency"],
      ["Copyright", j.copyright ? "yes":"unknown","Transparency"], ["Publication ethics", j.ethics ? "yes":"unknown","Transparency"],
      ["Retraction/correction policy", j.retraction ? "yes":"unknown","Transparency"],
      ["Digital preservation", j.archiving ? "yes":"unknown","Transparency"],
      ["Persistent identifier/DOI", j.doi ? "yes":"unknown","Transparency"]
    ];
    return items;
  }

  async function externalChecks(j) {
    const out={openalex:null,crossref:null,doaj:null,retractions:null,identityConflict:false};
    const rawIssns=[j.issn,j.eissn].filter(Boolean).map(norm);
    const normalizedIssns=rawIssns.map(x=>digits(x)).filter(Boolean);
    const issn=rawIssns[0];
    if (!issn) return out;

    // Run independent sources in parallel so one slow/blocked service cannot keep the
    // entire search screen stuck on "Searching…".
    const jobs = [
      (async()=>{
        try {
          // OpenAlex resolves ISSNs directly. Keep the canonical ISSN formatting first;
          // fall back to the compact form only if necessary.
          const candidates=[issn, ...rawIssns.slice(1)].filter(Boolean);
          let source=null, lastErr=null;
          for(const candidate of candidates){
            try {
              const data=await fetchJSON(`https://api.openalex.org/sources/issn:${encodeURIComponent(candidate)}`,6000);
              source=Array.isArray(data.results)?data.results[0]:data;
              if(source?.id) break;
            } catch(e){ lastErr=e; }
          }
          if(source?.id){
            const ids=[source.issn_l,...(source.issn||[])].filter(Boolean).map(digits);
            out.openalex={
              found:true,id:source.id,displayName:source.display_name||"",
              issns:ids,works:source.works_count??null,citations:source.cited_by_count??null,
              homepage:source.homepage_url||"",country:source.country_code||"",
              publisher:source.host_organization_name||"",
              isOA:source.is_oa===true,isInDOAJ:source.is_in_doaj===true,
              apcUsd:source.apc_usd??null,hIndex:source.summary_stats?.h_index??null,
              twoYearCitedness:source.summary_stats?.["2yr_mean_citedness"]??null,
              type:source.type||"",issnMismatch:!ids.some(x=>normalizedIssns.includes(x))
            };
          } else out.openalex={found:false,error:lastErr?.message||"OpenAlex source not found"};
        } catch(e){out.openalex={found:null,error:e.message};}
      })(),
      (async()=>{
        try {
          const data=await fetchJSON(`https://api.crossref.org/journals/${encodeURIComponent(issn)}`,6000);
          const m=data.message||{}; const titles=(m.title||[]).join(" ");
          const crossIssns=(m.ISSN||[]).map(digits);
          out.crossref={found:!!m.title,title:titles,issn:m.ISSN||[],publisher:m.publisher||"",
            works:m.counts?.["total-dois"] ?? m.count ?? null,
            titleMismatch:!!titles && !!j.title && similarity(cleanTitle(titles),cleanTitle(j.title))<0.55,
            issnMismatch:crossIssns.length>0 && !normalizedIssns.some(x=>crossIssns.includes(x))};
        } catch(e){out.crossref={found:null,error:e.message};}
      })(),
      (async()=>{
        try {
          const data=await fetchJSON(`https://doaj.org/api/search/journals/issn:${encodeURIComponent(issn)}?page=1&pageSize=1`,6000);
          const total=Number(data.total||0); out.doaj={found:total>0,total,record:data.results?.[0]?.bibjson||null};
        } catch(e){
          try {
            const data=await fetchJSON(`https://doaj.org/api/search/journal.issn:${encodeURIComponent(issn)}?page=1&pageSize=1`,6000);
            const total=Number(data.total||0); out.doaj={found:total>0,total,record:data.results?.[0]?.bibjson||null};
          } catch(e2){out.doaj={found:null,error:e2.message||e.message};}
        }
      })(),
      (async()=>{
        try {
          const data=await fetchJSON(`https://api.crossref.org/journals/${encodeURIComponent(issn)}/works?filter=update-type:retraction&rows=0`,6000);
          const total=Number(data.message?.total-results ?? data.message?.total_results ?? 0);
          out.retractions={count:total,source:"Crossref / Retraction Watch"};
        } catch(e){out.retractions={count:null,error:e.message};}
      })()
    ];
    await Promise.allSettled(jobs);

    out.identityConflict=Boolean(
      out.crossref?.found===true && out.crossref?.issnMismatch ||
      out.openalex?.found===true && out.openalex?.issnMismatch ||
      (out.crossref?.publisher && out.openalex?.publisher && similarity(cleanTitle(out.crossref.publisher),cleanTitle(out.openalex.publisher))<0.20)
    );
    return out;
  }

  function similarity(a,b){
    if(!a||!b)return 0;if(a===b)return 1;
    const A=new Set(a.split(" ")),B=new Set(b.split(" ")); let inter=0; A.forEach(x=>{if(B.has(x))inter++});
    return inter/Math.max(A.size,B.size);
  }

  function findMatches(q) {
    const raw=norm(q), n=cleanTitle(raw), d=digits(raw);
    const arr=DB.records.map(record);
    if (d.length>=7) {
      const exact=arr.filter(r=>digits(r.issn)===d || digits(r.eissn)===d);
      if(exact.length)return exact.slice(0,20);
    }
    const scored=arr.map(r=>{
      const t=cleanTitle(r.title), ct=compactTitle(r.title);
      let score=0;
      if(t===n)score+=100;
      if(t.includes(n)&&n.length>4)score+=70;
      if(ct===compactTitle(raw))score+=85;
      if(ct.includes(compactTitle(raw))&&compactTitle(raw).length>4)score+=50;
      score+=similarity(t,n)*45;
      if(r.publisher && cleanTitle(r.publisher)===n)score+=10;
      return {r,score};
    }).filter(x=>x.score>=28).sort((a,b)=>b.score-a.score);
    return scored.slice(0,20).map(x=>x.r);
  }

  function render(j, ext, matches, query) {
    const risk=scoreConcern(j,ext);
    const c=criteria(j,ext);
    const confirmed=c.filter(x=>x[1]==="yes").length, unavailable=c.filter(x=>x[1]==="unknown").length, negative=c.filter(x=>x[1]==="no").length;
    const bandLabel={low:"LOW CONCERN",moderate:"MODERATE CONCERN",high:"HIGH CONCERN",extreme:"EXTREME CONCERN"}[risk.band];
    const signals=risk.signals.length?risk.signals.map(s=>`<div class="signal"><strong>+${s.points} ${esc(s.title)}</strong><p>${esc(s.detail)}</p></div>`).join(""):`<div class="notice"><strong>No major concern signal was triggered by the available evidence.</strong><br>Missing data is not treated as misconduct. A low score is not a certification of quality.</div>`;

    const idx=[
      ["SCIE",j.scie], ["SSCI",j.ssci], ["AHCI",j.ahci], ["ESCI",j.esci], ["JCR 2025",j.jcr],
      ["Scopus",j.scopus], ["Scopus Active",j.scopusActive]
    ].map(([k,v])=>`<tr><td><strong>${k}</strong></td><td>${status(v)}</td><td>${k==="Scopus" ? textOrNA(j.scopusCoverage) : k==="Scopus Active" ? textOrNA(j.scopusType) : "—"}</td></tr>`).join("");

    const extStatus=(state,yes="✓ Confirmed",no="× No")=>state==="yes"?`<span class="status yes">${yes}</span>`:state==="no"?`<span class="status no">${no}</span>`:`<span class="status unknown">— Unknown</span>`;
    const doajBib=ext.doaj?.record||{};
    const oa=ext.openalex;
    const cr=ext.crossref;
    const rw=ext.retractions;

    const externalRows=[
      ["DOAJ",ext.doaj?.found===true?"yes":ext.doaj?.found===false?"no":"unknown",doajBib.title||"Official DOAJ lookup"],
      ["OpenAlex",oa?.found===true?"yes":oa?.found===false?"no":"unknown",oa?.displayName||"Official OpenAlex lookup"],
      ["Crossref",cr?.found===true?"yes":cr?.found===false?"no":"unknown",cr?.title||"Official Crossref lookup"],
      ["Retraction Watch / Crossref",rw?.count!=null?"yes":"unknown",rw?.count!=null?`${rw.count.toLocaleString()} retraction-related update record(s)`:(rw?.error||"Live check unavailable")],
      ["Scopus source ID",j.scopusId?"yes":"unknown",j.scopusId||"Not available"],
      ["Scopus OA",j.scopusOA?"yes":"unknown",j.scopusOA||"Not available"]
    ].map(([k,state,d])=>`<tr><td><strong>${k}</strong></td><td>${extStatus(state)}</td><td>${esc(d)}</td></tr>`).join("");

    const metricCards=[
      ["SCImago SJR",j.sjr], ["SJR year",j.sjr?(j.sjr_year||"2025"):"Not locally verified"], ["Quartile",j.quartile],
      ["CiteScore",j.citescore], ["SNIP",j.snip], ["H-index",j.hindex], ["Subject area",j.subject],
      ["OpenAlex works",oa?.works], ["OpenAlex citations",oa?.citations], ["OpenAlex h-index",oa?.hIndex],
      ["OpenAlex APC (USD)",oa?.apcUsd], ["OpenAlex OA",oa?.isOA===true?"Yes":oa?.isOA===false?"No":null],
      ["OpenAlex DOAJ flag",oa?.isInDOAJ===true?"Yes":oa?.isInDOAJ===false?"No":null]
    ].map(([k,v])=>`<div class="metric"><small>${k}</small><strong>${textOrNA(v)}</strong></div>`).join("");

    const trans=[
      ["Peer-review policy",j.peerReview], ["Editorial board",j.editorialBoard], ["Fees / APC",j.apc], ["Licensing",j.license],
      ["Copyright",j.copyright], ["Publication ethics",j.ethics], ["Retraction / correction",j.retraction], ["Digital preservation",j.archiving]
    ].map(([k,v])=>`<tr><td><strong>${k}</strong></td><td>${v?`<span class="status yes">✓ Recorded</span>`:`<span class="status unknown">— Not available</span>`}</td><td>${textOrNA(v)}</td></tr>`).join("");

    const criteriaHtml=c.map(([name,state,group])=>`<div class="criterion"><div><div class="criterion-name">${esc(name)}</div><div class="why">${esc(group)}</div></div>${state==="yes"?'<span class="status yes">✓ Included</span>':state==="no"?'<span class="status no">× No</span>':'<span class="status unknown">— Unknown</span>'}</div>`).join("");

    const issn=digits(j.issn||j.eissn);
    const titleQ=encodeURIComponent(`"${j.title||query}" ${j.issn||j.eissn||""}`);
    const googleBase=`https://www.google.com/search?q=${titleQ}`;
    const googlePred=`https://www.google.com/search?q=${encodeURIComponent(`"${j.title||query}" ${j.issn||j.eissn||""} (predatory OR hijacked OR scam OR fake OR warning)`)}`;
    const googleIndex=`https://www.google.com/search?q=${encodeURIComponent(`"${j.title||query}" ${j.issn||j.eissn||""} (Scopus OR Web of Science OR DOAJ OR SCImago)`)}`;
    const googleRetraction=`https://www.google.com/search?q=${encodeURIComponent(`"${j.title||query}" ${j.issn||j.eissn||""} (retraction OR "expression of concern")`)}`;
    const officialSite= j.website || oa?.homepage || "";
    const doajUrl=`https://doaj.org/toc/${encodeURIComponent(j.eissn||j.issn||"")}`;
    const openalexUrl=oa?.id||`https://openalex.org/sources?search=${encodeURIComponent(j.title||query)}`;
    const crossrefUrl=`https://search.crossref.org/?q=${encodeURIComponent(j.issn||j.eissn||j.title||query)}`;
    const issnUrl=`https://portal.issn.org/resource/ISSN/${encodeURIComponent(j.eissn||j.issn||"")}`;
    const scimagoUrl=`https://www.scimagojr.com/journalsearch.php?q=${encodeURIComponent(issn)}&tip=issn`;
    const scopusUrl=`https://www.scopus.com/sources`;
    const tcsUrl=`https://thinkchecksubmit.org/journals/`;

    let resultsBox=$("resultsBox");
    if(!resultsBox){
      const resultsSection=$("results");
      if(resultsSection){
        resultsBox=document.createElement("div");
        resultsBox.id="resultsBox";
        resultsBox.className="journal-card hide";
        resultsSection.appendChild(resultsBox);
      }
    }
    if(!resultsBox) throw new Error("Results container is missing from the page");
    const googleBtn=$("googleBtn");
    if(googleBtn) googleBtn.href=googlePred;
    resultsBox.innerHTML=`
      <div class="journal-top">
        <div>
          <div class="label">Best verified match</div>
          <h3 class="journal-name">${esc(j.title||"Untitled journal")}</h3>
          <div class="publisher">${textOrNA(j.publisher)}</div>
          <div class="identifiers">${j.issn?`<span class="idchip">ISSN ${esc(j.issn)}</span>`:""}${j.eissn?`<span class="idchip">eISSN ${esc(j.eissn)}</span>`:""}${j.country?`<span class="idchip">${esc(j.country)}</span>`:""}${j.language?`<span class="idchip">${esc(j.language)}</span>`:""}</div>
        </div>
        <div class="concern"><div class="score">${risk.score}<span style="font-size:20px">/100</span></div><div class="band ${risk.band}">${bandLabel}</div><div style="font-size:11px;color:var(--muted);margin-top:8px">Evidence-led concern screening</div></div>
      </div>

      <div class="section"><h3>1. Journal identity</h3><div class="grid">
        <div class="metric"><small>Title</small><strong>${textOrNA(j.title)}</strong></div>
        <div class="metric"><small>Publisher</small><strong>${textOrNA(j.publisher)}</strong></div>
        <div class="metric"><small>ISSN</small><strong>${textOrNA(j.issn)}</strong></div>
        <div class="metric"><small>eISSN</small><strong>${textOrNA(j.eissn)}</strong></div>
        <div class="metric"><small>Country</small><strong>${textOrNA(j.country || oa?.country)}</strong></div>
        <div class="metric"><small>Language</small><strong>${textOrNA(j.language)}</strong></div>
        <div class="metric"><small>Website</small><strong>${officialSite?`<a href="${esc(officialSite)}" target="_blank" rel="noopener">Open official / publisher site ↗</a>`:"Not available"}</strong></div>
        <div class="metric"><small>DOI / identifier</small><strong>${textOrNA(j.doi)}</strong></div>
      </div></div>

      <div class="section"><h3>2. Indexing profile</h3><table class="table"><thead><tr><th>Database</th><th>Status</th><th>Additional information</th></tr></thead><tbody>${idx}</tbody></table></div>

      <div class="section"><h3>3. Journal quality & metrics</h3><div class="grid">${metricCards}</div>
        <div class="notice" style="margin-top:14px"><strong>Metric rule:</strong> SJR and quartiles are shown only when a verifiable SCImago value is present. JournalCheck never converts CiteScore into SJR or invents a quartile. OpenAlex metrics are clearly labelled as OpenAlex and are not substituted for SCImago.</div>
      </div>

      <div class="section"><h3>4. Live external confirmations</h3><table class="table"><thead><tr><th>Source</th><th>Result</th><th>Evidence / response</th></tr></thead><tbody>${externalRows}</tbody></table>
        <div class="notice" style="margin-top:14px"><strong>Why some fields may still say Unknown:</strong> JournalCheck is a static GitHub Pages app. Crossref and OpenAlex can be queried directly from the browser; DOAJ may be blocked by browser CORS in some environments. Unknown means the check could not be completed — it is never converted into “No”.</div>
        <div class="external" style="margin-top:14px">
          ${officialSite?`<a target="_blank" rel="noopener" href="${esc(officialSite)}">Official journal ↗</a>`:""}
          <a target="_blank" rel="noopener" href="${issnUrl}">ISSN Portal ↗</a>
          <a target="_blank" rel="noopener" href="${doajUrl}">DOAJ record ↗</a>
          <a target="_blank" rel="noopener" href="${openalexUrl}">OpenAlex record ↗</a>
          <a target="_blank" rel="noopener" href="${crossrefUrl}">Crossref record ↗</a>
          <a target="_blank" rel="noopener" href="${scopusUrl}">Scopus Sources ↗</a>
          <a target="_blank" rel="noopener" href="${scimagoUrl}">SCImago by ISSN ↗</a>
          <a target="_blank" rel="noopener" href="${tcsUrl}">Think.Check.Submit ↗</a>
        </div>
      </div>

      <div class="section"><h3>5. Web & Google investigation</h3>
        <p style="color:var(--muted);margin-top:-4px">Google is used here as a discovery and investigation layer, not as proof of indexing or misconduct. Review the official result before treating a claim as confirmed.</p>
        <div class="external">
          <a target="_blank" rel="noopener" href="${googleIndex}">Search indexing claims ↗</a>
          <a target="_blank" rel="noopener" href="${googlePred}">Search predatory / hijacked warnings ↗</a>
          <a target="_blank" rel="noopener" href="${googleRetraction}">Search retractions / concerns ↗</a>
          <a target="_blank" rel="noopener" href="${googleBase}">General journal search ↗</a>
        </div>
        <div class="notice" style="margin-top:14px"><strong>Automated Google fetching is deliberately not enabled.</strong> Google's current Custom Search JSON API requires a configured search engine and API key, and Google says the API is closed to new customers. JournalCheck therefore provides targeted Google investigation links rather than scraping Google results or treating search snippets as evidence.</div>
      </div>

      <div class="section"><h3>6. Concern screening</h3><p style="color:var(--muted);margin-top:-6px">The score represents detected warning signals only. <strong>Index absence and missing metadata do not increase the concern score.</strong></p>${signals}</div>

      <div class="section"><h3>7. Publication transparency</h3><table class="table"><thead><tr><th>Criterion</th><th>Status</th><th>Recorded information</th></tr></thead><tbody>${trans}</tbody></table></div>

      <div class="section"><h3>8. Complete verification checklist</h3>
        <div class="criteria">${criteriaHtml}</div>
        <div class="notice" style="margin-top:15px"><strong>${confirmed} confirmed</strong> · <strong>${negative} explicit negative</strong> · <strong>${unavailable} not available</strong> across the checks performed. Unknown is deliberately separated from No.</div>
      </div>

      <div class="section"><h3>Researcher decision note</h3>
        <div class="notice"><strong>JournalCheck is a due-diligence aid, not a predatory-journal verdict.</strong><br>A low concern score does not certify a journal, and a high score does not by itself prove misconduct. Use the official records and the journal's own current policies before submitting.</div>
      </div>
    `;
    if($("resultHead")) $("resultHead").classList.remove("hide");
    if(resultsBox) resultsBox.classList.remove("hide");
    if($("emptyBox")) $("emptyBox").classList.add("hide");
    if($("resultTitle")) $("resultTitle").textContent=`${matches.length} result${matches.length===1?"":"s"} for “${query}”`;
    if($("matchSummary")) $("matchSummary").textContent=`Best match selected using title/ISSN/eISSN matching. ${matches.length>1?`${matches.length} close records were found; the strongest match is shown.`:""}`;
    if($("searchStatus")) $("searchStatus").textContent="Complete";
  }

  async function runSearch(query, autoScroll=true) {
    const q=norm(query);
    if(!q) return;
    if(!DB.records.length){$("#emptyBox").innerHTML=`<div class="error">Database is still loading. Please try again in a moment.</div>`;return;}
    $("#searchStatus").textContent="Searching…";
    const matches=findMatches(q);
    if(!matches.length){
      $("#resultHead").classList.remove("hide");$("#resultsBox").classList.add("hide");$("#emptyBox").classList.remove("hide");
      $("#resultTitle").textContent="No strong match found";$("#matchSummary").textContent=`No record matched “${q}”. Try the full title or ISSN/eISSN.`;
      $("#emptyBox").innerHTML=`<div class="empty"><strong>No strong match found.</strong><br>Try a full journal title, ISSN or eISSN. You can also use the Google investigation button after selecting a record.</div>`;
      $("#searchStatus").textContent="No match";
      if(autoScroll) $("#results").scrollIntoView({behavior:"smooth",block:"start"});
      return;
    }
    current=record(matches[0]);
    try {
      const ext=await externalChecks(current);
      render(current,ext,matches,q);
    } catch(err) {
      console.error("JournalCheck render error:", err);
      if($("searchStatus")) $("searchStatus").textContent="Complete";
      if($("resultHead")) $("resultHead").classList.remove("hide");
      if($("resultsBox")) { $("resultsBox").classList.remove("hide"); $("resultsBox").innerHTML=`<div class="error"><strong>${esc(current.title||"Journal")} was found.</strong><br>The external enrichment layer encountered an error, but the local journal record is available. Please refresh and retry the external checks.</div>`; }
    }
    const url=new URL(location.href);url.searchParams.set("q",q);history.replaceState({}, "", url);
    saveRecent(q);
    if(autoScroll) setTimeout(()=>$("#results").scrollIntoView({behavior:"smooth",block:"start"}),60);
  }

  function saveRecent(q){
    const arr=JSON.parse(localStorage.getItem("journalcheck_recent")||"[]").filter(x=>x!==q);
    arr.unshift(q);localStorage.setItem("journalcheck_recent",JSON.stringify(arr.slice(0,6)));renderRecent();
  }
  function renderRecent(){
    const arr=JSON.parse(localStorage.getItem("journalcheck_recent")||"[]");
    $("#recent").innerHTML=arr.length?`<span style="font-size:12px;color:var(--muted);width:100%">Recent</span>`+arr.map(x=>`<button type="button" data-q="${esc(x)}">${esc(x)}</button>`).join(""):"";
    $("#recent").querySelectorAll("button").forEach(b=>b.addEventListener("click",()=>{$("#journalInput").value=b.dataset.q;runSearch(b.dataset.q)}));
  }

  window.addEventListener("DOMContentLoaded", async ()=>{
    $("#searchForm")?.addEventListener("submit",e=>{e.preventDefault();runSearch($("#journalInput")?.value||"")});
    $("#clearBtn")?.addEventListener("click",()=>{history.replaceState({}, "", location.pathname);if($("#journalInput")) $("#journalInput").value="";$("#resultHead")?.classList.add("hide");$("#resultsBox")?.classList.add("hide");$("#emptyBox")?.classList.remove("hide");if($("#emptyBox")) $("#emptyBox").textContent="Search for a journal title, ISSN or eISSN to begin.";if($("#searchStatus")) $("#searchStatus").textContent="Ready"});
    $("#printBtn")?.addEventListener("click",()=>window.print());
    $("#themeBtn")?.addEventListener("click",()=>{document.body.classList.toggle("dark");localStorage.setItem("journalcheck_theme",document.body.classList.contains("dark")?"dark":"light")});
    if(localStorage.getItem("journalcheck_theme")==="dark") document.body.classList.add("dark");
    renderRecent();
    const ok=await loadDatabase();
    const q=new URL(location.href).searchParams.get("q");
    if(ok && q){if($("#journalInput")) $("#journalInput").value=q;await runSearch(q,true);}
  });
})();
