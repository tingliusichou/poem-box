/* 从《不离的现代诗.docx》提取全部诗并导入诗匣甲编 */
'use strict';
const fs = require('fs');
const path = require('path');

const xml = fs.readFileSync(path.join(__dirname, 'docx-extract', 'word', 'document.xml'), 'utf8');
const paras = xml.split(/<w:p [^>]*>|<w:p>/).slice(1).map(p => {
  const texts = [...p.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map(m => m[1]);
  return texts.join('')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'");
});

// 从第一个真实年份头开始（目录页的年份头带页码数字，不匹配）
let start = paras.findIndex(p => /^20\d{2}年$/.test(p.trim()));
if (start < 0) { console.error('未找到正文起点'); process.exit(1); }

const poems = [];
let cur = null, lastIdx = null;
for (let i = start; i < paras.length; i++) {
  const t = paras[i].trim();
  if (!t) continue;
  if (/^20\d{2}年$/.test(t)) { cur = null; lastIdx = i; continue; }
  const tm = t.match(/^《(.+)》[（(](\d{4}(?:\.\d{1,2}){0,2})[）)]$/);
  if (tm) {
    cur = { title: tm[1], date: tm[2], stanzas: [[]] };
    poems.push(cur);
    lastIdx = i;
    continue;
  }
  if (cur) {
    if (lastIdx !== null && i - lastIdx >= 2 && cur.stanzas[cur.stanzas.length - 1].length) cur.stanzas.push([]);
    cur.stanzas[cur.stanzas.length - 1].push(t);
  }
  lastIdx = i;
}

console.log('提取诗数:', poems.length);
const empty = poems.filter(p => !p.stanzas.some(s => s.length));
if (empty.length) { console.log('无正文（跳过）:', empty.map(p => p.title).join('、')); }
const good = poems.filter(p => p.stanzas.some(s => s.length));

// 与编订版 poems.json 交叉核对（信息性）
try {
  const ref = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'poems.json'), 'utf8'));
  if (Array.isArray(ref.poems)) {
    const a = new Set(good.map(p => p.title));
    const b = new Set(ref.poems.map(p => p.t));
    const onlyDocx = good.filter(p => !b.has(p.title)).map(p => p.title);
    const onlyJson = ref.poems.filter(p => !a.has(p.t)).map(p => p.t);
    console.log('文档有而编订版没有:', onlyDocx.length ? onlyDocx.join('、') : '无');
    console.log('编订版有而文档没有:', onlyJson.length ? onlyJson.join('、') : '无');
  }
} catch {}

// 导入
(async () => {
  const B = 'http://localhost:8137';
  const existing = new Set((await (await fetch(B + '/api/poems?vol=modern')).json()).poems.map(p => p.title));
  let imp = 0, skip = 0;
  for (const p of good) {
    if (existing.has(p.title)) { skip++; continue; }
    const content = p.stanzas.map(s => s.join('\n')).join('\n\n');
    const r = await fetch(B + '/api/poems', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vol: 'modern', title: p.title, date: p.date, content }),
    });
    if (r.ok) { imp++; existing.add(p.title); }
    else console.log('导入失败:', p.title, (await r.json()).error);
  }
  console.log(`导入完成：新增 ${imp} 首，跳过同名 ${skip} 首`);
  const list = (await (await fetch(B + '/api/poems?vol=modern')).json()).poems;
  console.log('甲编现有诗数:', list.length);
})();
