const fs = require('fs');
const buf = fs.readFileSync('C:/Program Files/ZCode/resources/app.asar').toString('latin1');
// openai-compatible 适配器解析 chunk 的地方：delta.reasoning / reasoning:
const cands = ['delta.reasoning', '.reasoning ??', 'reasoning ??', 'delta?.reasoning'];
for (const p of cands) {
  let i = -1, n = 0;
  while ((i = buf.indexOf(p, i + 1)) > 0 && n < 4) {
    const ctx = buf.slice(Math.max(0, i - 180), i + 160).replace(/[^\x20-\x7e\n]/g, '.');
    if (/tool_calls|choices|finish|stream|provider/i.test(ctx)) {
      console.log('### ' + p + ' @' + i + ':\n' + ctx + '\n');
      n++;
    }
  }
}
