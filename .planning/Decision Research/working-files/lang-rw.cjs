const fs=require('fs');
const ts=require('C:/dev/fincwin-p5/node_modules/typescript');
const src=fs.readFileSync('C:/dev/fincwin-p5/src/i18n/locales/en.ts','utf8');
const out=ts.transpileModule(src,{compilerOptions:{module:'commonjs',target:'es2020'}}).outputText;
const m={exports:{}}; new Function('module','exports','require',out)(m,m.exports,(p)=>{try{const o=ts.transpileModule(fs.readFileSync('C:/dev/fincwin-p5/src/i18n/'+p.replace('./','')+'.ts','utf8'),{compilerOptions:{module:'commonjs',target:'es2020'}}).outputText;const mm={exports:{}};new Function('module','exports','require',o)(mm,mm.exports,()=>({}));return mm.exports}catch(e){return new Proxy({}, {get:()=>'X'})}});
const en=m.exports.default||m.exports;
const get=(k)=>k.split('.').reduce((o,p)=>o&&o[p],en);
function syl(w){w=w.toLowerCase().replace(/[^a-z]/g,'');if(!w)return 0;if(w.length<=3)return 1;w=w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/,'').replace(/^y/,'');const g=w.match(/[aeiouy]{1,2}/g);return g?g.length:1}
function fk(text){const t=text.replace(/\{\{\w+\}\}/g,'100').replace(/\u00A0/g,' ');const words=t.split(/\s+/).map(w=>w.replace(/[^A-Za-z0-9’']/g,'')).filter(Boolean);if(!words.length)return NaN;const sy=words.reduce((a,w)=>a+(/\d/.test(w)?2:syl(w)),0);const Sn=Math.max(1,t.split(/[.!?]+\s|[.!?]+$/).filter(s=>/[a-z]/i.test(s)).length);const W=words.length;return 0.39*(W/Sn)+11.8*(sy/W)-15.59}
const demo=(s)=>s.replace(/\{\{(\w+)\}\}/g,(a,n)=>({basis:'tightest',count:'3',pct:'41%',date:'Mar 3',already:'$5,883.85',short:'$5,883.85',gap:'$6,003.85',added:'$120.00',name:'Sofa'}[n]||'$1,240.00'));
const R=JSON.parse(fs.readFileSync('C:/Users/harki/AppData/Local/Temp/claude/c--dev-fincwin/67272e04-2e02-4556-af3d-8b736ebb1d84/scratchpad/lang-rw.json','utf8'));
const rows=R.map(([k,n])=>{const o=get(k);return {k,o,n,missing:typeof o!=='string'}});
const bad=rows.filter(r=>r.missing);if(bad.length)console.error('MISSING',bad.map(b=>b.k));
const md=[];md.push('| # | Key | Current | Proposed | Words | FK now → new | Fit |');md.push('|---|---|---|---|---|---|---|');
let i=0;const esc=s=>s.replace(/\|/g,'\\|').replace(/\u00A0/g,' ');
let sumOld=0,sumNew=0,cnt=0;
for(const r of rows){if(r.missing)continue;i++;const a=fk(r.o),b=fk(r.n);const wn=r.n.replace(/\{\{\w+\}\}/g,'x').split(/\s+/).filter(Boolean).length;const L=demo(r.n).replace(/\u00A0/g,' ').length;let fit='';
 if(/^decide\.verdict\.(title|missing)/.test(r.k)||/^decide\.warn\..*Title/.test(r.k))fit=L<=64?'title '+L+'/64 ok':'title '+L+'/64 OVER';
 else if(/^decide\.fold\.preview/.test(r.k))fit=L<=44?'fold '+L+'/44 ok':'fold '+L+'/44 OVER';
 if(isFinite(a)&&isFinite(b)&&r.o.split(/\s+/).length>=5){sumOld+=a;sumNew+=b;cnt++}
 md.push(`| ${i} | \`${r.k}\` | ${esc(r.o)} | ${esc(r.n)} | ${wn} | ${isFinite(a)?a.toFixed(1):'–'} → ${isFinite(b)?b.toFixed(1):'–'} | ${fit} |`)}
fs.writeFileSync('C:/Users/harki/AppData/Local/Temp/claude/c--dev-fincwin/67272e04-2e02-4556-af3d-8b736ebb1d84/scratchpad/lang-table.md',md.join('\n'));
console.log('rows',i,'mean FK old/new (strings>=5 words, n='+cnt+')',(sumOld/cnt).toFixed(1),(sumNew/cnt).toFixed(1));
console.log(md.filter(l=>/OVER/.test(l)).join('\n'));
