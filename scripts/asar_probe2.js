const fs = require('fs');
const buf = fs.readFileSync('C:/Program Files/ZCode/resources/app.asar').toString('latin1');
// 找 activeExtraction 周边：流式 think 标签状态机的真实调用方与 tagName 取值
const i = buf.indexOf('activeExtraction.isFirstReasonin');
console.log(buf.slice(i - 2600, i + 200).replace(/[^\x20-\x7e\n]/g, '.'));
