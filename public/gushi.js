/* 诗匣 · 乙编（古体）界面：目录 / 编辑器+格律面板 / 详情 */
'use strict';

window.GUSHI = (function () {

  const GENRE_ORDER = ['词', '七绝', '七律', '五绝', '五律', '排律', '古风·乐府', '诗经体', '不拘'];
  const LS = {
    get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
    set(k, v) { localStorage.setItem(k, JSON.stringify(v)); },
    del(k) { localStorage.removeItem(k); },
  };
  const draftKey = id => 'shixia:draft:gushi:' + (id || 'new');

  /* ================= 目录 ================= */
  async function renderCatalog() {
    $app.innerHTML = '<div class="boot">翻开乙编……</div>';
    let poems = [];
    try {
      poems = (await api('/api/poems?vol=gushi')).poems;
    } catch (e) { $app.innerHTML = `<div class="boot">加载失败：${esc(e.message)}</div>`; return; }

    $app.innerHTML = `
    <div class="page">
      ${window.renderMasthead('gushi')}
      <div class="toolbar-row">
        <div class="search-wrap"><input id="g-search" placeholder="搜诗题或诗句…"></div>
        <div class="spacer"></div>
        <a class="btn ghost" href="/manual.html" target="_blank">手册</a>
        <a class="btn ghost" href="#/chat">对谈</a>
        <a class="btn ghost" href="#/settings">设置</a>
        <button class="btn primary" id="g-new">＋ 写新篇</button>
      </div>
      <div id="g-catalog-body"></div>
    </div>`;

    document.getElementById('g-new').onclick = () => go('#/new');
    const searchEl = document.getElementById('g-search');
    const bodyEl = document.getElementById('g-catalog-body');

    function drawList(query) {
      const kw = (query || '').trim().toLowerCase();
      const filtered = kw
        ? poems.filter(p => (p.title || '').toLowerCase().includes(kw) || (p.content || '').toLowerCase().includes(kw))
        : poems;
      if (!filtered.length) {
        bodyEl.innerHTML = kw
          ? `<div class="empty-state"><p>没有找到含「${esc(query)}」的诗。</p></div>`
          : `<div class="empty-state">
               <div class="glyph">律</div>
               <p>乙编还空着，从一首绝句开始。</p>
               <button class="btn primary big" id="g-new2">＋ 写新篇</button>
             </div>`;
        const b2 = document.getElementById('g-new2');
        if (b2) b2.onclick = () => go('#/new');
        return;
      }
      const groups = {};
      for (const p of filtered) {
        const g = GENRE_ORDER.includes(p.genre) ? p.genre : '不拘';
        (groups[g] = groups[g] || []).push(p);
      }
      let html = '';
      for (const g of GENRE_ORDER) {
        const list = groups[g];
        if (!list) continue;
        list.sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.updatedAt || '').localeCompare(a.updatedAt || ''));
        html += `<div class="year-block"><div class="year-label">${esc(g)}</div><ul class="poem-list">`;
        for (const p of list) {
          html += `
          <li class="poem-item" data-id="${esc(p.id)}">
            <span class="t">${esc(p.title)}${p.cipai ? `<span class="cipai-tag">「${esc(p.cipai)}」</span>` : ''}</span>
            <span class="dots"></span>
            <span class="badges">
              ${p.versionCount ? `<span class="badge">旧版 ${p.versionCount}</span>` : ''}
              ${p.evaluationCount ? `<span class="badge">评 ${p.evaluationCount}</span>` : ''}
            </span>
            <span class="d">${esc(p.date || '　')}</span>
          </li>`;
        }
        html += '</ul></div>';
        delete groups[g];
      }
      for (const g of Object.keys(groups)) {
        html += `<div class="year-block"><div class="year-label">${esc(g)}</div><ul class="poem-list">${
          groups[g].map(p => `<li class="poem-item" data-id="${esc(p.id)}"><span class="t">${esc(p.title)}</span><span class="dots"></span><span class="d">${esc(p.date || '')}</span></li>`).join('')
        }</ul></div>`;
      }
      bodyEl.innerHTML = html;
      bodyEl.querySelectorAll('.poem-item').forEach(li => { li.onclick = () => go('#/poem/' + li.dataset.id); });
    }
    drawList('');
    searchEl.oninput = () => drawList(searchEl.value);
  }

  /* ================= 详情 ================= */
  function subtitle(p) {
    const bits = [];
    if (p.genre) bits.push(p.genre === '词' && p.cipai ? `词·${p.cipai}` : p.genre);
    if (p.rhbook) bits.push(p.rhbook);
    return bits.join(' · ');
  }

  async function renderDetail(poem) {
    const id = poem.id;
    const align = localStorage.getItem('shixia:align') || 'left';
    const versions = poem.versions || [];
    const evals = poem.evaluations || [];
    const sub = subtitle(poem);

    $app.innerHTML = `
    <div class="page">
      <button class="back-link">← 返回目录</button>
      <div class="paper">
        <div class="poem-view${align === 'center' ? '' : ' left-align'}">
          <div class="p-title">${esc(poem.title)}</div>
          ${sub ? `<div class="p-date">${esc(sub)}</div>` : ''}
          <div class="p-date">${esc(poem.date || '')}</div>
          ${poem.preface ? `<div class="p-preface">${esc(poem.preface)}</div>` : ''}
          ${renderStanzas(poem.content)}
        </div>
      </div>
      <div class="action-row">
        <button class="btn primary" id="ga-edit">编辑</button>
        <button class="btn" id="ga-eval">AI 评价</button>
        <button class="btn" id="ga-gelv">格律</button>
        <button class="btn" id="ga-versions">版本${versions.length ? `（${versions.length}）` : ''}</button>
        <div class="spacer"></div>
        ${fontSelectHTML('gd-font')}
        <button class="btn danger" id="ga-del">删除此篇</button>
      </div>

      <div class="section">
        <div class="section-head" id="gsh-versions"><span class="caret">▶</span><h3>保留的旧版本</h3><span class="n">${versions.length ? versions.length + ' 个' : '暂无'}</span></div>
        <div class="section-body" id="gsb-versions">${
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

      <div class="section">
        <div class="section-head" id="gsh-evals"><span class="caret">▶</span><h3>AI 评价</h3><span class="n">${evals.length ? evals.length + ' 条' : '暂无'}</span></div>
        <div class="section-body" id="gsb-evals">${
          evals.length ? evals.map(e => `
            <div class="eval-row" data-eid="${esc(e.id)}">
              <div class="e-head">
                <span class="e-model">${esc(e.profile || '未命名模型')}<span class="muted"> · ${esc(e.model || '')}</span></span>
                ${e.score ? `<span class="score-badge">评分 ${esc(e.score)}/100</span>` : ''}
                <span class="e-time">${esc(fmtTime(e.createdAt))}</span>
                <span class="row-actions">
                  <button class="btn small ghost" data-act="toggle">展开 / 收起</button>
                  <button class="btn small danger" data-act="del">删除</button>
                </span>
              </div>
              <div class="eval-content"><div class="eval-text">${esc(e.content)}</div></div>
            </div>`).join('') : '<div style="padding:16px 4px;color:#a2967f;font-size:13.5px;">点上方「AI 评价」，为这一篇请一位严格的评审。</div>'
        }</div>
      </div>
    </div>`;

    $app.querySelector('.back-link').onclick = () => go('#/');
    bindFontSelect(document.getElementById('gd-font'));
    document.getElementById('ga-edit').onclick = () => go('#/edit/' + id);
    document.getElementById('ga-del').onclick = () => {
      confirmModal({
        title: '删除整篇',
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

    // 折叠区
    const shV = document.getElementById('gsh-versions'), sbV = document.getElementById('gsb-versions');
    shV.onclick = () => { shV.classList.toggle('open'); sbV.classList.toggle('open'); };
    sbV.querySelectorAll('.version-row').forEach(row => {
      const v = versions.find(x => x.id === row.dataset.vid);
      row.querySelectorAll('button').forEach(btn => {
        btn.onclick = () => {
          const act = btn.dataset.act;
          if (act === 'view') {
            showModal({
              title: '旧版本 · ' + (v.note || '未写备注'),
              html: `<div style="font-family:KaiTi,'楷体',serif;font-size:17px;line-height:2.1;white-space:pre-wrap;${align === 'center' ? 'text-align:center;' : ''}">${esc(v.content)}</div>`,
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
                  await api(`/api/poems/${encodeURIComponent(id)}/versions/${encodeURIComponent(v.id)}/restore`, { method: 'POST' });
                  toast('已恢复旧版，当前内容已自动存入历史');
                  window.routeAfterVol();
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
                  await api(`/api/poems/${encodeURIComponent(id)}/versions/${encodeURIComponent(v.id)}`, { method: 'DELETE' });
                  toast('已删除该版本');
                  window.routeAfterVol();
                } catch (e) { toast(e.message, 'err'); }
              },
            });
          }
        };
      });
    });

    const shE = document.getElementById('gsh-evals'), sbE = document.getElementById('gsb-evals');
    shE.onclick = () => { shE.classList.toggle('open'); sbE.classList.toggle('open'); };
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
                  window.routeAfterVol();
                } catch (e) { toast(e.message, 'err'); }
              },
            });
          }
        };
      });
    });

    document.getElementById('ga-eval').onclick = async () => {
      let report = '';
      try {
        const r = await GELV.annotate(poem.content, { genre: poem.genre || '不拘', rhbook: poem.rhbook || '平水韵', cipai: poem.cipai || '', overrides: poem.toneOverrides || {} });
        report = GELV.reportText(r, { genre: poem.genre, rhbook: poem.rhbook, cipai: poem.cipai });
      } catch {}
      window.startEvalFlow(poem, id, { report });
    };

    document.getElementById('ga-gelv').onclick = async () => {
      showModal({ title: '格律检视', wide: true, html: '<div class="gelv-loading">正在检视……</div>', buttons: [{ label: '关闭', class: 'ghost' }] });
      try {
        const r = await GELV.annotate(poem.content, { genre: poem.genre || '不拘', rhbook: poem.rhbook || '平水韵', cipai: poem.cipai || '', overrides: poem.toneOverrides || {} });
        document.querySelector('.modal-body').innerHTML = renderAnnotation(r, { rhbook: poem.rhbook || '平水韵' });
      } catch (e) {
        document.querySelector('.modal-body').innerHTML = `<p class="warn-line">检视失败：${esc(e.message)}</p>`;
      }
    };
  }

  /* ================= 标注渲染 ================= */
  function renderStanzas(content) {
    const stanzas = String(content || '').split(/\n{2,}/).filter(s => s.trim());
    if (!stanzas.length) return '<div class="p-empty">（暂无内容）</div>';
    return stanzas.map(st =>
      `<div class="stanza">${esc(st).split('\n').map(l => `<div class="verse">${l || '　'}</div>`).join('')}</div>`
    ).join('');
  }

  const STATE_CLS = {
    ok: 'gs-ok', plain: 'gs-ok', flex: 'gs-flex', poly: 'gs-poly', jiu: 'gs-jiu',
    '拗': 'gs-bad', unknown: 'gs-unknown', missing: 'gs-missing', extra: 'gs-extra',
    rhyme: 'gs-rhyme', 'rhyme-bad': 'gs-rhyme-bad',
  };

  function toneLabel(s) {
    if (!s.j || !s.j.ok) return s.state === 'missing' ? '' : '?';
    if (s.j.detail === '平' || s.j.detail === '仄') return s.j.detail;
    return s.j.detail; // 上/去/入
  }

  function renderAnnotation(r, opt) {
    const parts = [];
    if (r.cipai) parts.push(`<div class="gelv-cipai-line">《${esc(r.cipai.name)}》${esc(r.cipai.label || '正体')} · ${esc(r.cipai.sketch || '')}（${r.cipai.total} 字，例：${esc(r.cipai.author || '佚名')}）</div>`);
    parts.push('<div class="gelv-anno">');
    for (const ls of r.lineStates) {
      parts.push('<div class="gelv-line">');
      parts.push('<div class="gelv-text">');
      for (const s of ls.states) {
        const cls = STATE_CLS[s.state] || 'gs-ok';
        const clickable = s.j && s.j.poly ? ' clickable' : '';
        parts.push(`<span class="g-char ${cls}${clickable}" data-l="${ls.line.lineIdx}" data-c="${ls.states.indexOf(s)}" title="${esc(s.note || '')}">${s.ch}<span class="g-tone">${toneLabel(s)}</span></span>`);
      }
      parts.push('</div>');
      if (ls.expected) {
        const actual = ls.states.map(s => s.j && s.j.ok ? s.j.tone : '？').join('');
        const bad = ls.states.some(s => s.state === '拗' || s.state === 'missing');
        parts.push(`<div class="gelv-compare"><span class="gc-exp">${esc(ls.expected)}</span><span class="gc-sep">｜</span><span class="gc-act${bad ? ' gc-bad' : ''}">${esc(actual)}</span>${ls.special ? `<span class="gc-tag">${esc(ls.special)}</span>` : ''}${ls.rFlag ? `<span class="gc-tag">${esc(ls.rFlag)}</span>` : ''}</div>`);
      }
      parts.push('</div>');
    }
    parts.push('</div>');

    // 图例
    parts.push(`<div class="gelv-legend">
      <span><i class="lg lg-ok"></i>合律</span>
      <span><i class="lg lg-flex"></i>可平可仄</span>
      <span><i class="lg lg-bad"></i>拗/出韵</span>
      <span><i class="lg lg-jiu"></i>拗救/变格</span>
      <span><i class="lg lg-rhyme"></i>韵脚</span>
      <span><i class="lg lg-poly"></i>多音（点击选读音）</span>
      <span><i class="lg lg-ru"></i>入声</span>
    </div>`);

    // 韵脚表
    if (r.feet && r.feet.length) {
      parts.push('<div class="gelv-feet"><span class="gf-title">韵脚</span>' +
        r.feet.map(f => `<span class="gf${f.bad ? ' gf-bad' : ''}${f.borrow ? ' gf-borrow' : ''}">${esc(f.ch)}<small>${esc(f.bu || '?')}${f.borrow ? '·借' : ''}${f.bad ? '·出韵' : ''}</small></span>`).join('') + '</div>');
    } else if (r.rhymeRuns && r.rhymeRuns.length) {
      parts.push('<div class="gelv-feet"><span class="gf-title">韵段</span>' +
        r.rhymeRuns.map(run => `<span class="gf">${run.feet.map(f => esc(f.ch)).join('')}<small>${esc(run.bu || '?')}</small></span>`).join('') + '</div>');
    }

    // 问题清单
    if (r.issues.length) {
      parts.push('<div class="gelv-issues">' + r.issues.map(i =>
        `<div class="gi gi-${i.sev}"><b>【${esc(i.type)}】</b>${esc(i.msg)}</div>`
      ).join('') + '</div>');
    } else {
      parts.push('<div class="gelv-issues"><div class="gi gi-ok">✓ 本次检视未发现格律问题。</div></div>');
    }
    return parts.join('');
  }

  /* ================= 编辑器 ================= */
  async function renderEditor(poem) {
    const id = poem ? poem.id : null;
    const draft = LS.get(draftKey(id), null);
    const initial = {
      title: poem ? poem.title : '',
      date: poem ? poem.date : todayStr(),
      content: poem ? poem.content : '',
      preface: poem ? (poem.preface || '') : '',
      genre: poem ? poem.genre : '七绝',
      rhbook: poem ? poem.rhbook : '平水韵',
      cipai: poem ? poem.cipai : '',
    };
    let overrides = poem ? LS.get('shixia:ov:' + (id || 'new'), poem.toneOverrides || {}) : LS.get('shixia:ov:new', {});
    let usedDraft = false;
    if (draft && (draft.title !== initial.title || draft.content !== initial.content || draft.genre !== initial.genre || draft.cipai !== initial.cipai || (draft.preface || '') !== initial.preface)) {
      Object.assign(initial, {
        title: draft.title ?? initial.title, date: draft.date ?? initial.date, content: draft.content ?? initial.content,
        preface: draft.preface ?? initial.preface,
        genre: draft.genre ?? initial.genre, rhbook: draft.rhbook ?? initial.rhbook, cipai: draft.cipai ?? initial.cipai,
      });
      overrides = draft.overrides ?? overrides;
      usedDraft = true;
    }

    let cipuCatalog = [];
    try { cipuCatalog = await api('/api/gelv/cipu'); } catch { toast('词牌目录加载失败，可稍后重开本页'); }

    $app.innerHTML = `
    <div class="page page-wide">
      <button class="back-link" id="ge-back">← 返回</button>
      <div class="editor-bar">
        <span class="doc-name">${poem ? '编辑《' + esc(poem.title) + '》' : '写新篇'}</span>
        <select class="mini-select" id="ge-genre" title="体裁">
          ${['词', '七绝', '七律', '五绝', '五律', '排律', '古风·乐府', '诗经体', '不拘'].map(g => `<option value="${g}"${g === initial.genre ? ' selected' : ''}>${g}</option>`).join('')}
        </select>
        <select class="mini-select" id="ge-rhbook" title="韵书">
          ${GELV.RHBOOKS.map(b => `<option value="${b}"${b === initial.rhbook ? ' selected' : ''}>${b}</option>`).join('')}
        </select>
        <div class="cipai-wrap" id="ge-cipai-wrap" style="display:none;">
          <input class="mini-input" id="ge-cipai" placeholder="选词牌…" value="${esc(initial.cipai)}">
          <button class="btn small ghost" id="ge-cipai-pick">选词牌</button>
          <button class="btn small ghost" id="ge-cipai-view" title="查看这个词牌的谱面">谱</button>
        </div>
        ${fontSelectHTML('ge-font')}
        <div class="spacer"></div>
        <span class="count" id="ge-count"></span>
        <button class="btn small ghost" id="ge-undo" title="撤销 Ctrl+Z">撤销</button>
        <button class="btn small ghost" id="ge-redo" title="重做 Ctrl+Y">重做</button>
        <button class="btn primary" id="ge-save">保存</button>
      </div>
      <div class="gelv-layout">
    <div class="paper editor" id="ge-paper">
      <input class="title-input" id="ge-title" placeholder="诗题" value="${esc(initial.title)}">
      <div><input class="date-input" id="ge-date" placeholder="日期如 2026.11.18" value="${esc(initial.date)}"></div>
      <textarea class="preface-input" id="ge-preface" rows="1" placeholder="小序（可选）：题记、序言写在这里，不计入格律检视">${esc(initial.preface)}</textarea>
      <textarea class="content-input" id="ge-content" placeholder="一行一句或数句连写均可，按标点断句；空行分阕。右侧格律面板随写随检。">${esc(initial.content)}</textarea>
    </div>
        <div class="gelv-panel" id="ge-panel">
          <div class="gp-head">格律 <span class="gp-status" id="gp-status"></span></div>
          <div class="gp-body" id="gp-body"><div class="gelv-loading">落笔即检……</div></div>
        </div>
      </div>
      <div class="draft-note" id="ge-draftnote"></div>
    </div>`;

  const titleEl = document.getElementById('ge-title');
  const dateEl = document.getElementById('ge-date');
  const contentEl = document.getElementById('ge-content');
  const prefaceEl = document.getElementById('ge-preface');
    const genreEl = document.getElementById('ge-genre');
    const rhbookEl = document.getElementById('ge-rhbook');
    const cipaiWrap = document.getElementById('ge-cipai-wrap');
    const cipaiEl = document.getElementById('ge-cipai');
    const countEl = document.getElementById('ge-count');
    const panelBody = document.getElementById('gp-body');
    const panelStatus = document.getElementById('gp-status');

    function syncCipaiVisibility() {
      cipaiWrap.style.display = genreEl.value === '词' ? '' : 'none';
      // 写词时若还挂着平水韵，自动换到词林正韵（可手动改回）
      if (genreEl.value === '词' && rhbookEl.value === '平水韵') {
        rhbookEl.value = '词林正韵';
        toast('填词按惯例改用「词林正韵」检韵，可手动换回');
      }
    }
    syncCipaiVisibility();
    genreEl.onchange = () => { syncCipaiVisibility(); markDirty(); scheduleGelv(); };
    rhbookEl.onchange = () => { markDirty(); scheduleGelv(); };
    cipaiEl.oninput = () => { markDirty(); scheduleGelv(); };

    function autosize() {
      prefaceEl.style.height = 'auto';
      prefaceEl.style.height = Math.min(Math.max(prefaceEl.scrollHeight, 40), 200) + 'px';
      contentEl.style.height = 'auto';
      contentEl.style.height = Math.max(contentEl.scrollHeight, window.innerHeight * 0.4) + 'px';
    }
    function updateCount() {
      const text = contentEl.value;
      countEl.textContent = `${text.replace(/\s/g, '').length} 字 · ${text ? text.split('\n').filter(l => l.trim()).length : 0} 句`;
    }
    autosize(); updateCount();

    /* 草稿 */
    let draftTimer = null, dirty = false, gelvTimer = null;
    function saveDraft() {
      LS.set(draftKey(id), {
        title: titleEl.value, date: dateEl.value, content: contentEl.value,
        preface: prefaceEl.value,
        genre: genreEl.value, rhbook: rhbookEl.value, cipai: cipaiEl.value,
        overrides, at: Date.now(),
      });
      renderDraftNote();
    }
    function renderDraftNote() {
      const el = document.getElementById('ge-draftnote');
      if (!LS.get(draftKey(id), null)) { el.innerHTML = ''; return; }
      el.innerHTML = `
        <span>草稿已自动暂存（含多音字选择）。</span>
        ${poem && dirty ? '<button class="linkish" id="gdn-revert">放弃改动，还原为已保存版本</button>' : ''}`;
      const rk = document.getElementById('gdn-revert');
      if (rk) rk.onclick = () => {
        confirmModal({
          title: '还原为已保存版本',
          message: `放弃本次所有未保存的修改，还原《${esc(poem.title)}》到上次保存的样子？`,
          confirmLabel: '还原',
          onConfirm: () => {
            LS.del(draftKey(id)); LS.del('shixia:ov:' + (id || 'new'));
          titleEl.value = poem.title; dateEl.value = poem.date || ''; contentEl.value = poem.content;
          prefaceEl.value = poem.preface || '';
          genreEl.value = poem.genre || '七绝'; rhbookEl.value = poem.rhbook || '平水韵'; cipaiEl.value = poem.cipai || '';
            dirty = false; usedDraft = false; overrides = poem.toneOverrides || {};
            syncCipaiVisibility(); autosize(); updateCount(); saveDraft(); renderDraftNote(); scheduleGelv();
            toast('已还原为上次保存的版本');
          },
        });
      };
    }
    if (usedDraft) toast('已恢复上次未保存的草稿');
    renderDraftNote();

    function markDirty() {
      dirty = true;
      clearTimeout(draftTimer);
      draftTimer = setTimeout(saveDraft, 700);
    }

    /* 格律实时检视 */
    async function runGelv() {
      const content = contentEl.value;
      if (!content.trim()) {
        panelBody.innerHTML = '<div class="gelv-loading">右侧面板将随写随检：逐字平仄、韵脚、粘对、孤平、出韵，一目了然。</div>';
        panelStatus.textContent = '';
        return;
      }
      panelStatus.textContent = '检视中…';
      try {
        const r = await GELV.annotate(content, {
          genre: genreEl.value, rhbook: rhbookEl.value, cipai: cipaiEl.value.trim(), overrides,
        });
        panelBody.innerHTML = renderAnnotation(r, { rhbook: rhbookEl.value });
        panelStatus.textContent = r.summary.errors ? `${r.summary.errors} 处问题` : (r.summary.warns ? `${r.summary.warns} 处提醒` : '✓ 合');
        panelStatus.className = 'gp-status' + (r.summary.errors ? ' bad' : r.summary.warns ? ' warn' : ' good');
        // 多音字点击
        panelBody.querySelectorAll('.g-char.clickable').forEach(el => {
          el.onclick = () => {
            Promise.resolve(chooseReading(el.dataset.l, el.dataset.c, contentEl.value))
              .catch(e => { window.__chooseErr = String(e && e.stack || e); toast('选读音失败：' + e.message, 'err'); });
          };
        });
      } catch (e) {
        panelBody.innerHTML = `<div class="gelv-loading">检视失败：${esc(e.message)}</div>`;
        panelStatus.textContent = '';
      }
    }
    function scheduleGelv() {
      clearTimeout(gelvTimer);
      gelvTimer = setTimeout(runGelv, 500);
    }
    runGelv();

    async function chooseReading(l, c, content) {
      const lines = GELV.splitSentences(content);
      const line = lines[Number(l)];
      if (!line) return;
      const chs = GELV.stripPunct(line.text).split('');
      const ch = chs[Number(c)];
      if (!ch) return;
      const rs = GELV.readings(ch, rhbookEl.value);
      if (!rs || rs.length < 2) { toast('这个字只查到一个读音'); return; }
      const cur = overrides[`l${l}:${c}`] || 0;
      showModal({
        title: `「${ch}」的读音`,
        html: `<div class="reading-list">${rs.map((r, i) => `
          <label class="opt-item${i === cur ? ' selected' : ''}" data-i="${i}">
            <input type="radio" name="rd" ${i === cur ? 'checked' : ''}>
            <span class="opt-t">${esc(r.py || '　')}　${r.tune === '平' ? '平' : '仄'}${r.tune === '入' ? '（入声）' : ''}<span class="muted">　${esc(String(r.yb))}</span></span>
          </label>`).join('')}</div>
        <p style="margin-top:10px;font-size:12.5px;color:#a2967f;">选择将保存在草稿中，保存后随诗稿一起存档。</p>`,
        buttons: [{ label: '取消', class: 'ghost' }, { label: '就选这个', class: 'primary' }],
        onMount: (bodyEl, close) => {
          const btn = document.querySelector('.modal-foot .btn.primary');
          btn.onclick = () => {
            const item = bodyEl.querySelector('.opt-item input:checked');
            const idx = Number(item.closest('.opt-item').dataset.i);
            overrides[`l${l}:${c}`] = idx;
            LS.set('shixia:ov:' + (id || 'new'), overrides);
            markDirty();
            close();
            scheduleGelv();
          };
          bodyEl.querySelectorAll('.opt-item').forEach(it => {
            it.onclick = e => {
              bodyEl.querySelectorAll('.opt-item').forEach(x => x.classList.remove('selected'));
              it.classList.add('selected');
              it.querySelector('input').checked = true;
            };
          });
        },
      });
    }

    contentEl.addEventListener('input', () => { markDirty(); autosize(); updateCount(); scheduleGelv(); });
    prefaceEl.addEventListener('input', () => { markDirty(); autosize(); });
    titleEl.addEventListener('input', markDirty);
    dateEl.addEventListener('input', markDirty);

    document.getElementById('ge-undo').onclick = () => { contentEl.focus(); document.execCommand('undo'); };
    document.getElementById('ge-redo').onclick = () => { contentEl.focus(); document.execCommand('redo'); };
    document.getElementById('ge-back').onclick = () => go(poem ? '#/poem/' + id : '#/');
    document.getElementById('ge-cipai-pick').onclick = () => openCipaiPicker(cipaiEl, cipuCatalog);
    document.getElementById('ge-cipai-view').onclick = () => {
      const v = cipaiEl.value.trim();
      if (!v) { toast('先选或填写词牌名'); return; }
      showCipuPreview(v);
    };
    bindFontSelect(document.getElementById('ge-font'));

    /* 保存 */
    document.getElementById('ge-save').onclick = () => {
      const title = titleEl.value.trim();
      const content = contentEl.value.replace(/\r\n?/g, '\n').replace(/[ \t]+$/gm, '').replace(/\n+$/, '');
      if (!title) { toast('先给诗起个名字吧', 'err'); titleEl.focus(); return; }
      if (!content.trim()) { toast('诗的内容还是空的', 'err'); contentEl.focus(); return; }
      const payload = {
        title, date: dateEl.value.trim(), content,
        preface: prefaceEl.value.trim(),
        genre: genreEl.value, rhbook: rhbookEl.value, cipai: cipaiEl.value.trim(),
      };

      if (!poem) {
        api('/api/poems', { method: 'POST', body: { ...payload, vol: 'gushi', toneOverrides: overrides } })
          .then(r => {
            LS.del(draftKey(null)); LS.del('shixia:ov:new');
            toast('《' + title + '》已收进乙编');
            go('#/poem/' + r.id);
          })
          .catch(e => toast(e.message, 'err'));
        return;
      }
      const unchanged = title === poem.title && payload.date === (poem.date || '') && content === poem.content
        && payload.preface === (poem.preface || '')
        && payload.genre === (poem.genre || '') && payload.rhbook === (poem.rhbook || '') && payload.cipai === (poem.cipai || '');
      if (unchanged) { toast('内容和上次保存一致，无需保存'); return; }

      let mode = 'keep';
      showModal({
        title: '保存《' + esc(title) + '》',
        html: `
        <div class="opt-row" id="g-save-opts">
          <label class="opt-item" data-v="keep">
            <input type="radio" name="g-save-mode" value="keep" checked>
            <span><span class="opt-t">覆盖保存，并把当前版本存入历史</span>
            <span class="opt-d">旧版本保留在「版本」区，随时可查看、对比、恢复或删除。</span></span>
          </label>
          <label class="opt-item" data-v="overwrite">
            <input type="radio" name="g-save-mode" value="overwrite">
            <span><span class="opt-t">直接覆盖，不留旧版</span>
            <span class="opt-d">旧内容将被新内容替换，不留历史版本。</span></span>
          </label>
        </div>
        <input class="note-input" id="g-save-note" placeholder="给旧版本写句备注（可选），如：改了颈联">`,
        buttons: [
          { label: '取消', class: 'ghost' },
          {
            label: '保存', class: 'primary',
            onClick: async bodyEl => {
              const note = bodyEl.querySelector('#g-save-note').value.trim();
              try {
                await api('/api/poems/' + encodeURIComponent(id), {
                  method: 'PUT',
                  body: { ...payload, keepVersion: mode === 'keep', note, toneOverrides: overrides },
                });
                LS.del(draftKey(id)); LS.del('shixia:ov:' + id);
                toast(mode === 'keep' ? '已保存，旧版本已存入历史' : '已覆盖保存');
                go('#/poem/' + id);
              } catch (e) { toast(e.message, 'err'); return false; }
            },
          },
        ],
        onMount: bodyEl => {
          const items = bodyEl.querySelectorAll('.opt-item');
          const noteInput = bodyEl.querySelector('#g-save-note');
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

  /* ================= 词牌选择器 ================= */

  const COMMON_CIPAI = ['浣溪沙', '水调歌头', '念奴娇', '沁园春', '蝶恋花', '鹧鸪天', '虞美人', '菩萨蛮', '卜算子', '清平乐', '如梦令', '长相思', '西江月', '临江仙', '渔家傲', '破阵子', '定风波', '满江红', '声声慢', '雨霖铃', '扬州慢', '鹊桥仙', '踏莎行', '贺新郎', '玉楼春', '少年游', '青玉案', '一剪梅', '诉衷情', '点绛唇'];

  function openCipaiPicker(inputEl, catalog) {
    showModal({
      title: '选择词牌',
      wide: true,
      html: `<input class="text-input" id="cp-search" placeholder="搜词牌名，如：念奴娇 / 水 / 蝶……">
             <div class="cipai-pick-list" id="cp-list"></div>
             <p style="margin-top:10px;font-size:12.5px;color:#a2967f;">共收录 ${catalog.length} 调，点击即选；选好后点编辑栏的「谱」可查看谱面。</p>`,
      buttons: [{ label: '关闭', class: 'ghost' }],
      onMount: (bodyEl, close) => {
        const listEl = bodyEl.querySelector('#cp-list');
        const searchEl = bodyEl.querySelector('#cp-search');
        function row(c) {
          const display = c.s || c.name;
          const b = document.createElement('button');
          b.className = 'cp-row';
          b.innerHTML = `<span class="cp-name">${esc(display)}</span><span class="cp-meta">${c.total} 字${c.cat ? ' · ' + esc(c.cat) : ''}</span>`;
          b.onclick = () => {
            inputEl.value = display;
            inputEl.dispatchEvent(new Event('input', { bubbles: true }));
            close();
            toast('已选《' + display + '》');
          };
          return b;
        }
        function group(label) {
          const d = document.createElement('div');
          d.className = 'cp-group';
          d.textContent = label;
          return d;
        }
        function draw(q) {
          listEl.innerHTML = '';
          q = (q || '').trim().toLowerCase();
          if (!q) {
            const common = [...new Set(COMMON_CIPAI)].map(n => catalog.find(c => c.name === n)).filter(Boolean);
            if (common.length) {
              listEl.appendChild(group('常 用'));
              common.forEach(c => listEl.appendChild(row(c)));
            }
            listEl.appendChild(group('全部词牌（按字数，前 60）'));
            catalog.slice(0, 60).forEach(c => listEl.appendChild(row(c)));
          } else {
            const hits = catalog.filter(c => (c.s || c.name).toLowerCase().includes(q)).slice(0, 120);
            listEl.appendChild(group(hits.length ? `匹配 ${hits.length} 调` : '没有匹配的词牌'));
            hits.forEach(c => listEl.appendChild(row(c)));
          }
        }
        draw('');
        searchEl.oninput = () => draw(searchEl.value);
        setTimeout(() => searchEl.focus(), 60);
      },
    });
  }

  /* ================= 词谱谱面预览 ================= */
  async function showCipuPreview(name) {
    showModal({ title: '《' + esc(name) + '》谱面', wide: true, html: '<div class="gelv-loading">取谱……</div>', buttons: [{ label: '关闭', class: 'ghost' }] });
    try {
      const d = await (await api('/api/gelv/cipu/' + encodeURIComponent(name))).json();
      const f = d.formats[0];
      const html = f.segs.map((seg, si) =>
        `<div class="cipu-seg">${si > 0 ? '<div class="cipu-seg-mark">下阕</div>' : ''}` +
        seg.map(l => `<div class="cipu-line"><span class="cipu-pat">${esc(l.p)}<b class="${l.r === '韵' ? 'cipu-yun' : ''}">${esc(l.e)}</b></span><span class="cipu-flag">${l.r === '韵' ? '（韵）' : l.r === '读' ? '（豆）' : l.r === '叠' ? '（叠）' : l.r === '换' ? '（换韵）' : l.r === '叶' ? '（叶）' : ''}</span></div>`).join('') +
        '</div>').join('');
      document.querySelector('.modal-body').innerHTML =
        `<div class="cipu-headline">${esc(f.sketch || '')}</div>` + html +
        `<div style="margin-top:14px;font-size:12.5px;color:#a2967f;">「中」处平仄不拘。谱据《钦定词谱》类数据整理，共 ${d.formats.length} 体，此处列正体。</div>`;
    } catch (e) {
      document.querySelector('.modal-body').innerHTML = `<p class="warn-line">取谱失败：${esc(e.message)}</p>`;
    }
  }

  return { renderCatalog, renderDetail, renderEditor, renderAnnotation, showCipuPreview, draftKey };
})();
