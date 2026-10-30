/* 기간 실현손익: 증권사 손익 자료의 기간 확정 손익을 계좌별로 입력·표시합니다.
 * 저장은 서버 KV(kv/pnl, 법인별)에 하고 보유 데이터(rows)와 평가손익 계산에는 영향을 주지 않습니다. */
(function (root) {
'use strict';
const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const won = n => Number.isFinite(n) ? Math.round(n).toLocaleString('ko-KR') : '—';
const signed = n => (n > 0 ? '+' : n < 0 ? '−' : '') + won(Math.abs(n));
const num = v => { const x = Number(String(v == null ? '' : v).replace(/,/g, '').trim()); return Number.isFinite(x) ? x : NaN; };
const today = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
let ctx = null, st = { person: '', demo: false }, store = { ready: false, data: null };

async function kvGet(n) { if (!ctx || ctx.demo) return null; try { return await ctx.api('/kv/' + n); } catch (e) { return null; } }
async function kvSet(n, v) { if (!ctx || ctx.demo) return true; try { await ctx.api('/kv/' + n, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(v) }); return true; } catch (e) { return false; } }

function start(c) {
  ctx = c; store = { ready: false, data: null };
  if (c.demo) { store.ready = true; paint(); return; }
  kvGet('pnl').then(d => { store.data = d && Array.isArray(d.items) ? d : null; store.ready = true; paint(); });
}
function clear() { ctx = null; store = { ready: false, data: null }; st = { person: '', demo: false }; if ($('pnl-body')) $('pnl-body').innerHTML = ''; }
function render(d) { if (!d) return; st.person = d.person; st.demo = d.demo; paint(); }

function paint() {
  const box = $('pnl-body'); if (!box) return;
  if (st.demo) { box.innerHTML = '<div class="card-heading"><h3>기간 실현손익</h3></div><p class="empty">예시 화면에서는 표시하지 않습니다.</p>'; return; }
  const d = store.data;
  let h = '<div class="card-heading"><h3>기간 실현손익</h3><span class="caption">증권사 손익 자료 기준 · 평가손익과 별도 집계</span></div>';
  if (!store.ready) { box.innerHTML = h + '<p class="empty">불러오는 중…</p>'; return; }
  if (d && d.items.length) {
    const total = d.items.reduce((s, it) => s + (num(it.amount) || 0), 0);
    h += '<p class="caption" style="margin:0 0 10px">' + esc(d.start || '') + ' ~ ' + esc(d.end || '') + ' 기간의 확정 실현손익입니다(전기간 누적이 아니라 해당 기간만). 보유 평가손익·예수금과 별도로 표시하며, 미확인 금액은 추정해 넣지 않았습니다.' + (d.note ? ' ' + esc(d.note) : '') + '</p>';
    h += '<div class="mini-tiles pnl-summary" style="margin-bottom:12px"><div class="tile"><div class="tile-label">기간 실현손익 합계</div><div class="tile-value ' + (total >= 0 ? 'up' : 'down') + '">' + signed(total) + '<span class="unit">원</span></div><div class="tile-note">' + esc(d.start || '') + ' ~ ' + esc(d.end || '') + ' · 전기간 누적 아님</div></div></div>';
    h += '<div class="table-scroll"><table><thead><tr><th>계좌</th><th class="num">기간 실현손익(원)</th></tr></thead><tbody>' +
      d.items.map(it => '<tr><td>' + esc(it.label) + '</td><td class="num ' + ((num(it.amount) || 0) >= 0 ? 'up' : 'down') + '">' + signed(num(it.amount)) + '</td></tr>').join('') +
      '<tr class="summary-row"><td>합계</td><td class="num ' + (total >= 0 ? 'up' : 'down') + '">' + signed(total) + '</td></tr></tbody></table></div>';
    if (d.updated) h += '<p class="caption" style="margin-top:8px">입력일 ' + esc(d.updated) + '</p>';
  } else {
    h += '<p class="empty">아직 입력된 기간 손익 자료가 없습니다. 증권사 손익 자료를 보내 주시면 반영합니다.</p>';
  }
  h += '<details style="margin-top:14px"><summary class="caption" style="cursor:pointer">기간 손익 입력·수정</summary>' +
    '<div class="field-row" style="margin-top:10px"><label>기간 시작<input id="pnl-start" type="date" value="' + esc(d && d.start || '') + '"></label>' +
    '<label>기간 끝<input id="pnl-end" type="date" value="' + esc(d && d.end || '') + '"></label></div>' +
    '<label class="block"><textarea id="pnl-text" rows="5" placeholder="한 줄에 한 계좌 · 계좌, 실현손익&#10;예: 삼성증권 위탁 7134079254-01 (해외), 75538586"></textarea></label>' +
    '<div class="field-row" style="margin-top:10px"><button id="pnl-save" class="button primary" type="button">저장</button><span id="pnl-msg" class="caption" role="status" aria-live="polite">같은 법인에 다시 저장하면 기준값이 바뀝니다(덮어쓰기)</span></div></details>';
  box.innerHTML = h;
  const btn = $('pnl-save'); if (btn) btn.addEventListener('click', save);
}

async function save() {
  const msg = $('pnl-msg');
  const items = $('pnl-text').value.split('\n').map(l => l.trim()).filter(Boolean).map(l => {
    const i = l.lastIndexOf(',');
    if (i < 0) return { error: l };
    const amount = num(l.slice(i + 1));
    if (!Number.isFinite(amount)) return { error: l };
    return { label: l.slice(0, i).trim(), amount };
  });
  const bad = items.find(x => x.error);
  if (bad) { msg.textContent = '형식을 확인하세요: ' + bad.error; return; }
  if (!items.length) { msg.textContent = '입력된 계좌가 없습니다.'; return; }
  const d = { start: $('pnl-start').value, end: $('pnl-end').value, updated: today(), items };
  msg.textContent = '저장하는 중…';
  const ok = await kvSet('pnl', d);
  if (ok) { store.data = d; paint(); } else msg.textContent = '저장에 실패했습니다. 다시 시도해 주세요.';
}

root.WPNL = { start, render, clear };
})(window);
