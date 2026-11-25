/* 格律引擎测试：在 Node 中模拟 window 环境跑 gelv.js 用例 */
'use strict';
const fs = require('fs');
const path = require('path');

global.window = {};
const realFetch = global.fetch;
global.fetch = (url, opts) => realFetch('http://localhost:8137' + url, opts);
eval(fs.readFileSync(path.join(__dirname, '..', 'public', 'gelv.js'), 'utf8'));
const GELV = window.GELV;

let pass = 0, fail = 0;
function ok(cond, name, extra) {
  if (cond) { pass++; console.log('  ✓', name); }
  else { fail++; console.log('  ✗', name, extra !== undefined ? '→ ' + JSON.stringify(extra).slice(0, 300) : ''); }
}
function hasIssue(r, type, sev) {
  return r.issues.find(i => i.type === type && (!sev || i.sev === sev));
}

(async () => {
  await GELV.ensureTables();

  console.log('— 1. 枫桥夜泊（七绝·平水韵）应为合律 —');
  const fq = await GELV.annotate('月落乌啼霜满天\n江枫渔火对愁眠\n姑苏城外寒山寺\n夜半钟声到客船', { genre: '七绝', rhbook: '平水韵' });
  ok(fq.summary.errors === 0, '零错误', fq.issues);
  ok(fq.feet && fq.feet.length === 3, '韵脚 3 个（含首句入韵）', fq.feet && fq.feet.map(f => f.ch));
  ok(fq.feet.every(f => f.j.yb === '下平一先'), '韵脚同属下平一先', fq.feet.map(f => f.bu));
  const ke = fq.lineStates[3].states[5];
  ok(ke.j.ru === true, '「客」判为入声', ke.j);
  ok(!hasIssue(fq, '孤平') && !hasIssue(fq, '三平尾') && !hasIssue(fq, '失粘') && !hasIssue(fq, '失对'), '无孤平/三平尾/失粘/失对');

  console.log('— 2. 登鹳雀楼（五绝·平水韵）应为合律 —');
  const dg = await GELV.annotate('白日依山尽\n黄河入海流\n欲穷千里目\n更上一层楼', { genre: '五绝', rhbook: '平水韵' });
  ok(dg.summary.errors === 0, '零错误', dg.issues);
  const bai = dg.lineStates[0].states[0];
  ok(bai.j.ru === true && bai.j.tone === '仄', '「白」判入声作仄', bai.j);
  const yi = dg.lineStates[3].states[2];
  ok(yi.j.ru === true, '「一」判入声', yi.j);

  console.log('— 3. 人造孤平：第二句首字改仄 —');
  const gp = await GELV.annotate('白日依山尽\n夜河入海流\n欲穷千里目\n更上一层楼', { genre: '五绝', rhbook: '平水韵' });
  ok(!!hasIssue(gp, '孤平', 'error'), '检出孤平', gp.issues.map(i => i.type));

  console.log('— 4. 人造三平尾 —');
  const sp = await GELV.annotate('白日依山尽\n黄河入海流\n欲穷千里目\n更上烟波楼', { genre: '五绝', rhbook: '平水韵' });
  ok(!!hasIssue(sp, '三平尾', 'error'), '检出三平尾', sp.issues.map(i => i.type + ':' + i.msg.slice(0, 30)));

  console.log('— 5. 首句借邻韵（云/人/春：文借真）不算错 —');
  const jl = await GELV.annotate('夜半寒山闻断云\n江枫渔火对愁人\n姑苏城外寒山寺\n夜半钟声到晓春', { genre: '七绝', rhbook: '平水韵' });
  const borrow = hasIssue(jl, '借邻韵');
  ok(!!borrow, '标注借邻韵', jl.issues);
  ok(jl.summary.errors === 0, '且无错误', jl.issues);

  console.log('— 6. 出韵：第四句韵脚换部 —');
  const cy = await GELV.annotate('月落乌啼霜满天\n江枫渔火对愁眠\n姑苏城外寒山寺\n夜半钟声到客舟', { genre: '七绝', rhbook: '平水韵' });
  ok(!!hasIssue(cy, '出韵', 'error'), '检出出韵', cy.issues.map(i => i.type));

  console.log('— 7. 浣溪沙（苏轼·浣溪沙，韵同词林三部）按词谱对照应为零问题 —');
  const hx = await GELV.annotate('山下兰芽短浸溪\n松间沙路净无泥\n潇潇暮雨子规啼\n\n谁道人生无再少\n门前流水尚能西\n休将白发唱黄鸡', { genre: '词', rhbook: '词林正韵', cipai: '浣溪沙' });
  ok(hx.summary.errors === 0, '零错误', hx.issues);
  ok(hx.feet.length === 5, '韵脚 5 个（上三下二）', hx.feet && hx.feet.map(f => f.ch));
  ok(hx.feet.every(f => f.j.yb === 3), '韵脚同属词林三部', hx.feet.map(f => f.j.yb));

  console.log('— 7b. 晏殊浣溪沙（杯台回来徊）按词林正韵应检出出韵（十灰混押案例） —');
  const ys = await GELV.annotate('一曲新词酒一杯\n去年天气旧亭台\n夕阳西下几时回\n\n无可奈何花落去\n似曾相识燕归来\n小园香径独徘徊', { genre: '词', rhbook: '词林正韵', cipai: '浣溪沙' });
  ok(!!hasIssue(ys, '出韵', 'error'), '按词林正韵检出出韵', ys.issues.map(i => i.type));

  console.log('— 8. 词谱多字/缺字检测 —');
  const hc = await GELV.annotate('山下兰芽短浸溪\n松间沙路净无泥啊\n潇潇暮雨子规啼\n\n谁道人生无再少\n门前流水尚能西\n休将白发唱黄鸡', { genre: '词', rhbook: '词林正韵', cipai: '浣溪沙' });
  ok(!!hasIssue(hc, '字数', 'error'), '检出多字', hc.issues.map(i => i.type));

  console.log('— 9. 新韵/通韵模式：普通话读音判平仄 —');
  const xy = await GELV.annotate('白日依山尽\n黄河入海流\n欲穷千里目\n更上一层楼', { genre: '五绝', rhbook: '中华新韵' });
  ok(!!hasIssue(xy, '三平尾', 'error'), '新韵下「一」读平，「更上一层楼」正确判出三平尾（唐音仄、今音平）', xy.issues.map(i => i.type));
  ok(xy.lineStates[0].states[0].j.tone === '平' && xy.lineStates[0].states[0].j.yb === 4, '「白」按普通话判平、四开部', xy.lineStates[0].states[0].j);
  const tz = await GELV.annotate('月落乌啼霜满天\n江枫渔火对愁眠\n姑苏城外寒山寺\n夜半钟声到客船', { genre: '七绝', rhbook: '中华通韵' });
  ok(tz.feet.every(f => f.j.yb === 11), '通韵韵脚同属十一安', tz.feet && tz.feet.map(f => f.j.yb));

  console.log('— 10. 报告文本生成 —');
  const rep = GELV.reportText(fq, { genre: '七绝', rhbook: '平水韵', cipai: '' });
  ok(rep.includes('模板对照') && rep.includes('韵脚'), '报告含模板与韵脚', rep.slice(0, 120));

  console.log('— 11. 词按标点断句：苏轼〈念奴娇·赤壁怀古〉一行多句 —');
  const nn = await GELV.annotate(
    '大江东去，浪淘尽，千古风流人物。\n故垒西边，人道是，三国周郎赤壁。乱石穿空，惊涛拍岸，卷起千堆雪。江山如画，一时多少豪杰。\n\n遥想公瑾当年，小乔初嫁了，雄姿英发。羽扇纶巾，谈笑间，樯橹灰飞烟灭。\n故国神游，多情应笑我，早生华发。人生如梦，一尊还酹江月。',
    { genre: '词', rhbook: '词林正韵', cipai: '念奴娇' });
  ok(!hasIssue(nn, '字数'), '按标点断句后无字数错位', nn.issues.filter(i => i.type === '字数').map(i => i.msg));
  ok(nn.feet.length === 8, '韵脚 8 个（物壁雪杰发灭发月，「发」依谱亦是韵）', nn.feet && nn.feet.map(f => f.ch));
  ok(nn.feet.map(f => f.ch).join('') === '物壁雪杰发灭发月', '韵脚顺序正确', nn.feet && nn.feet.map(f => f.ch));
  ok(!!nn.feet.find(f => f.ch === '壁' && f.bad), '「壁」出韵按词林正韵正确标出（质陌锡混入月屑，著名案例）');
  ok(nn.cipai && /又一体/.test(nn.cipai.label), '自动匹配到苏轼大江东去体：' + (nn.cipai && nn.cipai.label));

  console.log('— 12. 近体两句一行（含标点）也能断句检律 —');
  const lj = await GELV.annotate('白日依山尽，黄河入海流。\n欲穷千里目，更上一层楼。', { genre: '五绝', rhbook: '平水韵' });
  ok(lj.summary.errors === 0, '两句一行零错误', lj.issues);
  ok(lj.feet && lj.feet.map(f => f.ch).join('') === '流楼', '韵脚 流/楼 正确', lj.feet && lj.feet.map(f => f.ch));

  console.log(`\n结果：${pass} 通过，${fail} 失败`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('测试异常：', e); process.exit(2); });
