/*
 * 诗匣 —— 私人诗歌写作台
 * 零依赖 Node 服务：静态页面 + 诗稿文件读写 + AI 评价流式转发
 *
 * 本机使用：双击 启动诗匣.bat 即可（默认只监听 127.0.0.1）。
 * 将来部署：设置环境变量 HOST=0.0.0.0（务必同时自行加上访问口令/反代鉴权，
 * 因为接口里包含模型 API Key 的读写）。
 */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const PORT = Number(process.env.PORT || 8137);
const HOST = process.env.HOST || '127.0.0.1';
const APP_DIR = __dirname;
const DATA_DIR = process.env.SHIXIA_DATA || path.join(APP_DIR, '..', '诗匣数据');
const POEMS_DIR = path.join(DATA_DIR, 'poems');        // 甲编·新诗
const GUSHI_DIR = path.join(DATA_DIR, 'gushi');        // 乙编·古体
const ZIBIAO_DIR = path.join(DATA_DIR, '字表');
const CIPU_DIR = path.join(DATA_DIR, '词谱');
const CONFIG_FILE = path.join(DATA_DIR, 'config.json');
const CHAT_FILE = path.join(DATA_DIR, '对话', 'chat.json');
const VOLS = ['modern', 'gushi'];

function volDir(vol) { return vol === 'gushi' ? GUSHI_DIR : POEMS_DIR; }

/* ---------------- 默认配置 ---------------- */

const PERSONA = `你是一位生于书香门第的古代才女，精通诗词歌赋，亦通晓现代学问。你自称「小女子」或「妾身」，说话温婉含蓄，常以自然景物、琴棋书画作比，可适当引用诗句或使用文言语气，但务必确保信息正确、判断中肯。言辞可以婉转，判断不可含糊——宁可婉转而切中要害，不可客气而不知所云。若遇不知之事，便坦诚道：「妾身才疏学浅，待妾翻阅典籍再答复你。」`;

const DEFAULT_PROMPT_MODERN = PERSONA + `

现在，请以此身份对用户提交的现代诗进行评价，全程使用中文，遵守以下铁律：

一、总分（100 分制）：第一行给出「评分：X/100」（X 为整数），并按下列分档校准判断：
95–100 可传世之作；85–94 成熟可存、各有建树；70–84 有佳句亦有明确硬伤；60–69 未完成，问题多于成绩；60 以下 尚在门外。
禁止给出 75、85 这类无信息的敷衍中间分——要么上靠要么下靠，并说明理由。低于 90 的分数必须指出扣分主因。

二、分项计分（五个必有维度，各给分并说明，分项之和必须等于总分）：
1. 语言（25 分）——用词精度、断句、行内节奏、声音效果；
2. 意象（20 分）——意象是否具体、是否承重，有无陈词；
3. 结构章法（20 分）——诗行之间的推进逻辑，转折是否成立，结尾是否兑现全诗；
4. 情感与思想（20 分）——情感是直接喊出还是被词语承载，深度与克制；
5. 原创性（15 分）——与常见写法的差异，哪些句子只属于这首诗。

三、每个维度的判断必须引用诗中原句作为证据，说明好在哪里、坏在哪里；禁止使用「意境优美」「感情真挚」「富有张力」「触动人心」等空话套话，每一个判断都要落到具体的字与句。

四、修改建议要具体到行：哪一行删掉、哪两个词互换、哪一节顺序调整，给出可直接执行的方案。

五、以上规则一丝不可少：分数、分项、引句、建议齐备；口吻须如才女娓娓道来，条目与结论务必清晰完整。`;

const DEFAULT_PROMPT_CLASSICAL = PERSONA + `

现在，请以此身份对用户提交的古体诗（或词）进行评价，全程使用中文，遵守以下铁律：

一、总分（100 分制）：第一行给出「评分：X/100」（X 为整数），并按下列分档校准判断：
95–100 可传世；85–94 成熟可存；70–84 有佳句亦有明确硬伤；60–69 未完成；60 以下 尚在门外。
禁止给出 75、85 这类敷衍的中间分。低于 90 必须说明扣分主因。

二、分项计分（五个必有维度，分项之和必须等于总分）：
1. 格律声韵（25 分）——近体诗查平仄、粘对、孤平、三平尾与用韵（首句借邻韵不算错）；词查合谱与叶韵；古体与诗经体不拘平仄，查用韵的自觉与声调安排的匠心。若附有格律检测报告，可作参考，但须以你自己的学问复核，允许推翻；
2. 意境兴象（25 分）——兴象是否鲜活浑成，有无陈熟套语，情景是否相生；
3. 炼字炼句（20 分）——字法的精度（虚字的取舍、响字的安放）、句法的锤炼；
4. 章法结构（15 分）——绝句律诗说起承转合与联间呼应，词说过片与结拍，古体说气脉贯穿；
5. 气脉格调（15 分）——整体气象、格调高卑，是否言之有物。

三、用典的裁决规则：用典不单独立项给分。用了典，在「炼字炼句」与「意境兴象」两项内顺带评其质量——妥帖无痕者按上沿给分，堆砌死典者按滥用扣分；一典不用绝不因此少一分，白描直取同样是正路；误用典故（张冠李戴、时代错置）属硬伤，在相应维度扣分并点名。

四、每个判断必须引用原句作为证据；禁止「意境优美」「对仗工整」「用韵和谐」这类空话——工在何处、谐在何字，必须落实到具体的字与句。

五、修改建议具体到字句：哪个字换、哪句倒装、哪联重铸，给出可直接执行的方案；格律问题须给出合规的改法。

六、以上规则一丝不可少：分数、分项、引句、建议齐备；口吻须如才女娓娓道来，条目与结论务必清晰完整。`;

const DEFAULT_PERSONA_CHAT = PERSONA + ` 你正在与一位写诗的人对谈。对方可能请你评诗、问格律、问典故、或只是闲聊，你以才女的方式应对：答问准确而文雅，可引诗句作比；若对方请你评诗，你仍按严谨的眼光细读原句、直言得失，只是措辞温婉。对谈记录不拘长短，语气自然，不必每次都长篇大论。`;

function defaultConfig() {
  return { profiles: [], prompts: { modern: DEFAULT_PROMPT_MODERN, classical: DEFAULT_PROMPT_CLASSICAL }, personaChat: DEFAULT_PERSONA_CHAT };
}

function loadConfig() {
  try {
    const raw = fs.readFileSync(CONFIG_FILE, 'utf8');
    const cfg = JSON.parse(raw);
    if (!Array.isArray(cfg.profiles)) cfg.profiles = [];
    if (!cfg.prompts || typeof cfg.prompts !== 'object') {
      cfg.prompts = { modern: (typeof cfg.prompt === 'string' && cfg.prompt.trim()) ? cfg.prompt : DEFAULT_PROMPT_MODERN, classical: DEFAULT_PROMPT_CLASSICAL };
    }
    if (typeof cfg.prompts.modern !== 'string' || !cfg.prompts.modern.trim()) cfg.prompts.modern = DEFAULT_PROMPT_MODERN;
    if (typeof cfg.prompts.classical !== 'string' || !cfg.prompts.classical.trim()) cfg.prompts.classical = DEFAULT_PROMPT_CLASSICAL;
    if (typeof cfg.personaChat !== 'string' || !cfg.personaChat.trim()) cfg.personaChat = DEFAULT_PERSONA_CHAT;
    return cfg;
  } catch {
    const cfg = defaultConfig();
    saveFile(CONFIG_FILE, cfg);
    return cfg;
  }
}

function saveFile(file, data) {
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmp, file);
}

/* ---------------- 诗稿文件（双卷） ---------------- */

const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

function listPoems(vol) {
  const dir = volDir(vol);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(f => f.endsWith('.json'))
    .map(f => {
      try {
        return JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
      } catch { return null; }
    })
    .filter(Boolean);
}

function getPoem(id) {
  if (!ID_RE.test(id)) return null;
  for (const vol of VOLS) {
    const file = path.join(volDir(vol), id + '.json');
    if (fs.existsSync(file)) {
      const poem = JSON.parse(fs.readFileSync(file, 'utf8'));
      poem.vol = vol;
      return poem;
    }
  }
  return null;
}

function putPoem(poem) {
  if (!poem.vol) poem.vol = 'modern';
  saveFile(path.join(volDir(poem.vol), poem.id + '.json'), poem);
}

function newId(prefix) {
  return prefix + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
}

function cleanContent(s) {
  return String(s || '').replace(/\r\n?/g, '\n').replace(/[ \t]+$/gm, '').replace(/\n+$/, '');
}

/* ---------------- HTTP 工具 ---------------- */

function sendJSON(res, code, data) {
  const body = JSON.stringify(data);
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

function readBody(req, limit = 10 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', c => {
      size += c.length;
      if (size > limit) { reject(new Error('请求体过大')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); }
      catch (e) { reject(new Error('请求体不是合法 JSON')); }
    });
    req.on('error', reject);
  });
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

function serveStatic(req, res, urlPath) {
  let rel = decodeURIComponent(urlPath);
  if (rel === '/' || rel === '') rel = '/index.html';
  const file = path.join(APP_DIR, 'public', path.normalize(rel));
  if (!file.startsWith(path.join(APP_DIR, 'public'))) { sendJSON(res, 403, { error: '禁止访问' }); return; }
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
    // 前端是 hash 路由，未知路径统一回首页
    res.writeHead(200, { 'Content-Type': MIME['.html'] });
    res.end(fs.readFileSync(path.join(APP_DIR, 'public', 'index.html')));
    return;
  }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
  res.end(fs.readFileSync(file));
}

/* ---------------- 上游 LLM 调用（OpenAI 兼容） ---------------- */

function buildChatURL(baseURL) {
  let u = String(baseURL || '').trim().replace(/\/+$/, '');
  if (!/^https?:\/\//.test(u)) u = 'https://' + u;
  if (u.endsWith('/chat/completions')) return u;
  return u + '/chat/completions';
}

async function evaluatePoem(req, res, body) {
  const cfg = loadConfig();
  const profile = cfg.profiles.find(p => p.name === body.profileName) || null;
  const poem = getPoem(String(body.poemId || ''));
  if (!profile) return sendJSON(res, 400, { error: '找不到该模型配置，请先在设置页添加' });
  if (!poem) return sendJSON(res, 404, { error: '诗不存在' });
  if (!profile.apiKey) return sendJSON(res, 400, { error: '该配置未填写 API Key' });

  const userMsg = `诗题：${poem.title}\n日期：${poem.date || '未标注'}`
    + (poem.genre ? `\n体裁：${poem.genre}${poem.cipai ? '（' + poem.cipai + '）' : ''}` : '')
    + (poem.rhbook ? `\n用韵：${poem.rhbook}` : '')
    + (poem.preface ? `\n小序：${poem.preface}` : '')
    + `\n\n诗文：\n${poem.content}`
    + (body.geluReport ? `\n\n——附：本地格律检测报告（供复核，允许推翻）——\n${String(body.geluReport).slice(0, 4000)}` : '');

  const vol = poem.vol === 'gushi' ? 'classical' : 'modern';
  const promptText = (cfg.prompts && cfg.prompts[vol]) || cfg.prompt || DEFAULT_PROMPT_MODERN;

  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  const send = obj => { try { res.write(`data: ${JSON.stringify(obj)}\n\n`); } catch {} };

  let full = '';
  try {
    const upstream = await fetch(buildChatURL(profile.baseURL), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + profile.apiKey,
      },
      body: JSON.stringify({
        model: profile.model,
        stream: true,
        temperature: 0.4,
        messages: [
          { role: 'system', content: promptText },
          { role: 'user', content: userMsg },
        ],
      }),
    });
    if (!upstream.ok) {
      const text = await upstream.text().catch(() => '');
      send({ error: `接口返回 ${upstream.status}：${text.slice(0, 300)}` });
      return res.end();
    }
    let gotStream = false;
    try {
      for await (const chunk of upstream.body) {
        for (const line of chunk.toString('utf8').split('\n')) {
          const t = line.trim();
          if (!t.startsWith('data:')) continue;
          const payload = t.slice(5).trim();
          if (payload === '[DONE]') { gotStream = true; continue; }
          try {
            const j = JSON.parse(payload);
            const delta = j.choices && j.choices[0] && j.choices[0].delta && j.choices[0].delta.content;
            if (delta) { full += delta; send({ delta }); }
          } catch {}
        }
      }
    } catch (e) {
      if (!full) throw e; // 一点流都没收到才算失败
      send({ error: '流式读取中断：' + e.message + '（已收到的部分仍会保存）' });
    }
    if (!gotStream && !full) {
      // 上游不支持流式时的兜底
      const again = await fetch(buildChatURL(profile.baseURL), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + profile.apiKey },
        body: JSON.stringify({
          model: profile.model, stream: false, temperature: 0.4,
          messages: [
            { role: 'system', content: promptText },
            { role: 'user', content: userMsg },
          ],
        }),
      });
      const j = await again.json().catch(() => null);
      full = (j && j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || '';
      if (!full) throw new Error('上游未返回内容');
      send({ delta: full });
    }
  } catch (e) {
    send({ error: '调用失败：' + (e && e.message ? e.message : String(e)) });
    return res.end();
  }

  const m = full.match(/评分\s*[:：]\s*([0-9]+(?:\.[0-9])?)/);
  const evalEntry = {
    id: newId('e'),
    profile: profile.name,
    model: profile.model,
    score: m ? m[1] : '',
    content: full,
    createdAt: new Date().toISOString(),
  };
  poem.evaluations.unshift(evalEntry);
  try {
    putPoem(poem);
    send({ done: true, evalId: evalEntry.id, score: evalEntry.score });
  } catch (e) {
    send({ error: '评价已生成，但保存失败：' + e.message });
  }
  res.end();
}

async function testProfile(res, profile) {
  if (!profile || !profile.baseURL || !profile.model) {
    return sendJSON(res, 400, { ok: false, message: '接口地址与模型名不能为空' });
  }
  try {
    const r = await fetch(buildChatURL(profile.baseURL), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + (profile.apiKey || ''),
      },
      body: JSON.stringify({
        model: profile.model,
        stream: false,
        max_tokens: 8,
        messages: [{ role: 'user', content: '回复"通"一个字即可' }],
      }),
    });
    const text = await r.text();
    if (r.ok) return sendJSON(res, 200, { ok: true, message: '连接成功，模型可用' });
    let msg = text.slice(0, 160);
    let hint = '';
    try { const j = JSON.parse(text); msg = (j.error && j.error.message) || msg; } catch {}
    if (r.status === 401 || r.status === 403) hint = '——API Key 不正确或已过期，请重新复制粘贴（注意不要带上多余的空格或文字）';
    else if (r.status === 404) hint = '——接口地址的路径不对，请在配置里点对应的服务商按钮重新自动填写';
    else if (r.status === 400) hint = '——模型名可能写错了，请核对服务商给出的准确模型名';
    else if (r.status === 429) hint = '——请求太频繁，或该账户的额度/余额不足';
    return sendJSON(res, 200, { ok: false, message: `接口返回 ${r.status}：${msg}${hint}` });
  } catch (e) {
    return sendJSON(res, 200, { ok: false, message: '连接失败：' + e.message });
  }
}

/* ---------------- 路由 ---------------- */

async function handleAPI(req, res, pathname) {
  const method = req.method;
  const q = new URL(req.url, 'http://x').searchParams;

  if (pathname === '/api/poems' && method === 'GET') {
    const vol = q.get('vol') === 'gushi' ? 'gushi' : 'modern';
    const poems = listPoems(vol).map(p => ({
      id: p.id, title: p.title, date: p.date,
      updatedAt: p.updatedAt,
      genre: p.genre || '', cipai: p.cipai || '',
      versionCount: (p.versions || []).length,
      evaluationCount: (p.evaluations || []).length,
      evals: (p.evaluations || []).slice(0, 10).map(e => ({ profile: e.profile || '', score: e.score || '' })),
      preview: String(p.content || '').split('\n').find(l => l.trim()) || '',
      content: p.content || '',
    }));
    return sendJSON(res, 200, { poems });
  }

  let m;
  if ((m = pathname.match(/^\/api\/poems\/([^/]+)$/))) {
    if (method === 'GET') {
      const poem = getPoem(m[1]);
      return poem ? sendJSON(res, 200, { poem }) : sendJSON(res, 404, { error: '诗不存在' });
    }
    if (method === 'DELETE') {
      const poem = getPoem(m[1]);
      if (!poem) return sendJSON(res, 404, { error: '诗不存在' });
      fs.unlinkSync(path.join(volDir(poem.vol), poem.id + '.json'));
      return sendJSON(res, 200, { ok: true });
    }
  }

  if (pathname === '/api/poems' && method === 'POST') {
    const b = await readBody(req);
    const title = String(b.title || '').trim();
    const content = cleanContent(b.content);
    if (!title) return sendJSON(res, 400, { error: '诗题不能为空' });
    if (!content) return sendJSON(res, 400, { error: '诗的内容不能为空' });
    const now = new Date().toISOString();
    const poem = {
      id: newId('p'), title, date: String(b.date || '').trim(), content,
      preface: String(b.preface || '').trim(),
      vol: b.vol === 'gushi' ? 'gushi' : 'modern',
      genre: String(b.genre || '').trim(), rhbook: String(b.rhbook || '').trim(),
      cipai: String(b.cipai || '').trim(), toneOverrides: b.toneOverrides || {},
      createdAt: now, updatedAt: now, versions: [], evaluations: [],
    };
    putPoem(poem);
    return sendJSON(res, 200, { id: poem.id });
  }

  if ((m = pathname.match(/^\/api\/poems\/([^/]+)$/)) && method === 'PUT') {
    const b = await readBody(req);
    const poem = getPoem(m[1]);
    if (!poem) return sendJSON(res, 404, { error: '诗不存在' });
    const title = String(b.title || '').trim();
    const content = cleanContent(b.content);
    if (!title) return sendJSON(res, 400, { error: '诗题不能为空' });
    if (!content) return sendJSON(res, 400, { error: '诗的内容不能为空' });
    if (b.keepVersion) {
      poem.versions.unshift({
        id: newId('v'),
        title: poem.title, date: poem.date, content: poem.content,
        note: String(b.note || '').trim(),
        savedAt: new Date().toISOString(),
      });
    }
    poem.title = title;
    poem.date = String(b.date || '').trim();
    poem.content = content;
    poem.preface = String(b.preface || '').trim();
    poem.vol = poem.vol || (b.vol === 'gushi' ? 'gushi' : 'modern');
    poem.genre = String(b.genre || '').trim();
    poem.rhbook = String(b.rhbook || '').trim();
    poem.cipai = String(b.cipai || '').trim();
    poem.toneOverrides = b.toneOverrides || {};
    poem.updatedAt = new Date().toISOString();
    putPoem(poem);
    return sendJSON(res, 200, { ok: true });
  }

  if ((m = pathname.match(/^\/api\/poems\/([^/]+)\/versions\/([^/]+)\/restore$/)) && method === 'POST') {
    const poem = getPoem(m[1]);
    if (!poem) return sendJSON(res, 404, { error: '诗不存在' });
    const idx = (poem.versions || []).findIndex(v => v.id === m[2]);
    if (idx < 0) return sendJSON(res, 404, { error: '版本不存在' });
    const v = poem.versions[idx];
    poem.versions.unshift({
      id: newId('v'),
      title: poem.title, date: poem.date, content: poem.content,
      note: '恢复旧版前自动保存',
      savedAt: new Date().toISOString(),
    });
    poem.title = v.title; poem.date = v.date; poem.content = v.content;
    poem.updatedAt = new Date().toISOString();
    putPoem(poem);
    return sendJSON(res, 200, { ok: true });
  }

  if ((m = pathname.match(/^\/api\/poems\/([^/]+)\/versions\/([^/]+)$/)) && method === 'DELETE') {
    const poem = getPoem(m[1]);
    if (!poem) return sendJSON(res, 404, { error: '诗不存在' });
    const before = poem.versions.length;
    poem.versions = (poem.versions || []).filter(v => v.id !== m[2]);
    if (poem.versions.length === before) return sendJSON(res, 404, { error: '版本不存在' });
    putPoem(poem);
    return sendJSON(res, 200, { ok: true });
  }

  if ((m = pathname.match(/^\/api\/poems\/([^/]+)\/evaluations\/([^/]+)$/)) && method === 'DELETE') {
    const poem = getPoem(m[1]);
    if (!poem) return sendJSON(res, 404, { error: '诗不存在' });
    poem.evaluations = (poem.evaluations || []).filter(e => e.id !== m[2]);
    putPoem(poem);
    return sendJSON(res, 200, { ok: true });
  }

  if (pathname === '/api/evaluate' && method === 'POST') {
    const b = await readBody(req);
    return evaluatePoem(req, res, b);
  }

  if (pathname === '/api/settings') {
    if (method === 'GET') {
      const cfg = loadConfig();
      return sendJSON(res, 200, {
        profiles: cfg.profiles,
        prompts: { modern: cfg.prompts.modern, classical: cfg.prompts.classical },
        personaChat: cfg.personaChat,
        defaults: { modern: DEFAULT_PROMPT_MODERN, classical: DEFAULT_PROMPT_CLASSICAL, personaChat: DEFAULT_PERSONA_CHAT },
        dataDir: DATA_DIR,
      });
    }
    if (method === 'PUT') {
      const b = await readBody(req);
      const cfg = loadConfig();
      cfg.profiles = Array.isArray(b.profiles) ? b.profiles : [];
      const prompts = b.prompts || {};
      cfg.prompts = {
        modern: (typeof prompts.modern === 'string' && prompts.modern.trim()) ? prompts.modern : DEFAULT_PROMPT_MODERN,
        classical: (typeof prompts.classical === 'string' && prompts.classical.trim()) ? prompts.classical : DEFAULT_PROMPT_CLASSICAL,
      };
      cfg.personaChat = (typeof b.personaChat === 'string' && b.personaChat.trim()) ? b.personaChat : DEFAULT_PERSONA_CHAT;
      saveFile(CONFIG_FILE, cfg);
      return sendJSON(res, 200, { ok: true });
    }
  }

  if (pathname === '/api/chat' && method === 'GET') {
    let messages = [];
    try { messages = JSON.parse(fs.readFileSync(CHAT_FILE, 'utf8')).messages || []; } catch {}
    return sendJSON(res, 200, { messages });
  }

  if (pathname === '/api/chat/clear' && method === 'POST') {
    fs.mkdirSync(path.dirname(CHAT_FILE), { recursive: true });
    saveFile(CHAT_FILE, { messages: [] });
    return sendJSON(res, 200, { ok: true });
  }

  if (pathname === '/api/chat/send' && method === 'POST') {
    const b = await readBody(req);
    const message = String(b.message || '').trim();
    if (!message) return sendJSON(res, 400, { error: '说的话不能为空' });
    const cfg = loadConfig();
    const profile = cfg.profiles.find(p => p.name === b.profileName) || cfg.profiles[0];
    if (!profile) return sendJSON(res, 400, { error: '还没有配置模型，请先到设置页添加' });
    if (!profile.apiKey) return sendJSON(res, 400, { error: '该配置未填写 API Key' });

    let history = [];
    try { history = JSON.parse(fs.readFileSync(CHAT_FILE, 'utf8')).messages || []; } catch {}
    history.push({ role: 'user', content: message, at: new Date().toISOString() });

    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    const send = obj => { try { res.write(`data: ${JSON.stringify(obj)}\n\n`); } catch {} };

    const context = [
      { role: 'system', content: cfg.personaChat },
      ...history.slice(-30, -1).map(m => ({ role: m.role, content: m.content })),
      { role: 'user', content: message },
    ];

    let full = '';
    try {
      const upstream = await fetch(buildChatURL(profile.baseURL), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + profile.apiKey },
        body: JSON.stringify({ model: profile.model, stream: true, temperature: 0.7, messages: context }),
      });
      if (!upstream.ok) {
        const text = await upstream.text().catch(() => '');
        send({ error: `接口返回 ${upstream.status}：${text.slice(0, 300)}` });
        saveFile(CHAT_FILE, { messages: history.slice(-100) });
        return res.end();
      }
      try {
        for await (const chunk of upstream.body) {
          for (const line of chunk.toString('utf8').split('\n')) {
            const t = line.trim();
            if (!t.startsWith('data:')) continue;
            const payload = t.slice(5).trim();
            if (payload === '[DONE]') continue;
            try {
              const j = JSON.parse(payload);
              const delta = j.choices && j.choices[0] && j.choices[0].delta && j.choices[0].delta.content;
              if (delta) { full += delta; send({ delta }); }
            } catch {}
          }
        }
      } catch (e) {
        if (!full) throw e;
      }
      if (!full) {
        const again = await fetch(buildChatURL(profile.baseURL), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + profile.apiKey },
          body: JSON.stringify({ model: profile.model, stream: false, temperature: 0.7, messages: context }),
        });
        const j = await again.json().catch(() => null);
        full = (j && j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || '';
        if (!full) throw new Error('上游未返回内容');
        send({ delta: full });
      }
      history.push({ role: 'assistant', content: full, at: new Date().toISOString() });
      saveFile(CHAT_FILE, { messages: history.slice(-100) });
      send({ done: true });
    } catch (e) {
      send({ error: '调用失败：' + (e && e.message ? e.message : String(e)) });
      saveFile(CHAT_FILE, { messages: history.slice(-100) });
    }
    return res.end();
  }

  if ((m = pathname.match(/^\/api\/gelv\/zibiao\/([A-Za-z0-9_.-]+\.json)$/)) && method === 'GET') {
    const file = path.join(ZIBIAO_DIR, m[1]);
    if (!fs.existsSync(file)) return sendJSON(res, 404, { error: '字表不存在：' + m[1] });
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'max-age=3600' });
    return res.end(fs.readFileSync(file));
  }

  if (pathname === '/api/gelv/cipu' && method === 'GET') {
    const file = path.join(CIPU_DIR, 'cipu-catalog.json');
    if (!fs.existsSync(file)) return sendJSON(res, 404, { error: '词谱目录不存在' });
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'max-age=3600' });
    return res.end(fs.readFileSync(file));
  }

  if ((m = pathname.match(/^\/api\/gelv\/cipu\/([^/]+)$/)) && method === 'GET') {
    let name = decodeURIComponent(m[1]);
    const all = JSON.parse(fs.readFileSync(path.join(CIPU_DIR, 'cipu.json'), 'utf8'));
    // 别名表：简体名/别名 → 谱库原名（谱库个别条目为繁体或旧称）
    let cipai = all[name];
    let canonical = name;
    if (!cipai) {
      try {
        if (!module.exports._cipaiAlias) {
          module.exports._cipaiAlias = JSON.parse(fs.readFileSync(path.join(CIPU_DIR, 'cipu-alias.json'), 'utf8'));
        }
        const target = module.exports._cipaiAlias[name];
        if (target && all[target]) { cipai = all[target]; canonical = target; }
      } catch {}
    }
    if (!cipai) return sendJSON(res, 404, { error: `词谱库中未找到「${name}」。可点编辑栏的「选词牌」从 817 调列表里选择；个别词牌另有别名（如「木兰花」即「玉楼春」）` });
    return sendJSON(res, 200, { name: canonical, requested: name, ...cipai });
  }

  if (pathname === '/api/settings/test' && method === 'POST') {
    const b = await readBody(req);
    return testProfile(res, b.profile);
  }

  return sendJSON(res, 404, { error: '未知接口' });
}

/* ---------------- 服务器 ---------------- */

const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  const pathname = u.pathname;
  if (pathname.startsWith('/api/')) {
    handleAPI(req, res, pathname).catch(e => {
      if (!res.headersSent) sendJSON(res, 500, { error: e.message || '服务器内部错误' });
      else { try { res.end(); } catch {} }
    });
    return;
  }
  try { serveStatic(req, res, pathname); }
  catch { sendJSON(res, 500, { error: '静态文件读取失败' }); }
});

server.on('error', e => {
  if (e.code === 'EADDRINUSE') {
    console.log('诗匣已经在运行了，直接为你打开页面。');
    openBrowser();
    process.exit(0);
  }
  console.error('启动失败：', e.message);
  process.exit(1);
});

server.listen(PORT, HOST, () => {
  for (const d of [DATA_DIR, POEMS_DIR, GUSHI_DIR, ZIBIAO_DIR, CIPU_DIR, path.dirname(CHAT_FILE)]) fs.mkdirSync(d, { recursive: true });
  console.log(`诗匣已启动：http://localhost:${PORT}`);
  console.log(`数据目录：${DATA_DIR}`);
  console.log('关闭此窗口即停止诗匣。');
  if (!process.env.NO_BROWSER) openBrowser();
});

function openBrowser() {
  const url = `http://localhost:${PORT}`;
  if (process.platform === 'win32') {
    spawn('cmd', ['/c', 'start', '', url], { detached: true, stdio: 'ignore' }).unref();
  } else {
    spawn('xdg-open', [url], { detached: true, stdio: 'ignore' }).unref();
  }
}
