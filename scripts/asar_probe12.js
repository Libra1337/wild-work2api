const fs = require('fs');
const buf = fs.readFileSync('C:/Program Files/ZCode/resources/app.asar').toString('latin1');
// 找 chat 流解析器：text-delta 入队处，看 delta.content 附近有无 reasoning 分支
const p = "type: 'text-delta'";
let i = -1;
let n = 0;
while ((i = buf.indexOf(p, i + 1)) > 0 && n < 5) {
  const ctx = buf.slice(Math.max(0, i - 500), i + 500).replace(/[^\x20-\x7e\n]/g, '.');
  if (/delta\.content|providerDelta|choice/.test(ctx)) {
    console.log('@' + i + ':\n' + ctx + '\n=========');
    n++;
  }
}
