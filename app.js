/* ================================================================
   app.js  –  Labour Productivity Dashboard
================================================================ */
'use strict';

/* ── Column indices in records ── */
const R_YEAR = 0, R_SEC = 1, R_SUB = 2, R_IND = 3, R_VAL = 4;

const CHART_COLOURS = [
  '#60a5fa','#f5a623','#34d399','#a78bfa','#fb7185',
  '#2dd4bf','#fbbf24','#818cf8','#f97316','#06b6d4'
];
const CHART_ALPHAS = CHART_COLOURS.map(c => c + 'cc');

let DB = null, filtered = [];
let detailPage = 1;
const PAGE_SIZE = 100;

let trendChart=null, top10Chart=null, sectorChart=null, yoyChart=null, bottom10Chart=null;

/* ── Destroy chart helper ── */
function destroyChart(ch) { if (ch) ch.destroy(); }

/* ── Formatters ── */
function fmtVal(v)  { return v == null ? '–' : v.toFixed(1); }
function fmtValFull(v) { return v == null ? '–' : v.toLocaleString('en-CA',{minimumFractionDigits:1,maximumFractionDigits:1}); }
function fmtN(n)    { return n.toLocaleString('en-CA'); }
function esc(s)     { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function truncate(s,n) { return s.length>n ? s.slice(0,n-1)+'…' : s; }

/* ── Chart defaults ── */
function chartDefaults() {
  const light = document.body.classList.contains('light-mode');
  return {
    gridColor:   light ? 'rgba(0,0,0,.06)' : 'rgba(255,255,255,.06)',
    legendColor: light ? '#374151' : '#a0aec0',
    tickColor:   light ? '#6b7280' : '#64748b'
  };
}

/* ── Load data ── */
fetch('data.json')
  .then(r => { if (!r.ok) throw new Error('data.json not found'); return r.json(); })
  .then(db => {
    DB = db;
    initControls();
    applyTheme();
    applyFilters();
  })
  .catch(err => {
    document.body.innerHTML = '<div style="color:#fb7185;padding:40px;font-family:monospace;font-size:14px;">ERROR: ' + err.message + '<br><br>Run: <b>node process_data.js</b> first.</div>';
  });

/* ── Build selectors ── */
function initControls() {
  const yearFrom = document.getElementById('yearFrom');
  const yearTo   = document.getElementById('yearTo');
  yearFrom.min = yearTo.min = DB.meta.minYear;
  yearFrom.max = yearTo.max = DB.meta.maxYear;
  yearFrom.value = DB.meta.minYear;
  yearTo.value   = DB.meta.maxYear;

  populateSectors();

  // Event listeners
  ['yearFrom','yearTo'].forEach(id => document.getElementById(id).addEventListener('change', applyFilters));
  document.getElementById('sectorFilter').addEventListener('change', () => { cascadeSubsectors(); applyFilters(); });
  document.getElementById('subsectorFilter').addEventListener('change', () => { cascadeIndustries(); applyFilters(); });
  document.getElementById('industryFilter').addEventListener('change', applyFilters);
  document.getElementById('searchBox').addEventListener('input', applyFilters);
  document.getElementById('resetBtn').addEventListener('click', resetFilters);

  document.querySelectorAll('#rankTable th[data-col]').forEach(th => th.addEventListener('click', () => handleSort(th)));
  document.querySelectorAll('#detailTable th[data-col]').forEach(th => th.addEventListener('click', () => handleSort(th)));
}

function populateSectors() {
  const sel = document.getElementById('sectorFilter');
  sel.innerHTML = '<option value="">‹All Sectors›</option>';
  // Skip index 0 which is the "(All Sectors)" placeholder
  DB.sectors.slice(1).forEach((name, i) => {
    const opt = document.createElement('option');
    opt.value = i + 1;
    opt.textContent = truncate(name, 60);
    sel.appendChild(opt);
  });
}

function cascadeSubsectors() {
  const secIdx = parseInt(document.getElementById('sectorFilter').value) || null;
  const sel = document.getElementById('subsectorFilter');
  sel.innerHTML = '<option value="">‹All Sub-sectors›</option>';
  document.getElementById('industryFilter').innerHTML = '<option value="">‹All Industries›</option>';

  if (!secIdx) return;

  // Find which subsectors appear in records matching this sector
  const subSet = new Set();
  for (const r of DB.records) {
    if (r[R_SEC] === secIdx) subSet.add(r[R_SUB]);
  }
  // Add subsector options in order
  subSet.forEach(si => {
    if (si === 0) return;
    const opt = document.createElement('option');
    opt.value = si;
    opt.textContent = truncate(DB.subsectors[si] || '', 60);
    sel.appendChild(opt);
  });
}

function cascadeIndustries() {
  const secIdx = parseInt(document.getElementById('sectorFilter').value) || null;
  const subIdx = parseInt(document.getElementById('subsectorFilter').value) || null;
  const sel = document.getElementById('industryFilter');
  sel.innerHTML = '<option value="">‹All Industries›</option>';

  if (!subIdx && !secIdx) return;

  const indSet = new Set();
  for (const r of DB.records) {
    const secMatch = !secIdx || r[R_SEC] === secIdx;
    const subMatch = !subIdx || r[R_SUB] === subIdx;
    if (secMatch && subMatch) indSet.add(r[R_IND]);
  }
  indSet.forEach(ii => {
    if (ii === 0) return;
    const opt = document.createElement('option');
    opt.value = ii;
    opt.textContent = truncate(DB.industries[ii] || '', 60);
    sel.appendChild(opt);
  });
}

/* ── Filter engine ── */
function applyFilters() {
  const yFrom  = parseInt(document.getElementById('yearFrom').value) || DB.meta.minYear;
  const yTo    = parseInt(document.getElementById('yearTo').value)   || DB.meta.maxYear;
  const secIdx = parseInt(document.getElementById('sectorFilter').value)    || null;
  const subIdx = parseInt(document.getElementById('subsectorFilter').value) || null;
  const indIdx = parseInt(document.getElementById('industryFilter').value)  || null;
  const search = document.getElementById('searchBox').value.trim().toLowerCase();

  filtered = DB.records.filter(r => {
    if (r[R_YEAR] < yFrom || r[R_YEAR] > yTo) return false;
    if (secIdx && r[R_SEC] !== secIdx) return false;
    if (subIdx && r[R_SUB] !== subIdx) return false;
    if (indIdx && r[R_IND] !== indIdx) return false;
    if (search) {
      const name = (DB.industries[r[R_IND]] || '').toLowerCase();
      if (!name.includes(search)) return false;
    }
    return true;
  });

  updateKPIs();
  updateCharts();
  updateRankTable();
  detailPage = 1;
  updateDetailTable();
}

function resetFilters() {
  document.getElementById('yearFrom').value    = DB.meta.minYear;
  document.getElementById('yearTo').value      = DB.meta.maxYear;
  document.getElementById('sectorFilter').value    = '';
  document.getElementById('subsectorFilter').value = '';
  document.getElementById('industryFilter').value  = '';
  document.getElementById('searchBox').value       = '';
  cascadeSubsectors();
  applyFilters();
}

/* ── KPIs ── */
function updateKPIs() {
  if (!filtered.length) {
    ['kpiAvgProd','kpiIndustries','kpiYears','kpiHighest','kpiLowest'].forEach(id => {
      document.getElementById(id).textContent = '–';
    });
    return;
  }
  const vals   = filtered.map(r => r[R_VAL]);
  const avg    = vals.reduce((a,b)=>a+b,0) / vals.length;
  const high   = Math.max(...vals);
  const low    = Math.min(...vals);
  const indSet = new Set(filtered.map(r=>r[R_IND]));
  const yrSet  = new Set(filtered.map(r=>r[R_YEAR]));

  document.getElementById('kpiAvgProd').textContent    = fmtValFull(avg);
  document.getElementById('kpiIndustries').textContent = fmtN(indSet.size);
  document.getElementById('kpiYears').textContent      = fmtN(yrSet.size);
  document.getElementById('kpiHighest').textContent    = fmtValFull(high);
  document.getElementById('kpiLowest').textContent     = fmtValFull(low);
}

/* ── Aggregate helpers ── */
function avgByYear() {
  const map = {};
  for (const r of filtered) {
    if (!map[r[R_YEAR]]) map[r[R_YEAR]] = { sum:0, n:0 };
    map[r[R_YEAR]].sum += r[R_VAL]; map[r[R_YEAR]].n++;
  }
  return Object.entries(map).sort((a,b)=>+a[0]-+b[0])
    .map(([y,v])=>({ year:+y, avg: v.sum/v.n }));
}

function avgByIndustry(top=10, asc=false) {
  const map = {};
  for (const r of filtered) {
    const name = DB.industries[r[R_IND]] || '?';
    if (!map[name]) map[name]={ sum:0, n:0, sec:DB.sectors[r[R_SEC]]||'', sub:DB.subsectors[r[R_SUB]]||'' };
    map[name].sum+=r[R_VAL]; map[name].n++;
  }
  let arr = Object.entries(map).map(([name,v])=>({ name, avg:v.sum/v.n, count:v.n, sec:v.sec, sub:v.sub }));
  arr.sort((a,b)=> asc ? a.avg-b.avg : b.avg-a.avg);
  return arr.slice(0,top);
}

function avgBySector() {
  const map = {};
  for (const r of filtered) {
    const name = DB.sectors[r[R_SEC]] || '?';
    if (!map[name]) map[name]={ sum:0, n:0 };
    map[name].sum+=r[R_VAL]; map[name].n++;
  }
  return Object.entries(map).map(([name,v])=>({ name, avg:v.sum/v.n }))
    .sort((a,b)=>b.avg-a.avg).slice(0,12);
}

/* ── Charts ── */
function updateCharts() {
  buildTrendChart();
  buildTop10Chart();
  buildSectorChart();
  buildYoYChart();
  buildBottom10Chart();
}

function buildTrendChart() {
  const data = avgByYear();
  const { gridColor, legendColor, tickColor } = chartDefaults();

  // Compute trend badge
  if (data.length >= 2) {
    const first = data[0].avg, last = data[data.length-1].avg;
    const pct = ((last-first)/first*100).toFixed(1);
    const badge = document.getElementById('trendBadge');
    const dir = pct > 0.5 ? 'up' : pct < -0.5 ? 'down' : 'flat';
    const arrow = dir==='up' ? '▲' : dir==='down' ? '▼' : '→';
    badge.innerHTML = `<span class="trend-badge trend-${dir}">${arrow} ${pct}% over period</span>`;
  }

  destroyChart(trendChart);
  trendChart = new Chart(document.getElementById('trendChart'), {
    type: 'line',
    data: {
      labels: data.map(d=>d.year),
      datasets: [{
        label: 'Avg Productivity ($/hr)',
        data: data.map(d=>d.avg),
        borderColor: '#60a5fa',
        backgroundColor: 'rgba(96,165,250,.08)',
        borderWidth: 2.5,
        tension: 0.35,
        fill: true,
        pointBackgroundColor: '#60a5fa',
        pointRadius: 3,
        pointHoverRadius: 6
      }]
    },
    options: {
      responsive:true,
      plugins:{
        legend:{ display:false },
        tooltip:{ callbacks:{ label: ctx => ' $'+fmtValFull(ctx.raw)+'/hr' } }
      },
      scales:{
        x:{ grid:{color:gridColor}, ticks:{color:tickColor} },
        y:{ grid:{color:gridColor}, ticks:{color:tickColor, callback:v=>'$'+v} }
      }
    }
  });
}

function buildTop10Chart() {
  const data = avgByIndustry(10, false);
  const { gridColor, tickColor } = chartDefaults();
  destroyChart(top10Chart);
  top10Chart = new Chart(document.getElementById('top10Chart'), {
    type: 'bar',
    data: {
      labels: data.map(d=>truncate(d.name.replace(/\s*\[[^\]]+\]/,''),35)),
      datasets: [{
        label: 'Avg $/hr',
        data: data.map(d=>d.avg),
        backgroundColor: CHART_ALPHAS,
        borderColor: CHART_COLOURS,
        borderWidth: 1.5,
        borderRadius: 4
      }]
    },
    options: {
      indexAxis:'y', responsive:true,
      plugins:{
        legend:{display:false},
        tooltip:{callbacks:{label:ctx=>' $'+fmtValFull(ctx.raw)+'/hr'}}
      },
      scales:{
        x:{grid:{color:gridColor},ticks:{color:tickColor,callback:v=>'$'+v}},
        y:{grid:{display:false},ticks:{color:tickColor,font:{size:10}}}
      }
    }
  });
}

function buildSectorChart() {
  const data = avgBySector();
  const { legendColor } = chartDefaults();
  destroyChart(sectorChart);
  sectorChart = new Chart(document.getElementById('sectorChart'), {
    type: 'doughnut',
    data: {
      labels: data.map(d=>truncate(d.name.replace(/\s*\[[^\]]+\]/,''),40)),
      datasets:[{
        data: data.map(d=>d.avg),
        backgroundColor: CHART_ALPHAS,
        borderColor: CHART_COLOURS,
        borderWidth: 1.5,
        hoverOffset: 6
      }]
    },
    options:{
      responsive:true,
      plugins:{
        legend:{ position:'right', labels:{ color:legendColor, font:{size:9}, boxWidth:10, padding:6 } },
        tooltip:{ callbacks:{ label:ctx=>' $'+fmtValFull(ctx.raw)+'/hr avg' } }
      }
    }
  });
}

function buildYoYChart() {
  const yearly = avgByYear();
  const { gridColor, tickColor } = chartDefaults();
  const labels=[], yoyData=[];
  for (let i=1; i<yearly.length; i++) {
    const pct = (yearly[i].avg - yearly[i-1].avg) / yearly[i-1].avg * 100;
    labels.push(yearly[i].year);
    yoyData.push(+pct.toFixed(2));
  }
  destroyChart(yoyChart);
  yoyChart = new Chart(document.getElementById('yoyChart'), {
    type:'bar',
    data:{
      labels,
      datasets:[{
        label:'YoY Change (%)',
        data: yoyData,
        backgroundColor: yoyData.map(v=>v>=0 ? 'rgba(52,211,153,.6)' : 'rgba(251,113,133,.6)'),
        borderColor:      yoyData.map(v=>v>=0 ? '#34d399' : '#fb7185'),
        borderWidth:1.5, borderRadius:3
      }]
    },
    options:{
      responsive:true,
      plugins:{
        legend:{display:false},
        tooltip:{callbacks:{label:ctx=>' '+ctx.raw.toFixed(2)+'%'}}
      },
      scales:{
        x:{grid:{color:gridColor},ticks:{color:tickColor}},
        y:{grid:{color:gridColor},ticks:{color:tickColor,callback:v=>v+'%'}}
      }
    }
  });
}

function buildBottom10Chart() {
  const data = avgByIndustry(10, true);
  const { gridColor, tickColor } = chartDefaults();
  destroyChart(bottom10Chart);
  bottom10Chart = new Chart(document.getElementById('bottom10Chart'), {
    type:'bar',
    data:{
      labels: data.map(d=>truncate(d.name.replace(/\s*\[[^\]]+\]/,''),35)),
      datasets:[{
        label:'Avg $/hr',
        data: data.map(d=>d.avg),
        backgroundColor:'rgba(251,113,133,.5)',
        borderColor:'#fb7185',
        borderWidth:1.5, borderRadius:4
      }]
    },
    options:{
      indexAxis:'y', responsive:true,
      plugins:{
        legend:{display:false},
        tooltip:{callbacks:{label:ctx=>' $'+fmtValFull(ctx.raw)+'/hr'}}
      },
      scales:{
        x:{grid:{color:gridColor},ticks:{color:tickColor,callback:v=>'$'+v}},
        y:{grid:{display:false},ticks:{color:tickColor,font:{size:10}}}
      }
    }
  });
}

/* ── Rank Table ── */
let rankSortCol='avgVal', rankSortDir=-1;

function buildRankData() {
  const map={};
  for (const r of filtered) {
    const ind=r[R_IND];
    if(!map[ind]) map[ind]={ name:DB.industries[ind]||'?', sec:DB.sectors[r[R_SEC]]||'', sub:DB.subsectors[r[R_SUB]]||'', vals:[], first:null, last:null };
    map[ind].vals.push(r[R_VAL]);
  }
  // For each industry, get first-year and last-year avg to compute change
  const byIndYear={};
  for(const r of filtered){
    const key=r[R_IND]+'_'+r[R_YEAR];
    if(!byIndYear[key]) byIndYear[key]={sum:0,n:0};
    byIndYear[key].sum+=r[R_VAL]; byIndYear[key].n++;
  }
  const years=Array.from(new Set(filtered.map(r=>r[R_YEAR]))).sort((a,b)=>a-b);
  const firstYr=years[0], lastYr=years[years.length-1];

  return Object.entries(map).map(([ind,d])=>{
    const avg=d.vals.reduce((a,b)=>a+b,0)/d.vals.length;
    const firstKey=ind+'_'+firstYr, lastKey=ind+'_'+lastYr;
    const firstVal = byIndYear[firstKey] ? byIndYear[firstKey].sum/byIndYear[firstKey].n : null;
    const lastVal  = byIndYear[lastKey]  ? byIndYear[lastKey].sum/byIndYear[lastKey].n   : null;
    const change   = (firstVal&&lastVal) ? (lastVal-firstVal)/firstVal*100 : null;
    return { ind:+ind, name:d.name, sec:d.sec, sub:d.sub, avg, latest:lastVal, change };
  });
}

function updateRankTable() {
  let data = buildRankData();
  const colFn={
    industry: d=>d.name,
    sector:   d=>d.sec,
    subsector:d=>d.sub,
    avgVal:   d=>d.avg,
    latestVal:d=>d.latest??-Infinity,
    change:   d=>d.change??-Infinity
  };
  if(colFn[rankSortCol]){
    const fn=colFn[rankSortCol];
    data.sort((a,b)=>{ const av=fn(a),bv=fn(b); return av<bv?-rankSortDir:av>bv?rankSortDir:0; });
  }
  document.getElementById('rankCount').textContent=`${fmtN(data.length)} industries`;

  if(!data.length){
    document.getElementById('rankBody').innerHTML='<tr><td colspan="8" class="no-data">No data for current filters.</td></tr>';
    return;
  }
  const maxAvg=Math.max(...data.map(d=>d.avg));
  document.getElementById('rankBody').innerHTML=data.map((d,i)=>{
    const barW=maxAvg?(d.avg/maxAvg*100).toFixed(1):0;
    const chg=d.change;
    let chgHtml='<span class="trend-badge trend-flat">–</span>';
    if(chg!=null){
      const dir=chg>0.5?'up':chg<-0.5?'down':'flat';
      const arrow=dir==='up'?'▲':dir==='down'?'▼':'→';
      chgHtml=`<span class="trend-badge trend-${dir}">${arrow} ${chg.toFixed(1)}%</span>`;
    }
    const nameShort=d.name.replace(/\s*\[[^\]]+\]/,'');
    const secShort=d.sec.replace(/\s*\[[^\]]+\]/,'');
    const subShort=d.sub.replace(/\s*\[[^\]]+\]/,'');
    return `<tr>
      <td class="rank">${i+1}</td>
      <td class="bar-cell" title="${esc(d.name)}" style="position:relative;">
        <div class="mini-bar" style="width:${barW}%"></div>
        <span style="position:relative;z-index:1">${esc(truncate(nameShort,48))}</span>
      </td>
      <td title="${esc(d.sec)}">${esc(truncate(secShort,35))}</td>
      <td title="${esc(d.sub)}">${esc(truncate(subShort,35))}</td>
      <td class="amount">$${fmtValFull(d.avg)}</td>
      <td class="amount">${d.latest!=null?'$'+fmtValFull(d.latest):'–'}</td>
      <td>${chgHtml}</td>
      <td></td>
    </tr>`;
  }).join('');

  document.querySelectorAll('#rankTable th[data-col]').forEach(th=>{
    th.classList.remove('sorted-asc','sorted-desc');
    if(th.dataset.col===rankSortCol) th.classList.add(rankSortDir===1?'sorted-asc':'sorted-desc');
  });
}

/* ── Detail Table ── */
let detailSortCol='year', detailSortDir=-1;

function updateDetailTable() {
  const total=filtered.length;
  const pages=Math.ceil(total/PAGE_SIZE)||1;
  if(detailPage>pages) detailPage=pages;

  let sorted=[...filtered];
  const colFn={
    year:      r=>r[R_YEAR],
    sector:    r=>DB.sectors[r[R_SEC]]||'',
    subsector: r=>DB.subsectors[r[R_SUB]]||'',
    industry:  r=>DB.industries[r[R_IND]]||'',
    value:     r=>r[R_VAL]
  };
  if(colFn[detailSortCol]){
    const fn=colFn[detailSortCol];
    sorted.sort((a,b)=>{ const av=fn(a),bv=fn(b); return av<bv?-detailSortDir:av>bv?detailSortDir:0; });
  }
  const page=sorted.slice((detailPage-1)*PAGE_SIZE, detailPage*PAGE_SIZE);

  document.getElementById('detailCount').textContent=
    `Showing ${fmtN((detailPage-1)*PAGE_SIZE+1)}–${fmtN(Math.min(detailPage*PAGE_SIZE,total))} of ${fmtN(total)} records`;

  const tbody=document.getElementById('detailBody');
  if(!page.length){
    tbody.innerHTML='<tr><td colspan="5" class="no-data">No records match the current filters.</td></tr>';
  } else {
    tbody.innerHTML=page.map(r=>{
      const ind=(DB.industries[r[R_IND]]||'').replace(/\s*\[[^\]]+\]/,'');
      const sec=(DB.sectors[r[R_SEC]]||'').replace(/\s*\[[^\]]+\]/,'');
      const sub=(DB.subsectors[r[R_SUB]]||'').replace(/\s*\[[^\]]+\]/,'');
      return `<tr>
        <td style="font-family:'Roboto Mono',monospace">${r[R_YEAR]}</td>
        <td title="${esc(sec)}">${esc(truncate(sec,40))}</td>
        <td title="${esc(sub)}">${esc(truncate(sub,40))}</td>
        <td title="${esc(DB.industries[r[R_IND]]||'')}">${esc(truncate(ind,50))}</td>
        <td class="amount">$${fmtValFull(r[R_VAL])}</td>
      </tr>`;
    }).join('');
  }

  buildPagination(pages);
  document.querySelectorAll('#detailTable th[data-col]').forEach(th=>{
    th.classList.remove('sorted-asc','sorted-desc');
    if(th.dataset.col===detailSortCol) th.classList.add(detailSortDir===1?'sorted-asc':'sorted-desc');
  });
}

function handleSort(th) {
  const col=th.dataset.col;
  const isDetail=th.closest('#detailTable');
  const isRank=th.closest('#rankTable');
  if(isDetail){
    if(detailSortCol===col) detailSortDir*=-1; else{detailSortCol=col;detailSortDir=1;}
    detailPage=1; updateDetailTable();
  } else if(isRank){
    if(rankSortCol===col) rankSortDir*=-1; else{rankSortCol=col;rankSortDir=1;}
    updateRankTable();
  }
}

function buildPagination(pages) {
  const pg=document.getElementById('detailPagination');
  if(pages<=1){pg.innerHTML='';return;}
  let html=`<span class="page-info">Page ${detailPage} / ${pages}</span>`;
  const btn=(label,page,disabled)=>
    `<button class="page-btn${page===detailPage?' active':''}" ${disabled?'disabled':''} data-page="${page}">${label}</button>`;
  html+=btn('«',1,detailPage===1);
  html+=btn('‹',detailPage-1,detailPage===1);
  const start=Math.max(1,detailPage-2),end=Math.min(pages,detailPage+2);
  for(let p=start;p<=end;p++) html+=btn(p,p,false);
  html+=btn('›',detailPage+1,detailPage===pages);
  html+=btn('»',pages,detailPage===pages);
  pg.innerHTML=html;
  pg.querySelectorAll('.page-btn[data-page]').forEach(b=>{
    b.addEventListener('click',()=>{ if(!b.disabled){detailPage=+b.dataset.page;updateDetailTable();} });
  });
}

/* ── Theme ── */
function applyTheme() {
  const saved=localStorage.getItem('labour-prod-theme')||'dark';
  document.body.classList.toggle('light-mode',saved==='light');
  document.getElementById('themeToggle').textContent=saved==='light'?'🌙 Dark':'☀ Light';
}
function toggleTheme() {
  const isLight=document.body.classList.toggle('light-mode');
  localStorage.setItem('labour-prod-theme',isLight?'light':'dark');
  document.getElementById('themeToggle').textContent=isLight?'🌙 Dark':'☀ Light';
  if(DB) updateCharts();
}
