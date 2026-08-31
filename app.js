const $ = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => [...r.querySelectorAll(s)];

const state = {
  db: null, records: [], results: [], selected: null, query: "",
  externalCache: new Map(), recent: JSON.parse(localStorage.getItem("jc_recent") || "[]")
};

const FIELD = {
  title: ["t","title","journal_title","journal","name"],
  issn: ["i","issn","pissn","print_issn","ISSN"],
  eissn: ["e","eissn","online_issn","electronic_issn","EISSN"],
  publisher: ["p","publisher","publisher_name"],
  country: ["c","country","publisher_country"],
  language: ["l","language","lang"],
  scie: ["scie","SCIE"],
  ssci: ["ssci","SSCI"],
  ahci: ["ahci","AHCI"],
  esci: ["esci","ESCI"],
  jcr: ["jcr","jcr_2025","JCR 2025","jcr2025"],
  scopus: ["scopus","Scopus"],
  scopusActive: ["scopus_active","scopusActive","scopus_active_status","Scopus Active"],
  scopusSourceType: ["scopus_source_type","scopusSourceType","source_type"],
  scopusOA: ["scopus_oa","scopusOA","scopus_oa_status","oa_status"],
  coverage: ["coverage","scopus_coverage","coverage_years"],
  doaj: ["doaj","DOAJ"],
  openalex: ["openalex","OpenAlex"],
  crossref: ["crossref","Crossref"]
};

function val(r, key) {
  const keys = FIELD[key] || [];
  for (const k of keys) if (r && r[k] !== undefined && r[k] !== null && String(r[k]).trim() !== "") return r[k];
  return "";
}
function clean(v){ return String(v ?? "").replace(/\s+/g," ").trim(); }
function norm(v){ return clean(v).toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g,"").replace(/[^\p{L}\p{N}\s-]/gu," ").replace(/\s+/g," ").trim(); }
function normIssn(v){ return clean(v).replace(/[^0-9Xx]/g,"").toUpperCase(); }
function formatIssn(v){ const n=normIssn(v); return n.length===8 ? `${n.slice(0,4)}-${n.slice(4)}` : clean(v); }
function boolValue(v){
  if (typeof v === "boolean") return v;
  const x = norm(v);
  if (["yes","true","1","y","indexed","active","included"].includes(x)) return true;
  if (["no","false","0","n","not indexed","inactive","excluded"].includes(x)) return false;
  return null;
}
function badge(v){
  const b=boolValue(v);
  if(b===true) return `<span class="badge yes">✓ Yes</span>`;
  if(b===false) return `<span class="badge no">× No</span>`;
  return `<span class="badge na">— Not available</span>`;
}
function esc(s){ return String(s ?? "").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m])); }

async function loadDB(){
  setText("#dbState","Loading");
  try{
    const res=await fetch("./data/journals.json",{cache:"no-store"});
    if(!res.ok) throw new Error(`Database request failed (${res.status})`);
    const json=await res.json();
    state.db=json;
    state.records=Array.isArray(json) ? json : (Array.isArray(json.records) ? json.records : []);
    if(!state.records.length) throw new Error("The database contains no journal records.");
    setText("#dbState","Ready"); setText("#recordCount",state.records.length.toLocaleString());
    setText("#datasetVersion",clean(json.version)||"1.0");
    $("#datasetPill").textContent=`${state.records.length.toLocaleString()} journal records`;
    buildQuickChips();
  }catch(err){
    setText("#dbState","Error"); $("#datasetPill").textContent="Database error";
    showToast(err.message);
    $("#resultsSection").hidden=false;
    $("#resultsList").innerHTML=`<div class="error-box"><strong>Journal database could not be loaded.</strong><br>${esc(err.message)}<br><br>Make sure <code>data/journals.json</code> is published with the site.</div>`;
  }
}
function setText(sel,text){const el=$(sel);if(el)el.textContent=text}
function buildQuickChips(){
  const picks=state.records.slice(0,3).map(r=>({t:clean(val(r,"title")),i:clean(val(r,"issn"))})).filter(x=>x.t);
  $("#quickChips").innerHTML=picks.map(x=>`<button class="chip" data-q="${esc(x.i||x.t)}">${esc(x.t)}${x.i?` · ${esc(formatIssn(x.i))}`:""}</button>`).join("");
}
function scoreMatch(r,q){
  const nq=norm(q), ni=normIssn(q);
  const title=norm(val(r,"title")), issn=normIssn(val(r,"issn")), eissn=normIssn(val(r,"eissn")), pub=norm(val(r,"publisher"));
  if(ni && (ni===issn || ni===eissn)) return 1000;
  if(title===nq) return 950;
  let s=0;
  if(title.includes(nq)) s+=500;
  const qTokens=nq.split(/\s+/).filter(Boolean), tTokens=new Set(title.split(/\s+/));
  const overlap=qTokens.filter(x=>tTokens.has(x)).length;
  s += overlap * 80;
  if(pub.includes(nq)) s+=40;
  const prefix=nq.slice(0,Math.min(12,nq.length));
  if(prefix && title.startsWith(prefix)) s+=50;
  return s;
}
function searchDB(q){
  q=clean(q); state.query=q;
  if(!q) return [];
  return state.records.map(r=>({r,s:scoreMatch(r,q)})).filter(x=>x.s>0).sort((a,b)=>b.s-a.s).slice(0,8).map(x=>x.r);
}
function addRecent(q){
  const x=clean(q); if(!x)return;
  state.recent=[x,...state.recent.filter(v=>norm(v)!==norm(x))].slice(0,5);
  localStorage.setItem("jc_recent",JSON.stringify(state.recent)); renderRecent();
}
function renderRecent(){
  const wrap=$("#recentWrap"), box=$("#recentChips");
  if(!state.recent.length){wrap.hidden=true;return}
  wrap.hidden=false; box.innerHTML=state.recent.map(q=>`<button class="chip" data-q="${esc(q)}">${esc(q)}</button>`).join("");
}
function doSearch(q){
  if(!state.records.length){showToast("Database is still loading.");return}
  q=clean(q||$("#journalInput").value);
  if(!q){showToast("Enter a journal title, ISSN or eISSN.");$("#journalInput").focus();return}
  $("#journalInput").value=q; addRecent(q); setText("#searchState","Searching");
  state.results=searchDB(q);
  renderResults();
  setText("#searchState",state.results.length ? `${state.results.length} found` : "No match");
}
function renderResults(){
  $("#resultsSection").hidden=false; $("#detailSection").hidden=true;
  setText("#resultTitle",`${state.results.length} result${state.results.length===1?"":"s"} for “${state.query}”`);
  if(!state.results.length){$("#resultsList").innerHTML=`<div class="empty">No close journal match was found. Try the exact ISSN/eISSN or a shorter title.</div>`;return}
  $("#resultsList").innerHTML=state.results.map((r,i)=>{
    const concern=calcConcern(r);
    return `<article class="result-card">
      <div><div class="match-tag">${i===0?"BEST MATCH":"MATCH "+(i+1)}</div>
      <h3>${esc(val(r,"title")||"Untitled journal")}</h3><div class="publisher">${esc(val(r,"publisher")||"Publisher not available")}</div>
      <div class="mini-meta"><span>ISSN <b>${esc(formatIssn(val(r,"issn"))||"—")}</b></span><span>eISSN <b>${esc(formatIssn(val(r,"eissn"))||"—")}</b></span></div></div>
      <div class="score-mini"><div class="score-ring">${concern.score}</div><div class="score-label">concern score</div></div>
      <button class="primary-btn open-result" data-index="${i}" type="button">View profile →</button>
    </article>`;
  }).join("");
  $$(".open-result").forEach(b=>b.addEventListener("click",()=>selectResult(Number(b.dataset.index))));
}
function selectResult(i){
  state.selected=state.results[i]; renderDetail(state.selected);
  $("#detailSection").hidden=false; $("#detailSection").scrollIntoView({behavior:"smooth",block:"start"});
  verifyExternal(state.selected);
}
function calcConcern(r, external={}){
  let score=0, factors=[];
  const add=(pts,label,why)=>{score+=pts;factors.push({pts,label,why})};
  const issn=val(r,"issn"), eissn=val(r,"eissn"), title=val(r,"title"), pub=val(r,"publisher");
  if(!title) add(25,"Journal title missing","Identity data is incomplete.");
  if(!issn && !eissn) add(20,"No ISSN/eISSN","A persistent journal identifier is unavailable in this record.");
  if(!pub) add(10,"Publisher missing","Publisher information is not present in the local record.");
  const indexKeys=["scie","ssci","ahci","esci","jcr","scopus"];
  const yes=indexKeys.filter(k=>boolValue(val(r,k))===true).length;
  if(yes===0) add(18,"No major index signal in dataset","None of SCIE, SSCI, AHCI, ESCI, JCR or Scopus is marked positive in this dataset.");
  else if(yes===1) add(6,"Limited index coverage","Only one major index field is positive in this dataset.");
  if(boolValue(val(r,"scopus"))===true && boolValue(val(r,"scopusActive"))===false) add(10,"Scopus not active","The dataset distinguishes Scopus presence from current active status.");
  const doaj=external.doaj;
  if(doaj?.status==="verified") { /* positive evidence, never subtract as a quality guarantee */ }
  if(external.crossref?.status==="verified") { /* metadata presence is neutral */ }
  if(external.openalex?.status==="verified") { /* metadata presence is neutral */ }
  const normalized=Math.min(100,score);
  let level=normalized<20?"low":normalized<40?"moderate":normalized<60?"high":"extreme";
  return {score:normalized,level,factors};
}
function concernClass(level){return level}
function renderDetail(r){
  const concern=calcConcern(r, state.externalCache.get(formatIssn(val(r,"issn")||val(r,"eissn"))) || {});
  const index=[
    ["SCIE","scie"],["SSCI","ssci"],["AHCI","ahci"],["ESCI","esci"],["JCR 2025","jcr"],["Scopus","scopus"],["Scopus Active","scopusActive"]
  ];
  $("#detail").innerHTML=`<div class="detail-shell">
    <div class="detail-hero">
      <div class="detail-top"><div><div class="match-tag">JOURNAL PROFILE</div>
        <h2 class="detail-title">${esc(val(r,"title")||"Untitled journal")}</h2>
        <div class="detail-pub">${esc(val(r,"publisher")||"Publisher not available")}</div></div>
        <div class="concern ${concernClass(concern.level)}"><b>${concern.level[0].toUpperCase()+concern.level.slice(1)} concern</b><small>${concern.score}/100 screening score</small></div>
      </div>
      <div class="identity-grid">
        ${info("ISSN",formatIssn(val(r,"issn"))||"Not available")}
        ${info("eISSN",formatIssn(val(r,"eissn"))||"Not available")}
        ${info("Country",val(r,"country")||"Not available")}
        ${info("Language",val(r,"language")||"Not available")}
      </div>
    </div>
    <div class="detail-body">
      <div class="detail-grid">
        <div><h3 class="panel-title">Indexing profile</h3><div class="index-grid">${index.map(([n,k])=>`<div class="index-item"><div class="index-name">${n}</div>${badge(val(r,k))}</div>`).join("")}</div>
          <div class="risk-panel"><div class="risk-top"><div><h3 class="panel-title">Concern screening</h3><div style="font-size:12px;color:var(--muted)">Transparent rule-based screening; not a predatory-journal verdict.</div></div><div class="risk-score">${concern.score}<small>/100</small></div></div>
          <div class="risk-scale"></div><div class="risk-list">${concern.factors.length?concern.factors.map(f=>`<div class="risk-factor"><span>${esc(f.label)}</span><span>+${f.pts}</span></div>`).join(""):`<div class="risk-factor"><span>No material concern flags from the current local fields.</span><span>0</span></div>`}</div>
          <div class="disclaimer">A low score does not prove a journal is trustworthy, and a high score does not prove misconduct. Confirm critical claims at the relevant official source before submitting.</div></div>
        </div>
        <div><h3 class="panel-title">External confirmation</h3><div id="externalChecks" class="external-list">
          ${externalRow("DOAJ",externalNote("doaj","Checking live ISSN record…"),"doaj")}
          ${externalRow("OpenAlex",externalNote("openalex","Checking source record…"),"openalex")}
          ${externalRow("Crossref",externalNote("crossref","Checking journal metadata…"),"crossref")}
          ${externalRow("ISSN / ROAD","Official source search link","road",false)}
        </div>
        <div style="margin-top:14px;font-size:11px;color:var(--muted);line-height:1.55">External services are separate evidence streams. Presence in a discovery/metadata service is not, by itself, a quality endorsement.</div>
        </div>
      </div>
    </div>
  </div>`;
}
function info(k,v){return `<div class="info-box"><small>${k}</small><strong>${esc(v)}</strong></div>`}
function externalNote(key,fallback){
  const c=state.externalCache.get(formatIssn(val(state.selected,"issn")||val(state.selected,"eissn")));
  return c?.[key]?.note || fallback;
}
function externalRow(name,note,key,checking=true){
  const r=state.selected, issn=formatIssn(val(r,"issn")||val(r,"eissn"));
  const cached=state.externalCache.get(issn)?.[key];
  let href="";
  if(key==="road") href=`https://road.issn.org/?search=${encodeURIComponent(issn||val(r,"title"))}`;
  if(key==="doaj") href=`https://doaj.org/search/journals/${encodeURIComponent(issn?`issn:${issn}`:val(r,"title"))}`;
  const status=cached?.status;
  const badgeHtml=checking?`<span class="badge ${status==="verified"?"yes":status==="not-found"?"no":"na"} status-badge">${status==="verified"?"✓ Confirmed":status==="not-found"?"× Not found":status==="error"?"! Check manually":"…"}</span>`:"";
  if(cached?.href) href=cached.href;
  return `<div class="external-item" data-external="${key}"><div><div class="external-name">${name}</div><div class="external-note">${esc(note)}</div></div><div class="external-actions">${badgeHtml}${href?`<a class="source-btn" href="${href}" target="_blank" rel="noopener">Open source ↗</a>`:""}</div></div>`;
}
async function verifyExternal(r){
  const issn=formatIssn(val(r,"issn")||val(r,"eissn"));
  if(!issn){ updateExternal("doaj","na","No ISSN/eISSN available");updateExternal("openalex","na","No ISSN/eISSN available");updateExternal("crossref","na","No ISSN/eISSN available");return; }
  const [doaj,openalex,crossref]=await Promise.allSettled([checkDOAJ(issn),checkOpenAlex(issn),checkCrossref(issn)]);
  state.externalCache.set(issn,{doaj:resultOf(doaj),openalex:resultOf(openalex),crossref:resultOf(crossref)});
  updateExternal("doaj",resultOf(doaj).status,resultOf(doaj).note,resultOf(doaj).href);
  updateExternal("openalex",resultOf(openalex).status,resultOf(openalex).note,resultOf(openalex).href);
  updateExternal("crossref",resultOf(crossref).status,resultOf(crossref).note,resultOf(crossref).href);
  renderDetail(r);
}
function resultOf(x){return x.status==="fulfilled"?x.value:{status:"error",note:"External check unavailable right now."}}
async function fetchJSON(url,timeout=6500){
  const ctl=new AbortController(); const t=setTimeout(()=>ctl.abort(),timeout);
  try{const res=await fetch(url,{headers:{Accept:"application/json"},signal:ctl.signal});if(!res.ok)throw new Error(String(res.status));return await res.json()}finally{clearTimeout(t)}
}
async function checkDOAJ(issn){
  try{const d=await fetchJSON(`https://doaj.org/api/search/journals/issn:${encodeURIComponent(issn)}`);
    const ok=Number(d.total)>0; return {status:ok?"verified":"not-found",note:ok?"ISSN found in DOAJ.":"No DOAJ record found for this ISSN.",href:`https://doaj.org/search/journals/issn%3A${encodeURIComponent(issn)}`};
  }catch(e){return {status:"error",note:"DOAJ could not be reached from this browser.",href:`https://doaj.org/search/journals/issn%3A${encodeURIComponent(issn)}`}}
}
async function checkOpenAlex(issn){
  try{const d=await fetchJSON(`https://api.openalex.org/sources?filter=issn:${encodeURIComponent(issn)}&per-page=1`);
    const ok=Array.isArray(d.results)&&d.results.length>0; const id=ok?d.results[0].id:"";
    return {status:ok?"verified":"not-found",note:ok?"ISSN found as an OpenAlex source.":"No OpenAlex source matched this ISSN.",href:id||`https://openalex.org/sources?search=${encodeURIComponent(issn)}`};
  }catch(e){return {status:"error",note:"OpenAlex could not be reached from this browser.",href:`https://openalex.org/sources?search=${encodeURIComponent(issn)}`}}
}
async function checkCrossref(issn){
  try{const d=await fetchJSON(`https://api.crossref.org/journals/${encodeURIComponent(issn)}`);const title=d.message?.title;
    return {status:title?"verified":"not-found",note:title?`Crossref journal metadata found${title?`: ${title}`:""}.`:"No Crossref journal record found.",href:`https://api.crossref.org/journals/${encodeURIComponent(issn)}`};
  }catch(e){return {status:"error",note:"Crossref could not be reached from this browser.",href:`https://api.crossref.org/journals/${encodeURIComponent(issn)}`}}
}
function updateExternal(key,status,note,href){
  const row=$(`[data-external="${key}"]`);if(!row)return;
  const badgeEl=$(".status-badge",row), noteEl=$(".external-note",row), actions=$(".external-actions",row);
  noteEl.textContent=note;
  const label=status==="verified"?"✓ Confirmed":status==="not-found"?"× Not found":status==="na"?"— Not available":"! Check manually";
  badgeEl.className=`badge status-badge ${status==="verified"?"yes":status==="not-found"?"no":"na"}`; badgeEl.textContent=label;
  if(href && !$(".source-btn",actions)) actions.insertAdjacentHTML("beforeend",`<a class="source-btn" href="${href}" target="_blank" rel="noopener">Open source ↗</a>`);
}
function showToast(msg){const t=$("#toast");t.textContent=msg;t.classList.add("show");clearTimeout(showToast.t);showToast.t=setTimeout(()=>t.classList.remove("show"),3000)}
function initTheme(){
  const saved=localStorage.getItem("jc_theme"); if(saved)document.documentElement.dataset.theme=saved;
  $("#themeBtn").addEventListener("click",()=>{const next=document.documentElement.dataset.theme==="dark"?"light":"dark";document.documentElement.dataset.theme=next;localStorage.setItem("jc_theme",next)});
}
function init(){
  initTheme(); renderRecent(); loadDB();
  $("#searchBtn").addEventListener("click",()=>doSearch());
  $("#journalInput").addEventListener("keydown",e=>{if(e.key==="Enter")doSearch()});
  $("#clearBtn").addEventListener("click",()=>{state.query="";state.results=[];state.selected=null;$("#journalInput").value="";$("#resultsSection").hidden=true;$("#detailSection").hidden=true;setText("#searchState","Ready")});
  document.addEventListener("click",e=>{const q=e.target.closest("[data-q]")?.dataset.q;if(q){$("#journalInput").value=q;doSearch(q)}});
  $("#compareBtn").addEventListener("click",()=>showToast("Comparison view is reserved for the next multi-journal release."));
}
function syncQuery(){
  const p=new URLSearchParams(location.search), q=p.get("q"); if(q){$("#journalInput").value=q;setTimeout(()=>doSearch(q),300)}
}
init(); syncQuery();
