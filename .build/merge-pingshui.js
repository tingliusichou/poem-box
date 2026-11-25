/* 用繁体全帙《平水韵》(rbnyng/pingshui_rhyme) 繁→简转换后补全字表缺口 */
'use strict';
const fs = require('fs');
const path = require('path');
const OpenCC = require('opencc-js');
const converter = OpenCC.Converter({ from: 'tw', to: 'cn' });

const RAW = path.join(__dirname, 'raw');
const OUT = path.join(__dirname, 'out');

function main() {
  const d = JSON.parse(fs.readFileSync(path.join(RAW, 'pr_dict.json'), 'utf8'));
  const table = JSON.parse(fs.readFileSync(path.join(OUT, 'zibiao-pingshui.json'), 'utf8'));
  const before = Object.keys(table).length;

  const TONE = { '上聲部': '上', '去聲部': '去', '入聲部': '入' };
  const added = new Set();
  let convMissing = 0;

  function addEntry(ch, tone, ybSimplified) {
    if (!ch || Array.from(ch).length !== 1) return;
    const arr = table[ch] = table[ch] || [];
    if (!arr.some(([t, y]) => t === tone && y === ybSimplified)) {
      arr.push([tone, ybSimplified]);
      added.add(ch);
    }
  }

  for (const group of ['ping', 'ze']) {
    for (const [sd, ybs] of Object.entries(d[group])) {
      for (const [ybFull, chars] of Object.entries(ybs)) {
        // '上平聲一東' → 去掉声部前缀 → '一東' → 简体 '一东'
        let core = ybFull.replace(/^上平聲/, '').replace(/^下平聲/, '').replace(/^上聲/, '').replace(/^去聲/, '').replace(/^入聲/, '');
        const ybSimplified = converter(core);
        if (!ybSimplified || Array.from(core).length !== Array.from(ybSimplified).length) { convMissing++; continue; }
        const tone = group === 'ping' ? '平' : TONE[sd];
        const runs = Array.isArray(chars) ? chars : [String(chars)];
        for (const run of runs) {
          for (const ch of String(run)) {
            const sim = converter(ch);
            if (Array.from(ch).length !== 1) continue;
            if (!sim || Array.from(sim).length === 0) { convMissing++; continue; }
            if (Array.from(sim).length === 1) addEntry(sim, tone, ybSimplified);
            else for (const c of Array.from(sim)) addEntry(c, tone, ybSimplified);
          }
        }
      }
    }
  }
  // 重排（平上去入序）
  const ORDER = { 平: 0, 上: 1, 去: 2, 入: 3 };
  for (const arr of Object.values(table)) arr.sort((a, b) => ORDER[a[0]] - ORDER[b[0]]);
  fs.writeFileSync(path.join(OUT, 'zibiao-pingshui.json'), JSON.stringify(table));
  const after = Object.keys(table).length;
  console.log(`平水韵补全: ${before} → ${after} 字（新增 ${after - before}，转换失败 ${convMissing}）`);
  console.log('抽查: 啼', JSON.stringify(table['啼']), '| 溪', JSON.stringify(table['溪']), '| 白', JSON.stringify(table['白']));
}
main();
