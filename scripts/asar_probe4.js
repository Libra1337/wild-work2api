const fs = require('fs');
const buf = fs.readFileSync('C:/Program Files/ZCode/resources/app.asar').toString('latin1');
// 找 ZCode 自己注册 provider middleware 的地方：搜 'think' 作为对象值/参数附近有 middleware/model/provider 字样
const rx = /middleware[^\n]{0,120}/g;
let m, n = 0;
while ((m = rx.exec(buf)) && n < 40) {
  const s = m[0];
  if (/think/i.test(s) && !/yourModel|import /.test(s)) {
    console.log('@' + m.index + ': ' + s.replace(/[^\x20-\x7e]/g, '.'));
    n++;
  }
}
console.log('---think-字符串对象值---');
let i = -1, k = 0;
while ((i = buf.indexOf("'think'", i + 1)) > 0 && k < 10) {
  const ctx = buf.slice(i - 100, i + 100).replace(/[^\x20-\x7e]/g, '.');
  if (/middleware|tagName|extract/.test(ctx)) { console.log(ctx + '\n'); k++; }
}
