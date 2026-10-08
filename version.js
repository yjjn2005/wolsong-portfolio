/* 포트폴리오 버전 표시 — 상단에 현재 데이터 버전을 보여주고, 누르면 버전별 변경 내역과 주체별 총자산을 펼칩니다. */
(function (root) {
'use strict';
const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const won = n => Number.isFinite(n) ? Math.round(n).toLocaleString('ko-KR') : '—';
const signed = n => (n > 0 ? '+' : n < 0 ? '−' : '') + won(Math.abs(n));
const NAMES = { tc: '월송티앤씨', co: '월송앤컴퍼니', mp: '문앤파인트리', hk: '한규자님' };
let data = null;
const short = at => { const m = String(at || '').match(/^\d{4}-(\d\d)-(\d\d)(?: (\d\d:\d\d))?/); return m ? m[1] + '.' + m[2] + (m[3] ? ' ' + m[3] : '') : String(at || ''); };
const full = at => String(at || '').replace(/^(\d{4})-(\d\d)-(\d\d)/, '$1.$2.$3');

function start(c) {
  hide();
  if (c.demo) return;
  c.api('/kv/version?p=all').then(d => { if (d && Array.isArray(d.history) && d.history.length) { data = d; show(); } }).catch(() => {});
}
function hide() { data = null; const b = $('ver-chip'), p = $('ver-panel'); if (b) { b.hidden = true; b.setAttribute('aria-expanded', 'false'); } if (p) { p.hidden = true; p.innerHTML = ''; } }
function show() {
  const b = $('ver-chip'); if (!b || !data) return;
  b.textContent = '포트폴리오 ' + data.cur + ' · ' + short(data.at);
  b.title = '데이터 기준 ' + full(data.at) + ' · 눌러서 버전별 변경 내역 보기';
  b.hidden = false;
  b.onclick = () => { const p = $('ver-panel'), open = p.hidden; if (open) paint(); p.hidden = !open; b.setAttribute('aria-expanded', String(open)); };
}
function paint() {
  const p = $('ver-panel'), h = data.history;
  const sum = t => Object.values(t || {}).reduce((n, x) => n + x, 0);
  p.innerHTML = '<div class="card-heading"><h3>포트폴리오 버전 이력</h3><span class="caption">현재 ' + esc(data.cur) + ' · 데이터 기준 ' + esc(full(data.at)) + '</span></div>' +
    h.map((v, i) => {
      const prev = h[i + 1] && h[i + 1].totals, t = v.totals || {};
      return '<div style="padding:12px 0;border-top:1px solid var(--line)"><div style="display:flex;gap:10px;align-items:baseline;flex-wrap:wrap"><strong>' + esc(v.v) + '</strong>' + (i === 0 ? '<span class="badge ok">현재</span>' : '') + '<span class="caption">' + esc(full(v.at)) + ' · ' + esc(v.title) + '</span></div>' +
        '<ul style="margin:8px 0 10px 18px;padding:0">' + (v.changes || []).map(c => '<li style="margin:2px 0">' + esc(c) + '</li>').join('') + '</ul>' +
        '<div class="table-scroll"><table><thead><tr><th scope="col">주체별 총자산(원)</th>' + Object.keys(NAMES).map(k => '<th scope="col" class="num">' + NAMES[k] + '</th>').join('') + '<th scope="col" class="num">합계</th></tr></thead><tbody><tr><th scope="row">이 버전</th>' + Object.keys(NAMES).map(k => '<td class="num">' + won(t[k]) + '</td>').join('') + '<td class="num"><strong>' + won(sum(t)) + '</strong></td></tr>' +
        (prev ? '<tr><th scope="row">이전 버전 대비</th>' + Object.keys(NAMES).map(k => { const d = (t[k] || 0) - (prev[k] || 0); return '<td class="num ' + (d > 0 ? 'up' : d < 0 ? 'down' : '') + '">' + signed(d) + '</td>'; }).join('') + '<td class="num"><strong>' + signed(sum(t) - sum(prev)) + '</strong></td></tr>' : '') +
        '</tbody></table></div></div>';
    }).join('') + '<p class="caption">버전 합계는 입력 시점의 계좌 평가금액입니다. 앱을 열면 시세가 갱신되어 화면의 총자산은 달라질 수 있습니다.</p>';
}
root.WVER = { start, clear: hide };
})(typeof window !== 'undefined' ? window : globalThis);
