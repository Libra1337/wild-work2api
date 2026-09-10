const fs = require('fs');
const buf = fs.readFileSync('C:/Program Files/ZCode/resources/app.asar').toString('latin1');
// 反向：找 reasoning-delta 流部件的生成处（enqueue/emit reasoning-delta）
let i = -1;
let shown = 0;
while ((i = buf.indexOf('reasoning-delta', i + 1)) > 0 && shown < 8) {
  const ctx = buf.slice(Math.max(0, i - 260), i + 120).replace(/[^\x20-\x7e\n]/g, '.');
  if (/type:|enqueue|case/.test(ctx) && !/text_delta....text_delta/.test(ctx)) {
    console.log('@' + i + ':\n' + ctx + '\n---');
    shown++;
  }
}
