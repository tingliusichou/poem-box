/* 从《不离的古体诗.docx》提取全部诗并导入诗匣乙编 */
'use strict';
const fs = require('fs');
const path = require('path');

const xml = fs.readFileSync(path.join(__dirname, 'gushi-extract', 'word', 'document.xml'), 'utf8');
const paras = xml.split(/<w:p [^>]*>|<w:p>/).slice(1).map(p => {
  const texts = [...p.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map(m => m[1]);
  return texts.join('')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'");
});

let start = paras.findIndex(p => /^20\d{2}年$/.test(p.trim()));
if (start < 0) { console.error('未找到正文起点'); process.exit(1); }

const poems = [];
let cur = null, lastIdx = null, headerCount = 0;
for (let i = start; i < paras.length; i++) {
  const t = paras[i].trim();
  if (!t) continue;
  if (/^20\d{2}年$/.test(t)) { cur = null; lastIdx = i; continue; }
  const tm = t.match(/^《(.+)》[（(](\d{4}(?:\.\d{1,2}){0,2})[）)]$/);
  if (tm) {
    headerCount++;
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
console.log('诗头数量:', headerCount, '| 提取诗数:', poems.length);
const dupTitles = {};
poems.forEach(p => { dupTitles[p.title] = (dupTitles[p.title] || 0) + 1; });
const dups = Object.entries(dupTitles).filter(([, n]) => n > 1);
if (dups.length) console.log('同名诗:', dups.map(([t, n]) => `${t}×${n}`).join('、'));
const empty = poems.filter(p => !p.stanzas.some(s => s.length));
if (empty.length) console.log('无正文（跳过）:', empty.map(p => p.title).join('、'));

// 词牌目录（含简体显示名）
const cipaiCatalog = JSON.parse(fs.readFileSync('C:/Users/SUOZHIYUAN/Desktop/索致远/现代诗/诗匣数据/词谱/cipu-catalog.json', 'utf8'));
const byName = {};
cipaiCatalog.forEach(c => { byName[c.name] = c; if (c.s) byName[c.s] = c; });

// 体裁推断（按句量字数，一行可含多句）
function guessGenre(title, stanzas) {
  const m = title.match(/^([^··]+)/);
  if (m && byName[m[1]]) return { genre: '词', cipai: m[1] };
  const lens = stanzas
    .flatMap(s => s.flatMap(line => line.split(/[，。、；：！？…]/))
      .map(t => t.replace(/\s/g, '')).filter(Boolean).map(t => t.length));
  const uniq = [...new Set(lens)];
  if (uniq.length === 1 && lens[0] === 4) return { genre: '诗经体' };
  if (lens.length === 4 && uniq.length === 1) return { genre: lens[0] === 5 ? '五绝' : lens[0] === 7 ? '七绝' : '不拘' };
  if (lens.length === 8 && uniq.length === 1) return { genre: lens[0] === 5 ? '五律' : lens[0] === 7 ? '七律' : '不拘' };
  return { genre: '古风·乐府' };
}

(async () => {
  const B = 'http://localhost:8137';
  const existing = (await (await fetch(B + '/api/poems?vol=gushi')).json()).poems;
  const existingSet = new Set(existing.map(p => p.title + '::' + p.content));
  let imp = 0, skip = 0;
  const genreDist = {};
  for (const p of poems) {
    if (!p.stanzas.some(s => s.length)) { skip++; continue; }
    const content = p.stanzas.map(s => s.join('\n')).join('\n\n');
    if (existingSet.has(p.title + '::' + content)) { skip++; continue; }
    const g = guessGenre(p.title, p.stanzas);
    genreDist[g.genre] = (genreDist[g.genre] || 0) + 1;
    const body = { vol: 'gushi', title: p.title, date: p.date, content, genre: g.genre, rhbook: g.genre === '词' ? '词林正韵' : '平水韵' };
    if (g.cipai) body.cipai = g.cipai;
    const r = await fetch(B + '/api/poems', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (r.ok) { imp++; existingSet.add(p.title + '::' + content); }
    else console.log('导入失败:', p.title, (await r.json()).error);
  }
  console.log('体裁分布:', JSON.stringify(genreDist));
  console.log(`导入完成：新增 ${imp} 首，跳过 ${skip} 首`);
  const list = (await (await fetch(B + '/api/poems?vol=gushi')).json()).poems;
  console.log('乙编现有诗数:', list.length);
})();
