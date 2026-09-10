const fs = require('fs');
const buf = fs.readFileSync('C:/Program Files/ZCode/resources/app.asar').toString('latin1');
// 直接找 openai chat delta schema 中的字段列举（content/role/tool_calls 同现的 schema）
let i = -1;
let shown = 0;
while ((i = buf.indexOf('tool_calls', i + 1)) > 0 && shown < 6) {
  const ctx = buf.slice(Math.max(0, i - 300), i + 300).replace(/[^\x20-\x7e\n]/g, '.');
  // schema 特征：.optional()/.nullable()/z.string 密集
  const optCount = (ctx.match(/optional\(\)|nullable\(\)|z\./g) || []).length;
  if (optCount >= 4) {
    console.log('@' + i + ' (opt=' + optCount + '):\n' + ctx + '\n=====');
    shown++;
  }
}
