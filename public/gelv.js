/* 诗匣格律引擎（乙编前端）
 * 依赖数据（懒加载）：zibiao-pingshui / zibiao-cilin / zibiao-xinyun / zibiao-tongyun / pinyin-map
 * 输出：逐字平仄标注 + 近体模板对照 + 体检问题清单 + 韵脚表 + 词谱对照
 */
'use strict';

window.GELV = (function () {
  const TABLES = {};
  const FILES = ['zibiao-pingshui', 'zibiao-cilin', 'zibiao-xinyun', 'zibiao-tongyun', 'pinyin-map'];
  let loading = null;

  async function ensureTables() {
    if (loading) return loading;
    loading = (async () => {
      for (const f of FILES) {
        const r = await fetch('/api/gelv/zibiao/' + f + '.json');
        TABLES[f] = await r.json();
      }
    })();
    return loading;
  }

  /* ---------- 字的读音查询 ---------- */
  /* 返回 [{tune:'平|上|去|入|平|仄', yb:'上平一东'|3, py:'zhōng'}]；tune 统一为 平/仄 + 原调标注 */
  function readings(ch, rhbook) {
    const res = [];
    let src = null, map = null;
    if (rhbook === '平水韵') { src = TABLES['zibiao-pingshui']; }
    else if (rhbook === '词林正韵') { src = TABLES['zibiao-cilin']; }
    else if (rhbook === '中华通韵') { src = TABLES['zibiao-tongyun']; }
    else if (rhbook === '中华新韵') { src = TABLES['zibiao-xinyun']; }
    if (!src) return res;
    const entries = src[ch];
    if (!entries) return res;
    const pys = TABLES['pinyin-map'][ch] || [];
    entries.forEach(([tune, yb], i) => {
      res.push({ tune, yb, py: pys[i] || pys[0] || '', idx: i });
    });
    return res;
  }

  /* 单字的平仄判定：返回 {ok, tone:'平|仄', detail:'平|上|去|入', yb, ru:bool, poly:bool, readings} */
  function judge(ch, rhbook, overrideIdx) {
    const rs = readings(ch, rhbook);
    if (!rs.length) return { ok: false, tone: '?', detail: '无考', yb: null, ru: false, poly: false, readings: [] };
    const pick = rs[overrideIdx != null && rs[overrideIdx] ? overrideIdx : 0];
    return {
      ok: true,
      tone: pick.tune === '平' ? '平' : '仄',
      detail: pick.tune === '平' ? '平' : pick.tune, // 平水韵返回 平/上/去/入；其余 平/仄
      yb: pick.yb,
      ru: pick.tune === '入',
      poly: rs.length > 1,
      readings: rs,
    };
  }

  /* ---------- 基础：内容 → 句 ---------- */
  function splitLines(content) {
    const out = [];
    String(content || '').split(/\r?\n/).forEach((raw, i) => {
      const text = raw.trim();
      if (text) out.push({ text, lineIdx: out.length, rawIdx: i });
    });
    return out;
  }

  /* 按标点断句：一行里可以有多句；空行分隔阕/章节。
     返回 [{text(无标点), lineIdx(句序), segIdx(段序)}] */
  function splitSentences(content) {
    const units = [];
    let segIdx = 0, pending = false;
    String(content || '').split(/\r?\n/).forEach(raw => {
      const line = raw.trim();
      if (!line) { if (units.length) pending = true; return; }
      if (pending) { segIdx++; pending = false; }
      for (const piece of line.split(/[，。、；：！？…？！,.;:]+/)) {
        const t = piece.replace(/\s+/g, '');
        if (t) units.push({ text: t, lineIdx: units.length, segIdx });
      }
    });
    return units;
  }
  function stripPunct(s) {
    return s.replace(/[，。、；：？！“”‘’「」『』（）《》〈〉,.:;?!()\-—\s·]/g, '');
  }

  const GENRES = {
    '五绝': { kind: 'jinti', len: 5, name: '五言绝句' },
    '七绝': { kind: 'jinti', len: 7, name: '七言绝句' },
    '五律': { kind: 'jinti', len: 5, minLines: 8, maxLines: 8, name: '五言律诗' },
    '七律': { kind: 'jinti', len: 7, minLines: 8, maxLines: 8, name: '七言律诗' },
    '排律': { kind: 'jinti', len: null, minLines: 6, name: '排律' },
    '古风·乐府': { kind: 'guti', name: '古风·乐府' },
    '诗经体': { kind: 'guti', name: '诗经体', lineLen: 4 },
    '词': { kind: 'ci', name: '词' },
    '不拘': { kind: 'guti', name: '不拘' },
  };
  const JINTI_SET = ['五绝', '七绝', '五律', '七律', '排律'];
  const RHBOOKS = ['平水韵', '词林正韵', '中华通韵', '中华新韵'];

  /* ---------- 近体模板生成 ---------- */
  const T5 = { A: '仄仄平平仄', B: '平平平仄仄', C: '平平仄仄平', D: '仄仄仄平平' };
  const T7 = { A: '平平仄仄平平仄', B: '仄仄平平平仄仄', C: '仄仄平平仄仄平', D: '平平仄仄仄平平' };
  const TYPE5 = { '仄仄': 'A', '平仄': 'B', '平平': 'C', '仄平': 'D' };   // 第2字,末字 → 句式
  const TYPE7 = { '平仄': 'A', '仄仄': 'B', '仄平': 'C', '平平': 'D' };

  function typeOf(t2, last, len) {
    const key = t2 + last;
    return (len === 5 ? TYPE5 : TYPE7)[key] || null;
  }
  function patternOf(type, len) { return (len === 5 ? T5 : T7)[type]; }

  /* 生成 n 句的模板（对/粘生成器） */
  function buildTemplate(lines, len, tones, poly) {
    const n = lines.length;
    const t2s = [], lasts = [];
    for (let i = 0; i < n; i++) {
      const chs = stripPunct(lines[i].text);
      const j2 = judge(chs[1] || '', poly.rhbook, poly.ov(i, 1));
      const jL = judge(chs[chs.length - 1] || '', poly.rhbook, poly.ov(i, chs.length - 1));
      t2s.push(j2.tone);
      lasts.push(jL.tone);
    }
    const first = typeOf(t2s[0], lasts[0], len);
    if (!first) return null;
    const seq = [first];
    for (let k = 1; k < n; k++) {
      const prev = patternOf(seq[k - 1], len);
      let t2, last;
      if (k % 2 === 1) {
        // 对句：第2字相反，末字平（偶数句押韵）
        t2 = prev[1] === '平' ? '仄' : '平';
        last = '平';
      } else {
        // 粘句（出句）：第2字相同，末字仄
        t2 = prev[1];
        last = '仄';
      }
      const t = typeOf(t2, last, len);
      if (!t) return null;
      seq.push(t);
    }
    return seq.map(t => patternOf(t, len));
  }

  function isPing(j) { return j.tone === '平'; }

  /* ---------- 近体检查 ---------- */
  function checkJinti(lines, opt) {
    const issues = [];
    const len = opt.len || inferLen(lines, issues);
    if (!len) return { issues };
    // 句长校验
    const bad = lines.filter(l => stripPunct(l.text).length !== len);
    if (bad.length) {
      issues.push({ sev: 'error', type: '句长', msg: `有 ${bad.length} 句不是${len}言（第 ${bad.map(b => b.lineIdx + 1).join('、')} 句），整句不参与模板对照` });
    }
    const good = lines.filter(l => stripPunct(l.text).length === len);
    if (good.length < 2) return { issues, len };

    const tpl = buildTemplate(good, len, null, opt);
    if (!tpl) {
      issues.push({ sev: 'warn', type: '模板', msg: '首句第二字读音存疑，无法确定平仄起式，模板对照不可用' });
      return { issues, len };
    }

    const lineStates = [];
    const feet = [];
    good.forEach((line, li) => {
      const chs = stripPunct(line.text).split('');
      const expected = tpl[li];
      const judges = chs.map((ch, ci) => judge(ch, opt.rhbook, opt.ov(line.lineIdx, ci)));
      const states = chs.map((ch, ci) => ({ ch, j: judges[ci], exp: expected[ci], state: 'ok', note: '' }));
      const strictPos = len === 5 ? [1, 3, 4] : [1, 3, 5, 6];
      const flexPos = len === 5 ? [0, 2] : [0, 2, 4];
      let lineSpecial = null;

      states.forEach((s, ci) => {
        if (!s.j.ok) { s.state = 'unknown'; s.note = '无考'; return; }
        if (s.j.poly) s.state = 'poly';
        const act = s.j.tone;
        if (act === s.exp) { if (s.state === 'poly') s.note = '多音，按' + s.j.detail; return; }
        if (flexPos.includes(ci)) {
          s.state = 'flex'; s.note = '可平可仄位';
        } else {
          s.state = '拗'; s.note = `应${s.exp === '平' ? '平' : '仄'}`;
        }
      });

      const typeKey = expected[1] + expected[expected.length - 1];
      const typeName = typeOf(expected[1], expected[expected.length - 1], len);

      // —— 特拗：B 型 平平平仄仄 → 平平仄平仄（五言）/ 仄仄平平平仄仄 → 仄仄平平仄平仄（七言）
      if (typeName === 'B') {
        const i1 = len === 5 ? 2 : 4, i2 = len === 5 ? 3 : 5, i3 = len - 1;
        const s1 = states[i1], s2 = states[i2], s3 = states[i3];
        if (s1.j.ok && s2.j.ok && s3.j.ok && s1.j.tone === '仄' && s2.j.tone === '平' && s3.j.tone === '仄') {
          s1.state = 'jiu'; s1.note = '特拗';
          s2.state = 'jiu'; s2.note = '特拗（三四/五六字互换）';
          lineSpecial = '特拗';
        }
      }
      // —— 孤平自救：C 型
      if (typeName === 'C') {
        const iOut = len === 5 ? 0 : 2;   // 起字的平位（七言第3字）
        const iSave = len === 5 ? 2 : 4;  // 自救位
        const sOut = states[iOut], sSave = states[iSave];
        if (sOut.j.ok && sOut.j.tone === '仄') {
          if (sSave.j.ok && sSave.j.tone === '平') {
            sOut.state = sOut.state === '拗' ? 'jiu' : sOut.state;
            sOut.note = '拗（孤平自救）';
            sSave.state = 'jiu'; sSave.note = '救孤平';
          } else {
            sOut.state = '拗';
            issues.push({ sev: 'error', type: '孤平', lineIdx: line.lineIdx, msg: `第 ${line.lineIdx + 1} 句犯孤平（${len === 5 ? '首字用仄，第三字须改平自救' : '第三字用仄，第五字须改平自救'}）` });
          }
        }
      }
      // —— 大拗对句救：A 型出句第4/6字拗，对句第3/5字平救
      if (typeName === 'A') {
        const iBad = len === 5 ? 3 : 5;
        const sBad = states[iBad];
        if (sBad.state === '拗') {
          const next = good[li + 1];
          if (next) {
            const nchs = stripPunct(next.text).split('');
            const iSave = len === 5 ? 2 : 4;
            if (iSave < nchs.length) {
              const sSave = judge(nchs[iSave], opt.rhbook, opt.ov(next.lineIdx, iSave));
              if (sSave.ok && sSave.tone === '平') {
                sBad.state = 'jiu'; sBad.note = '大拗';
                issues.push({ sev: 'info', type: '拗救', lineIdx: line.lineIdx, msg: `第 ${line.lineIdx + 1} 句大拗，已由对句第 ${iSave + 1} 字（${nchs[iSave]}）救` });
              } else {
                issues.push({ sev: 'error', type: '大拗', lineIdx: line.lineIdx, msg: `第 ${line.lineIdx + 1} 句第 ${iBad + 1} 字应平用仄，且对句未救` });
              }
            }
          }
        } else if (sBad.state === 'flex') {
          sBad.note = '可平可仄位（小拗宜救）';
        }
      }
      // —— 三平尾 / 三仄尾
      const last3 = states.slice(-3).map(s => s.j.tone);
      if (expected[expected.length - 1] === '平' && last3.every(t => t === '平')) {
        issues.push({ sev: 'error', type: '三平尾', lineIdx: line.lineIdx, msg: `第 ${line.lineIdx + 1} 句结尾三连平（三平尾）` });
      }
      if (expected[expected.length - 1] === '仄' && last3.every(t => t === '仄')) {
        issues.push({ sev: 'warn', type: '三仄尾', lineIdx: line.lineIdx, msg: `第 ${line.lineIdx + 1} 句结尾三连仄（三仄尾，小疵）` });
      }
      // —— 韵脚
      const lastChar = states[states.length - 1];
      if (expected[expected.length - 1] === '平') {
        lastChar.state = 'rhyme';
        const feetItem = { lineIdx: line.lineIdx, ch: lastChar.ch, j: lastChar.j };
        if (opt.rhbook === '平水韵' && lastChar.j.ru) feetItem.ru = true;
        feet.push(feetItem);
      }

      lineStates.push({ line, states, expected, typeName, special: lineSpecial });
    });

    // —— 韵部一致性
    if (feet.length >= 2) {
      const buOf = f => (opt.rhbook === '平水韵' ? f.j.yb : f.j.yb);
      const cilinOf = ch => {
        const e = (TABLES['zibiao-cilin'][ch] || [[null, null]])[0];
        return e ? e[1] : null;
      };
      const main = buOf(feet[feet.length - 1]);
      const mainName = main || '？';
      feet.forEach((f, fi) => {
        f.bu = buOf(f);
        if (fi === 0 && feet.length > 2 && f.bu !== main) {
          // 首句借邻韵判断（按词林正韵大部同即视为邻韵）
          const c1 = cilinOf(f.ch), cMain = cilinOf(feet[feet.length - 1].ch);
          if (c1 && cMain && c1 === cMain) {
            f.borrow = true;
            issues.push({ sev: 'info', type: '借邻韵', lineIdx: f.lineIdx, msg: `首句韵脚「${f.ch}」属${f.bu}，借邻韵（孤雁出群格），不算出韵` });
            f.note = '借邻韵';
          } else {
            issues.push({ sev: 'warn', type: '首句韵', lineIdx: f.lineIdx, msg: `首句韵脚「${f.ch}」属${f.bu}，与主韵${mainName}不同部且非邻韵` });
            f.bad = true;
          }
        } else if (fi > 0 && f.bu !== main) {
          issues.push({ sev: 'error', type: '出韵', lineIdx: f.lineIdx, msg: `第 ${f.lineIdx + 1} 句韵脚「${f.ch}」属${f.bu || '？'}，出韵（主韵为${mainName}）` });
          f.bad = true;
        }
      });
    }

    // —— 粘对实测（以实际第2、4、6字平仄为准）
    for (let i = 1; i < good.length; i++) {
      const prev = stripPunct(good[i - 1].text).split('');
      const cur = stripPunct(good[i].text).split('');
      const posList = len === 5 ? [1, 3] : [1, 3, 5];
      const isEven = (i + 1) % 2 === 0; // 第 i+1 句
      let conflict = 0, checked = 0;
      for (const p of posList) {
        if (p >= cur.length || p >= prev.length) continue;
        const a = judge(prev[p], opt.rhbook, opt.ov(good[i - 1].lineIdx, p));
        const b = judge(cur[p], opt.rhbook, opt.ov(good[i].lineIdx, p));
        if (!a.ok || !b.ok) continue;
        checked++;
        const same = a.tone === b.tone;
        if (isEven && same) conflict++;       // 对句应相反
        if (!isEven && !same) conflict++;     // 粘句应相同
      }
      if (checked && conflict >= 2) {
        issues.push({ sev: 'error', type: isEven ? '失对' : '失粘', lineIdx: good[i].lineIdx, msg: `第 ${good[i].lineIdx + 1} 句${isEven ? '与出句失对' : '与上句失粘'}（第2${len === 7 ? '、4、6' : '、4'}字实测）` });
      }
    }

    return { issues, len, lineStates, feet, template: tpl };
  }

  function inferLen(lines, issues) {
    const counts = {};
    lines.forEach(l => { const n = stripPunct(l.text).length; counts[n] = (counts[n] || 0) + 1; });
    const best = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
    if (!best || (Number(best[0]) !== 5 && Number(best[0]) !== 7)) return null;
    return Number(best[0]);
  }

  /* ---------- 古体/诗经体标注 ---------- */
  function checkGuti(lines, opt) {
    const issues = [];
    const lineStates = [];
    const feetAll = [];
    lines.forEach(line => {
      const chs = stripPunct(line.text).split('');
      const states = chs.map((ch, ci) => {
        const j = judge(ch, opt.rhbook, opt.ov(line.lineIdx, ci));
        return { ch, j, state: j.ok ? 'plain' : 'unknown', note: '' };
      });
      if (opt.genre === '诗经体' && chs.length !== 4) {
        issues.push({ sev: 'info', type: '句长', lineIdx: line.lineIdx, msg: `第 ${line.lineIdx + 1} 章句非四言（${chs.length} 字）——诗经以四言为主，此为提示非错误` });
      }
      lineStates.push({ line, states });
      if (chs.length) feetAll.push({ lineIdx: line.lineIdx, ch: chs[chs.length - 1], j: judge(chs[chs.length - 1], opt.rhbook, opt.ov(line.lineIdx, chs.length - 1)) });
    });
    // 韵段：句尾字连续同部视为一段韵
    const rhymeRuns = [];
    let run = null;
    feetAll.forEach(f => {
      const bu = f.j.ok ? f.j.yb : null;
      if (bu && (!run || run.bu !== bu)) {
        run = { bu, feet: [] };
        rhymeRuns.push(run);
      }
      if (run && run.bu === bu) run.feet.push(f);
    });
    rhymeRuns.forEach(r => { r.feet.forEach(f => { f.inRun = true; f.bu = r.bu; }); });
    return { issues, lineStates, rhymeRuns };
  }

  /* ---------- 词谱对照 ---------- */
  /* 词的正文按标点断句后与谱逐句对齐；同一词牌往往有多体，自动选与用户句读最合的一体 */
  async function checkCi(lines, opt, cipai) {
    const issues = [];
    const r = await fetch('/api/gelv/cipu/' + encodeURIComponent(cipai));
    if (!r.ok) { issues.push({ sev: 'error', type: '词谱', msg: '词谱未收录：' + cipai }); return { issues }; }
    const data = await r.json();

    // 自动选体：按各体的句长序列与用户句长序列的吻合度打分
    // （只比对齐的句位；用户句数少于谱不扣分——可能还没写完；得分接近时正体优先）
    const unitLens = lines.map(l => stripPunct(l.text).length);
    let best = { fi: 0, score: -Infinity };
    data.formats.forEach((f, fi) => {
      const lens = f.segs.map(seg => seg.map(l => l.p.length + 1)).flat();
      const L = Math.min(lens.length, unitLens.length);
      let score = 0;
      for (let i = 0; i < L; i++) {
        score += lens[i] === unitLens[i] ? 1 : -Math.min(2, Math.abs(lens[i] - unitLens[i])) * 0.6;
      }
      if (unitLens.length > lens.length) score -= (unitLens.length - lens.length) * 0.9;
      score /= Math.max(L, 1);
      score += fi === 0 ? 0.05 : 0.03 * (1 - fi / data.formats.length);   // 正体优先
      if (score > best.score) best = { fi, score };
    });
    const fmt = data.formats[best.fi];
    const rhymeType = /平韵/.test(fmt.sketch) ? '·平韵' : /仄韵/.test(fmt.sketch) ? '·仄韵' : '';
    const fmtLabel = (best.fi === 0 ? '正体' : '又一体' + (best.fi + 1) + '（' + (fmt.author || '佚名') + '体）') + rhymeType;

    const segLines = [];
    fmt.segs.forEach((seg, si) => {
      seg.forEach(l => segLines.push({ ...l, seg: si }));
    });
    if (lines.length !== segLines.length) {
      issues.push({ sev: 'warn', type: '句读', msg: `谱（${fmtLabel}）共 ${segLines.length} 句，你按标点断出了 ${lines.length} 句——句读需再核对，或换个词牌体` });
    }
    const lineStates = [];
    const feet = [];
    const n = Math.min(lines.length, segLines.length);
    for (let i = 0; i < n; i++) {
      const chs = stripPunct(lines[i].text).split('');
      const spec = segLines[i];
      const pat = (spec.p + spec.e).split('');
      const states = [];
      const maxc = Math.max(chs.length, pat.length);
      for (let ci = 0; ci < maxc; ci++) {
        const ch = chs[ci];
        const exp = pat[ci];
        if (ci >= pat.length) {
          states.push({ ch, j: judge(ch, opt.rhbook, opt.ov(lines[i].lineIdx, ci)), exp: null, state: 'extra', note: '超出谱外' });
          continue;
        }
        if (!ch) {
          states.push({ ch: '□', missing: true, exp, state: 'missing', note: `缺字（谱：${exp === '中' ? '平仄不拘' : exp}）` });
          continue;
        }
        const j = judge(ch, opt.rhbook, opt.ov(lines[i].lineIdx, ci));
        const st = { ch, j, exp, state: 'ok', note: '' };
        if (!j.ok) { st.state = 'unknown'; st.note = '无考'; }
        else if (exp === '中') { st.state = 'flex'; st.note = '中（不拘）'; }
        else if (j.tone !== exp) {
          st.state = '拗'; st.note = `谱要求${exp === '平' ? '平' : '仄'}`;
        }
        const isFeet = ci === pat.length - 1 && (spec.r === '韵' || spec.r === '叶' || spec.r === '换' || spec.r === '重');
        if (ci === pat.length - 1 && spec.r) st.rFlag = spec.r;
        if (isFeet) {
          st.state = st.state === 'ok' ? 'rhyme' : st.state;
          feet.push({ lineIdx: lines[i].lineIdx, ch, j, r: spec.r, bu: j.yb });
        }
        states.push(st);
      }
      if (chs.length !== pat.length) {
        issues.push({ sev: 'error', type: '字数', lineIdx: lines[i].lineIdx, msg: `第 ${i + 1} 句应为 ${pat.length} 字（${spec.r === '韵' ? '韵句' : spec.r === '读' ? '豆句' : '句'}），你写了 ${chs.length} 字` });
      }
      lineStates.push({ line: lines[i], states, expected: pat.join(''), rFlag: spec.r, seg: spec.seg });
    }
    // 韵部一致性（换韵分段检查）；韵脚多音字按主韵择音（如「恶」è/wù）
    const groups = [];
    feet.forEach(f => {
      const g = groups[groups.length - 1];
      if (f.r === '换' && g) { groups.push({ feet: [f] }); return; }
      if (!g) groups.push({ feet: [f] });
      else g.feet.push(f);
    });
    groups.forEach((g, gi) => {
      // 主韵取本组多数
      const counts = {};
      g.feet.forEach(f => { if (f.j.yb != null) counts[f.j.yb] = (counts[f.j.yb] || 0) + 1; });
      const bu0 = Number(Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0]);
      g.feet.forEach(f => {
        if (f.j.yb === bu0) return;
        // 多音择音：任一读音与主韵同部（且平仄一致）即认为押韵
        const hit = (f.j.readings || []).find(x => x.yb === bu0 && (x.tone === '平') === (f.j.tone === '平'));
        if (hit) {
          f.j = { ...f.j, yb: hit.yb, tone: hit.tone === '平' ? '平' : '仄' };
          f.note = '择音（' + (hit.py || '') + '）';
          return;
        }
        issues.push({ sev: 'error', type: '出韵', lineIdx: f.lineIdx, msg: `韵脚「${f.ch}」（第${f.j.yb || '?'}部）与同段主韵（第${bu0 || '?'}部）不同部，出韵` });
        f.bad = true;
      });
    });
    return { issues, lineStates, feet, cipai: { name: cipai, sketch: fmt.sketch, author: fmt.author, total: fmt.total, label: fmtLabel } };
  }

  /* ---------- 总入口 ---------- */
  async function annotate(content, opt) {
    await ensureTables();
    const genre = GENRES[opt.genre] ? opt.genre : '不拘';
    const lines = splitSentences(content);   // 按标点断句：一行可含多句，空行分阕
    opt = { ...opt, ov: (l, c) => ((opt.overrides || {})[`l${l}:${c}`]) };
    let result = { genre, lines, issues: [], lineStates: [], feet: [] };
    if (!lines.length) return result;

    if (GENRES[genre].kind === 'jinti') {
      result = { ...result, ...checkJinti(lines, opt) };
    } else if (GENRES[genre].kind === 'ci') {
      if (!opt.cipai) {
        result.issues.push({ sev: 'warn', type: '词牌', msg: '尚未选择词牌，暂只标注平仄，不作谱对照' });
        result = { ...result, ...checkGuti(lines, opt) };
      } else {
        result = { ...result, ...await checkCi(lines, opt, opt.cipai) };
      }
    } else {
      result = { ...result, ...checkGuti(lines, opt) };
    }
    result.summary = summarize(result);
    return result;
  }

  function summarize(r) {
    const errors = r.issues.filter(i => i.sev === 'error').length;
    const warns = r.issues.filter(i => i.sev === 'warn').length;
    return { errors, warns, ok: errors === 0 };
  }

  /* ---------- 供 AI 评价用的检测报告文本 ---------- */
  function reportText(r, opt) {
    if (!r || !r.issues) return '';
    const g = GENRES[r.genre] || GENRES['不拘'];
    const parts = [];
    parts.push(`体裁：${g.name}${opt.cipai ? '（' + opt.cipai + '）' : ''}；韵书：${opt.rhbook}`);
    if (r.template) {
      parts.push('模板对照（谱｜实际平仄）：');
      r.lineStates.forEach(ls => {
        const actual = ls.states.map(s => s.j.ok ? s.j.tone : '？').join('');
        const mark = ls.states.filter(s => s.state === '拗' || s.state === 'missing').length ? '有拗' : '合';
        parts.push(`  ${ls.expected} ｜ ${actual}  （${mark}${ls.special ? '·' + ls.special : ''}）`);
      });
    }
    if (r.feet && r.feet.length) {
      parts.push('韵脚：' + r.feet.map(f => `${f.ch}(${f.bu || '?'})${f.borrow ? '借邻韵' : ''}${f.bad ? '出韵' : ''}`).join('、'));
    }
    if (r.rhymeRuns && r.rhymeRuns.length) {
      parts.push('韵段：' + r.rhymeRuns.map(run => run.feet.map(f => f.ch).join('') + '→' + (run.bu || '?')).join('；'));
    }
    if (r.issues.length) {
      parts.push('检测问题：' + r.issues.map(i => `【${i.type}】${i.msg}`).join('；'));
    } else {
      parts.push('检测问题：无（本次检测未发现格律问题）');
    }
    return parts.join('\n');
  }

  return {
    ensureTables, judge, readings, annotate, reportText,
    GENRES, JINTI_SET, RHBOOKS, stripPunct, splitLines, splitSentences,
  };
})();
