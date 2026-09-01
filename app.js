/* JournalCheck — final UI controller */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const esc = v => String(v ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const clean = v => String(v ?? '').trim();
  const display = v => clean(v) || 'Not available';
  const bool = v => ['true','yes','active','indexed'].includes(clean(v).toLowerCase());
  const no = v => ['false','no','inactive','not indexed'].includes(clean(v).toLowerCase());
  const normIssn = v => clean(v).replace(/[^0-9Xx]/g,'').toUpperCase();

  let current=null, searchTimer=null;

  function setStatus(label,ok=true){
    $('db-status').textContent=label;
    $('db-dot').className='dot '+(ok?'ok':'bad');
  }
  function badge(v){
    if(bool(v))return '<span class="badge yes">✓ Yes</span>';
    if(no(v))return '<span class="badge no">✕ No</span>';
    return '<span class="badge na">— Not available</span>';
  }
  function statusText(v){return bool(v)?'Included':no(v)?'Not included':'Not available';}
  function sourceCard(name,state,url,detail){
    return `<div class="source"><h4>${esc(name)} <span class="source-state">${esc(state)}</span></h4><p>${esc(detail)}</p>${url?`<a target="_blank" rel="noopener noreferrer" href="${esc(url)}">Open official/source record ↗</a>`:''}</div>`;
  }

  function renderNotFound(query,db){
    $('results-inner').innerHTML=`<div class="empty"><div class="eyebrow">No confident match</div><h2>No journal found for “${esc(query)}”</h2><p>Try the exact journal title, print ISSN or eISSN. The local database contains ${Number(db.records||0).toLocaleString()} records.</p><div class="note">A failed external lookup does not create a risk finding. Search again using an identifier for the strongest match.</div></div>`;
  }

  function renderError(message){
    $('results-inner').innerHTML=`<div class="empty"><div class="eyebrow">Search error</div><h2>The result could not be displayed</h2><p>${esc(message)}</p><div class="note">The application is designed so Crossref, OpenAlex or DOAJ failures do not block the local database result. If this message persists, verify that <strong>data/journals.json</strong> exists in the deployed repository.</div></div>`;
  }

  function criteriaRows(r,ext,sjr){
    const rows=[
      ['Journal identity','Title + ISSN/eISSN + publisher',r.title&&(r.issn||r.eissn)?'Included':'Incomplete','Local master dataset'],
      ['Web of Science — SCIE', 'Science Citation Index Expanded',statusText(r.scie),'Local master dataset'],
      ['Web of Science — SSCI','Social Sciences Citation Index',statusText(r.ssci),'Local master dataset'],
      ['Web of Science — AHCI','Arts & Humanities Citation Index',statusText(r.ahci),'Local master dataset'],
      ['Web of Science — ESCI','Emerging Sources Citation Index',statusText(r.esci),'Local master dataset'],
      ['JCR 2025','Journal Citation Reports coverage',statusText(r.jcr),'Local master dataset'],
      ['Scopus','Scopus source record',statusText(r.scopus),'Local master dataset'],
      ['Scopus Active','Currently active in supplied dataset',statusText(r.scopusActive),'Local master dataset'],
      ['SJR','SCImago 2025 journal record',sjr?'Included':'Not available','Supplied SCImago dataset'],
      ['SJR Best Quartile','Q1 / Q2 / Q3 / Q4',sjr?.quartile||'Not available','Supplied SCImago dataset'],
      ['SJR H-index','SCImago H-index',sjr?.hIndex||'Not available','Supplied SCImago dataset'],
      ['DOAJ','Open-access directory confirmation',ext.doaj?.found===true?'Confirmed':ext.doaj?.found===false?'Not confirmed':'Not verified','DOAJ'],
      ['Crossref','Journal metadata confirmation',ext.crossref?.found?'Confirmed':'Not confirmed','Crossref'],
      ['OpenAlex','Scholarly source confirmation',ext.openalex?.found?'Confirmed':'Not confirmed','OpenAlex'],
      ['Google Scholar','Citation/profile check', 'Manual check','Google Scholar — no scraping'],
      ['COPE','Ethics membership/claim',r.raw?.cope?display(r.raw.cope):'Not available','Master dataset / verify officially']
    ];
    return rows.map(x=>`<tr><td><strong>${esc(x[0])}</strong></td><td>${esc(x[1])}</td><td>${esc(x[2])}</td><td>${esc(x[3])}</td></tr>`).join('');
  }

  function render(payload){
    const r=payload.result.journal, ext=payload.result, sjr=payload.result.sjr, risk=payload.risk;
    const q=risk.score;
    const marker=Math.max(0,Math.min(100,q));
    const index=[['SCIE',r.scie],['SSCI',r.ssci],['AHCI',r.ahci],['ESCI',r.esci],['JCR 2025',r.jcr],['Scopus',r.scopus],['Scopus Active',r.scopusActive]];
    const oa=ext.openalex, cr=ext.crossref, dj=ext.doaj;
    const externalHtml=[
      sourceCard('Crossref',cr?.found?'✓ Confirmed':'— Not confirmed',cr?.url||`https://api.crossref.org/journals/${normIssn(r.issn||r.eissn)}`,cr?.found?`Title: ${cr.title||'Not available'} · registered DOI works: ${cr.works??'Not available'}`:'No matching journal record returned by the live request.'),
      sourceCard('OpenAlex',oa?.found?'✓ Confirmed':'— Not confirmed',oa?.url||'https://openalex.org/',oa?.found?`Works: ${oa.works??'Not available'} · citations: ${oa.citations??'Not available'} · OpenAlex H-index: ${oa.hIndex??'Not available'}`:'No matching source returned by the live request.'),
      sourceCard('DOAJ',dj?.found?'✓ Confirmed':'— Not confirmed',dj?.url||'https://doaj.org/',dj?.found?'The journal was returned by the DOAJ query.':'DOAJ did not confirm the journal in this browser request.'),
      sourceCard('Google Scholar','Manual verification',ext.googleScholar?.url||'https://scholar.google.com/', 'Google Scholar is provided as a direct verification link. JournalCheck does not scrape Scholar or present an invented citation/H-index value.')
    ].join('');

    $('results-inner').innerHTML=`
      <div class="resulthead"><div><div class="eyebrow">Best match</div><h2>${esc(r.title)}</h2><div class="subtle">${esc(display(r.publisher))}</div></div><button class="outline" id="print-result">Print / Save PDF</button></div>
      <article class="card">
        <div class="grid4">${[['ISSN',r.issn],['eISSN',r.eissn],['Country',r.country],['Language',r.language]].map(x=>`<div class="cell"><small>${esc(x[0])}</small><strong>${esc(display(x[1]))}</strong></div>`).join('')}</div>
        <div class="section-title">Indexing profile</div>
        <div class="indexgrid">${index.map(x=>`<div class="indexcard"><span class="name">${esc(x[0])}</span>${badge(x[1])}</div>`).join('')}</div>
        <div class="section-title">Scopus & publication information</div>
        <div class="grid4">${[['Source type',r.scopusType],['Scopus OA',r.scopusOA],['Coverage',r.scopusCoverage],['Scopus Source ID',r.scopusId],['Subject',r.scopusSubject]].map(x=>`<div class="cell"><small>${esc(x[0])}</small><strong>${esc(display(x[1]))}</strong></div>`).join('')}</div>
        <div class="section-title">SCImago Journal & Country Rank — 2025 supplied dataset</div>
        <div class="metrics">${[['SJR',sjr?.sjr],['Best Quartile',sjr?.quartile],['SJR H-index',sjr?.hIndex],['SJR Rank',sjr?.rank],['Coverage',sjr?.coverage]].map(x=>`<div class="metric"><small>${esc(x[0])}</small><strong>${esc(display(x[1]))}</strong><em>SCImago 2025 file</em></div>`).join('')}</div>
        ${sjr?`<div class="note">SJR categories: ${esc(display(sjr.categories))}<br>Country: ${esc(display(sjr.country))} · Open access flag in SJR: ${esc(display(sjr.openAccess))}</div>`:'<div class="note">No SJR row was matched by the supplied ISSN/eISSN. This is a data-coverage result, not a quality or predatory-journal finding.</div>'}
        <div class="section-title">External confirmations</div><div class="external">${externalHtml}</div>
        <div class="risk"><div class="riskhead"><div><h3>Concern screening</h3><div class="subtle">Evidence-led screening; not a predatory-journal verdict.</div></div><div class="score">${q}/100</div></div><div class="bar"><span class="marker" style="left:${marker}%"></span></div><div class="riskband">${esc(risk.band)}</div>${risk.signals.length?`<ul class="signals">${risk.signals.map(s=>`<li><strong>+${s.points}</strong> ${esc(s.label)} — ${esc(s.detail)}</li>`).join('')}</ul>`:'<div class="note">No current high-confidence concern signal was triggered by the implemented rules.</div>'}<div class="note">${esc(risk.disclaimer)}</div></div>
        <div class="criteria"><div class="section-title">JournalCheck criteria — what this journal has and does not have</div><div style="overflow:auto"><table><thead><tr><th>Criterion</th><th>What we evaluate</th><th>Journal result</th><th>Evidence source</th></tr></thead><tbody>${criteriaRows(r,ext,sjr)}</tbody></table></div><div class="note"><strong>Decision rule:</strong> positive indexing/metric evidence is shown separately from concern signals. Missing information is not automatically scored as misconduct. Confirm critical submission claims at the relevant official database.</div></div>
      </article>`;
    $('print-result').onclick=()=>window.print();
    current=payload;
  }

  async function search(raw){
    const q=clean(raw??$('journal').value);
    if(!q){$('search-error').textContent='Enter a journal title, ISSN or eISSN.';$('search-error').classList.remove('hidden');return;}
    const btn=$('check-button'); btn.disabled=true; btn.textContent='Checking…'; $('search-error').classList.add('hidden');
    $('results-inner').innerHTML='<div class="empty"><div class="eyebrow">Searching</div><h2>Checking the journal record…</h2><p>Local indexing and SJR data load first. External sources are optional enrichment and cannot block the result.</p></div>';
    $('results').scrollIntoView({behavior:'smooth',block:'start'});
    try{
      const p=await window.JournalCheckSources.checkJournal(q);
      if(!p.found){renderNotFound(q,p.database||{});return;}
      render(p);
      const u=new URL(location.href);u.searchParams.set('q',q);history.replaceState({},'',u.pathname+u.search+'#results');
      try{const old=JSON.parse(localStorage.getItem('jc_recent')||'[]').filter(x=>x.toLowerCase()!==q.toLowerCase());localStorage.setItem('jc_recent',JSON.stringify([q,...old].slice(0,6)));renderRecent();}catch(_){ }
      setTimeout(()=>document.getElementById('results')?.scrollIntoView({behavior:'smooth',block:'start'}),50);
    }catch(e){console.error('JournalCheck search error:',e);renderError(e?.message||'Unknown error.');}
    finally{btn.disabled=false;btn.textContent='Check journal →';}
  }

  function renderRecent(){
    try{const a=JSON.parse(localStorage.getItem('jc_recent')||'[]');$('recent-searches').innerHTML=a.length?'<span class="subtle">Recent:</span>'+a.map(q=>`<button class="pillbtn" data-recent="${esc(q)}">${esc(q)}</button>`).join(''):'';document.querySelectorAll('[data-recent]').forEach(b=>b.onclick=()=>{ $('journal').value=b.dataset.recent;search(b.dataset.recent); });}catch(_){ }
  }

  async function init(){
    renderRecent();
    $('check-button').addEventListener('click',()=>search());
    $('journal').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();search();}});
    $('clear-button').addEventListener('click',()=>{$('journal').value='';$('search-error').classList.add('hidden');$('results-inner').innerHTML='<div class="empty"><div class="eyebrow">Ready</div><h2>Search for a journal</h2><p>Your complete evidence panel will appear here.</p></div>';history.replaceState({},'',location.pathname);$('journal').focus();});
    document.querySelectorAll('[data-example]').forEach(b=>b.addEventListener('click',()=>{$('journal').value=b.dataset.example;search(b.dataset.example);}));
    try{
      const master=await window.JournalCheckSources.loadMaster();
      $('record-count').textContent=Number(master.record_count||master.records.length).toLocaleString();
      $('dataset-version').textContent=display(master.version); setStatus('Ready',true);
    }catch(e){setStatus('Error',false);$('record-count').textContent='—';$('dataset-version').textContent='—';$('search-error').textContent=`Database could not be loaded: ${e.message}. Confirm data/journals.json is deployed.`;$('search-error').classList.remove('hidden');}
    try{const sjr=await window.JournalCheckSources.loadLocalSJR();$('sjr-status').textContent=sjr.ok?`${Number(sjr.count).toLocaleString()} records`:'Unavailable';}catch(_){$('sjr-status').textContent='Unavailable';}
    const q=new URLSearchParams(location.search).get('q'); if(q){$('journal').value=q;await search(q);}
  }
  document.addEventListener('DOMContentLoaded',init);
})();
