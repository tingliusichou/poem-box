/* 诗匣 API 全流程测试（跑完自动清理测试数据） */
'use strict';
const BASE = 'http://localhost:8137';
let pass = 0, fail = 0;
function ok(cond, name, extra) {
  if (cond) { pass++; console.log('  ✓', name); }
  else { fail++; console.log('  ✗', name, extra !== undefined ? '→ ' + JSON.stringify(extra).slice(0, 200) : ''); }
}
async function j(method, path, body) {
  const r = await fetch(BASE + path, {
    method, headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: r.status, data: await r.json().catch(() => ({})) };
}

(async () => {
  console.log('— 1. 新建诗 —');
  const c1 = await j('POST', '/api/poems', { title: '测试之诗', date: '2026.11.18', content: '冬至后的第三个夜晚\n天不见月\n\n第二节 here' });
  ok(c1.status === 200 && c1.data.id, '新建成功', c1.data);
  const id = c1.data.id;

  const bad1 = await j('POST', '/api/poems', { title: '', date: '', content: 'x' });
  ok(bad1.status === 400, '空标题被拒绝');
  const bad2 = await j('POST', '/api/poems', { title: 'x', date: '', content: '   ' });
  ok(bad2.status === 400, '空内容被拒绝');

  console.log('— 2. 修改并保留旧版本 —');
  await j('PUT', '/api/poems/' + id, { title: '测试之诗', date: '2026.11.18', content: '改过的第一行\n天不见月\n\n第二节 here', keepVersion: true, note: '第一节改了' });
  await j('PUT', '/api/poems/' + id, { title: '测试·改题乙', date: '2026.07.09', content: '全新内容', keepVersion: true, note: '整首重写' });
  let g = await j('GET', '/api/poems/' + id);
  ok(g.data.poem.versions.length === 2, '两个旧版本已保留', g.data.poem.versions.length);
  ok(g.data.poem.versions[0].note === '整首重写', '备注与顺序正确（新的在前）', g.data.poem.versions[0].note);
  ok(g.data.poem.versions[1].content.startsWith('冬至后'), '第一版原文正确');
  ok(g.data.poem.content === '全新内容', '当前内容已覆盖');

  console.log('— 3. 恢复旧版本 —');
  const v2 = g.data.poem.versions[1].id;
  await j('POST', `/api/poems/${id}/versions/${v2}/restore`);
  g = await j('GET', '/api/poems/' + id);
  ok(g.data.poem.content.startsWith('冬至后'), '当前内容已恢复为旧版');
  ok(g.data.poem.versions.length === 3, '被替换的当前版自动存入历史', g.data.poem.versions.length);
  ok(g.data.poem.versions[0].note === '恢复旧版前自动保存', '自动存档备注正确');

  console.log('— 4. 删除旧版本（含确认由前端负责，接口直接删） —');
  const vDel = g.data.poem.versions[2].id;
  await j('DELETE', `/api/poems/${id}/versions/${vDel}`);
  g = await j('GET', '/api/poems/' + id);
  ok(g.data.poem.versions.length === 2, '版本已删除', g.data.poem.versions.length);
  ok(!g.data.poem.versions.some(v => v.id === vDel), '删的是目标版本');

  console.log('— 5. 评价接口的健壮性 —');
  const eNoProfile = await j('POST', '/api/evaluate', { poemId: id, profileName: '不存在的配置' });
  ok(eNoProfile.status === 400 && /找不到/.test(eNoProfile.data.error), '无配置时报错清晰', eNoProfile.data);
  await j('PUT', '/api/settings', { profiles: [{ name: '假模型', baseURL: 'http://localhost:9', model: 'x', apiKey: 'k' }], prompt: '' });
  const rawBad = await fetch(BASE + '/api/evaluate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ poemId: id, profileName: '假模型' }) });
  ok(rawBad.status === 200, 'SSE 通道建立', rawBad.status);
  const eText = await rawBad.text();
  ok(/调用失败|"error"/.test(eText), '上游不可达时返回错误事件', eText.slice(0, 120));
  g = await j('GET', '/api/poems/' + id);
  ok((g.data.poem.evaluations || []).length === 0, '失败的评价不落库');

  console.log('— 6. 设置读写 —');
  let s = await j('GET', '/api/settings');
  ok(s.data.profiles.length === 1 && s.data.profiles[0].name === '假模型', '配置可写入读出');
  ok(typeof s.data.prompts.modern === 'string' && s.data.prompts.modern.includes('100 分制'), '甲编准则存在（100分制）');
  ok(typeof s.data.prompts.classical === 'string' && s.data.prompts.classical.includes('用典'), '乙编准则存在（含用典裁决规则）');
  await j('PUT', '/api/settings', { profiles: [], prompt: s.data.prompt });
  s = await j('GET', '/api/settings');
  ok(s.data.profiles.length === 0, '配置可清空');
  const dupTest = await j('POST', '/api/settings/test', { profile: { name: 'x', baseURL: 'http://localhost:9', model: 'x', apiKey: 'k' } });
  ok(dupTest.status === 200 && dupTest.data.ok === false, '测试连接对不可达地址优雅失败', dupTest.data);

  console.log('— 7. 目录列表 —');
  const list = await j('GET', '/api/poems');
  ok(list.data.poems.some(p => p.id === id), '列表含测试诗');
  ok(list.data.poems.find(p => p.id === id).versionCount === 2, '列表带版本数');

  console.log(`\n结果：${pass} 通过，${fail} 失败`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('测试脚本异常：', e); process.exit(2); });
