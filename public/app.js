/* 诗匣 前端 —— 原生 JS，无构建 */
'use strict';

/* ================= 基础工具 ================= */

const $app = document.getElementById('app');
const $modalRoot = document.getElementById('modal-root');
const $toastRoot = document.getElementById('toast-root');
const $evalRoot = document.getElementById('eval-overlay-root');

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

async function api(path, opts = {}) {
  const r = await fetch(path, {
    method: opts.method || 'GET',
    headers: { 'Content-Type': 'application/json' },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || `请求失败（${r.status}）`);
  return data;
}

function toast(msg, type) {
  const el = document.createElement('div');
  el.className = 'toast' + (type === 'err' ? ' err' : '');
  el.textContent = msg;
  $toastRoot.appendChild(el);
  setTimeout(() => { el.style.transition = 'opacity .3s'; el.style.opacity = '0'; }, 2200);
  setTimeout(() => el.remove(), 2600);
}

function todayStr() {
  const d = new Date();
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())}`;
}

function fmtTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d)) return iso;
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/* ================= 弹窗 ================= */

function showModal({ title, html, wide, onMount, buttons }) {
  const mask = document.createElement('div');
  mask.className = 'modal-mask';
  mask.innerHTML = `
    <div class="modal${wide ? ' wide' : ''}">
      <div class="modal-head"><h3>${esc(title)}</h3></div>
      <div class="modal-body"></div>
      <div class="modal-foot"></div>
    </div>`;
  const bodyEl = mask.querySelector('.modal-body');
  const footEl = mask.querySelector('.modal-foot');
  bodyEl.innerHTML = html;
  function close() { mask.remove(); document.removeEventListener('keydown', onKey); }
  function onKey(e) { if (e.key === 'Escape') close(); }
  document.addEventListener('keydown', onKey);
  mask.addEventListener('mousedown', e => { if (e.target === mask) close(); });
  for (const b of buttons || []) {
    const btn = document.createElement('button');
    btn.className = 'btn' + (b.class ? ' ' + b.class : '');
    btn.textContent = b.label;
    btn.onclick = async () => {
      let ok = true;
      if (b.onClick) ok = await b.onClick(bodyEl, close);
      if (ok !== false && !b.keepOpen) close();
    };
    footEl.appendChild(btn);
  }
  // 先挂载再 onMount，保证 onMount 里能用 document 查询到弹窗内元素
  $modalRoot.appendChild(mask);
  if (onMount) onMount(bodyEl, close);
  return { close, bodyEl };
}

function confirmModal({ title, message, confirmLabel = '确认', danger, onConfirm }) {
  showModal({
    title,
    html: `<p>${message}</p>`,
    buttons: [
      { label: '取消', class: 'ghost' },
      { label: confirmLabel, class: danger ? 'danger' : 'primary', onClick: async () => { await onConfirm(); } },
    ],
  });
}

/* ================= 卷与路由 ================= */

function currentVol() { return localStorage.getItem('shixia:vol') === 'gushi' ? 'gushi' : 'modern'; }
function setVol(v) { localStorage.setItem('shixia:vol', v === 'gushi' ? 'gushi' : 'modern'); }

window.renderMasthead = function (vol) {
  return `
  <div class="masthead">
    <span class="seal-mark">诗</span>
    <h1>诗匣</h1>
    <span class="sub">${vol === 'gushi' ? '乙编 · 古体' : '甲编 · 新诗'}</span>
    <div class="vol-tabs">
      <button data-vol="modern" class="${vol === 'modern' ? 'on' : ''}" title="现代诗">甲编</button>
      <button data-vol="gushi" class="${vol === 'gushi' ? 'on' : ''}" title="古体诗与词">乙编</button>
    </div>
  </div>`;
};

window.routeAfterVol = function () { route(); };

function route() {
  const hash = location.hash || '#/';
  closeAllOverlays();
  applyFontPref();
  const vol = currentVol();
  let m;
  if (hash === '#/' || hash === '') return vol === 'gushi' ? GUSHI.renderCatalog() : renderCatalog();
  if (hash === '#/new') return vol === 'gushi' ? GUSHI.renderEditor(null) : renderEditor(null);
  if (hash === '#/settings') return renderSettings();
  if (hash === '#/chat') return renderChat();
  if ((m = hash.match(/^#\/poem\/([^/]+)$/))) return routePoem(m[1], p => p.vol === 'gushi' ? GUSHI.renderDetail(p) : renderDetail(p.id));
  if ((m = hash.match(/^#\/edit\/([^/]+)$/))) return routePoem(m[1], p => p.vol === 'gushi' ? GUSHI.renderEditor(p) : renderEditor(p.id));
  renderCatalog();
}

async function routePoem(id, dispatch) {
  $app.innerHTML = '<div class="boot">展卷……</div>';
  let poem;
  try {
    poem = (await api('/api/poems/' + encodeURIComponent(id))).poem;
  } catch (e) { $app.innerHTML = `<div class="boot">${esc(e.message)}</div>`; return; }
  if (poem.vol && poem.vol !== currentVol()) setVol(poem.vol); // 深链落在另一卷时校正卷签
  dispatch(poem);
}
window.addEventListener('hashchange', route);

function go(hash) {
  if (location.hash === hash) route();
  else location.hash = hash;
}

function scoreBadges(evals, total) {
  const list = evals || [];
  if (!list.length) return total ? `<span class="badge">评 ${total}</span>` : '';
  const cls = s => {
    const n = parseFloat(s);
    if (isNaN(n)) return 's-low';
    const v = n <= 10 ? n * 10 : n;   // 兼容旧十分制记录
    return v >= 90 ? 's-high' : v >= 80 ? 's-mid' : 's-low';
  };
  const one = e => `<span class="badge score ${cls(e.score)}">${esc(e.profile || '评')}${e.score ? ' ' + esc(e.score) : ''}</span>`;
  const head = list.slice(0, 2).map(one).join('');
  const rest = list.length - 2;
  return head + (rest > 0 ? `<span class="badge score s-low">+${rest}</span>` : '');
}

/* ================= 目录页 ================= */

async function renderCatalog() {
  $app.innerHTML = '<div class="boot">翻开诗匣……</div>';
  let poems = [];
  try {
    poems = (await api('/api/poems')).poems;
  } catch (e) { $app.innerHTML = `<div class="boot">加载失败：${esc(e.message)}</div>`; return; }

  const q = '';
  $app.innerHTML = `
  <div class="page">
    ${window.renderMasthead('modern')}
    <div class="toolbar-row">
      <div class="search-wrap"><input id="search" placeholder="搜诗题或诗句…" value="${esc(q)}"></div>
      <div class="spacer"></div>
      <a class="btn ghost" href="/manual.html" target="_blank">手册</a>
      <a class="btn ghost" href="#/chat">对谈</a>
      <a class="btn ghost" href="#/settings">设置</a>
      <button class="btn primary" id="btn-new">＋ 写新诗</button>
    </div>
    <div id="catalog-body"></div>
  </div>`;

  document.getElementById('btn-new').onclick = () => go('#/new');
  const searchEl = document.getElementById('search');
  const bodyEl = document.getElementById('catalog-body');

  function drawList(query) {
    const kw = (query || '').trim().toLowerCase();
    const filtered = kw
      ? poems.filter(p => (p.title || '').toLowerCase().includes(kw) || (p.content || '').toLowerCase().includes(kw))
      : poems;
    if (!filtered.length) {
      bodyEl.innerHTML = kw
        ? `<div class="empty-state"><p>没有找到含「${esc(query)}」的诗。</p></div>`
        : `<div class="empty-state">
             <div class="glyph">空</div>
             <p>诗匣还空着，写下第一首吧。</p>
             <button class="btn primary big" id="btn-new2">＋ 写新诗</button>
           </div>`;
      const b2 = document.getElementById('btn-new2');
      if (b2) b2.onclick = () => go('#/new');
      return;
    }
    const groups = {};
    for (const p of filtered) {
      const ym = (p.date || '').match(/^(\d{4})/);
      const y = ym ? ym[1] : '未标年份';
      (groups[y] = groups[y] || []).push(p);
    }
    const years = Object.keys(groups).sort((a, b) => {
      if (a === '未标年份') return 1;
      if (b === '未标年份') return -1;
      return b.localeCompare(a);
    });
    let html = '';
    for (const y of years) {
      const list = groups[y].slice().sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.updatedAt || '').localeCompare(a.updatedAt || ''));
      html += `<div class="year-block"><div class="year-label">${esc(y)}</div><ul class="poem-list">`;
      for (const p of list) {
        html += `
        <li class="poem-li" data-id="${esc(p.id)}">
          <div class="poem-item">
            <span class="t">${esc(p.title)}${p.cipai ? `<span class="cipai-tag">「${esc(p.cipai)}」</span>` : ''}</span>
            <span class="dots"></span>
            <span class="badges">
              ${p.versionCount ? `<span class="badge">旧版 ${p.versionCount}</span>` : ''}
              ${scoreBadges(p.evals, p.evaluationCount)}
            </span>
            <span class="d">${esc(p.date || '　')}</span>
            ${p.versionCount ? '<button class="v-expander" title="展开历史版本">▾</button>' : ''}
          </div>
          <div class="v-sublist" hidden></div>
        </li>`;
    }
    html += '</ul></div>';
    }
    html += '</ul></div>';
    bodyEl.innerHTML = html;
    bodyEl.querySelectorAll('.poem-item').forEach(row => {
      row.onclick = () => go('#/poem/' + row.closest('.poem-li').dataset.id);
    });
    bodyEl.querySelectorAll('.v-expander').forEach(btn => {
      btn.onclick = async e => {
        e.stopPropagation();
        const li = btn.closest('.poem-li');
        const sub = li.querySelector('.v-sublist');
        const opening = sub.hidden;
        btn.classList.toggle('open', opening);
        if (!opening) { sub.hidden = true; return; }
        if (!sub.dataset.loaded) {
          sub.innerHTML = '<div class="v-sub-loading">载入版本…</div>';
          sub.hidden = false;
          try {
            const poem = (await api('/api/poems/' + li.dataset.id)).poem;
            const vs = poem.versions || [];
            sub.innerHTML = vs.length ? vs.map(v => `
              <button class="v-sub-line">
                <span class="v-sub-note">${esc(v.note || '未写备注')}</span>
                <span class="v-sub-time">${esc(fmtTime(v.savedAt))}</span>
              </button>`).join('')
              : '<div class="v-sub-loading">没有历史版本</div>';
            sub.querySelectorAll('.v-sub-line').forEach(line => {
              line.onclick = () => go('#/poem/' + li.dataset.id);
            });
          } catch (err) { sub.innerHTML = `<div class="v-sub-loading">${esc(err.message)}</div>`; }
          sub.dataset.loaded = '1';
        } else {
          sub.hidden = false;
        }
      };
    });
  }
  drawList('');
  searchEl.oninput = () => drawList(searchEl.value);
}

/* ================= 详情页 ================= */

function renderPoemHTML(p, align) {
  const stanzas = String(p.content || '').split(/\n{2,}/).filter(s => s.trim());
  const body = stanzas.length
    ? stanzas.map(st =>
        `<div class="stanza">${esc(st).split('\n').map(l => `<div class="verse">${l || '　'}</div>`).join('')}</div>`
      ).join('')
    : '<div class="p-empty">（暂无内容）</div>';
  return `
    <div class="poem-view${align === 'center' ? '' : ' left-align'}">
      <div class="p-title">${esc(p.title)}</div>
      <div class="p-date">${esc(p.date || '')}</div>
      ${p.preface ? `<div class="p-preface">${esc(p.preface)}</div>` : ''}
      ${body}
    </div>`;
}

async function renderDetail(id) {
  $app.innerHTML = '<div class="boot">展卷……</div>';
  let poem;
  try {
    poem = (await api('/api/poems/' + encodeURIComponent(id))).poem;
  } catch (e) { $app.innerHTML = `<div class="boot">${esc(e.message)}</div>`; return; }

  const align = localStorage.getItem('shixia:align') || 'left';
  const versions = poem.versions || [];
  const evals = poem.evaluations || [];

  $app.innerHTML = `
  <div class="page">
    <button class="back-link">← 返回目录</button>
    <div class="paper">${renderPoemHTML(poem, align)}</div>
    <div class="action-row">
      <button class="btn primary" id="a-edit">编辑</button>
      <button class="btn" id="a-eval">AI 评价</button>
      <button class="btn" id="a-versions">版本${versions.length ? `（${versions.length}）` : ''}</button>
      <div class="spacer"></div>
      ${fontSelectHTML('a-font')}
      <button class="btn danger" id="a-del">删除此诗</button>
    </div>

    <div class="section" id="sec-versions">
      <div class="section-head" id="sh-versions"><span class="caret">▶</span><h3>保留的旧版本</h3><span class="n">${versions.length ? versions.length + ' 个' : '暂无'}</span></div>
      <div class="section-body" id="sb-versions">${
        versions.length ? versions.map(v => `
          <div class="version-row" data-vid="${esc(v.id)}">
            <div class="v-head">
              <span class="v-note${v.note ? '' : ' muted'}">${v.note ? esc(v.note) : '未写备注'}</span>
              <span class="v-time">${esc(fmtTime(v.savedAt))}</span>
              <span class="row-actions">
                <button class="btn small ghost" data-act="view">查看全文</button>
                <button class="btn small ghost" data-act="diff">与当前版对比</button>
                <button class="btn small" data-act="restore">设为当前</button>
                <button class="btn small danger" data-act="del">删除</button>
              </span>
            </div>
            <div class="preview-snippet">${esc((v.content || '').split('\n').filter(l => l.trim()).slice(0, 2).join(' ／ '))}</div>
          </div>`).join('') : '<div style="padding:16px 4px;color:#a2967f;font-size:13.5px;">保存修改时勾选「存入历史」，旧版本就会出现在这里。</div>'
      }</div>
    </div>

    <div class="section" id="sec-evals">
      <div class="section-head" id="sh-evals"><span class="caret">▶</span><h3>AI 评价</h3><span class="n">${evals.length ? evals.length + ' 条' : '暂无'}</span></div>
      <div class="section-body" id="sb-evals">${
        evals.length ? evals.map(e => `
          <div class="eval-row" data-eid="${esc(e.id)}">
            <div class="e-head">
              <span class="e-model">${esc(e.profile || '未命名模型')}<span class="muted"> · ${esc(e.model || '')}</span></span>
              ${e.score ? `<span class="score-badge">评分 ${esc(e.score)}/10</span>` : ''}
              <span class="e-time">${esc(fmtTime(e.createdAt))}</span>
              <span class="row-actions">
                <button class="btn small ghost" data-act="toggle">展开 / 收起</button>
                <button class="btn small danger" data-act="del">删除</button>
              </span>
            </div>
            <div class="eval-content"><div class="eval-text">${esc(e.content)}</div></div>
          </div>`).join('') : '<div style="padding:16px 4px;color:#a2967f;font-size:13.5px;">点上方「AI 评价」，为这首诗请一位严格的编辑。</div>'
      }</div>
    </div>
  </div>`;

  $app.querySelector('.back-link').onclick = () => go('#/');
  bindFontSelect(document.getElementById('a-font'));
  document.getElementById('a-edit').onclick = () => go('#/edit/' + id);
  document.getElementById('a-del').onclick = () => {
    confirmModal({
      title: '删除整首诗',
      message: `确定要删除《${esc(poem.title)}》吗？<br><span class="warn-line">将连同 ${versions.length} 个旧版本、${evals.length} 条 AI 评价一起删除，删除后无法恢复。</span>`,
      confirmLabel: '确认删除',
      danger: true,
      onConfirm: async () => {
        try {
          await api('/api/poems/' + encodeURIComponent(id), { method: 'DELETE' });
          toast('已删除《' + poem.title + '》');
          go('#/');
        } catch (e) { toast(e.message, 'err'); }
      },
    });
  };

  // 版本区折叠
  const secV = document.getElementById('sec-versions');
  const shV = document.getElementById('sh-versions');
  const sbV = document.getElementById('sb-versions');
  shV.onclick = () => { secV.classList.toggle('open'); sbV.classList.toggle('open'); shV.classList.toggle('open'); };
  sbV.querySelectorAll('.version-row').forEach(row => {
    const vid = row.dataset.vid;
    const v = versions.find(x => x.id === vid);
    row.querySelectorAll('button').forEach(btn => {
      btn.onclick = () => {
        const act = btn.dataset.act;
        if (act === 'view') {
          showModal({
            title: '旧版本 · ' + (v.note || '未写备注'),
            html: `<div style="${align === 'left' ? 'text-align:left;' : 'text-align:center;'}font-family:KaiTi,'楷体',serif;font-size:17px;line-height:2.1;white-space:pre-wrap;">${esc(v.content)}</div>`,
            buttons: [{ label: '关闭', class: 'ghost' }],
          });
        } else if (act === 'diff') {
          openDiffModal(poem, v, align);
        } else if (act === 'restore') {
          confirmModal({
            title: '设为当前版本',
            message: `将《${esc(poem.title)}》恢复为「${esc(v.note || '该旧版')}」的内容。<br>当前的版本会先自动存入历史，不会丢失。`,
            confirmLabel: '恢复',
            onConfirm: async () => {
              try {
                await api(`/api/poems/${encodeURIComponent(id)}/versions/${encodeURIComponent(vid)}/restore`, { method: 'POST' });
                toast('已恢复旧版，当前内容已自动存入历史');
                renderDetail(id);
              } catch (e) { toast(e.message, 'err'); }
            },
          });
        } else if (act === 'del') {
          confirmModal({
            title: '删除这个旧版本',
            message: `确定要删除「${esc(v.note || '未写备注')}」这一版吗？<br><span class="warn-line">删除后无法恢复，且无法再对比或恢复到它。</span>`,
            confirmLabel: '确认删除',
            danger: true,
            onConfirm: async () => {
              try {
                await api(`/api/poems/${encodeURIComponent(id)}/versions/${encodeURIComponent(vid)}`, { method: 'DELETE' });
                toast('已删除该版本');
                renderDetail(id);
              } catch (e) { toast(e.message, 'err'); }
            },
          });
        }
      };
    });
  });

  // 评价区折叠
  const secE = document.getElementById('sec-evals');
  const shE = document.getElementById('sh-evals');
  const sbE = document.getElementById('sb-evals');
  shE.onclick = () => { secE.classList.toggle('open'); sbE.classList.toggle('open'); shE.classList.toggle('open'); };
  sbE.querySelectorAll('.eval-row').forEach(row => {
    const content = row.querySelector('.eval-content');
    row.querySelectorAll('button').forEach(btn => {
      btn.onclick = () => {
        if (btn.dataset.act === 'toggle') content.classList.toggle('open');
        else {
          confirmModal({
            title: '删除这条评价',
            message: '确定要删除这条 AI 评价吗？删除后无法恢复。',
            confirmLabel: '确认删除',
            danger: true,
            onConfirm: async () => {
              try {
                await api(`/api/poems/${encodeURIComponent(id)}/evaluations/${encodeURIComponent(row.dataset.eid)}`, { method: 'DELETE' });
                toast('已删除该评价');
                renderDetail(id);
              } catch (e) { toast(e.message, 'err'); }
            },
          });
        }
      };
    });
  });

  // AI 评价
  document.getElementById('a-eval').onclick = () => startEvalFlow(poem, id);
}

/* ---------- 版本对比 ---------- */

function lineDiff(aText, bText) {
  const a = String(aText || '').split('\n');
  const b = String(bText || '').split('\n');
  const norm = s => s.replace(/\s+$/, '');
  const n = a.length, m = b.length;
  const dp = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      dp[i][j] = norm(a[i]) === norm(b[j]) ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const rows = [];
  let i = 0, j = 0;
  const flushMod = (ai, bj) => {
    const prev = rows[rows.length - 1];
    if (prev && prev.st === 'del') { prev.r = b[bj]; prev.st = 'mod'; }
    else rows.push({ l: a[ai], r: b[bj], st: 'mod' });
  };
  while (i < n && j < m) {
    if (norm(a[i]) === norm(b[j])) { rows.push({ l: a[i], r: b[j], st: 'same' }); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) {
      const prev = rows[rows.length - 1];
      if (prev && prev.st === 'add') { prev.l = a[i]; prev.st = 'mod'; }
      else rows.push({ l: a[i], r: '', st: 'del' });
      i++;
    } else { rows.push({ l: '', r: b[j], st: 'add' }); j++; }
  }
  while (i < n) { rows.push({ l: a[i], r: '', st: 'del' }); i++; }
  while (j < m) { rows.push({ l: '', r: b[j], st: 'add' }); j++; }
  // 相邻的"删+加"（或"加+删"）合并为一行修改
  for (let k = 0; k < rows.length - 1; k++) {
    const cur = rows[k], nxt = rows[k + 1];
    if (((cur.st === 'del' && nxt.st === 'add') || (cur.st === 'add' && nxt.st === 'del')) && !cur.r && !nxt.l) {
      cur.l = cur.st === 'del' ? cur.l : nxt.l;
      cur.r = cur.st === 'del' ? nxt.r : cur.r;
      cur.st = 'mod';
      rows.splice(k + 1, 1);
    }
  }
  return rows;
}

function openDiffModal(poem, v, align) {
  const rows = lineDiff(poem.content, v.content);
  let changed = 0;
  const html = rows.map(r => {
    let cl = '', cr = '';
    if (r.st === 'mod') { cl = 'mod-l'; cr = 'mod-r'; changed++; }
    else if (r.st === 'del') { cl = 'del'; changed++; }
    else if (r.st === 'add') { cr = 'add'; changed++; }
    const lt = r.l === '' && r.r !== '' ? '—' : esc(r.l);
    const rt = r.r === '' && r.l !== '' ? '—' : esc(r.r);
    return `<tr><td class="${cl}">${lt || '　'}</td><td class="${cr}">${rt || '　'}</td></tr>`;
  }).join('');
  showModal({
    title: `对比 · ${changed ? `${changed} 处改动` : '两版一致'}`,
    wide: true,
    html: `
      <table class="diff-table">
        <tr><th>当前版本</th><th>旧版${v.note ? ' · ' + esc(v.note) : ''}</th></tr>
        ${html}
      </table>`,
    buttons: [{ label: '关闭', class: 'ghost' }],
  });
}

/* ---------- AI 评价 ---------- */

function closeAllOverlays() {
  // 页面切换时：若评价正在进行则只收起面板（浮标保留，任务继续），否则清空
  if (evalTask.active && evalTask.status === 'running') {
    if ($evalRoot.firstChild) { $evalRoot.innerHTML = ''; evalTask.minified = true; }
    return;
  }
  if (evalTask.active) evalBadgeHide();
  $evalRoot.innerHTML = '';
}

async function startEvalFlow(poem, id, opts = {}) {
  let settings;
  try { settings = await api('/api/settings'); }
  catch (e) { toast(e.message, 'err'); return; }
  if (!settings.profiles.length) {
    confirmModal({
      title: '还没有配置模型',
      message: '先到设置页添加一个模型配置（接口地址、API Key、模型名），再回来评价。',
      confirmLabel: '去设置',
      onConfirm: () => { go('#/settings'); },
    });
    return;
  }
  showModal({
    title: '请谁来评价这首诗',
    html: `
      <p style="margin-bottom:12px;">《${esc(poem.title)}》将按你在设置页里定好的提示词接受评审。</p>
      <select class="text-input" id="eval-profile">
        ${settings.profiles.map(p => `<option value="${esc(p.name)}">${esc(p.name)}（${esc(p.model)}）</option>`).join('')}
      </select>
      <p style="margin-top:12px;font-size:12.5px;color:#a2967f;">评价会流式生成并自动存入这首诗的档案，可随时删除。</p>`,
    buttons: [
      { label: '取消', class: 'ghost' },
      { label: '开始评价', class: 'primary' },
    ],
    onMount: (bodyEl, close) => {
      const btn = document.querySelector('.modal-foot .btn.primary');
      btn.onclick = async () => {
        const name = bodyEl.querySelector('#eval-profile').value;
        close();
        runEvalStream(poem, id, name, opts.report || '');
      };
    },
  });
}

/* ---------- 评价任务：全局浮标（收起后仍可见进行状态） ---------- */

const evalTask = {
  active: false, poemTitle: '', poemId: '', profile: '',
  full: '', status: 'running',   // running | done | error
  minified: false, msg: '',
  panel: null,                   // 收起后保留的面板节点
  _badgeTimer: null,
};

function evalBadgeRender() {
  let badge = document.getElementById('eval-badge');
  if (!evalTask.active) { if (badge) badge.remove(); return; }
  if (!badge) {
    badge = document.createElement('button');
    badge.id = 'eval-badge';
    badge.className = 'eval-badge';
    badge.onclick = () => {
      if (evalTask.status === 'done' || evalTask.status === 'error') { evalBadgeHide(); return; }
      evalPanelRestore();
    };
    document.body.appendChild(badge);
  }
  const n = evalTask.full.length;
  if (evalTask.status === 'running') {
    badge.className = 'eval-badge running';
    badge.innerHTML = `<span class="eb-dot"></span><span class="eb-text">评审中 · 《${esc(evalTask.poemTitle)}》${n ? ' · ' + n + ' 字' : ''}</span>`;
    badge.title = evalTask.profile + ' 正在评阅《' + evalTask.poemTitle + '》——点击回到评语面板';
  } else if (evalTask.status === 'done') {
    badge.className = 'eval-badge done';
    badge.innerHTML = `<span class="eb-check">✓</span><span class="eb-text">《${esc(evalTask.poemTitle)}》评审完成${evalTask.msg ? ' · ' + esc(evalTask.msg) : ''}</span>`;
    badge.title = '点击关闭';
  } else {
    badge.className = 'eval-badge error';
    badge.innerHTML = `<span class="eb-cross">✗</span><span class="eb-text">《${esc(evalTask.poemTitle)}》评审中断</span>`;
    badge.title = evalTask.msg || '点击关闭';
  }
}

function evalBadgeHide() {
  clearTimeout(evalTask._badgeTimer);
  evalTask.active = false;
  evalBadgeRender();
  // 归还面板并清空
  if (evalTask.panel) { try { evalTask.panel.remove(); } catch {} evalTask.panel = null; }
  if (evalTask.minified) $evalRoot.innerHTML = '';
  evalTask.minified = false;
}

function evalPanelRestore() {
  if (!evalTask.panel || !evalTask.active) return;
  $evalRoot.innerHTML = '';
  $evalRoot.appendChild(evalTask.panel);
  evalTask.minified = false;
  const body = evalTask.panel.querySelector('.ep-body');
  if (body) body.scrollTop = body.scrollHeight;
}

function evalBadgeScheduleHide(ms) {
  clearTimeout(evalTask._badgeTimer);
  evalTask._badgeTimer = setTimeout(evalBadgeHide, ms);
}

async function runEvalStream(poem, id, profileName, report) {
  // 若已有任务在进行，先收掉旧的
  if (evalTask.active) evalBadgeHide();

  const wrap = document.createElement('div');
  wrap.className = 'eval-overlay';
  wrap.innerHTML = `
    <div class="eval-panel">
      <div class="ep-head">
        <h3>AI 评价 · 《${esc(poem.title)}》</h3>
        <span class="ep-status" id="ep-status">${esc(profileName)} 正在评阅……</span>
      </div>
      <div class="ep-body"><div class="eval-stream" id="ep-stream"></div></div>
      <div class="ep-foot">
        <button class="btn ghost" id="ep-close">收起（右下角可随时点回）</button>
      </div>
    </div>`;
  $evalRoot.innerHTML = '';
  $evalRoot.appendChild(wrap);

  Object.assign(evalTask, {
    active: true, poemTitle: poem.title, poemId: id, profile: profileName,
    full: '', status: 'running', minified: false, msg: '', panel: wrap,
  });
  evalBadgeRender();

  const streamEl = wrap.querySelector('#ep-stream');
  const statusEl = wrap.querySelector('#ep-status');
  const closeBtn = wrap.querySelector('#ep-close');
  closeBtn.onclick = () => { $evalRoot.innerHTML = ''; evalTask.minified = true; };
  const cursor = '<span class="cursor">&nbsp;</span>';
  streamEl.innerHTML = cursor;

  let full = '';
  let errored = false;
  let errMsg = '';
  let finalMsg = '';
  try {
    const resp = await fetch('/api/evaluate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ poemId: id, profileName, geluReport: report || undefined }),
    });
    if (!resp.ok || !resp.body) {
      const j = await resp.json().catch(() => ({}));
      throw new Error(j.error || `请求失败（${resp.status}）`);
    }
    const reader = resp.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buf = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const parts = buf.split('\n\n');
      buf = parts.pop();
      for (const part of parts) {
        const line = part.split('\n').find(l => l.startsWith('data:'));
        if (!line) continue;
        let ev;
        try { ev = JSON.parse(line.slice(5).trim()); } catch { continue; }
        if (ev.delta) {
          full += ev.delta;
          evalTask.full = full;
          streamEl.innerHTML = esc(full) + cursor;
          const epBody = wrap.querySelector('.ep-body');
          if (epBody) epBody.scrollTop = epBody.scrollHeight;
          evalBadgeRender();
        }
        if (ev.error) {
          errored = true; errMsg = ev.error;
          statusEl.textContent = '出错了'; statusEl.style.color = '#9e3b34';
          streamEl.innerHTML = esc(full + '\n\n〔' + ev.error + '〕');
        }
        if (ev.done) {
          streamEl.innerHTML = esc(full);
          finalMsg = ev.score ? `评分 ${ev.score}/100` : '';
          statusEl.textContent = ev.score ? `已完成 · 评分 ${ev.score}/100，已保存` : '已完成，已保存';
        }
      }
    }
    if (!errored) {
      statusEl.textContent = statusEl.textContent.includes('已完成') ? statusEl.textContent : '已完成，已保存';
    }
  } catch (e) {
    errored = true; errMsg = e.message;
    statusEl.textContent = '出错了';
    streamEl.innerHTML = esc(full) + `<br><br>〔${esc(e.message)}〕`;
  }

  evalTask.status = errored ? 'error' : 'done';
  evalTask.msg = errored ? errMsg : finalMsg;
  closeBtn.textContent = '关闭';
  closeBtn.onclick = evalBadgeHide;
  evalBadgeRender();
  if (!errored) {
    // 评价已存入诗稿：若此刻正停在这首诗的页面，轻刷新以显示新评价（不重绘则保持阅读位置）
    setTimeout(() => {
      const h = location.hash || '';
      if (h === '#/poem/' + id) window.routeAfterVol();
    }, 400);
    evalBadgeScheduleHide(8000);
  }
}

/* ================= 编辑器 ================= */

function draftKey(id) { return 'shixia:draft:' + (id || 'new'); }

async function renderEditor(poemId) {
  let poem = null;
  if (poemId) {
    try { poem = (await api('/api/poems/' + encodeURIComponent(poemId))).poem; }
    catch (e) { $app.innerHTML = `<div class="boot">${esc(e.message)}</div>`; return; }
  }

  // 草稿恢复
  let draft = null;
  try { draft = JSON.parse(localStorage.getItem(draftKey(poemId)) || 'null'); } catch {}
  const initial = {
    title: poem ? poem.title : '',
    date: poem ? poem.date : todayStr(),
    content: poem ? poem.content : '',
  };
  let usedDraft = false;
  if (draft && (draft.title !== initial.title || draft.date !== initial.date || draft.content !== initial.content)) {
    Object.assign(initial, { title: draft.title || initial.title, date: draft.date || initial.date, content: draft.content || initial.content });
    usedDraft = true;
  }

  $app.innerHTML = `
  <div class="page">
    <button class="back-link" id="ed-back">← 返回</button>
    <div class="editor-bar">
      <span class="doc-name">${poem ? '编辑《' + esc(poem.title) + '》' : '写新诗'}</span>
      <div class="align-toggle" title="正文对齐方式">
        <button data-al="left">左对齐</button><button data-al="center">居中</button>
      </div>
      ${fontSelectHTML('ed-font')}
      <div class="spacer"></div>
      <span class="count" id="ed-count"></span>
      <button class="btn small ghost" id="ed-undo" title="撤销 Ctrl+Z">撤销</button>
      <button class="btn small ghost" id="ed-redo" title="重做 Ctrl+Y">重做</button>
      <button class="btn primary" id="ed-save">保存</button>
    </div>
    <div class="paper editor" id="ed-paper">
      <input class="title-input" id="ed-title" placeholder="诗题" value="${esc(initial.title)}">
      <div><input class="date-input" id="ed-date" placeholder="日期如 2026.11.18" value="${esc(initial.date)}"></div>
      <textarea class="content-input" id="ed-content" placeholder="一行一句，空行分节。&#10;&#10;落笔即是手稿，写下的每个字都会自动暂存。">${esc(initial.content)}</textarea>
    </div>
    <div class="draft-note" id="ed-draftnote"></div>
  </div>`;

  const titleEl = document.getElementById('ed-title');
  const dateEl = document.getElementById('ed-date');
  const contentEl = document.getElementById('ed-content');
  const paperEl = document.getElementById('ed-paper');
  const countEl = document.getElementById('ed-count');
  const draftNoteEl = document.getElementById('ed-draftnote');

  // 对齐
  let align = localStorage.getItem('shixia:align') || 'left';
  function applyAlign() {
    localStorage.setItem('shixia:align', align);
    paperEl.classList.toggle('center-mode', align === 'center');
    $app.querySelectorAll('.align-toggle button').forEach(b => b.classList.toggle('on', b.dataset.al === align));
  }
  $app.querySelectorAll('.align-toggle button').forEach(b => {
    b.onclick = () => { align = b.dataset.al; applyAlign(); contentEl.focus(); };
  });
  applyAlign();

  function autosize() {
    contentEl.style.height = 'auto';
    contentEl.style.height = Math.max(contentEl.scrollHeight, window.innerHeight * 0.46) + 'px';
  }
  function updateCount() {
    const text = contentEl.value;
    const chars = text.replace(/\s/g, '').length;
    const lines = text ? text.split('\n').length : 0;
    countEl.textContent = `${chars} 字 · ${lines} 行`;
  }
  autosize(); updateCount();
  bindFontSelect(document.getElementById('ed-font'));

  // 草稿
  let draftTimer = null;
  let dirty = false;
  function saveDraft() {
    const val = { title: titleEl.value, date: dateEl.value, content: contentEl.value, at: Date.now() };
    localStorage.setItem(draftKey(poemId), JSON.stringify(val));
    renderDraftNote();
  }
  function renderDraftNote() {
    const hasDraft = localStorage.getItem(draftKey(poemId));
    if (!hasDraft) { draftNoteEl.innerHTML = ''; return; }
    draftNoteEl.innerHTML = `
      <span>草稿已自动暂存（离开页面也不会丢）。</span>
      ${usedDraft ? '<button class="linkish" id="dn-keep">就是它，继续写</button>' : ''}
      ${poem && dirty ? '<button class="linkish" id="dn-revert">放弃改动，还原为已保存版本</button>' : ''}`;
    const rk = document.getElementById('dn-revert');
    if (rk) rk.onclick = () => {
      confirmModal({
        title: '还原为已保存版本',
        message: `放弃本次所有未保存的修改，还原《${esc(poem.title)}》到上次保存的样子？`,
        confirmLabel: '还原',
        onConfirm: async () => {
          localStorage.removeItem(draftKey(poemId));
          titleEl.value = poem.title; dateEl.value = poem.date || ''; contentEl.value = poem.content;
          dirty = false; usedDraft = false;
          autosize(); updateCount(); saveDraft(); renderDraftNote();
          toast('已还原为上次保存的版本');
        },
      });
    };
    const kk = document.getElementById('dn-keep');
    if (kk) kk.onclick = () => { usedDraft = false; renderDraftNote(); toast('好，就按草稿继续'); };
  }
  if (usedDraft) {
    toast('已恢复上次未保存的草稿（' + fmtTime(draft && draft.at) + '）');
  }
  renderDraftNote();

  function onInput() {
    dirty = true;
    autosize(); updateCount();
    clearTimeout(draftTimer);
    draftTimer = setTimeout(saveDraft, 700);
  }
  contentEl.addEventListener('input', onInput);
  titleEl.addEventListener('input', onInput);
  dateEl.addEventListener('input', onInput);

  // 撤销 / 重做
  function execUndo() { contentEl.focus(); document.execCommand('undo'); }
  function execRedo() { contentEl.focus(); document.execCommand('redo'); }
  document.getElementById('ed-undo').onclick = execUndo;
  document.getElementById('ed-redo').onclick = execRedo;

  // 返回
  document.getElementById('ed-back').onclick = () => go(poem ? '#/poem/' + poemId : '#/');

  // 保存
  document.getElementById('ed-save').onclick = () => {
    const title = titleEl.value.trim();
    const content = contentEl.value.replace(/\r\n?/g, '\n').replace(/[ \t]+$/gm, '').replace(/\n+$/, '');
    if (!title) { toast('先给诗起个名字吧', 'err'); titleEl.focus(); return; }
    if (!content.trim()) { toast('诗的内容还是空的', 'err'); contentEl.focus(); return; }
    const date = dateEl.value.trim();

    if (!poem) {
      api('/api/poems', { method: 'POST', body: { title, date, content } })
        .then(r => {
          localStorage.removeItem(draftKey(null));
          toast('《' + title + '》已收进诗匣');
          go('#/poem/' + r.id);
        })
        .catch(e => toast(e.message, 'err'));
      return;
    }

    const unchanged = title === poem.title && date === (poem.date || '') && content === poem.content;
    if (unchanged) { toast('内容和上次保存一致，无需保存'); return; }

    let mode = 'keep'; // 默认选保留
    showModal({
      title: '保存《' + esc(title) + '》',
      html: `
        <div class="opt-row" id="save-opts">
          <label class="opt-item" data-v="keep">
            <input type="radio" name="save-mode" value="keep" checked>
            <span><span class="opt-t">覆盖保存，并把当前版本存入历史</span>
            <span class="opt-d">旧版本保留在「版本」区，随时可查看、对比、恢复或删除。</span></span>
          </label>
          <label class="opt-item" data-v="overwrite">
            <input type="radio" name="save-mode" value="overwrite">
            <span><span class="opt-t">直接覆盖，不留旧版</span>
            <span class="opt-d">旧内容将被新内容替换，不留历史版本。</span></span>
          </label>
        </div>
        <input class="note-input" id="save-note" placeholder="给旧版本写句备注（可选），如：第二节重写了">
        <p style="margin-top:10px;font-size:12.5px;color:#a2967f;">拿不准就选第一项，多留一版总不会错。</p>`,
      buttons: [
        { label: '取消', class: 'ghost' },
        {
          label: '保存', class: 'primary',
          onClick: async bodyEl => {
            const note = bodyEl.querySelector('#save-note').value.trim();
            try {
              await api('/api/poems/' + encodeURIComponent(poemId), {
                method: 'PUT',
                body: { title, date, content, keepVersion: mode === 'keep', note },
              });
              localStorage.removeItem(draftKey(poemId));
              toast(mode === 'keep' ? '已保存，旧版本已存入历史' : '已覆盖保存');
              go('#/poem/' + poemId);
            } catch (e) { toast(e.message, 'err'); return false; }
          },
        },
      ],
      onMount: bodyEl => {
        const items = bodyEl.querySelectorAll('.opt-item');
        const noteInput = bodyEl.querySelector('#save-note');
        function sync() {
          items.forEach(it => {
            const on = it.dataset.v === mode;
            it.classList.toggle('selected', on);
            it.querySelector('input').checked = on;
          });
          noteInput.style.display = mode === 'keep' ? '' : 'none';
        }
        items.forEach(it => {
          it.onclick = e => {
            if (e.target.tagName !== 'INPUT') it.querySelector('input').click();
            mode = it.dataset.v; sync();
          };
        });
        sync();
      },
    });
  };
}

/* ================= 字体 ================= */

const FONT_CHOICES = [
  { k: 'kai', label: '楷体', stack: 'KaiTi, "楷体", "STKaiti", serif', core: true },
  { k: 'song', label: '宋体', stack: 'SimSun, "宋体", serif', core: true },
  { k: 'fang', label: '仿宋', stack: 'FangSong, "仿宋", serif', core: true },
  { k: 'hei', label: '黑体', stack: 'SimHei, "黑体", sans-serif', core: true },
  { k: 'yahei', label: '雅黑', stack: '"Microsoft YaHei", sans-serif', core: true },
  { k: 'lishu', label: '隶书', stack: 'LiSu, "隶书", KaiTi, serif' },
  { k: 'youyuan', label: '幼圆', stack: 'YouYuan, "幼圆", "Microsoft YaHei", sans-serif' },
  { k: 'xingkai', label: '行楷', stack: '"STXingkai", "华文行楷", "Xingkai SC", KaiTi, serif' },
  { k: 'xinwei', label: '新魏', stack: '"STXinwei", "华文新魏", KaiTi, serif' },
  { k: 'huali', label: '华隶', stack: '"STLiti", "华文隶书", LiSu, serif' },
  { k: 'shuti', label: '舒体', stack: '"FZShuTi", "方正舒体", KaiTi, serif' },
  { k: 'yaoti', label: '姚体', stack: '"FZYaoTi", "方正姚体", SimHei, sans-serif' },
];

function applyFontPref() {
  const k = localStorage.getItem('shixia:font') || 'kai';
  const f = FONT_CHOICES.find(x => x.k === k) || FONT_CHOICES[0];
  document.body.style.setProperty('--poem-font', f.stack);
}

function fontSelectHTML(id) {
  return `<select class="mini-select" id="${esc(id)}" title="正文字体"></select>`;
}

async function bindFontSelect(el) {
  if (!el) return;
  const cur = localStorage.getItem('shixia:font') || 'kai';
  const list = [];
  for (const f of FONT_CHOICES) {
    if (f.core) { list.push(f); continue; }
    const primary = f.stack.split(',')[0].trim();
    try { if (document.fonts.check('16px ' + primary)) list.push(f); } catch { /* 探测失败就跳过 */ }
  }
  el.innerHTML = list.map(f => `<option value="${esc(f.k)}"${f.k === cur ? ' selected' : ''}>${esc(f.label)}</option>`).join('');
  el.onchange = () => {
    localStorage.setItem('shixia:font', el.value);
    applyFontPref();
    toast('正文字体：' + (FONT_CHOICES.find(x => x.k === el.value) || {}).label);
  };
  if (!list.some(f => f.k === cur)) {
    localStorage.setItem('shixia:font', 'kai');
    applyFontPref();
    el.value = 'kai';
  }
}

/* ================= 与伊对谈 ================= */

function chatBubble(role, content) {
  const isUser = role === 'user';
  return `
  <div class="chat-msg ${isUser ? 'user' : 'her'}">
    ${isUser ? '' : '<span class="chat-avatar">伊</span>'}
    <div class="chat-bubble">${esc(content) || '　'}</div>
    ${isUser ? '<span class="chat-avatar me">我</span>' : ''}
  </div>`;
}

async function renderChat() {
  $app.innerHTML = '<div class="boot">研墨备茶……</div>';
  let messages = [], profiles = [];
  try {
    messages = (await api('/api/chat')).messages;
    profiles = (await api('/api/settings')).profiles;
  } catch (e) { $app.innerHTML = `<div class="boot">加载失败：${esc(e.message)}</div>`; return; }

  $app.innerHTML = `
  <div class="page chat-page">
    <button class="back-link" id="ct-back">← 返回目录</button>
    <div class="chat-shell">
      <div class="chat-head">
        <span class="seal-mark">伊</span>
        <div>
          <div class="chat-title">与伊对谈</div>
          <div class="chat-sub">书香才女，论诗答问；言辞温婉，判断中肯</div>
        </div>
        <div class="spacer"></div>
        ${profiles.length > 1 ? `<select class="mini-select" id="ct-profile">${profiles.map(p => `<option value="${esc(p.name)}">${esc(p.name)}</option>`).join('')}</select>` : ''}
        <button class="btn small ghost" id="ct-clear">另起一谈</button>
      </div>
      <div class="chat-body" id="ct-body">
        ${messages.length ? messages.map(m => chatBubble(m.role, m.content)).join('')
          : '<div class="chat-welcome">竹影扫阶尘不动，月穿潭底水无痕。<br>公子今夕有何见教？评诗、问格律、谈典故，或只是闲叙，妾身洗耳恭听。</div>'}
      </div>
      <div class="chat-input-row">
        <textarea class="chat-input" id="ct-input" rows="1" placeholder="与伊对谈……（Enter 发送，Shift+Enter 换行）"></textarea>
        <button class="btn primary" id="ct-send">寄语</button>
      </div>
    </div>
  </div>`;

  const bodyEl = document.getElementById('ct-body');
  const inputEl = document.getElementById('ct-input');
  const sendBtn = document.getElementById('ct-send');
  bodyEl.scrollTop = bodyEl.scrollHeight;

  function scrollBottom() { bodyEl.scrollTop = bodyEl.scrollHeight; }
  function setBusy(b) { sendBtn.disabled = b; inputEl.disabled = b; sendBtn.textContent = b ? '伊思忖中…' : '寄语'; }

  async function send() {
    const text = inputEl.value.trim();
    if (!text || sendBtn.disabled) return;
    if (!profiles.length) {
      confirmModal({
        title: '还没有配置模型',
        message: '先到设置页添加一个模型配置（接口地址、API Key、模型名），才请得动这位才女。',
        confirmLabel: '去设置',
        onConfirm: () => { go('#/settings'); },
      });
      return;
    }
    // 开场白若是欢迎语则先清掉
    const welcome = bodyEl.querySelector('.chat-welcome');
    if (welcome) welcome.remove();
    inputEl.value = ''; autosize();
    bodyEl.insertAdjacentHTML('beforeend', chatBubble('user', text));
    bodyEl.insertAdjacentHTML('beforeend', chatBubble('assistant', ''));
    const bubble = bodyEl.querySelector('.chat-msg.her:last-child .chat-bubble');
    bubble.innerHTML = '<span class="cursor">　</span>';
    scrollBottom();
    setBusy(true);

    let full = '';
    let failed = false;
    try {
      const resp = await fetch('/api/chat/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          profileName: profiles.length > 1 ? (document.getElementById('ct-profile') || {}).value : undefined,
        }),
      });
      if (!resp.ok || !resp.body) {
        const j = await resp.json().catch(() => ({}));
        throw new Error(j.error || `请求失败（${resp.status}）`);
      }
      const reader = resp.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buf = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const parts = buf.split('\n\n');
        buf = parts.pop();
        for (const part of parts) {
          const line = part.split('\n').find(l => l.startsWith('data:'));
          if (!line) continue;
          let ev; try { ev = JSON.parse(line.slice(5).trim()); } catch { continue; }
          if (ev.delta) { full += ev.delta; bubble.innerHTML = esc(full) + '<span class="cursor">　</span>'; scrollBottom(); }
          if (ev.error) { failed = true; full += '\n\n〔' + ev.error + '〕'; bubble.innerHTML = esc(full); scrollBottom(); }
        }
      }
      if (!failed) bubble.innerHTML = esc(full);
    } catch (e) {
      failed = true;
      bubble.innerHTML = esc(full + '\n\n〔' + e.message + '〕');
    }
    setBusy(false);
    inputEl.focus();
  }

  function autosize() {
    inputEl.style.height = 'auto';
    inputEl.style.height = Math.min(inputEl.scrollHeight, 140) + 'px';
  }

  sendBtn.onclick = send;
  inputEl.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  });
  inputEl.addEventListener('input', autosize);

  document.getElementById('ct-back').onclick = () => go('#/');
  document.getElementById('ct-clear').onclick = () => {
    confirmModal({
      title: '另起一谈',
      message: '清空全部对谈记录，重新开始？<span class="warn-line">此前的对谈将不可找回。</span>',
      confirmLabel: '清空',
      danger: true,
      onConfirm: async () => {
        try {
          await api('/api/chat/clear', { method: 'POST' });
          toast('已另起一谈');
          renderChat();
        } catch (e) { toast(e.message, 'err'); }
      },
    });
  };
}

/* ================= 设置页 ================= */

const PROVIDER_PRESETS = [
  {
    key: 'deepseek', label: 'DeepSeek', name: 'DeepSeek',
    base: 'https://api.deepseek.com', model: 'deepseek-v4-pro',
    models: ['deepseek-v4-pro', 'deepseek-flash'],
    keyHint: 'Key 以 sk- 开头。到 platform.deepseek.com 登录后，在「API keys」页点「创建 API key」，复制粘贴到下面。（注意：旧教程里的 deepseek-chat / deepseek-reasoner 已于 2026 年 7 月退役，别再用。）',
    consoleUrl: 'https://platform.deepseek.com/api_keys',
    modelsUrl: 'https://api-docs.deepseek.com/zh-cn/updates',
  },
  {
    key: 'zhipu', label: '智谱 GLM', name: '智谱 GLM',
    base: 'https://open.bigmodel.cn/api/paas/v4', model: 'glm-5.3-flash',
    models: ['glm-5.3-flash', 'glm-5.3', 'glm-5.3-flashx', 'glm-4.6'],
    keyHint: '到 bigmodel.cn 控制台的「API Keys」页创建并复制。GLM-5.3-Flash 为最新高性价比款，旗舰选 glm-5.3。',
    consoleUrl: 'https://bigmodel.cn/usercenter/apikeys',
    modelsUrl: 'https://docs.bigmodel.cn/cn/guide/models',
  },
  {
    key: 'kimi', label: 'Kimi', name: 'Kimi',
    base: 'https://api.moonshot.cn/v1', model: 'kimi-k3.1-pro',
    models: ['kimi-k3.1-pro', 'kimi-k3'],
    keyHint: '到 platform.kimi.com 控制台的「API Key 管理」页创建并复制。',
    consoleUrl: 'https://platform.kimi.com/console/api-key',
    modelsUrl: 'https://platform.kimi.com/docs/models',
  },
  {
    key: 'qwen', label: '通义千问', name: '通义千问',
    base: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen4-max',
    models: ['qwen4-max', 'qwen3.8-max', 'qwen-plus', 'qwen-max'],
    keyHint: '到阿里云百炼控制台（bailian.console.aliyun.com）的「API-KEY 管理」页创建并复制。qwen4-max 为现行旗舰（2026.11 正式版）；qwen-plus / qwen-max 是滚动别名，始终指向该档最新模型，价格更低。',
    consoleUrl: 'https://bailian.console.aliyun.com/',
    modelsUrl: 'https://help.aliyun.com/zh/model-studio/models',
  },
  {
    key: 'openai', label: 'OpenAI', name: 'OpenAI',
    base: 'https://api.openai.com/v1', model: 'gpt-6.2-sol',
    models: ['gpt-6.2-sol', 'gpt-6-luna', 'gpt-6-astra'],
    keyHint: '到 platform.openai.com 的「API keys」页创建并复制。国内网络通常需要代理才能连通；GPT-5 系列已属旧款，现行主力为 GPT-6 系列。',
    consoleUrl: 'https://platform.openai.com/api-keys',
    modelsUrl: 'https://developers.openai.com/api/docs/models',
  },
];

function cleanBaseURL(v) {
  v = String(v || '').trim().replace(/[，、\s]+/g, '');
  if (!v) return '';
  if (!/^https?:\/\//i.test(v)) v = 'https://' + v;
  return v.replace(/\/+$/, '').replace(/\/chat\/completions$/i, '');
}

async function renderSettings() {
  $app.innerHTML = '<div class="boot">打开设置……</div>';
  let settings;
  try { settings = await api('/api/settings'); }
  catch (e) { $app.innerHTML = `<div class="boot">${esc(e.message)}</div>`; return; }

  $app.innerHTML = `
  <div class="page">
    <button class="back-link" id="st-back">← 返回目录</button>
    <div class="masthead">
      <span class="seal-mark">匣</span>
      <h1 style="font-size:26px;">设置</h1>
      <span class="sub">模型 · 提示词 · 数据</span>
    </div>

    <div class="set-section">
      <h2>AI 模型配置</h2>
      <p style="font-size:13px;color:#6b6154;line-height:1.9;margin-bottom:14px;">
        不用懂技术：点「＋ 新增模型配置」，<b>选一家服务商，粘贴 API Key，测试连接</b>——三步完成。
        地址和模型名会自动填好；智谱、DeepSeek、Kimi、通义、OpenAI 均可接入。
        API Key 只存在你这台电脑的配置文件里，请求由诗匣本地转发，不经过其他第三方。
      </p>
      <div id="profiles"></div>
      <button class="btn" id="add-profile">＋ 新增模型配置</button>
    </div>

    <div class="set-section">
      <h2>评价准则 · 甲编（新诗，100 分制）</h2>
      <p style="font-size:13px;color:#6b6154;line-height:1.9;margin-bottom:14px;">
        评价甲编现代诗时发给模型的评审规则，可按你的口味修改。保存后对之后的评价生效。
      </p>
      <textarea class="text-input prompt-area" id="st-prompt-modern">${esc(settings.prompts.modern)}</textarea>
      <div style="margin-top:10px;">
        <button class="btn small ghost" id="st-reset-modern">恢复默认准则</button>
      </div>
    </div>

    <div class="set-section">
      <h2>评价准则 · 乙编（古体与词，100 分制）</h2>
      <p style="font-size:13px;color:#6b6154;line-height:1.9;margin-bottom:14px;">
        评价乙编时使用。评审时会随稿附上本地格律检测报告供模型复核；用典质量并入「炼字炼句」与「意境兴象」两维，不单独占分。
      </p>
      <textarea class="text-input prompt-area" id="st-prompt-classical">${esc(settings.prompts.classical)}</textarea>
      <div style="margin-top:10px;">
        <button class="btn small ghost" id="st-reset-classical">恢复默认准则</button>
      </div>
    </div>

    <div class="set-section">
      <h2>对谈人设 · 与伊对话</h2>
      <p style="font-size:13px;color:#6b6154;line-height:1.9;margin-bottom:14px;">
        目录页「对谈」是与这位才女自由对话的地方。这里定义她的性情与口吻，保存后对之后的对话生效。
      </p>
      <textarea class="text-input" id="st-persona" style="min-height:180px;">${esc(settings.personaChat)}</textarea>
      <div style="margin-top:10px;">
        <button class="btn small ghost" id="st-reset-persona">恢复默认人设</button>
      </div>
    </div>

    <div class="set-section">
      <h2>格律数据</h2>
      <p class="path-line">字表与词谱存于数据目录 <code>字表/</code> 与 <code>词谱/</code>：平水韵 8108 字、词林正韵 8203 字、中华新韵 6730 字、中华通韵 9017 字；词谱 817 调、2475 体（以正体对照）。全部离线使用，不联网。</p>
      <p class="path-line">多音字以「存疑可点选」处理：编辑器里点击带虚线的字即可为其选读音；检测报告仅供参考，AI 评审被要求独立复核。</p>
    </div>

    <div class="set-section">
      <h2>数据</h2>
      <p class="path-line">诗稿数据目录：<code>${esc(settings.dataDir)}</code>（一首诗一个文件，纯文本，随时可整目录拷贝备份）</p>
      <p class="path-line">本机使用无需登录；将来若部署到服务器，请务必先加上访问口令再开放。</p>
      <div style="margin-top:12px;display:flex;gap:10px;flex-wrap:wrap;">
        <a class="btn ghost" href="/manual.html" target="_blank">打开使用手册</a>
      </div>
    </div>

    <div class="action-row" style="margin-top:40px;">
      <button class="btn primary" id="st-save">保存设置</button>
      <span style="font-size:12.5px;color:#a2967f;" id="st-hint">修改模型配置或提示词后，记得点保存。</span>
    </div>
  </div>`;

  document.getElementById('st-back').onclick = () => go('#/');

  const profilesData = settings.profiles.map(p => ({ ...p }));
  const profilesEl = document.getElementById('profiles');

  function profileCardHTML(p, idx) {
    const chips = PROVIDER_PRESETS.map(pp => `<button class="preset-chip" data-preset="${esc(pp.key)}">${esc(pp.label)}</button>`).join('');
    return `
    <div class="profile-card" data-idx="${idx}">
      <div class="preset-row">
        <span class="preset-label">选一家服务商，自动帮你填好地址和模型：</span>
        ${chips}
      </div>
      <div class="profile-grid">
        <div class="field"><label>配置名称（随你起）</label><input class="text-input" data-k="name" value="${esc(p.name || '')}" placeholder="如：DeepSeek"></div>
        <div class="field"><label>模型名（点 ▾ 可选常用型号）</label>
          <div class="model-row">
            <input class="text-input" data-k="model" value="${esc(p.model || '')}" placeholder="如：deepseek-chat">
            <button class="btn small ghost model-btn" data-act="model-menu" title="常用模型" style="display:none;">▾</button>
            <div class="model-menu" data-role="model-menu"></div>
          </div>
        </div>
        <div class="field" style="grid-column:1/-1;"><label>接口地址（Base URL）——选了服务商就不用填</label>
          <input class="text-input" data-k="baseURL" value="${esc(p.baseURL || '')}" placeholder="选上面的服务商自动填；或完整粘贴，如 https://api.deepseek.com">
          <div class="hint">一般保持服务商给的地址原样即可；粘贴时少了 https:// 或多了结尾斜杠，诗匣会自动纠正。</div>
        </div>
        <div class="field" style="grid-column:1/-1;"><label>API Key</label>
          <input class="text-input" data-k="apiKey" type="password" value="${esc(p.apiKey || '')}" placeholder="粘贴你的 Key">
          <div class="hint" data-role="key-hint">先在上方选一家服务商，这里会告诉你去哪里获取 Key。</div>
        </div>
      </div>
      <div class="profile-foot">
        <button class="btn small" data-act="test">测试连接</button>
        <span class="test-result" data-role="result"></span>
        <div class="spacer"></div>
        <button class="btn small danger" data-act="remove">删除此配置</button>
      </div>
    </div>`;
  }

  const cardModels = {};   // idx → 该服务商常用模型列表

  function openModelMenu(card, idx) {
    const menu = card.querySelector('[data-role="model-menu"]');
    const models = cardModels[idx] || [];
    menu.innerHTML = models.map(m => `<button class="model-item" data-m="${esc(m)}">${esc(m)}</button>`).join('') +
      '<button class="model-item custom" data-m="__custom__">自定义（手填）…</button>';
    menu.classList.add('open');
    menu.querySelectorAll('.model-item').forEach(item => {
      item.onclick = () => {
        menu.classList.remove('open');
        if (item.dataset.m === '__custom__') {
          const inp = card.querySelector('input[data-k="model"]');
          inp.focus(); inp.select();
          return;
        }
        card.querySelector('input[data-k="model"]').value = item.dataset.m;
        profilesData[idx].model = item.dataset.m;
      };
    });
  }

  function renderProfiles() {
    profilesEl.innerHTML = profilesData.map((p, i) => profileCardHTML(p, i)).join('') ||
      '<p style="font-size:13.5px;color:#a2967f;margin-bottom:14px;">还没有配置。点下方「新增模型配置」，选一家服务商，粘贴 Key 就能用。</p>';
    profilesEl.querySelectorAll('.profile-card').forEach(card => {
      const idx = Number(card.dataset.idx);
      const inpOf = k => card.querySelector(`input[data-k="${k}"]`);
      card.querySelectorAll('input[data-k]').forEach(inp => {
        inp.oninput = () => { profilesData[idx][inp.dataset.k] = inp.value; };
      });

      // 服务商预设：一键填好
      card.querySelectorAll('.preset-chip').forEach(chip => {
        chip.onclick = () => {
          const pp = PROVIDER_PRESETS.find(x => x.key === chip.dataset.preset);
          if (!pp) return;
          inpOf('name').value = pp.name;
          inpOf('baseURL').value = pp.base;
          inpOf('model').value = pp.model;
          profilesData[idx].name = pp.name;
          profilesData[idx].baseURL = pp.base;
          profilesData[idx].model = pp.model;
          cardModels[idx] = pp.models;
          card.querySelector('[data-act="model-menu"]').style.display = '';
          card.querySelector('[data-role="key-hint"]').innerHTML =
            `${esc(pp.keyHint)} <a href="${esc(pp.consoleUrl)}" target="_blank" style="color:#9e3b34;">去获取 Key ↗</a>` +
            (pp.modelsUrl ? `　<a href="${esc(pp.modelsUrl)}" target="_blank" style="color:#9e3b34;">型号列表 ↗</a>` : '');
          inpOf('apiKey').focus();
          toast('已填好「' + pp.label + '」，粘贴 Key 即可');
        };
      });

      // 初始时若接口地址与某预设一致，直接显示对应的 Key 提示与常用模型
      const curBase = cleanBaseURL(profilesData[idx].baseURL);
      const matched = PROVIDER_PRESETS.find(pp => cleanBaseURL(pp.base) === curBase);
      if (matched) {
        cardModels[idx] = matched.models;
        card.querySelector('[data-act="model-menu"]').style.display = '';
        card.querySelector('[data-role="key-hint"]').innerHTML =
          `${esc(matched.keyHint)} <a href="${esc(matched.consoleUrl)}" target="_blank" style="color:#9e3b34;">去获取 Key ↗</a>` +
          (matched.modelsUrl ? `　<a href="${esc(matched.modelsUrl)}" target="_blank" style="color:#9e3b34;">型号列表 ↗</a>` : '');
      }

      // 模型下拉菜单
      const modelBtn = card.querySelector('[data-act="model-menu"]');
      modelBtn.onclick = e => {
        e.stopPropagation();
        const menu = card.querySelector('[data-role="model-menu"]');
        const wasOpen = menu.classList.contains('open');
        document.querySelectorAll('.model-menu.open').forEach(m => m.classList.remove('open'));
        if (!wasOpen) openModelMenu(card, idx);
      };

      // 接口地址失焦时自动纠错
      const baseInput = inpOf('baseURL');
      baseInput.addEventListener('blur', () => {
        const cleaned = cleanBaseURL(baseInput.value);
        if (cleaned && cleaned !== baseInput.value.trim()) {
          baseInput.value = cleaned;
          profilesData[idx].baseURL = cleaned;
          toast('接口地址已自动纠正格式');
        }
      });

      card.querySelector('[data-act="test"]').onclick = async ev => {
        const btn = ev.target;
        const result = card.querySelector('[data-role="result"]');
        btn.disabled = true; result.className = 'test-result'; result.textContent = '正在连接……';
        try {
          profilesData[idx].baseURL = cleanBaseURL(profilesData[idx].baseURL);
          const r = await api('/api/settings/test', { method: 'POST', body: { profile: profilesData[idx] } });
          result.className = 'test-result ' + (r.ok ? 'ok' : 'bad');
          result.textContent = r.ok ? '✓ ' + r.message : '✗ ' + r.message;
        } catch (e) {
          result.className = 'test-result bad'; result.textContent = '✗ ' + e.message;
        }
        btn.disabled = false;
      };
      card.querySelector('[data-act="remove"]').onclick = () => {
        confirmModal({
          title: '删除模型配置',
          message: `删除配置「${esc(profilesData[idx].name || '未命名')}」？已有的评价记录不受影响。`,
          confirmLabel: '删除',
          danger: true,
          onConfirm: async () => { profilesData.splice(idx, 1); renderProfiles(); },
        });
      };
    });
  }
  renderProfiles();

  document.getElementById('add-profile').onclick = () => {
    profilesData.push({ name: '', baseURL: '', model: '', apiKey: '' });
    renderProfiles();
    profilesEl.querySelectorAll('.profile-card').forEach(c => c.scrollIntoView({ behavior: 'smooth', block: 'center' }));
  };

  document.getElementById('st-reset-modern').onclick = () => {
    confirmModal({
      title: '恢复默认准则',
      message: '把甲编（新诗）准则还原为诗匣内置版本？你现在的修改将被覆盖。',
      confirmLabel: '恢复',
      onConfirm: async () => { document.getElementById('st-prompt-modern').value = settings.defaults.modern; },
    });
  };
  document.getElementById('st-reset-classical').onclick = () => {
    confirmModal({
      title: '恢复默认准则',
      message: '把乙编（古体与词）准则还原为诗匣内置版本？你现在的修改将被覆盖。',
      confirmLabel: '恢复',
      onConfirm: async () => { document.getElementById('st-prompt-classical').value = settings.defaults.classical; },
    });
  };

  document.getElementById('st-reset-persona').onclick = () => {
    confirmModal({
      title: '恢复默认人设',
      message: '把对谈人设还原为诗匣内置的书香才女版？你现在的修改将被覆盖。',
      confirmLabel: '恢复',
      onConfirm: async () => { document.getElementById('st-persona').value = settings.defaults.personaChat; },
    });
  };

  document.getElementById('st-save').onclick = async () => {
    const profiles = profilesData.filter(p => (p.name || '').trim());
    for (const p of profiles) {
      p.baseURL = cleanBaseURL(p.baseURL);
      if (!p.baseURL || !p.model) { toast(`配置「${p.name}」还缺接口地址或模型名`, 'err'); return; }
    }
    const names = profiles.map(p => p.name.trim());
    if (new Set(names).size !== names.length) { toast('配置名称不能重复', 'err'); return; }
    try {
      await api('/api/settings', {
        method: 'PUT',
        body: {
          profiles,
          prompts: {
            modern: document.getElementById('st-prompt-modern').value,
            classical: document.getElementById('st-prompt-classical').value,
          },
          personaChat: document.getElementById('st-persona').value,
        },
      });
      toast('设置已保存');
    } catch (e) { toast(e.message, 'err'); }
  };
}

/* ================= 启动 ================= */

// 卷签切换（事件委托，任何页面上的卷签都生效）
$app.addEventListener('click', e => {
  const b = e.target.closest('[data-vol]');
  if (!b) return;
  if (currentVol() !== b.dataset.vol) {
    setVol(b.dataset.vol);
    go('#/');
  }
});

// 点空白处收起模型下拉菜单
document.addEventListener('click', () => {
  document.querySelectorAll('.model-menu.open').forEach(m => m.classList.remove('open'));
});

route();
