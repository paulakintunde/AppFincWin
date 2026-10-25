const fs=require('fs');
const ts=require('C:/dev/fincwin-p5/node_modules/typescript');
const src=fs.readFileSync('C:/dev/fincwin-p5/src/i18n/locales/en.ts','utf8');
const out=ts.transpileModule(src,{compilerOptions:{module:'commonjs',target:'es2020'}}).outputText;
const m={exports:{}}; new Function('module','exports','require',out)(m,m.exports,(p)=>{try{const o=ts.transpileModule(fs.readFileSync('C:/dev/fincwin-p5/src/i18n/'+p.replace('./','')+'.ts','utf8'),{compilerOptions:{module:'commonjs',target:'es2020'}}).outputText;const mm={exports:{}};new Function('module','exports','require',o)(mm,mm.exports,()=>({}));return mm.exports}catch(e){return new Proxy({}, {get:()=>'X'})}});
const en=m.exports.default||m.exports;
const leaves=[];(function w(n,p){if(typeof n==='string')leaves.push([p,n]);else if(n&&typeof n==='object')for(const k in n)w(n[k],p?p+'.'+k:k)})(en.decide,'decide');
function syl(w){w=w.toLowerCase().replace(/[^a-z]/g,'');if(!w)return 0;if(w.length<=3)return 1;w=w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/,'').replace(/^y/,'');const g=w.match(/[aeiouy]{1,2}/g);return g?g.length:1}
function fk(text){
 const t=text.replace(/\{\{\w+\}\}/g,'100').replace(/\u00A0/g,' ');
 const sents=t.split(/(?<=[.!?:;])\s+|\s·\s/).filter(s=>/[a-z]/i.test(s));
 const words=t.split(/\s+/).map(w=>w.replace(/[^A-Za-z0-9’']/g,'')).filter(Boolean);
 if(!words.length||!sents.length)return null;
 const sy=words.reduce((a,w)=>a+(/\d/.test(w)?2:syl(w)),0);
 const W=words.length,Sn=Math.max(1,t.split(/[.!?]+\s|[.!?]+$/).filter(s=>/[a-z]/i.test(s)).length);
 return {W,S:Sn,fk:0.39*(W/Sn)+11.8*(sy/W)-15.59,fre:206.835-1.015*(W/Sn)-84.6*(sy/W),longest:Math.max(...sents.map(s=>s.split(/\s+/).length))};
}
const rows=leaves.map(([p,v])=>({p,v,...fk(v)||{}})).filter(r=>r.W>=4);
const grp=(name,re)=>{const g=rows.filter(r=>re.test(r.p));const a=g.reduce((s,r)=>s+r.fk,0)/g.length;const med=g.map(r=>r.fk).sort((x,y)=>x-y)[Math.floor(g.length/2)];console.log(name,'n='+g.length,'mean FK',a.toFixed(1),'median',med.toFixed(1),'share>8:',(g.filter(r=>r.fk>8).length/g.length*100).toFixed(0)+'%','share>12:',(g.filter(r=>r.fk>12).length/g.length*100).toFixed(0)+'%')};
grp('ALL',/./);grp('info.*.body',/^decide\.info\.[^.]+\.body/);grp('info.*.changes',/^decide\.info\.[^.]+\.changes/);grp('verdict titles',/^decide\.verdict\.(title|missing)/);grp('warn.*',/^decide\.warn\./);grp('home.*',/^decide\.home\./);grp('decision.*',/^decide\.decision\./);grp('alt.*',/^decide\.alt\./);grp('quick.line',/^decide\.quick\.line/);grp('section.*',/^decide\.section\./);
console.log('---worst by FK (W>=12)');
rows.filter(r=>r.W>=12).sort((a,b)=>b.fk-a.fk).slice(0,40).forEach(r=>console.log(r.fk.toFixed(1),'FRE',r.fre.toFixed(0),'W',r.W,'long',r.longest,r.p,'::',r.v.slice(0,90)));
console.log('---selected');
['decide.info.netFreeCashFlow.body','decide.info.confidence.body','decide.info.size.body','decide.info.pots.body','decide.alt.footer','decide.warn.monthAlready','decide.quick.line.cashFits','decide.home.hero.subMonth','decide.verdict.titleNoAlreadyShortSame','decide.info.edge.body','decide.info.cushionMonths.body','decide.info.housingLine.body','decide.info.setbacks.body','decide.info.whereItLands.body','decide.verdict.titleFits','decide.decision.goDesc','decide.decision.waitBeyond','decide.info.dsrLine.body','decide.info.reserve.body','decide.info.basisMonth.body'].forEach(k=>{const r=rows.find(x=>x.p===k);if(r)console.log(k,'FK',r.fk.toFixed(1),'FRE',r.fre.toFixed(0),'W',r.W,'S',r.S,'avgS',(r.W/r.S).toFixed(0))});
console.log('leaves',leaves.length,'info terms',Object.keys(en.decide.info).length);
// word counts for info bodies
const ib=rows.filter(r=>/^decide\.info\.[^.]+\.body/.test(r.p));console.log('info body words mean',(ib.reduce((s,r)=>s+r.W,0)/ib.length).toFixed(0),'max',Math.max(...ib.map(r=>r.W)));
