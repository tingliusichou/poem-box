/* 构建期脚本：Ci_Tunes.json → 运行时词谱库（含 Ci_Catalog 分类） */
'use strict';
const fs = require('fs');
const path = require('path');
const RAW = path.join(__dirname, 'raw');
const OUT = path.join(__dirname, 'out');

/* rhythm 分类:
   韵/叶/换 → 韵脚(换韵标注) ; 句 → 句尾 ; 读 → 豆/逗停顿 ; 叠 → 叠句 ; 重 → 重韵
   其余脏数据（枝女竹年平等）按普通字处理 */
const R_CLOSE = { '韵': '韵', '叶': '叶', '换': '换', '句': '句', '读': '读', '叠': '叠', '重': '重' };

function parseFormat(f) {
  const segs = [];
  let seg = [], line = [];
  let total = 0;
  for (const t of f.tunes) {
    const tune = t.tune;
    if (!tune || !'平仄中'.includes(tune)) continue; // 脏数据防御
    total++;
    const r = R_CLOSE[t.rhythm] || null;
    line.push(tune);
    const isClose = !!r;
    const isShift = t.shift === 'true' || t.shift === true;
    if (isClose && line.length) {
      const e = line.pop();
      seg.push({ p: line.join(''), e, r });
      line = [];
    }
    if (isShift) { segs.push(seg); seg = []; }
  }
  if (line.length) {
    const e = line.pop();
    seg.push({ p: line.join(''), e, r: null });
  }
  if (seg.length) segs.push(seg);
  return { segs, total };
}

function main() {
  const ct = JSON.parse(fs.readFileSync(path.join(RAW, 'Ci_Tunes.json'), 'utf8'));
  // 分类索引
  let catMap = {};
  try {
    const cat = JSON.parse(fs.readFileSync(path.join(RAW, 'Ci_Catalog.json'), 'utf8'));
    for (const [type, arr] of Object.entries(cat)) {
      if (Array.isArray(arr)) for (const item of arr) if (item && item.name) catMap[item.name] = type;
    }
  } catch { console.log('Ci_Catalog 解析失败，跳过分类'); }

  const out = {};
  let badFormats = 0;
  for (const [name, d] of Object.entries(ct)) {
    const formats = [];
    d.formats.forEach((f, i) => {
      try {
        const { segs, total } = parseFormat(f);
        if (!total || !segs.length) { badFormats++; return; }
        formats.push({
          author: (f.author || '').slice(0, 24),
          sketch: (f.sketch || '').slice(0, 80),
          total,
          ...(i > 0 ? { alt: i } : {}),
          segs,
        });
      } catch { badFormats++; }
    });
    if (!formats.length) { badFormats++; continue; }
    out[name] = { desc: (d.desc || '').slice(0, 160), cat: catMap[name] || '', formats };
  }
  // 目录表：名称 + 字数 + 分类（按正体）
  const catalog = Object.entries(out)
    .map(([name, v]) => ({ name, total: v.formats[0].total, cat: v.cat }))
    .sort((a, b) => a.total - b.total || a.name.localeCompare(b.name, 'zh'));

  fs.writeFileSync(path.join(OUT, 'cipu.json'), JSON.stringify(out));
  fs.writeFileSync(path.join(OUT, 'cipu-catalog.json'), JSON.stringify(catalog));
  console.log(`词谱库: ${Object.keys(out).length} 调（体 ${Object.values(out).reduce((a, v) => a + v.formats.length, 0)}），坏体丢弃 ${badFormats}`);
  console.log(`文件大小: cipu.json ${fs.statSync(path.join(OUT, 'cipu.json')).size} bytes`);
}
main();
