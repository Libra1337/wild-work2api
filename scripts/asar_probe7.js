const fs = require('fs');
const buf = fs.readFileSync('C:/Program Files/ZCode/resources/app.asar').toString('latin1');
// openai chat chunk 的 zod schema：找定义 delta 字段列表处（含 reasoning 字段名）
for (const p of ['reasoning: z', 'reasoning:', 'providerMeta']) {
  let i = -1, n = 0;
  while ((i = buf.indexOf(p, i + 1)) > 0 && n < 6) {
    const ctx = buf.slice(Math.max(0, i - 200), i + 200).replace(/[^\x20-\x7e\n]/g, '.');
    if (/tool_calls/.test(ctx) && /delta/.test(ctx)) {
      console.log('### @' + i + ':\n' + ctx + '\n---');
      n++;
    }
  }
}
