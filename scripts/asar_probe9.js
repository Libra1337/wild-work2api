const fs = require('fs');
const buf = fs.readFileSync('C:/Program Files/ZCode/resources/app.asar').toString('latin1');
for (const p of ['delta.reasoning', 'delta?.reasoning', '.reasoning', 'reasoning:']) {
  let i = -1, n = 0;
  const limit = p === '.reasoning' || p === 'reasoning:' ? 8 : 10;
  while ((i = buf.indexOf(p, i + 1)) > 0 && n < limit) {
    const ctx = buf.slice(Math.max(0, i - 160), i + 140).replace(/[^\x20-\x7e\n]/g, '.');
    if (/delta/i.test(ctx) && /controller|enqueue|type|choice/i.test(ctx)) {
      console.log('### ' + p + ' @' + i + ':\n' + ctx + '\n----');
      n++;
    }
  }
  if (n) break;
}
