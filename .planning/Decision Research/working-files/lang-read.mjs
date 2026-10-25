import fs from 'fs';
const src = fs.readFileSync('C:/dev/fincwin-p5/src/i18n/locales/en.ts','utf8').split('\n').slice(1461,2669).join('\n');
// crude TS object parse: walk lines keeping key path via braces
const lines = fs.readFileSync('C:/dev/fincwin-p5/src/i18n/locales/en.ts','utf8').split('\n').slice(1461,2669);
// Evaluate by transforming to JS: strip comments and 'as const'
let code = '({' + lines.join('\n').replace(/^\s*decide: \{/, '').replace(/\/\/.*$/gm, m => m.includes("'")||m.includes('"')? m.replace(/.*/,''):'' ) ;
