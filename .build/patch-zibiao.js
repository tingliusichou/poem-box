/* 手工核实的小补丁：上游各源共同缺失的常用字 */
'use strict';
const fs = require('fs');
const path = require('path');
const OUT = path.join(__dirname, 'out');
const DATA = 'C:/Users/SUOZHIYUAN/Desktop/索致远/现代诗/诗匣数据/字表/';

function patch(file, add) {
  for (const out of [OUT, DATA]) {
    const p = path.join(out, file);
    if (!fs.existsSync(p)) continue;
    const t = JSON.parse(fs.readFileSync(p, 'utf8'));
    for (const [ch, entries] of Object.entries(add)) {
      const arr = t[ch] = t[ch] || [];
      for (const e of entries) if (!arr.some(x => x[0] === e[0] && x[1] === e[1])) arr.push(e);
    }
    fs.writeFileSync(p, JSON.stringify(t));
  }
  console.log('补丁完成:', file);
}

/* 依据：
   啼：杜奚切，平声八齐（《广韵》齐韵定母）；词林三部（齐部）；通韵 tí 阳平，衣部
   樽：尊同，祖昆切，平声十三元（门魂组半）；词林六部；通韵 zūn 阴平，恩部 */
patch('zibiao-pingshui.json', {
  '啼': [['平', '上平八齐']],
  '樽': [['平', '上平十三元']],
});
patch('zibiao-cilin.json', {
  '啼': [['平', 3]],
  '樽': [['平', 6]],
});
patch('zibiao-tongyun.json', {
  '啼': [['平', 4]],
  '樽': [['平', 12]],
});
/* 新韵：去 qù 仄·十二齐；思 sī 平·十三支（另读 sì 仄） */
patch('zibiao-xinyun.json', {
  '去': [['仄', 12]],
  '思': [['平', 13], ['仄', 13]],
});
console.log('全部完成');
