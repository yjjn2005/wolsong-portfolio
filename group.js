/* 4개 주체 총합 대시보드 — 월송그룹 통합 탭 상단에 주체별 총자산·손익·증권사 분포를 보여줍니다. */
(function (root) {
'use strict';
const ORDER = ['tc', 'co', 'mp', 'hk'];
const NAMES = { tc: '월송티앤씨', co: '월송앤컴퍼니', mp: '문앤파인트리', hk: '한규자님' };
const BROKERS = ['삼성', '신한', '한국투자'];
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const won = n => Number.isFinite(n) ? Math.round(n).toLocaleString('ko-KR') : '—';
const signed = n => (n > 0 ? '+' : n < 0 ? '−' : '') + won(Math.abs(n));
const pct = n => Number.isFinite(n) ? (n > 0 ? '+' : n < 0 ? '−' : '') + Math.abs(n).toFixed(2) + '%' : '—';
const cls = n => n > 0 ? 'up' : n < 0 ? 'down' : '';
const rank = b => { const i = BROKERS.findIndex(k => String(b || '').includes(k)); return i < 0 ? 99 : i; };
const eok = n => (n / 1e8).toLocaleString('ko-KR', { maximumFractionDigits: 2 }) + '억';

function compute(rows) {
  const g = {}; ORDER.forEach(k => g[k] = { k, ev: 0, cash: 0, invEv: 0, inv: 0, fee: 0, accts: new Set(), names: new Set(), brokers: {} });
  rows.forEach(h => {
    const x = g[h._p]; if (!x) return;
    x.ev += h.ev; x.accts.add(h.accountKey);
    if (h.cash) x.cash += h.ev; else { x.invEv += h.ev; x.inv += h.buy; x.fee += h.fee || 0; x.names.add(h.instrumentKey || h.n); }
    x.brokers[h.b] = (x.brokers[h.b] || 0) + h.ev;
  });
  return g;
}

function render(d) {
  const el = document.getElementById('dash-group'); if (!el) return;
  const rows = d.all || [];
  if (d.person !== 'all' || d.demo || !rows.length || !rows.some(h => h._p)) { el.hidden = true; el.innerHTML = ''; return; }
  const g = compute(rows), list = ORDER.map(k => g[k]), total = list.reduce((n, x) => n + x.ev, 0);
  const T = { ev: total, cash: 0, invEv: 0, inv: 0, fee: 0 }; list.forEach(x => { T.cash += x.cash; T.invEv += x.invEv; T.inv += x.inv; T.fee += x.fee; });
  const pl = x => x.invEv - x.inv - x.fee, rt = x => x.inv > 0 ? pl(x) / x.inv * 100 : null;
  const cols = ['var(--c1)', 'var(--c2)', 'var(--c3)', 'var(--muted)'];
  const brokers = [...new Set(rows.map(h => h.b))].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b, 'ko'));
  el.hidden = false;
  el.innerHTML =
    '<div class="card-heading"><h3>4개 주체 총합</h3><span class="caption">월송티앤씨 · 월송앤컴퍼니 · 문앤파인트리 · 한규자님 · 금액 단위 원</span></div>' +
    '<div class="mini-tiles"><div class="tile featured"><div class="tile-label">4개 주체 총자산</div><div class="tile-value">' + won(total) + '<span class="unit">원</span></div><div class="tile-note">' + eok(total) + ' · 현금 ' + (total > 0 ? (T.cash / total * 100).toFixed(1) : '0.0') + '%</div></div>' +
    '<div class="tile"><div class="tile-label">투자자산 평가</div><div class="tile-value">' + won(T.invEv) + '<span class="unit">원</span></div><div class="tile-note">매입 ' + won(T.inv) + '원</div></div>' +
    '<div class="tile"><div class="tile-label">평가손익</div><div class="tile-value ' + cls(T.invEv - T.inv - T.fee) + '">' + signed(T.invEv - T.inv - T.fee) + '<span class="unit">원</span></div><div class="tile-note">' + pct(T.inv > 0 ? (T.invEv - T.inv - T.fee) / T.inv * 100 : NaN) + '</div></div>' +
    '<div class="tile"><div class="tile-label">현금성 자산</div><div class="tile-value">' + won(T.cash) + '<span class="unit">원</span></div><div class="tile-note">예수금·RP 포함</div></div></div>' +
    '<div class="stackbar" role="img" aria-label="주체별 총자산 비중" style="display:flex;height:14px;border-radius:7px;overflow:hidden;background:var(--line);margin:4px 0 14px">' +
      list.map((x, i) => x.ev > 0 ? '<span title="' + esc(NAMES[x.k]) + '" style="width:' + (x.ev / total * 100) + '%;background:' + cols[i] + '"></span>' : '').join('') + '</div>' +
    '<div class="table-scroll"><table><thead><tr><th scope="col">주체</th><th scope="col" class="num">총자산</th><th scope="col" class="num">비중</th><th scope="col" class="num">투자자산</th><th scope="col" class="num">현금성</th><th scope="col" class="num">평가손익</th><th scope="col" class="num">수익률</th><th scope="col" class="num">계좌·종목</th></tr></thead><tbody>' +
    list.map((x, i) => '<tr' + (x.ev ? '' : ' style="color:var(--muted)"') + '><th scope="row"><span style="display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:8px;background:' + cols[i] + '"></span>' + esc(NAMES[x.k]) + '</th>' +
      (x.ev ? '<td class="num"><strong>' + won(x.ev) + '</strong></td><td class="num">' + (x.ev / total * 100).toFixed(1) + '%</td><td class="num">' + won(x.invEv) + '</td><td class="num">' + won(x.cash) + '</td><td class="num ' + cls(pl(x)) + '">' + (x.inv > 0 ? signed(pl(x)) : '—') + '</td><td class="num ' + cls(pl(x)) + '">' + pct(rt(x)) + '</td><td class="num">' + x.accts.size + ' · ' + x.names.size + '</td>' : '<td class="num" colspan="7">입력된 데이터 없음</td>') + '</tr>').join('') +
    '</tbody><tfoot><tr><th scope="row">합계</th><td class="num"><strong>' + won(T.ev) + '</strong></td><td class="num">100%</td><td class="num">' + won(T.invEv) + '</td><td class="num">' + won(T.cash) + '</td><td class="num ' + cls(T.invEv - T.inv - T.fee) + '">' + (T.inv > 0 ? signed(T.invEv - T.inv - T.fee) : '—') + '</td><td class="num ' + cls(T.invEv - T.inv - T.fee) + '">' + pct(T.inv > 0 ? (T.invEv - T.inv - T.fee) / T.inv * 100 : NaN) + '</td><td class="num">' + list.reduce((n, x) => n + x.accts.size, 0) + ' · —</td></tr></tfoot></table></div>' +
    '<h3 style="margin:22px 0 8px;font-size:1rem">증권사 × 주체</h3><div class="table-scroll"><table><thead><tr><th scope="col">증권사</th>' + list.map(x => '<th scope="col" class="num">' + esc(NAMES[x.k]) + '</th>').join('') + '<th scope="col" class="num">합계</th></tr></thead><tbody>' +
    brokers.map(b => { const sum = list.reduce((n, x) => n + (x.brokers[b] || 0), 0); return '<tr><th scope="row">' + esc(b) + '</th>' + list.map(x => '<td class="num">' + (x.brokers[b] ? won(x.brokers[b]) : '—') + '</td>').join('') + '<td class="num"><strong>' + won(sum) + '</strong></td></tr>'; }).join('') +
    '</tbody></table></div><p class="caption">평가손익은 투자자산(종목) 기준이며 현금성 자산은 제외합니다. 국내 시세 갱신 후에는 평가금액이 바뀔 수 있습니다.</p>';
}
root.WGRP = { render, _compute: compute };
})(typeof window !== 'undefined' ? window : globalThis);
