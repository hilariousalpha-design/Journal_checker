/* JournalCheck — external evidence layer
   Static-host friendly. External failures NEVER block local results.
   Sources: Crossref, OpenAlex, DOAJ, Google Scholar link.
   SJR is read only from the supplied SCImago 2025 dataset.
*/
(() => {
  'use strict';
  const CFG = {
    master: './data/journals.json',
    sjr: './data/scimagojr-2025-journalcheck.csv',
    timeout: 9000,
    politeMailto: ''
  };

  const clean = v => String(v ?? '').trim();
  const normIssn = v => clean(v).replace(/[^0-9Xx]/g, '').toUpperCase();
  const normTitle = v => clean(v).normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').replace(/\s+/g,' ').trim();
  const esc = v => clean(v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  async function request(url, ms = CFG.timeout, options = {}) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), ms);
    try {
      const r = await fetch(url, { ...options, signal: ctl.signal, cache: 'no-store' });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r;
    } finally { clearTimeout(timer); }
  }
  async function json(url, ms) { return (await request(url, ms, {headers:{Accept:'application/json'}})).json(); }
  async function text(url, ms) { return (await request(url, ms)).text(); }

  function parseCSV(text) {
    const rows=[]; let row=[], cell='', quoted=false;
    for(let i=0;i<text.length;i++){
      const c=text[i], n=text[i+1];
      if(quoted){
        if(c==='"' && n==='"'){cell+='"';i++;}
        else if(c==='"') quoted=false; else cell+=c;
      } else if(c==='"') quoted=true;
      else if(c===';'){row.push(cell);cell='';}
      else if(c==='\n'){row.push(cell);rows.push(row);row=[];cell='';}
      else if(c!=='\r') cell+=c;
    }
    if(cell.length || row.length){row.push(cell);rows.push(row);}
    if(!rows.length)return[];
    const headers=rows[0].map(x=>clean(x));
    return rows.slice(1).filter(r=>r.some(x=>clean(x))).map(r=>Object.fromEntries(headers.map((h,i)=>[h,r[i]??''])));
  }

  let masterPromise=null, sjrPromise=null;
  async function loadMaster(){
    if(!masterPromise) masterPromise=(async()=>{
      const d=await json(`${CFG.master}?v=${Date.now()}`,20000);
      const records=Array.isArray(d)?d:(Array.isArray(d.records)?d.records:[]);
      if(!records.length) throw new Error('Master database contains no records.');
      return {version:d.version||'1.0',record_count:d.record_count||records.length,records};
    })();
    return masterPromise;
  }

  async function loadLocalSJR(){
    if(!sjrPromise) sjrPromise=(async()=>{
      try{
        const rows=parseCSV(await text(`${CFG.sjr}?v=${Date.now()}`,30000));
        const byIssn=new Map();
        for(const r of rows){
          const item={rank:r.Rank||null,sourceId:r.Sourceid||null,title:r.Title||null,issn:r.Issn||null,publisher:r.Publisher||null,openAccess:r['Open Access']||null,sjr:r.SJR||null,quartile:r['SJR Best Quartile']||null,hIndex:r['H index']||null,coverage:r.Coverage||null,categories:r.Categories||null,areas:r.Areas||null,country:r.Country||null};
          String(item.issn||'').split(/[\s,;]+/).map(normIssn).filter(x=>x.length>=7).forEach(id=>byIssn.set(id,item));
        }
        return {ok:true,count:rows.length,byIssn};
      }catch(e){return {ok:false,count:0,byIssn:new Map(),error:e.message};}
    })();
    return sjrPromise;
  }

  function field(r,names){for(const n of names){if(r && r[n]!==undefined && clean(r[n])!=='')return r[n];}return ''}
  function journal(r){return {raw:r,title:field(r,['t','title','journal','journal_title','name']),issn:field(r,['i','issn','ISSN','pissn']),eissn:field(r,['e','eissn','EISSN','online_issn']),publisher:field(r,['p','publisher','publisher_name']),country:field(r,['c','country']),language:field(r,['l','language','lang']),scie:field(r,['scie','SCIE']),ssci:field(r,['ssci','SSCI']),ahci:field(r,['ahci','AHCI']),esci:field(r,['esci','ESCI']),jcr:field(r,['jcr','jcr_2025','JCR 2025']),scopus:field(r,['sco','scopus','Scopus']),scopusActive:field(r,['sa','scopus_active','scopusActive','active']),scopusType:field(r,['st','scopus_source_type','source_type']),scopusOA:field(r,['oa','scopus_oa','open_access']),scopusCoverage:field(r,['cov','scopus_coverage','coverage']),scopusId:field(r,['scopus_id','source_id','sourceid']),scopusSubject:field(r,['scopus_subject','subject']),website:field(r,['website','url','journal_url','homepage'])};}

  function similarity(a,b){
    const A=new Set(normTitle(a).split(' ').filter(Boolean)), B=new Set(normTitle(b).split(' ').filter(Boolean));
    if(!A.size||!B.size)return 0; let n=0; A.forEach(x=>B.has(x)&&n++); return n/Math.max(A.size,B.size);
  }
  function findMaster(records,q){
    const query=clean(q), qi=normIssn(query);
    if(qi.length>=7){for(const raw of records){const j=journal(raw);const ids=[j.issn,j.eissn].flatMap(v=>String(v).split(/[\s,;]+/).map(normIssn));if(ids.includes(qi))return j;}}
    const nq=normTitle(query); let best=null;
    for(const raw of records){const j=journal(raw);const nt=normTitle(j.title);if(!nt)continue;let s=similarity(nt,nq)*100;if(nt===nq)s+=150;if(nt.startsWith(nq)&&nq.length>3)s+=45;if(nt.includes(nq)&&nq.length>4)s+=30;if(!best||s>best.score)best={score:s,journal:j};}
    return best&&best.score>=28?best.journal:null;
  }

  async function crossref(j){
    const ids=[j.issn,j.eissn].flatMap(v=>String(v).split(/[\s,;]+/)).map(normIssn).filter(x=>x.length>=7);
    for(const id of ids){
      try{
        const d=await json(`https://api.crossref.org/v1/journals/${encodeURIComponent(id)}${CFG.politeMailto?`?mailto=${encodeURIComponent(CFG.politeMailto)}`:''}`,7000);
        const m=d.message||{};
        return {found:!!m.title,title:Array.isArray(m.title)?m.title.join(' '):m.title||null,publisher:m.publisher||null,issns:m.ISSN||[],works:m.counts?.['total-dois']??null,url:`https://api.crossref.org/v1/journals/${encodeURIComponent(id)}`};
      }catch(_){/* try next identifier */}
    }
    return {found:false,url:`https://api.crossref.org/journals/${encodeURIComponent(normIssn(j.eissn||j.issn))}`};
  }

  function openAlexNorm(s){return {found:true,id:s.id||null,title:s.display_name||null,publisher:s.host_organization_name||null,issns:[s.issn_l,...(s.issn||[])].filter(Boolean),works:s.works_count??null,citations:s.cited_by_count??null,hIndex:s.summary_stats?.h_index??null,i10Index:s.summary_stats?.i10_index??null,isOA:s.is_oa??null,isDOAJ:s.is_in_doaj??null,homepage:s.homepage_url||null,url:s.id||'https://openalex.org/'};}
  async function openalex(j){
    const ids=[j.issn,j.eissn].flatMap(v=>String(v).split(/[\s,;]+/)).map(normIssn).filter(x=>x.length>=7);
    for(const id of ids){
      try{const d=await json(`https://api.openalex.org/sources/issn:${encodeURIComponent(id)}`,7000);if(d?.id)return openAlexNorm(d);}catch(_){}
      try{const d=await json(`https://api.openalex.org/sources?filter=issn:${encodeURIComponent(id)}&per-page=5`,7000);if(d?.results?.[0]?.id)return openAlexNorm(d.results[0]);}catch(_){}
    }
    if(j.title){try{const d=await json(`https://api.openalex.org/sources?search=${encodeURIComponent(j.title)}&per-page=10`,7000);const best=(d.results||[]).map(s=>({s,score:similarity(j.title,s.display_name)})).sort((a,b)=>b.score-a.score)[0];if(best&&best.score>=.65)return openAlexNorm(best.s);}catch(_){}
    }
    return {found:false,url:'https://openalex.org/'};
  }

  async function doaj(j){
    const ids=[j.issn,j.eissn].flatMap(v=>String(v).split(/[\s,;]+/)).map(normIssn).filter(x=>x.length>=7);
    for(const id of ids){
      const urls=[`https://doaj.org/api/search/journals/issn:${encodeURIComponent(id)}?page=1&pageSize=1`,`https://doaj.org/api/search/journal.issn:${encodeURIComponent(id)}?page=1&pageSize=1`];
      for(const u of urls){try{const d=await json(u,7000);const total=Number(d.total??d.meta?.count??0);return {found:total>0,total,record:d.results?.[0]?.bibjson||null,url:`https://doaj.org/?func=search&query=issn%3A${encodeURIComponent(id)}`};}catch(_){} }
    }
    return {found:false,url:`https://doaj.org/?func=search&query=${encodeURIComponent(j.title||'')}`};
  }

  function scholar(j){return {automated:false,url:`https://scholar.google.com/scholar?q=${encodeURIComponent(`"${j.title||''}" ${j.issn||j.eissn||''}`.trim())}`};}

  function evidence(j,sjr,cr,oa,dj){return {journal:j,sjr,crossref:cr,openalex:oa,doaj:dj,googleScholar:scholar(j)};}

  function concern(result){
    const j=result.journal, signals=[]; let score=0;
    if(result.crossref?.found && result.crossref.title && similarity(j.title,result.crossref.title)<.55){score+=30;signals.push({points:30,label:'Crossref identity mismatch',detail:'The Crossref journal title does not closely match the master record for the supplied identifier.'});}
    if(result.openalex?.found){const expected=[j.issn,j.eissn].flatMap(v=>String(v).split(/[\s,;]+/)).map(normIssn).filter(x=>x.length>=7);const actual=(result.openalex.issns||[]).map(normIssn);if(expected.length&&actual.length&&!expected.some(x=>actual.includes(x))){score+=30;signals.push({points:30,label:'OpenAlex identifier mismatch',detail:'OpenAlex returned a source whose ISSN identifiers do not align with the journal record.'});}}
    if(result.crossref?.found && result.crossref.publisher && j.publisher && similarity(result.crossref.publisher,j.publisher)<.35){score+=15;signals.push({points:15,label:'Publisher metadata mismatch',detail:'Publisher metadata differs materially between the local record and Crossref.'});}
    if(j.scopus==='Yes' && j.scopusActive==='No'){score+=10;signals.push({points:10,label:'Scopus status needs attention',detail:'The master dataset marks the journal as Scopus indexed but not currently active.'});}
    const band=score>=75?'Extreme concern':score>=50?'High concern':score>=25?'Moderate concern':'Low concern';
    return {score,band,signals,disclaimer:'This is an evidence-screening profile, not a definitive predatory-journal verdict. Missing DOAJ, SJR, Crossref or OpenAlex data is not itself a misconduct finding.'};
  }

  async function checkJournal(query){
    const [master,sjrdb]=await Promise.all([loadMaster(),loadLocalSJR()]);
    const j=findMaster(master.records,query);
    if(!j)return {found:false,query,database:{records:master.record_count,version:master.version,sjrRecords:sjrdb.count,sjrLoaded:sjrdb.ok}};
    let sjr=null; for(const id of [j.issn,j.eissn].flatMap(v=>String(v).split(/[\s,;]+/)).map(normIssn)){if(sjrdb.byIssn.has(id)){sjr=sjrdb.byIssn.get(id);break;}}
    const [cr,oa,dj]=await Promise.all([crossref(j).catch(()=>({found:false})),openalex(j).catch(()=>({found:false})),doaj(j).catch(()=>({found:false}))]);
    const result=evidence(j,sjr,cr,oa,dj); const risk=concern(result);
    return {found:true,result,risk,database:{records:master.record_count,version:master.version,sjrRecords:sjrdb.count,sjrLoaded:sjrdb.ok}};
  }

  window.JournalCheckSources={checkJournal,loadMaster,loadLocalSJR,findMaster,concern};
})();
