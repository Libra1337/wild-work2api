const fs = require('fs');
const buf = fs.readFileSync('C:/Program Files/ZCode/resources/app.asar').toString('latin1');
// 穷举 .reasoning 的访问点
let i = -1;
const seen = [];
while ((i = buf.indexOf('.reasoning', i + 1)) > 0) {
  const ctx = buf.slice(i, i + 40).replace(/[^\x20-\x7e]/g, '.');
  seen.push(ctx.slice(0, 30));
}
const counts = {};
for (const s of seen) counts[s] = (counts[s] || 0) + 1;
const top = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 20);
for (const [k, v] of top) console.log(v, '×', k);
