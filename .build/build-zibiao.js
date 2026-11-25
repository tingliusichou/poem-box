/* 构建期脚本：把原始韵书 JSON 转成诗匣运行时的紧凑字表 */
'use strict';
const fs = require('fs');
const path = require('path');

const RAW = path.join(__dirname, 'raw');
const OUT = path.join(__dirname, 'out');
fs.mkdirSync(OUT, { recursive: true });

/* 中文数字 → 阿拉伯数字（处理 一~十九） */
function cnNum(s) {
  const D = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };
  if (D[s]) return D[s];
  const m = s.match(/^十([一二三四五六七八九])$/);
  if (m) return 10 + D[m[1]];
  return NaN;
}

/* ---------- 平水韵主表 ---------- */
function buildPingshui() {
  const src = JSON.parse(fs.readFileSync(path.join(RAW, 'Pingshui_Rhyme.json'), 'utf8'));
  const SD_SHORT = { '上平声部': '上平', '下平声部': '下平', '上声部': '上声', '去声部': '去声', '入声部': '入声' };
  const TONE = { '上平声部': '平', '下平声部': '平', '上声部': '上', '去声部': '去', '入声部': '入' };
  const ORDER = { 平: 0, 上: 1, 去: 2, 入: 3 };
  const table = {};
  for (const [sd, ybs] of Object.entries(src)) {
    for (const [yb, chars] of Object.entries(ybs)) {
      const list = Array.isArray(chars) ? chars : Array.from(String(chars));
      // 源数据的入声韵部键自带「入声」前缀，避免拼成「入声入声一屋」
      const full = yb.startsWith(SD_SHORT[sd]) ? yb : `${SD_SHORT[sd]}${yb}`;
      for (const ch of list) {
        if (!ch || ch.length !== 1) continue;
        (table[ch] = table[ch] || []).push([TONE[sd], full]);
      }
    }
  }
  let poly = 0, total = 0;
  const out = {};
  for (const [ch, arr] of Object.entries(table)) {
    total++;
    const seen = new Set();
    const uniq = arr.filter(([t, y]) => { const k = t + y; if (seen.has(k)) return false; seen.add(k); return true; });
    uniq.sort((a, b) => ORDER[a[0]] - ORDER[b[0]]);
    if (uniq.length > 1) poly++;
    out[ch] = uniq;
  }
  const yunbu = {};
  for (const [sd, ybs] of Object.entries(src)) yunbu[SD_SHORT[sd]] = Object.keys(ybs);
  fs.writeFileSync(path.join(OUT, 'zibiao-pingshui.json'), JSON.stringify(out));
  fs.writeFileSync(path.join(OUT, 'yunbu-pingshui.json'), JSON.stringify(yunbu));
  console.log(`平水韵: ${total} 字（多音 ${poly}）→ zibiao-pingshui.json`);
}

/* ---------- 中华新韵（十四韵） ---------- */
function buildXinyun() {
  const src = JSON.parse(fs.readFileSync(path.join(RAW, 'Xinyun_Rhyme.json'), 'utf8'));
  const ORDER = {};
  ['一麻', '二波', '三皆', '四开', '五微', '六豪', '七尤', '八寒', '九文', '十唐', '十一庚', '十二齐', '十三支', '十四姑']
    .forEach((n, i) => { ORDER[n] = i + 1; });
  const table = {};
  for (const [bu, tones] of Object.entries(src)) {
    const buNum = ORDER[bu];
    if (!buNum) { console.log('未知新韵部:', bu); continue; }
    for (const [tone, chars] of Object.entries(tones)) {
      const list = Array.isArray(chars) ? chars : Array.from(String(chars));
      for (const ch of list) {
        if (!ch || ch.length !== 1) continue;
        (table[ch] = table[ch] || []).push([tone === '平' ? '平' : '仄', buNum]);
      }
    }
  }
  const out = {};
  let poly = 0;
  for (const [ch, arr] of Object.entries(table)) {
    const seen = new Set();
    const uniq = arr.filter(x => { const k = x.join(','); if (seen.has(k)) return false; seen.add(k); return true; });
    uniq.sort((a, b) => (a[0] === '平' ? 0 : 1) - (b[0] === '平' ? 0 : 1) || a[1] - b[1]);
    if (uniq.length > 1) poly++;
    out[ch] = uniq;
  }
  fs.writeFileSync(path.join(OUT, 'zibiao-xinyun.json'), JSON.stringify(out));
  console.log(`中华新韵: ${Object.keys(out).length} 字（多音 ${poly}）→ zibiao-xinyun.json`);
}

/* ---------- 词林正韵：逐字表 + 平水韵部级映射推导 ---------- */
const PS2CL = {
  '上平一东': 1, '上平二冬': 1, '上平三江': 2, '上平四支': 3, '上平五微': 3, '上平六鱼': 4, '上平七虞': 4,
  '上平八齐': 3, '上平九佳': 'H', '上平十灰': 'H', '上平十一真': 6, '上平十二文': 6, '上平十三元': 'H',
  '上平十四寒': 7, '上平十五删': 7,
  '下平一先': 7, '下平二萧': 8, '下平三肴': 8, '下平四豪': 8, '下平五歌': 9, '下平六麻': 10, '下平七阳': 2,
  '下平八庚': 11, '下平九青': 11, '下平十蒸': 11, '下平十一尤': 12, '下平十二侵': 13, '下平十三覃': 14,
  '下平十四盐': 14, '下平十五咸': 14,
  '上声一董': 1, '上声二肿': 1, '上声三讲': 2, '上声四纸': 3, '上声五尾': 3, '上声六语': 4, '上声七麌': 4,
  '上声八荠': 3, '上声九蟹': 'H', '上声十贿': 'H', '上声十一轸': 6, '上声十二吻': 6, '上声十三阮': 'H',
  '上声十四旱': 7, '上声十五潸': 7, '上声十六铣': 7, '上声十七筱': 8, '上声十八巧': 8, '上声十九皓': 8,
  '上声二十哿': 9, '上声二十一马': 10, '上声二十二养': 2, '上声二十三梗': 11, '上声二十四迥': 11,
  '上声二十五有': 12, '上声二十六寝': 13, '上声二十七感': 14, '上声二十八俭': 14, '上声二十八琰': 14, '上声二十九豏': 14,
  '去声一送': 1, '去声二宋': 1, '去声三绛': 2, '去声四寘': 3, '去声五未': 3, '去声六御': 4, '去声七遇': 4,
  '去声八霁': 3, '去声九泰': 'H', '去声十卦': 'H', '去声十一队': 'H', '去声十二震': 6, '去声十三问': 6,
  '去声十四愿': 'H', '去声十五翰': 7, '去声十六谏': 7, '去声十七霰': 7, '去声十八啸': 8, '去声十九效': 8,
  '去声二十号': 8, '去声二十一个': 9, '去声二十二祃': 10, '去声二十三漾': 2, '去声二十四敬': 11,
  '去声二十五径': 11, '去声二十六宥': 12, '去声二十七沁': 13, '去声二十八勘': 14, '去声二十九艳': 14, '去声三十陷': 14,
  '入声一屋': 15, '入声二沃': 15, '入声三觉': 16, '入声四质': 17, '入声五物': 18, '入声六月': 18,
  '入声七曷': 18, '入声八黠': 18, '入声九屑': 18, '入声十药': 16, '入声十一陌': 17, '入声十二锡': 17,
  '入声十三职': 17, '入声十四缉': 17, '入声十五合': 19, '入声十六叶': 18, '入声十七洽': 19,
};
/* 半部裁决：[今音匹配归A, 否则归B, 匹配正则]
   佳蟹卦：涯类(a/ia/ua)→十部，其余(街鞋牌钗钗ai)→五部
   灰贿泰队：来开台该(ai)→五部，回梅雷杯(ei/ui)→三部
   元阮愿：言轩园(an)→七部，门魂痕(en/in/un/ün)→六部 */
const HALF_RULE = {
  '上平九佳': [10, 5, /^(a|ia|ua)$/], '上声九蟹': [10, 5, /^(a|ia|ua)$/], '去声十卦': [10, 5, /^(a|ia|ua)$/],
  '上平十灰': [5, 3, /^(ai|uai)$/], '上声十贿': [5, 3, /^(ai|uai)$/], '去声九泰': [5, 3, /^(ai|uai)$/],
  '去声十一队': [5, 3, /^(ai|uai)$/],
  '上平十三元': [7, 6, /^(an|uan|üan)$/], '上声十三阮': [7, 6, /^(an|uan|üan)$/], '去声十四愿': [7, 6, /^(an|uan|üan)$/],
};

async function buildCilinDerived() {
  const { pinyin } = require('pinyin-pro');
  const srcPs = JSON.parse(fs.readFileSync(path.join(OUT, 'zibiao-pingshui.json'), 'utf8'));
  const srcCl = JSON.parse(fs.readFileSync(path.join(RAW, 'Cilin_Rhyme.json'), 'utf8'));

  // ① 逐字表（权威）
  const table = {};
  for (const [bu, tones] of Object.entries(srcCl)) {
    const buNum = cnNum(bu.replace('第', '').replace('部', ''));
    if (!buNum) { console.log('未知词林部:', bu); continue; }
    for (const [tone, chars] of Object.entries(tones)) {
      const list = Array.isArray(chars) ? chars : Array.from(String(chars));
      for (const ch of list) {
        if (!ch || ch.length !== 1) continue;
        (table[ch] = table[ch] || []).push([tone === '平声' ? '平' : '仄', buNum]);
      }
    }
  }
  // ② 推导补全
  const pyCache = {};
  function finalOf(ch) {
    if (!pyCache[ch]) {
      try { pyCache[ch] = pinyin(ch, { pattern: 'final', toneType: 'none', type: 'array', multiple: true }); }
      catch { pyCache[ch] = []; }
    }
    return pyCache[ch].map(f => String(f).replace(/v/g, 'ü'));
  }
  let derived = 0, halfResolved = 0, unresolved = [];
  for (const [ch, entries] of Object.entries(srcPs)) {
    if (table[ch]) continue;
    const uniq = [];
    for (const [tone, yb] of entries) {
      const mapped = PS2CL[yb];
      if (mapped === undefined || mapped === 'H') continue;
      if (!uniq.some(x => x[0] === tone && x[1] === mapped)) uniq.push([tone === '入' ? '仄' : tone, mapped]);
    }
    const hasHalf = entries.some(([, yb]) => PS2CL[yb] === 'H');
    if (hasHalf) {
      const finals = finalOf(ch);
      for (const [tone, yb] of entries) {
        if (PS2CL[yb] !== 'H') continue;
        const [toA, toB, re] = HALF_RULE[yb];
        const target = finals.some(f => re.test(f)) ? toA : toB;
        const t2 = tone === '入' ? '仄' : tone;
        if (!uniq.some(x => x[0] === t2 && x[1] === target)) uniq.push([t2, target]);
        halfResolved++;
      }
    }
    if (uniq.length) { table[ch] = uniq; derived++; }
    else unresolved.push(ch);
  }
  const out = {};
  let poly = 0;
  for (const [ch, arr] of Object.entries(table)) {
    const seen = new Set();
    const uniq = arr.filter(x => { const k = x.join(','); if (seen.has(k)) return false; seen.add(k); return true; });
    uniq.sort((a, b) => (a[0] === '平' ? 0 : 1) - (b[0] === '平' ? 0 : 1) || a[1] - b[1]);
    if (uniq.length > 1) poly++;
    out[ch] = uniq;
  }
  fs.writeFileSync(path.join(OUT, 'zibiao-cilin.json'), JSON.stringify(out));
  console.log(`词林正韵: ${Object.keys(out).length} 字（多音 ${poly}；推导补全 ${derived}，半部裁决 ${halfResolved}，未解 ${unresolved.length}）`);
  if (unresolved.length && unresolved.length <= 60) console.log('未解字:', unresolved.join(''));
}

/* ---------- 中华通韵（十六韵）+ 拼音表 ---------- */
const TONGYUN_MAP = [
  [/^(a|ia|ua)$/, 1], [/^(o|uo)$/, 2], [/^(e|ie|üe|ue)$/, 3], [/^i$/, 4], [/^u$/, 5], [/^ü$/, 6],
  [/^(ai|uai)$/, 7], [/^(ei|ui)$/, 8], [/^(ao|iao)$/, 9], [/^(ou|iu)$/, 10],
  [/^(an|ian|uan|üan)$/, 11], [/^(en|in|un|ün)$/, 12], [/^(ang|iang|uang)$/, 13],
  [/^(eng|ing)$/, 14], [/^(ong|iong)$/, 15], [/^er$/, 16],
];
function tongyunBu(f) {
  for (const [re, n] of TONGYUN_MAP) if (re.test(f)) return n;
  return null;
}

async function buildTongyun() {
  const { pinyin } = require('pinyin-pro');
  const ps = JSON.parse(fs.readFileSync(path.join(OUT, 'zibiao-pingshui.json'), 'utf8'));
  const xy = JSON.parse(fs.readFileSync(path.join(OUT, 'zibiao-xinyun.json'), 'utf8'));
  const chars = Array.from(new Set([...Object.keys(ps), ...Object.keys(xy)]));
  const table = {};
  let pyOut = {}, noFinal = 0;
  for (const ch of chars) {
    let finals, fulls;
    try {
      finals = pinyin(ch, { pattern: 'final', toneType: 'none', type: 'array', multiple: true });
      fulls = pinyin(ch, { toneType: 'num', type: 'array', multiple: true });
    } catch { finals = []; fulls = []; }
    finals = [...new Set(finals || [])].map(f => String(f).replace(/v/g, 'ü')).filter(f => /^[a-zü]+$/.test(f));
    fulls = [...new Set(fulls || [])].map(r => String(r).replace(/v/g, 'ü')).filter(r => /^[a-zü]+[1-4]$/.test(r));
    if (fulls.length) pyOut[ch] = fulls;
    const entries = [];
    for (const f of finals) {
      const bu = tongyunBu(f);
      if (bu == null) { noFinal++; continue; }
      const reading = fulls.find(r => {
        const s = r.slice(0, -1);
        return s.endsWith(f) || (f.includes('ü') && s.replace(/u/g, 'ü').endsWith(f));
      }) || (f === 'i' ? fulls.find(r => /^[zcsr]h?i[1-4]$/.test(r)) : null);
      if (!reading) continue;
      entries.push([Number(reading.slice(-1)) <= 2 ? '平' : '仄', bu]);
    }
    if (entries.length) {
      const seen = new Set();
      table[ch] = entries.filter(x => { const k = x.join(','); if (seen.has(k)) return false; seen.add(k); return true; });
    }
  }
  fs.writeFileSync(path.join(OUT, 'zibiao-tongyun.json'), JSON.stringify(table));
  fs.writeFileSync(path.join(OUT, 'pinyin-map.json'), JSON.stringify(pyOut));
  console.log(`中华通韵: ${Object.keys(table).length} 字 → zibiao-tongyun.json；拼音表 ${Object.keys(pyOut).length} 字；韵母未匹配 ${noFinal}`);
}

buildPingshui();
buildXinyun();
buildCilinDerived().then(buildTongyun);
