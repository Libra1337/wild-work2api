const fs = require('fs');
const buf = fs.readFileSync('C:/Program Files/ZCode/resources/app.asar').toString('latin1');
// 换角度：找 choices 解构 + content 读取（d.content / {content:...} = delta）
for (const p of ['?delta:', '?.delta', 'delta=e.choices', 'e.choices', 'choices?.']) {
  let i = -1, n = 0;
  while ((i = buf.indexOf(p, i + 1)) > 0 && n < 4) {
    const ctx = buf.slice(Math.max(0, i - 60), i + 380).replace(/[^\x20-\x7e\n]/g, '.');
    if (/content/.test(ctx) && /reason|finish|tool/.test(ctx)) {
      console.log('### ' + p + ' @' + i + ':\n' + ctx + '\n----');
      n++;
    }
  }
  if (n) break;
}
