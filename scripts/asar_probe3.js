const fs = require('fs');
const buf = fs.readFileSync('C:/Program Files/ZCode/resources/app.asar').toString('latin1');
// extractReasoningMiddleware 的调用点（排除定义/文档），找 tagName 实参
const pat = 'extractReasoningMiddleware';
let i = -1;
const hits = [];
while ((i = buf.indexOf(pat, i + 1)) > 0) hits.push(i);
console.log('出现次数:', hits.length);
for (const h of hits) {
  const before = buf.slice(Math.max(0, h - 250), h);
  // 调用形如 xxx(extractReasoningMiddleware(...)) 或 middleware: extractReasoningMiddleware
  const after = buf.slice(h + pat.length, h + pat.length + 90).replace(/[^\x20-\x7e]/g, '.');
  if (/\(\{|tagName/.test(after) && !before.includes('// src/')) {
    console.log('调用 @' + h + ': ...' + after);
  }
}
// 也搜 tagName:'think' / "think" 注册
for (const p2 of ["tagName:'think'", 'tagName:"think"', "tagName:'reasoning'"]) {
  const j = buf.indexOf(p2);
  if (j > 0) console.log('TAGREG @' + j + ':', buf.slice(j - 120, j + 60).replace(/[^\x20-\x7e]/g, '.'));
}
