const fs = require('fs');
const buf = fs.readFileSync('C:/Program Files/ZCode/resources/app.asar').toString('latin1');
const pats = ['<think>', 'extractReasoningMiddleware({', 'languageModelMiddleware:'];
for (const pat of pats) {
  let i = -1, n = 0;
  while ((i = buf.indexOf(pat, i + 1)) > 0 && n < 6) {
    const ctx = buf.slice(Math.max(0, i - 150), i + 180).replace(/[^\x20-\x7e\n]/g, '.');
    if (!/yourModel|import |declare|```/.test(ctx)) {
      console.log('### ' + pat + ' @' + i + ':\n' + ctx + '\n');
      n++;
    }
  }
}
