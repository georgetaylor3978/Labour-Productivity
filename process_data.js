/* ================================================================
   process_data.js  –  Labour Productivity Dashboard Data Compiler
   Run: node process_data.js   (from the Productivity folder)
   Reads:  ProductivityData.csv, ProductivityDataMap.csv
   Writes: data.json
================================================================ */
'use strict';
const fs   = require('fs');
const path = require('path');
const rl   = require('readline');

const DIR      = __dirname;
const DATA_CSV = path.join(DIR, 'ProductivityData.csv');
const OUT_JSON = path.join(DIR, 'data.json');

function parseCSVLine(line) {
    const parts = []; let cur = '', inQ = false;
    for (let i = 0; i < line.length; i++) {
        const c = line[i];
        if (c === '"') { if (inQ && line[i+1]==='"'){cur+='"';i++;}else inQ=!inQ; }
        else if (c===',' && !inQ){parts.push(cur.trim());cur='';}
        else cur+=c;
    }
    parts.push(cur.trim()); return parts;
}

function intern(val, list, map) {
    const key=(val||'').trim();
    if(map[key]!==undefined)return map[key];
    const idx=list.length; list.push(key); map[key]=idx; return idx;
}

function extractNAICS(name){ const m=name.match(/\[([A-Z0-9]+)\]$/); return m?m[1]:null; }

const sectors=[],secMap={}, subsectors=[],subMap={}, industries=[],indMap={};
intern('(All Sectors)',sectors,secMap);
intern('(All Sub-sectors)',subsectors,subMap);
intern('(All Industries)',industries,indMap);

console.log('Reading '+DATA_CSV+' ...');
const reader=rl.createInterface({input:fs.createReadStream(DATA_CSV,{encoding:'utf8'}),crlfDelay:Infinity});

let headers=[],lineNum=0;
const records=[];
let minYear=9999,maxYear=0;
const allCodes=new Set();
const codeLabel={};
const rows=[];

reader.on('line',line=>{
    lineNum++;
    if(lineNum===1){headers=parseCSVLine(line);return;}
    if(!line.trim())return;
    const p=parseCSVLine(line);
    const get=col=>{const i=headers.indexOf(col);return i>=0?(p[i]||'').trim():'';};
    const year=parseInt(get('REF_DATE'),10)||0;
    const ind=get('Industry');
    const valStr=get('VALUE');
    const status=get('STATUS');
    if(year<1990||year>2100)return;
    if(!valStr||status==='..'||status==='x'||status==='F')return;
    const value=parseFloat(valStr);
    if(isNaN(value))return;
    const code=extractNAICS(ind);
    if(!code)return;
    if(year<minYear)minYear=year;
    if(year>maxYear)maxYear=year;
    allCodes.add(code);
    codeLabel[code]=ind;
    rows.push([year,code,value]);
});

reader.on('close',()=>{
    console.log('Unique NAICS codes: '+allCodes.size);
    // Build parent map: find longest matching prefix that exists
    const codeArr=Array.from(allCodes);
    function findParent(code){
        let c=code;
        while(c.length>2){c=c.slice(0,-1);if(allCodes.has(c))return c;}
        return null;
    }
    const codeParent={};
    for(const c of codeArr) codeParent[c]=findParent(c);
    const sectorSet=new Set(codeArr.filter(c=>!codeParent[c]));
    const subsectorSet=new Set(codeArr.filter(c=>sectorSet.has(codeParent[c])));

    function getSector(code){let c=code;while(codeParent[c])c=codeParent[c];return c;}
    function getSubsector(code){
        let c=code;
        while(c&&!subsectorSet.has(c)&&!sectorSet.has(c))c=codeParent[c];
        return c||code;
    }

    const codeToSec={},codeToSub={},codeToInd={};
    for(const code of codeArr){
        codeToSec[code]=intern(codeLabel[getSector(code)]||getSector(code),sectors,secMap);
        codeToSub[code]=intern(codeLabel[getSubsector(code)]||getSubsector(code),subsectors,subMap);
        codeToInd[code]=intern(codeLabel[code]||code,industries,indMap);
    }

    for(const [year,code,value] of rows){
        records.push([year,codeToSec[code]??0,codeToSub[code]??0,codeToInd[code]??0,value]);
    }

    const db={
        meta:{
            title:'Labour Productivity and Related Measures — Statistics Canada Table 36-10-0480-01',
            source:'https://www150.statcan.gc.ca/t1/tbl1/en/tv.action?pid=3610048001',
            generatedAt:new Date().toISOString(),
            recordCount:records.length,
            minYear,maxYear,
            uom:'Chained (2017) dollars per hour'
        },
        sectors,subsectors,industries,
        records
    };
    fs.writeFileSync(OUT_JSON,JSON.stringify(db));
    const mb=(fs.statSync(OUT_JSON).size/1024/1024).toFixed(2);
    console.log('Done! data.json = '+mb+' MB');
    console.log('  Sectors:     '+sectors.length);
    console.log('  Sub-sectors: '+subsectors.length);
    console.log('  Industries:  '+industries.length);
    console.log('  Records:     '+records.length.toLocaleString());
    console.log('  Year range:  '+minYear+' - '+maxYear);
});
