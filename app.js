(() => {
  "use strict";

  const DATABASE_URL = "./data/journals.json";
  const MAX_RESULTS = 20;
  const RECENT_KEY = "journalcheck_recent_searches_v2";

  const state = { database:null, records:[], entries:[], byId:new Map(), byTitle:new Map(), prepared:false, loadingPromise:null };
  const $ = (s,r=document) => r.querySelector(s);

  function normalize(v){return String(v??"").normalize("NFKD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g,"").trim()}
  function tokens(v){return String(v??"").normalize("NFKD").replace(/[\u0300-\u036f]/g,"").toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)}
  function escapeHTML(v){return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]))}
  function display(v){const s=String(v??"").trim();return s||"Not available"}
  function boolState(v){if(typeof v==='boolean')return v?'yes':'no';const s=String(v??"").trim().toLowerCase();if(["true","yes","active","indexed"].includes(s))return"yes";if(["false","no","inactive","not indexed"].includes(s))return"no";return"neutral"}
  function badge(v){const s=boolState(v);const t=s==='yes'?'✓ Yes':s==='no'?'✕ No':'Not available';return `<span class="badge ${s}">${t}</span>`}
  function status(v){const s=boolState(v);return s==='yes'?'Yes':s==='no'?'No':'Not available'}

  function setLoading(message,show=true){const el=$("#loading-status");if(!el)return;el.textContent=message;el.classList.toggle("hidden",!show)}

  function prepareDatabase(db){
    state.database=db;state.records=Array.isArray(db.records)?db.records:[];state.entries=[];state.byId.clear();state.byTitle.clear();
    state.records.forEach((j,index)=>{
      const i=normalize(j.i),e=normalize(j.e),t=normalize(j.t);
      const entry={journal:j,index,title:t,titleTokens:tokens(j.t),idKeys:[i,e].filter(Boolean)};
      state.entries.push(entry);
      entry.idKeys.forEach(k=>state.byId.set(k,entry));
      if(t&&!state.byTitle.has(t))state.byTitle.set(t,entry);
    });
    state.prepared=true;
    $("#database-count").textContent=state.records.length.toLocaleString();
    $("#database-version").textContent=display(db.version);
    $("#database-status-label").textContent="Ready";
    $("#database-status").className="dot ready";
  }

  async function loadDatabase(){
    if(state.prepared)return state.database;
    if(state.loadingPromise)return state.loadingPromise;
    state.loadingPromise=(async()=>{
      setLoading("Loading the master database…",true);
      try{
        const res=await fetch(`${DATABASE_URL}?v=20260831`,{cache:"no-store"});
        if(!res.ok)throw new Error(`Database request failed (HTTP ${res.status}).`);
        const db=await res.json();
        if(!db||!Array.isArray(db.records))throw new Error("Invalid database format.");
        prepareDatabase(db);setLoading("Database loaded.",false);return db;
      }catch(err){
        console.error("JournalCheck database error:",err);
        $("#database-status-label").textContent="Unavailable";$("#database-status").className="dot error";
        setLoading("The database could not be loaded. Check that data/journals.json exists and is valid JSON.",true);throw err;
      }finally{state.loadingPromise=null}
    })();
    return state.loadingPromise;
  }

  function score(entry,q,nq,qt){
    const j=entry.journal,title=entry.title,i=normalize(j.i),e=normalize(j.e);
    if(i===nq||e===nq)return 100000;
    if(title===nq)return 90000;
    let s=0;
    if(title.startsWith(nq))s+=6000;
    if(title.includes(nq))s+=4000;
    let exact=0,partial=0;
    for(const token of qt){
      if(entry.titleTokens.includes(token))exact++;
      else if(entry.titleTokens.some(tt=>tt.startsWith(token)))partial++;
      else if(token.length>=4&&entry.titleTokens.some(tt=>tt.includes(token)))partial+=.5;
    }
    s+=exact*900+partial*250;
    const publisher=normalize(j.p),categories=normalize(j.wc);
    if(publisher.includes(nq))s+=400;
    if(categories.includes(nq))s+=250;
    // Small similarity bonus for a partially typed title.
    if(nq.length>=5){let common=0;while(common<Math.min(nq.length,title.length)&&nq[common]===title[common])common++;s+=Math.min(common*20,300)}
    // Prefer journals over non-journal source types when otherwise tied.
    if(String(j.st).toLowerCase()==='journal')s+=10;
    return s;
  }

  function searchDatabase(query){
    const nq=normalize(query);if(!nq)return[];
    const id=state.byId.get(nq);if(id)return[{...id,score:100000}];
    const title=state.byTitle.get(nq);if(title)return[{...title,score:90000}];
    const qt=tokens(query),matches=[];
    for(const entry of state.entries){const s=score(entry,query,nq,qt);if(s>0)matches.push({...entry,score:s})}
    matches.sort((a,b)=>b.score-a.score||a.title.localeCompare(b.title));
    return matches.slice(0,MAX_RESULTS);
  }

  function info(label,v){return `<div class="info"><span>${escapeHTML(label)}</span><strong>${escapeHTML(display(v))}</strong></div>`}
  function indexCard(label,v){return `<div class="index-card"><span>${escapeHTML(label)}</span>${badge(v)}</div>`}

  function interpretation(j){
    const p=[];
    if(boolState(j.sa)==='yes')p.push("The dataset marks this source as Scopus Active.");
    else if(boolState(j.sco)==='yes')p.push("The dataset marks this source as Scopus-listed.");
    if(boolState(j.jcr)==='yes')p.push("The dataset marks this journal as present in JCR 2025.");
    const w=[j.scie,j.ssci,j.ahci,j.esci].some(v=>boolState(v)==='yes');
    if(w)p.push("At least one Web of Science collection field is marked positive in the dataset.");
    if(!p.length)p.push("No positive indexing statement was generated beyond the fields shown above.");
    return p;
  }

  function completeness(j){
    const keys=["t","i","e","p","c","l","wc","st","oa","cov","scie","ssci","ahci","esci","jcr","sco","sa"];
    const present=keys.filter(k=>j[k]!==undefined&&j[k]!==null&&(typeof j[k]==='boolean'||String(j[k]).trim()!=="")).length;
    return Math.round(present/keys.length*100);
  }

  function renderResults(matches,q){
    const section=$("#results");if(!section)return;
    if(!matches.length){section.innerHTML=`<div class="container"><div class="empty"><span class="eyebrow">Search result</span><h2>No matching journal found</h2><p>Nothing matching <strong>“${escapeHTML(q)}”</strong> was found in the current master dataset.</p><p>Try the full journal title, ISSN/eISSN, or a shorter distinctive part of the title.</p></div></div>`;return}
    const cards=matches.map((m,n)=>{
      const j=m.journal,points=interpretation(j).map(x=>`<li>${escapeHTML(x)}</li>`).join("");
      return `<article class="journal-card"><div class="card-top"><div><span class="match">${n===0?'BEST MATCH':'MATCH'}</span><h2 class="journal-title">${escapeHTML(display(j.t))}</h2><p class="publisher">${escapeHTML(display(j.p))}</p></div><button class="copy" data-index="${n}" type="button">Copy result</button></div>
      <div class="info-grid">${info('ISSN',j.i)}${info('eISSN',j.e)}${info('Country',j.c)}${info('Language',j.l)}</div>
      <h3>Indexing profile</h3><div class="index-grid">${indexCard('SCIE',j.scie)}${indexCard('SSCI',j.ssci)}${indexCard('AHCI',j.ahci)}${indexCard('ESCI',j.esci)}${indexCard('JCR 2025',j.jcr)}${indexCard('Scopus',j.sco)}${indexCard('Scopus Active',j.sa)}</div>
      <h3>Publication information</h3><div class="details">${info('Scopus source type',j.st)}${info('Scopus OA',j.oa)}${info('Coverage',j.cov)}${info('Subject categories',j.wc)}</div>
      <div class="interpret"><div class="interpret-box"><h4>Evidence-based interpretation</h4><ul>${points}</ul></div><div class="interpret-box scope"><h4>Risk screening</h4><p>JournalCheck does not label a journal predatory or safe from missing fields alone. This page reports the dataset evidence; it is not a live external verification.</p></div></div>
      <div class="card-footer"><span>Dataset completeness: ${completeness(j)}%</span><span>Result ${n+1} of ${matches.length}</span></div></article>`;
    }).join("");
    section.innerHTML=`<div class="container"><div class="result-head"><div><span class="eyebrow">Verified database search</span><h2>${matches.length} result${matches.length===1?'':'s'} for “${escapeHTML(q)}”</h2><div class="result-sub">Ranked by exact identifier, exact title, title relevance and indexed fields.</div></div><button class="secondary" id="print-results" type="button">Print results</button></div>${cards}<p class="disclaimer"><strong>Important:</strong> these results come from the current JournalCheck master dataset. They are not a live verification against Scopus, Clarivate/Web of Science, publishers, or other external services. Confirm critical submission requirements with the relevant official source before submitting.</p></div>`;
    section.querySelectorAll('.copy').forEach(btn=>btn.addEventListener('click',()=>copyResult(matches[Number(btn.dataset.index)].journal,btn)));
    $("#print-results",section)?.addEventListener('click',()=>window.print());
  }

  async function copyResult(j,btn){
    const text=[display(j.t),`Publisher: ${display(j.p)}`,`ISSN: ${display(j.i)}`,`eISSN: ${display(j.e)}`,`Country: ${display(j.c)}`,`Language: ${display(j.l)}`,`SCIE: ${status(j.scie)}`,`SSCI: ${status(j.ssci)}`,`AHCI: ${status(j.ahci)}`,`ESCI: ${status(j.esci)}`,`JCR 2025: ${status(j.jcr)}`,`Scopus: ${status(j.sco)}`,`Scopus Active: ${status(j.sa)}`,`Source type: ${display(j.st)}`,`Coverage: ${display(j.cov)}`,`JournalCheck master dataset`].join('\n');
    try{await navigator.clipboard.writeText(text);const old=btn.textContent;btn.textContent='Copied';setTimeout(()=>btn.textContent=old,1200)}catch{alert('Copy failed. Please copy the result manually.')}
  }

  function showError(msg){const el=$("#search-error");if(el){el.textContent=msg;el.classList.remove('hidden')}}
  function hideError(){$("#search-error")?.classList.add('hidden')}

  function saveRecent(q){try{const old=JSON.parse(localStorage.getItem(RECENT_KEY)||'[]');const next=[q,...old.filter(x=>x.toLowerCase()!==q.toLowerCase())].slice(0,5);localStorage.setItem(RECENT_KEY,JSON.stringify(next));renderRecent()}catch{}}
  function renderRecent(){const wrap=$("#recent-searches");if(!wrap)return;try{const items=JSON.parse(localStorage.getItem(RECENT_KEY)||'[]');wrap.innerHTML=items.length?`<span style="font-size:12px;color:#7b8799;padding:6px 2px">Recent:</span>${items.map(q=>`<button type="button" data-query="${escapeHTML(q)}">${escapeHTML(q)}</button>`).join('')}`:'';wrap.querySelectorAll('button').forEach(b=>b.addEventListener('click',()=>{ $("#journal").value=b.dataset.query;checkJournal(b.dataset.query)}))}catch{wrap.innerHTML=''}}

  async function checkJournal(explicit){
    const input=$("#journal"),button=$("#check-button"),q=String(explicit??input?.value??'').trim();
    if(!q){showError('Enter a journal name, ISSN or eISSN.');input?.focus();return}
    hideError();button.disabled=true;button.textContent='Checking…';
    try{await loadDatabase();const matches=searchDatabase(q);saveRecent(q);renderResults(matches,q);const url=new URL(location.href);url.searchParams.set('q',q);history.replaceState({},'',url)}
    catch(err){console.error(err);showError('The database could not be loaded. Please confirm that data/journals.json is present and valid, then refresh the page.')}
    finally{button.disabled=false;button.textContent='Check Journal'}
  }
  window.checkJournal=checkJournal;

  document.addEventListener('DOMContentLoaded',async()=>{
    const input=$("#journal"),button=$("#check-button");
    input?.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();checkJournal()}});
    button?.addEventListener('click',()=>checkJournal());
    $("#clear-button")?.addEventListener('click',()=>{input.value='';hideError();$("#results").innerHTML='';const url=new URL(location.href);url.searchParams.delete('q');history.replaceState({},'',url);input.focus()});
    document.querySelectorAll('[data-example]').forEach(b=>b.addEventListener('click',()=>{input.value=b.dataset.example;checkJournal(b.dataset.example)}));
    renderRecent();
    try{await loadDatabase()}catch(err){}
    const q=new URLSearchParams(location.search).get('q');if(q){input.value=q;checkJournal(q)}
  });
})();
