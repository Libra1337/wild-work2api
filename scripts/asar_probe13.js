const fs = require('fs');
const buf = fs.readFileSync('C:/Program Files/ZCode/resources/app.asar').toString('latin1');
// 直接找 provider 的 openai-compatible chunk 解析（JSON.parse chunk choices delta content）
const p = 'choices[0]';
let i = -1;
const positions = [];
while ((i = buf.indexOf(p, i + 1)) > 0) positions.push(i);
console.log('choices[0] 出现:', positions.length);
for (const j of positions.slice(0, 12)) {
  const ctx = buf.slice(Math.max(0, j - 80), j + 320).replace(/[^\x20-\x7e\n]/g, '.');
  console.log('@' + j + ':\n' + ctx + '\n----');
}
