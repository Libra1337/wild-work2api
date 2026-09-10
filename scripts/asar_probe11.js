const fs = require('fs');
const buf = fs.readFileSync('C:/Program Files/ZCode/resources/app.asar').toString('latin1');
// 6× ".reasoning,." 上下文（疑似 delta 解构）
let i = -1;
let n = 0;
while ((i = buf.indexOf('.reasoning,', i + 1)) > 0 && n < 12) {
  const ctx = buf.slice(Math.max(0, i - 220), i + 80).replace(/[^\x20-\x7e\n]/g, '.');
  if (/content/.test(ctx)) {
    console.log('@' + i + ':\n' + ctx + '\n----');
    n++;
  }
}
