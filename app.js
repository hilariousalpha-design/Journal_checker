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
    scopus: ["scopus","Scopus"],
    scopusActive: ["scopus_active","scopusActive","scopus_active_status"],
    scopusId: ["scopus_id","source_id","scopus_source_id"],
    scopusCoverage: ["scopus_coverage","coverage_years","scopus_coverage_years"],
    scopusType: ["scopus_source_type","source_type"],
    citescore: ["citescore","cite_score","CiteScore"],
    snip: ["snip","SNIP"],
    sjr: ["sjr","SJR","scimago_sjr"],
    quartile: ["quartile","best_quartile","sjr_quartile","scimago_quartile"],
    hindex: ["h_index","hindex","H_index"],
    subject: ["subject","subject_area","scimago_subject","scopus_subject"],
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
    website: ["website","url","journal_url"],
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
      scopusCoverage:val(r,"scopusCoverage"),scopusType:val(r,"scopusType"),citescore:val(r,"citescore"),snip:val(r,"snip"),
      sjr:val(r,"sjr"),quartile:val(r,"quartile"),hindex:val(r,"hindex"),subject:val(r,"subject"),
      doaj:val(r,"doaj"),openalex:val(r,"openalex"),crossref:val(r,"crossref"),cope:val(r,"cope"),
      peerReview:val(r,"peerReview"),editorialBoard:val(r,"editorialBoard"),apc:val(r,"apc"),license:val(r,"license"),
      copyright:val(r,"copyright"),ethics:val(r,"ethics"),retraction:val(r,"retraction"),archiving:val(r,"archiving"),
      doi:val(r,"doi"),website:val(r,"website"),warning:val(r,"warning")
    };
  }

  function scoreConcern(j, ext={}) {
    const signals=[];
    const add=(points,title,detail)=>signals.push({points,title,detail});

    // Explicit negative evidence only. Missing/unknown never adds points.
    const indexes=[j.scie,j.ssci,j.ahci,j.esci,j.scopus];
    const explicitNo=indexes.filter(v=>boolState(v)==="no").length;
    if (explicitNo >= 4) add(6,"Limited index coverage","The local verified dataset records no coverage in four or more major indexing fields.");
    if (boolState(j.scopus)==="no" && boolState(j.scopusActive)==="yes") add(20,"Scopus status conflict","The dataset says Scopus is not indexed but also says Scopus is active. Verify the source record.");
    if (boolState(j.scopus)==="yes" && boolState(j.scopusActive)==="no") add(25,"Scopus status conflict","The dataset records Scopus coverage but marks the source inactive/discontinued. Verify current status.");
    if (j.warning) {
      const arr=Array.isArray(j.warning)?j.warning:[j.warning];
      arr.forEach(x=>add(10,"Recorded warning signal",String(x)));
    }
    if (ext.crossref && ext.crossref.titleMismatch) add(30,"Identity mismatch","Crossref returned a substantially different title for the same identifier.");
    if (ext.openalex && ext.openalex.issnMismatch) add(30,"Identifier mismatch","OpenAlex returned a source whose identifiers do not align cleanly with this record.");
    if (j.title && /international|global|world/i.test(j.title) && !j.publisher) add(5,"Publisher not recorded","The master dataset does not contain a publisher for this title.");
    // Transparency checks are only scored when explicitly negative.
    const negative=[["peerReview","Peer-review information not recorded"],["apc","Fee/APC information not recorded"],["ethics","Publication-ethics information not recorded"],["archiving","Digital preservation information not recorded"]];
    // Missing values are intentionally NOT scored.
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
      ["SCIE", boolState(j.scie),"Indexing"],
      ["SSCI", boolState(j.ssci),"Indexing"],
      ["AHCI", boolState(j.ahci),"Indexing"],
      ["ESCI", boolState(j.esci),"Indexing"],
      ["Scopus", boolState(j.scopus),"Indexing"],
      ["Scopus active", boolState(j.scopusActive),"Indexing"],
      ["JCR", boolState(j.jcr),"Indexing"],
      ["DOAJ", ext.doaj?.found===true ? "yes":(ext.doaj?.found===false?"no":"unknown"),"External"],
      ["OpenAlex", ext.openalex?.found===true ? "yes":(ext.openalex?.found===false?"no":"unknown"),"External"],
      ["Crossref", ext.crossref?.found===true ? "yes":(ext.crossref?.found===false?"no":"unknown"),"External"],
      ["SJR", j.sjr ? "yes":"unknown","Metrics"],
      ["Quartile", j.quartile ? "yes":"unknown","Metrics"],
      ["CiteScore", j.citescore ? "yes":"unknown","Metrics"],
      ["SNIP", j.snip ? "yes":"unknown","Metrics"],
      ["H-index", j.hindex ? "yes":"unknown","Metrics"],
      ["Peer-review policy", j.peerReview ? "yes":"unknown","Transparency"],
      ["Editorial board", j.editorialBoard ? "yes":"unknown","Transparency"],
      ["Fees/APC", j.apc ? "yes":"unknown","Transparency"],
      ["Licensing", j.license ? "yes":"unknown","Transparency"],
      ["Copyright", j.copyright ? "yes":"unknown","Transparency"],
      ["Publication ethics", j.ethics ? "yes":"unknown","Transparency"],
      ["Retraction/correction", j.retraction ? "yes":"unknown","Transparency"],
      ["Digital preservation", j.archiving ? "yes":"unknown","Transparency"],
      ["Persistent identifier/DOI", j.doi ? "yes":"unknown","Transparency"]
    ];
    return items;
  }

  async function externalChecks(j) {
    const out={openalex:null,crossref:null,doaj:null};
    const issn=digits(j.issn||j.eissn);
    if (!issn) return out;

    // OpenAlex
    try {
      const data=await fetchJSON(`https://api.openalex.org/sources/issn:${encodeURIComponent(issn)}`,9000);
      const source=Array.isArray(data.results)?data.results[0]:data;
      if (source && source.id) {
        const ids=(source.issn_l ? [source.issn_l] : []).concat(source.issn||[]);
        out.openalex={found:true,id:source.id,displayName:source.display_name,issns:ids,works:source.works_count,citations:source.cited_by_count,homepage:source.homepage_url||"",issnMismatch:!ids.map(digits).includes(issn)};
      } else out.openalex={found:false};
    } catch(e){out.openalex={found:null,error:e.message};}

    // Crossref
    try {
      const data=await fetchJSON(`https://api.crossref.org/journals/${encodeURIComponent(issn)}`,9000);
      const m=data.message||{};
      const titles=(m.title||[]).join(" ");
      out.crossref={found:!!m.title,title:titles,issn:m.ISSN||[],publisher:m.publisher||"",works:m.count||null,titleMismatch:!!titles && !!j.title && similarity(cleanTitle(titles),cleanTitle(j.title))<0.55};
    } catch(e){out.crossref={found:null,error:e.message};}

    // DOAJ public endpoint. If unavailable, it stays Unknown rather than becoming No.
    try {
      const data=await fetchJSON(`https://doaj.org/api/search/journal.issn:${encodeURIComponent(issn)}?pageSize=1`,9000);
      const total=data.total ?? 0;
      out.doaj={found:total>0,total,record:total>0?data.results?.[0]?.bibjson:null};
    } catch(e){out.doaj={found:null,error:e.message};}
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
    const signals=risk.signals.length?risk.signals.map(s=>`<div class="signal"><strong>+${s.points} ${esc(s.title)}</strong><p>${esc(s.detail)}</p></div>`).join(""):`<div class="notice"><strong>No major concern signal was triggered by the available evidence.</strong><br>That does not certify the journal as trustworthy and does not prove the absence of problems. Verify critical claims at the relevant official source.</div>`;

    const idx=[
      ["SCIE",j.scie],["SSCI",j.ssci],["AHCI",j.ahci],["ESCI",j.esci],["JCR 2025",j.jcr],["Scopus",j.scopus],["Scopus Active",j.scopusActive]
    ].map(([k,v])=>`<tr><td><strong>${k}</strong></td><td>${status(v)}</td><td>${k==="Scopus" ? textOrNA(j.scopusCoverage) : k==="Scopus Active" ? textOrNA(j.scopusType) : "—"}</td></tr>`).join("");

    const externalRows=[
      ["DOAJ",ext.doaj?.found===true?"yes":ext.doaj?.found===false?"no":"unknown",ext.doaj?.record?.title||"Official DOAJ lookup"],
      ["OpenAlex",ext.openalex?.found===true?"yes":ext.openalex?.found===false?"no":"unknown",ext.openalex?.displayName||"Official OpenAlex lookup"],
      ["Crossref",ext.crossref?.found===true?"yes":ext.crossref?.found===false?"no":"unknown",ext.crossref?.title||"Official Crossref lookup"],
      ["COPE",boolState(j.cope),"Local dataset"]
    ].map(([k,s,d])=>`<tr><td><strong>${k}</strong></td><td>${s==="yes"?`<span class="status yes">✓ Confirmed</span>`:s==="no"?`<span class="status no">× No</span>`:`<span class="status unknown">— Unknown</span>`}</td><td>${esc(d)}</td></tr>`).join("");

    const metricCards=[
      ["SCImago SJR",j.sjr],["Quartile",j.quartile],["CiteScore",j.citescore],["SNIP",j.snip],["H-index",j.hindex],["Subject area",j.subject]
    ].map(([k,v])=>`<div class="metric"><small>${k}</small><strong>${textOrNA(v)}</strong></div>`).join("");

    const trans=[
      ["Peer-review policy",j.peerReview],["Editorial board",j.editorialBoard],["Fees / APC",j.apc],["Licensing",j.license],
      ["Copyright",j.copyright],["Publication ethics",j.ethics],["Retraction / correction",j.retraction],["Digital preservation",j.archiving]
    ].map(([k,v])=>`<tr><td><strong>${k}</strong></td><td>${v?`<span class="status yes">✓ Recorded</span>`:`<span class="status unknown">— Not available</span>`}</td><td>${textOrNA(v)}</td></tr>`).join("");

    const criteriaHtml=c.map(([name,s,group])=>`<div class="criterion"><div><div class="criterion-name">${esc(name)}</div><div class="why">${esc(group)}</div></div>${s==="yes"?'<span class="status yes">✓ Included</span>':s==="no"?'<span class="status no">× No</span>':'<span class="status unknown">— Unknown</span>'}</div>`).join("");

    const google=`https://www.google.com/search?q=${encodeURIComponent(`"${j.title}" ${j.issn||j.eissn||""} journal indexing predatory`)}`;
    $("#googleBtn").href=google;
    $("#resultsBox").innerHTML=`
      <div class="journal-top">
        <div>
          <div class="label">Best verified match</div>
          <h3 class="journal-name">${esc(j.title||"Untitled journal")}</h3>
          <div class="publisher">${textOrNA(j.publisher)}</div>
          <div class="identifiers">
            ${j.issn?`<span class="idchip">ISSN ${esc(j.issn)}</span>`:""}${j.eissn?`<span class="idchip">eISSN ${esc(j.eissn)}</span>`:""}${j.country?`<span class="idchip">${esc(j.country)}</span>`:""}${j.language?`<span class="idchip">${esc(j.language)}</span>`:""}
          </div>
        </div>
        <div class="concern"><div class="score">${risk.score}<span style="font-size:20px">/100</span></div><div class="band ${risk.band}">${bandLabel}</div><div style="font-size:11px;color:var(--muted);margin-top:8px">Evidence-led concern screening</div></div>
      </div>

      <div class="section"><h3>1. Journal identity</h3><div class="grid">
        <div class="metric"><small>Title</small><strong>${textOrNA(j.title)}</strong></div>
        <div class="metric"><small>Publisher</small><strong>${textOrNA(j.publisher)}</strong></div>
        <div class="metric"><small>ISSN</small><strong>${textOrNA(j.issn)}</strong></div>
        <div class="metric"><small>eISSN</small><strong>${textOrNA(j.eissn)}</strong></div>
        <div class="metric"><small>Country</small><strong>${textOrNA(j.country)}</strong></div>
        <div class="metric"><small>Language</small><strong>${textOrNA(j.language)}</strong></div>
        <div class="metric"><small>Website</small><strong>${j.website?`<a href="${esc(j.website)}" target="_blank" rel="noopener">Open publisher site ↗</a>`:"Not available"}</strong></div>
        <div class="metric"><small>DOI / identifier</small><strong>${textOrNA(j.doi)}</strong></div>
      </div></div>

      <div class="section"><h3>2. Indexing profile</h3><table class="table"><thead><tr><th>Database</th><th>Status</th><th>Additional information</th></tr></thead><tbody>${idx}</tbody></table></div>

      <div class="section"><h3>3. Journal quality & metrics</h3><div class="grid">${metricCards}</div>
        <div class="notice" style="margin-top:14px"><strong>Quartiles are category-specific.</strong> A journal can have different quartiles across subject categories. JournalCheck displays the locally verified metric/year and does not infer a Q1–Q4 value from a general reputation.</div>
      </div>

      <div class="section"><h3>4. External confirmations</h3><table class="table"><thead><tr><th>Source</th><th>Result</th><th>Evidence / response</th></tr></thead><tbody>${externalRows}</tbody></table>
        <div class="external" style="margin-top:14px">
          <a target="_blank" rel="noopener" href="https://www.scopus.com/sources">Scopus Sources ↗</a>
          <a target="_blank" rel="noopener" href="https://www.scimagojr.com/">SCImago ↗</a>
          <a target="_blank" rel="noopener" href="https://doaj.org/">DOAJ ↗</a>
          <a target="_blank" rel="noopener" href="https://openalex.org/">OpenAlex ↗</a>
          <a target="_blank" rel="noopener" href="https://search.crossref.org/">Crossref ↗</a>
          <a target="_blank" rel="noopener" href="${google}">Google investigation ↗</a>
        </div>
        <div class="notice" style="margin-top:14px"><strong>Important:</strong> external search results are investigation aids, not automatic proof of misconduct. Official source records should control final submission decisions.</div>
      </div>

      <div class="section"><h3>5. Concern screening</h3><p style="color:var(--muted);margin-top:-6px">The score represents detected warning signals. Missing information is <strong>not</strong> treated as misconduct.</p>${signals}</div>

      <div class="section"><h3>6. Publication transparency</h3><table class="table"><thead><tr><th>Criterion</th><th>Status</th><th>Recorded information</th></tr></thead><tbody>${trans}</tbody></table></div>

      <div class="section"><h3>7. Complete verification checklist</h3>
        <div class="criteria">${criteriaHtml}</div>
        <div class="notice" style="margin-top:15px"><strong>${confirmed} confirmed</strong> · <strong>${negative} explicit negative</strong> · <strong>${unavailable} not available</strong> across the checks performed. Unknown is deliberately separated from No.</div>
      </div>

      <div class="section"><h3>Researcher decision note</h3>
        <div class="notice"><strong>JournalCheck is a due-diligence aid, not a predatory-journal verdict.</strong><br>
        A low concern score does not certify a journal, and a high score does not by itself prove misconduct. Confirm critical indexing, ranking, publisher and policy claims at the relevant official source before submission.</div>
      </div>
    `;
    $("#resultHead").classList.remove("hide");
    $("#resultsBox").classList.remove("hide");
    $("#emptyBox").classList.add("hide");
    $("#resultTitle").textContent=`${matches.length} result${matches.length===1?"":"s"} for “${query}”`;
    $("#matchSummary").textContent=`Best match selected using title/ISSN/eISSN matching. ${matches.length>1?`${matches.length} close records were found; the strongest match is shown.`:""}`;
    $("#searchStatus").textContent="Complete";
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
    const ext=await externalChecks(current);
    render(current,ext,matches,q);
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

  $("#searchForm").addEventListener("submit",e=>{e.preventDefault();runSearch($("#journalInput").value)});
  $("#clearBtn").addEventListener("click",()=>{history.replaceState({}, "", location.pathname);$("#journalInput").value="";$("#resultHead").classList.add("hide");$("#resultsBox").classList.add("hide");$("#emptyBox").classList.remove("hide");$("#emptyBox").textContent="Search for a journal title, ISSN or eISSN to begin.";$("#searchStatus").textContent="Ready"});
  $("#printBtn").addEventListener("click",()=>window.print());
  $("#themeBtn").addEventListener("click",()=>{document.body.classList.toggle("dark");localStorage.setItem("journalcheck_theme",document.body.classList.contains("dark")?"dark":"light")});
  if(localStorage.getItem("journalcheck_theme")==="dark") document.body.classList.add("dark");

  window.addEventListener("DOMContentLoaded", async ()=>{
    renderRecent();
    const ok=await loadDatabase();
    const q=new URL(location.href).searchParams.get("q");
    if(ok && q){$("#journalInput").value=q;await runSearch(q,true);}
  });
})();
