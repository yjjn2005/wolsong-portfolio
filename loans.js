/* 차입금 탭 — 주체별 차입금·대여금, 연 이자(참고), 회수·상환 후 총잔고 추계, 대여금 거래 내역
 * 데이터: 서버 KV 'loans'(대여금 총괄표 기준). 총자산은 앱의 계좌 평가금액을 그대로 사용합니다. */
(function (root) {
'use strict';
const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const won = n => Number.isFinite(n) ? Math.round(n).toLocaleString('ko-KR') : '—';
const signed = n => (n > 0 ? '+' : n < 0 ? '−' : '') + won(Math.abs(n));
const pct = n => Number.isFinite(n) ? (n > 0 ? '+' : n < 0 ? '−' : '') + Math.abs(n).toFixed(1) + '%' : '—';
const cls = n => n > 0 ? 'up' : n < 0 ? 'down' : '';
const eok = n => (n / 1e8).toLocaleString('ko-KR', { maximumFractionDigits: 2 }) + '억';
const NAMES = { tc: '월송티앤씨', co: '월송앤컴퍼니', mp: '문앤파인트리', hk: '한규자' };
const ORDER = ['tc', 'co', 'mp', 'hk'];
const IN = new Set(Object.values(NAMES));
const EXT = ['유태로', '유승진', '유진희'];
const rateText = r => r > 0 ? '연 ' + (r * 100).toFixed(1) + '%' : '무이자';

let ctx = null, store = { state: 'idle', data: null }, ui = { rel: '', all: false }, sig = '', last = null;

function start(c) {
  ctx = c; sig = ''; store = { state: c.demo ? 'demo' : 'loading', data: null };
  if (c.demo) { paint(); return; }
  c.api('/kv/loans?p=all').then(d => { store = { state: d && Array.isArray(d.ledger) ? 'ready' : 'empty', data: d }; sig = ''; paint(); })
    .catch(() => { store = { state: 'empty', data: null }; sig = ''; paint(); });
}
function clear() { ctx = null; store = { state: 'idle', data: null }; sig = ''; last = null; const b = $('ln-body'); if (b) b.innerHTML = ''; }
function render(d) { last = d; paint(); }

/* ---------- 계산 ---------- */
function model(data) {
  const rel = new Map();
  (data.rels || []).forEach(r => rel.set(r.l + '|' + r.b, { l: r.l, b: r.b, rate: r.rate, terms: r.terms, status: r.status, loan: 0, ret: 0, n: 0 }));
  const sorted = data.ledger.map((e, i) => ({ ...e, i })).sort((x, y) => x.d < y.d ? -1 : x.d > y.d ? 1 : x.i - y.i);
  const run = new Map(), led = [];
  sorted.forEach(e => {
    const k = e.l + '|' + e.b;
    if (!rel.has(k)) rel.set(k, { l: e.l, b: e.b, rate: 0, terms: e.t, status: '진행중', loan: 0, ret: 0, n: 0 });
    const r = rel.get(k); r.n++;
    if (e.k === '대여') r.loan += e.a; else r.ret += e.a;
    const bal = (run.get(k) || 0) + (e.k === '대여' ? e.a : -e.a); run.set(k, bal);
    led.push({ ...e, bal });
  });
  const list = [...rel.values()].map(r => ({ ...r, bal: r.loan - r.ret, int: Math.round((r.loan - r.ret) * r.rate) }));
  return { list, led };
}
const sumBy = (arr, f) => arr.reduce((n, x) => n + f(x), 0);
function assets(all, person) {
  const a = {}; ORDER.forEach(k => a[k] = 0);
  (all || []).forEach(h => { const k = person === 'all' ? h._p : person; if (a[k] != null) a[k] += h.ev; });
  return a;
}

/* ---------- 화면 ---------- */
function paint() {
  const body = $('ln-body'); if (!body || !last) return;
  const d = last;
  if (store.state !== 'ready') {
    const msg = store.state === 'demo' ? '예시 화면에는 차입금 데이터가 없습니다.' : store.state === 'loading' ? '차입금 데이터를 불러오는 중입니다…' : '차입금 데이터가 아직 없습니다. 대여금 총괄표를 보내 주시면 반영합니다.';
    const s = 'msg:' + store.state; if (s !== sig) { sig = s; body.innerHTML = '<article class="card"><p class="empty">' + esc(msg) + '</p></article>'; } return;
  }
  const A = assets(d.all, d.person);
  const s2 = JSON.stringify([d.person, ORDER.map(k => Math.round(A[k] / 1e6)), ui.rel, ui.all, store.data.asof]);
  if (s2 === sig) return; sig = s2;
  const m = model(store.data);
  body.innerHTML = d.person === 'all' ? viewAll(m, A) : viewEntity(m, A, d.person);
  const sel = $('ln-rel'); if (sel) sel.addEventListener('change', () => { ui.rel = sel.value; ui.all = false; sig = ''; paint(); });
  const more = $('ln-more'); if (more) more.addEventListener('click', () => { ui.all = true; sig = ''; paint(); });
}

const relTable = (rows, who, title, note) => {
  if (!rows.length) return '<article class="card"><div class="card-heading"><h3>' + esc(title) + '</h3></div><p class="empty">' + esc(note) + '</p></article>';
  const t = { loan: sumBy(rows, r => r.loan), ret: sumBy(rows, r => r.ret), bal: sumBy(rows, r => r.bal), int: sumBy(rows, r => r.int) };
  return '<article class="card"><div class="card-heading"><h3>' + esc(title) + '</h3><span class="caption">금액 단위 원</span></div><div class="table-scroll"><table><thead><tr><th scope="col">' + who + '</th><th scope="col" class="num">대여 누계</th><th scope="col" class="num">반환 누계</th><th scope="col" class="num">잔액</th><th scope="col">이율</th><th scope="col" class="num">연 이자(참고)</th><th scope="col">대여 조건</th><th scope="col">상태</th></tr></thead><tbody>' +
    rows.map(r => '<tr' + (r.bal ? '' : ' style="color:var(--muted)"') + '><th scope="row">' + esc(who === '대여자' ? r.l : r.b) + '</th><td class="num">' + won(r.loan) + '</td><td class="num">' + won(r.ret) + '</td><td class="num"><strong>' + won(r.bal) + '</strong></td><td>' + rateText(r.rate) + '</td><td class="num">' + (r.int ? won(r.int) : '—') + '</td><td>' + esc(r.terms) + '</td><td><span class="badge' + (r.status === '상환완료' ? ' ok' : '') + '">' + esc(r.status) + '</span></td></tr>').join('') +
    '</tbody><tfoot><tr><th scope="row">합계</th><td class="num">' + won(t.loan) + '</td><td class="num">' + won(t.ret) + '</td><td class="num"><strong>' + won(t.bal) + '</strong></td><td></td><td class="num">' + won(t.int) + '</td><td colspan="2"></td></tr></tfoot></table></div></article>';
};
const byBal = (a, b) => (b.bal > 0) - (a.bal > 0) || b.bal - a.bal;

function ledger(m, filterFn, label) {
  const rels = m.list.filter(filterFn).sort(byBal);
  if (!rels.length) return '';
  const keys = rels.map(r => r.l + '|' + r.b);
  if (ui.rel && ui.rel !== 'all' && !keys.includes(ui.rel)) ui.rel = '';
  const cur = ui.rel || 'all';
  const rows = m.led.filter(e => cur === 'all' ? keys.includes(e.l + '|' + e.b) : (e.l + '|' + e.b) === cur).slice().reverse();
  const shown = ui.all ? rows : rows.slice(0, 30);
  return '<article class="card"><div class="card-heading"><h3>' + esc(label) + '</h3><label class="caption" style="display:flex;gap:8px;align-items:center">관계<select id="ln-rel"><option value="all"' + (cur === 'all' ? ' selected' : '') + '>전체 (' + rows.length + '건)</option>' +
    rels.map(r => '<option value="' + esc(r.l + '|' + r.b) + '"' + (cur === r.l + '|' + r.b ? ' selected' : '') + '>' + esc(r.l + ' → ' + r.b) + '</option>').join('') + '</select></label></div>' +
    '<div class="table-scroll"><table><thead><tr><th scope="col">일자</th><th scope="col">관계</th><th scope="col">구분</th><th scope="col" class="num">금액</th><th scope="col" class="num">관계별 잔액</th><th scope="col">비고</th></tr></thead><tbody>' +
    shown.map(e => '<tr><td>' + esc(e.d) + '</td><td>' + esc(e.l + ' → ' + e.b) + '</td><td>' + (e.k === '대여' ? '<span class="badge">대여</span>' : '<span class="badge ok">반환</span>') + '</td><td class="num">' + won(e.a) + '</td><td class="num">' + won(e.bal) + '</td><td>' + esc(e.n) + '</td></tr>').join('') + '</tbody></table></div>' +
    (!ui.all && rows.length > 30 ? '<div class="field-row" style="margin-top:10px"><button id="ln-more" class="button subtle" type="button">전체 ' + rows.length + '건 보기</button></div>' : '') + '</article>';
}

const NOTE = '<p class="caption">연 이자는 현재 잔액 × 이율의 단순 참고치이며, 경과 기간과 이자 지급 이력은 반영하지 않았습니다. 기준일 ';

function viewEntity(m, A, p) {
  const N = NAMES[p], asset = A[p] || 0;
  const bor = m.list.filter(r => r.b === N).sort(byBal), len = m.list.filter(r => r.l === N).sort(byBal);
  const B = sumBy(bor, r => r.bal), L = sumBy(len, r => r.bal);
  const Bin = sumBy(bor.filter(r => IN.has(r.l)), r => r.bal), Bout = B - Bin;
  const Ie = sumBy(bor, r => r.int), Ii = sumBy(len, r => r.int);
  const after = asset + L - B;
  return '<div class="tiles">' +
    '<div class="tile featured"><div class="tile-label">차입금 잔액</div><div class="tile-value">' + won(B) + '<span class="unit">원</span></div><div class="tile-note">' + (B ? eok(B) + ' · 내부 ' + won(Bin) + ' · 외부 ' + won(Bout) : '차입금 없음') + '</div></div>' +
    '<div class="tile"><div class="tile-label">대여금 잔액</div><div class="tile-value">' + won(L) + '<span class="unit">원</span></div><div class="tile-note">' + (L ? eok(L) + ' 회수 예정' : '대여금 없음') + '</div></div>' +
    '<div class="tile"><div class="tile-label">총자산 (계좌 평가)</div><div class="tile-value">' + won(asset) + '<span class="unit">원</span></div><div class="tile-note">자산 탭과 같은 기준</div></div>' +
    '<div class="tile"><div class="tile-label">회수·상환 후 총잔고</div><div class="tile-value ' + cls(after - asset) + '">' + won(after) + '<span class="unit">원</span></div><div class="tile-note">총자산 + 대여금 − 차입금 · ' + (asset > 0 ? pct((after - asset) / asset * 100) : '—') + '</div></div>' +
    '<div class="tile"><div class="tile-label">연 이자 (참고)</div><div class="tile-value ' + cls(Ii - Ie) + '">' + signed(Ii - Ie) + '<span class="unit">원</span></div><div class="tile-note">수익 ' + won(Ii) + ' − 비용 ' + won(Ie) + '</div></div></div>' +
    relTable(bor, '대여자', N + ' 차입금', '이 주체의 차입금이 없습니다.') +
    relTable(len, '차입자', N + ' 대여금', '이 주체의 대여금이 없습니다.') +
    ledger(m, r => r.l === N || r.b === N, '대여금 거래 내역') +
    NOTE + esc(store.data.asof) + '. 이자 이력까지 반영한 정산은 별도 확인이 필요합니다.</p>';
}

function viewAll(m, A) {
  const inB = r => IN.has(r.b), inL = r => IN.has(r.l);
  const bor = m.list.filter(inB), internal = bor.filter(inL), external = bor.filter(r => !inL(r));
  const B = sumBy(bor, r => r.bal), Bi = sumBy(internal, r => r.bal), Bo = B - Bi;
  const Io = sumBy(external, r => r.int), Ii = sumBy(internal, r => r.int);
  const totAsset = sumBy(ORDER, k => A[k]);
  const party = n => { const k = ORDER.find(x => NAMES[x] === n); return { name: n, asset: k ? A[k] : null, L: sumBy(m.list.filter(r => r.l === n), r => r.bal), B: sumBy(m.list.filter(r => r.b === n), r => r.bal) }; };
  const names = [...ORDER.map(k => NAMES[k]), ...EXT], P = names.map(party);
  const four = P.slice(0, 4), fL = sumBy(four, x => x.L), fB = sumBy(four, x => x.B);
  const lenders = ['유태로', '유승진', '한규자', '유진희', '월송티앤씨', '월송앤컴퍼니'], borrowers = ['월송티앤씨', '월송앤컴퍼니', '문앤파인트리', '유승진'];
  const cell = (l, b) => { const r = m.list.find(x => x.l === l && x.b === b); return r && r.bal ? won(r.bal) : '—'; };
  const allBal = sumBy(m.list, r => r.bal), allInt = sumBy(m.list, r => r.int);
  const aft = x => x.asset == null ? null : x.asset + x.L - x.B;
  return '<div class="tiles">' +
    '<div class="tile featured"><div class="tile-label">4개 주체 차입금 합계</div><div class="tile-value">' + won(B) + '<span class="unit">원</span></div><div class="tile-note">' + eok(B) + ' · 주체 간 거래 포함</div></div>' +
    '<div class="tile"><div class="tile-label">주체 간 내부 대차</div><div class="tile-value">' + won(Bi) + '<span class="unit">원</span></div><div class="tile-note">합산 시 상계되는 금액</div></div>' +
    '<div class="tile"><div class="tile-label">외부 차입금</div><div class="tile-value">' + won(Bo) + '<span class="unit">원</span></div><div class="tile-note">' + esc([...new Set(external.filter(r => r.bal).map(r => r.l))].join('·')) + ' · ' + eok(Bo) + '</div></div>' +
    '<div class="tile"><div class="tile-label">외부 차입 연 이자 (참고)</div><div class="tile-value">' + won(Io) + '<span class="unit">원</span></div><div class="tile-note">내부 대차 이자 ' + won(Ii) + '원은 상계</div></div>' +
    '<div class="tile"><div class="tile-label">회수·상환 후 4개 주체 총잔고</div><div class="tile-value ' + cls(fL - fB) + '">' + won(totAsset + fL - fB) + '<span class="unit">원</span></div><div class="tile-note">총자산 ' + won(totAsset) + ' ' + (fL - fB >= 0 ? '+' : '−') + ' 순' + (fL - fB >= 0 ? '대여' : '차입') + ' ' + won(Math.abs(fL - fB)) + '</div></div></div>' +
    '<article class="card"><div class="card-heading"><h3>주체별 회수·상환 후 총잔고 추계</h3><span class="caption">금액 단위 원 · 추계 = 총자산 + 대여잔액 − 차입잔액 · 이자 미반영</span></div><div class="table-scroll"><table><thead><tr><th scope="col">주체</th><th scope="col" class="num">① 총자산</th><th scope="col" class="num">② 대여잔액</th><th scope="col" class="num">③ 차입잔액</th><th scope="col" class="num">순대여 (②−③)</th><th scope="col" class="num">회수 후 총잔고</th><th scope="col" class="num">증감률</th></tr></thead><tbody>' +
    P.map(x => '<tr' + (x.L || x.B || x.asset ? '' : ' style="color:var(--muted)"') + '><th scope="row">' + esc(x.name) + (x.asset == null ? ' <span class="caption">계좌 미입력</span>' : '') + '</th><td class="num">' + (x.asset == null ? '—' : won(x.asset)) + '</td><td class="num">' + won(x.L) + '</td><td class="num">' + won(x.B) + '</td><td class="num ' + cls(x.L - x.B) + '">' + signed(x.L - x.B) + '</td><td class="num">' + (aft(x) == null ? '—' : '<strong>' + won(aft(x)) + '</strong>') + '</td><td class="num ' + cls(x.L - x.B) + '">' + (x.asset > 0 ? pct((x.L - x.B) / x.asset * 100) : '—') + '</td></tr>').join('') +
    '</tbody><tfoot><tr><th scope="row">4개 주체 소계</th><td class="num">' + won(totAsset) + '</td><td class="num">' + won(fL) + '</td><td class="num">' + won(fB) + '</td><td class="num ' + cls(fL - fB) + '">' + signed(fL - fB) + '</td><td class="num"><strong>' + won(totAsset + fL - fB) + '</strong></td><td class="num ' + cls(fL - fB) + '">' + (totAsset > 0 ? pct((fL - fB) / totAsset * 100) : '—') + '</td></tr>' +
    '<tr><th scope="row">전체 (대여 = 차입)</th><td></td><td class="num">' + won(sumBy(P, x => x.L)) + '</td><td class="num">' + won(sumBy(P, x => x.B)) + '</td><td class="num">' + signed(sumBy(P, x => x.L - x.B)) + '</td><td colspan="2"></td></tr></tfoot></table></div>' +
    '<p class="caption">유태로·유승진·유진희는 개인 자산을 입력하지 않아 대여·차입 잔액만 표시합니다. 총자산은 이 앱의 계좌 평가금액이며 시세 갱신에 따라 바뀝니다.</p></article>' +
    '<article class="card"><div class="card-heading"><h3>대여잔액 매트릭스</h3><span class="caption">대여자 ＼ 차입자 · 금액 단위 원</span></div><div class="table-scroll"><table><thead><tr><th scope="col">대여자 ＼ 차입자</th>' + borrowers.map(b => '<th scope="col" class="num">' + esc(b) + '</th>').join('') + '<th scope="col" class="num">대여 잔액 합계</th></tr></thead><tbody>' +
    lenders.map(l => '<tr><th scope="row">' + esc(l) + '</th>' + borrowers.map(b => '<td class="num">' + cell(l, b) + '</td>').join('') + '<td class="num"><strong>' + won(sumBy(m.list.filter(r => r.l === l), r => r.bal)) + '</strong></td></tr>').join('') +
    '</tbody><tfoot><tr><th scope="row">차입자별 합계</th>' + borrowers.map(b => '<td class="num">' + won(sumBy(m.list.filter(r => r.b === b), r => r.bal)) + '</td>').join('') + '<td class="num"><strong>' + won(allBal) + '</strong></td></tr></tfoot></table></div></article>' +
    relTableAll(m.list.slice().sort(byBal), allBal, allInt) +
    ledger(m, () => true, '대여금 거래 내역 (전 관계)') +
    NOTE + esc(store.data.asof) + '.</p>';
}

function relTableAll(rows, bal, int) {
  return '<article class="card"><div class="card-heading"><h3>대여관계별 총현황</h3><span class="caption">금액 단위 원</span></div><div class="table-scroll"><table><thead><tr><th scope="col">대여자 → 차입자</th><th scope="col" class="num">대여 누계</th><th scope="col" class="num">반환 누계</th><th scope="col" class="num">잔액</th><th scope="col">이율</th><th scope="col" class="num">연 이자(참고)</th><th scope="col">대여 조건</th><th scope="col">상태</th></tr></thead><tbody>' +
    rows.map(r => '<tr' + (r.bal ? '' : ' style="color:var(--muted)"') + '><th scope="row">' + esc(r.l + ' → ' + r.b) + '</th><td class="num">' + won(r.loan) + '</td><td class="num">' + won(r.ret) + '</td><td class="num"><strong>' + won(r.bal) + '</strong></td><td>' + rateText(r.rate) + '</td><td class="num">' + (r.int ? won(r.int) : '—') + '</td><td>' + esc(r.terms) + '</td><td><span class="badge' + (r.status === '상환완료' ? ' ok' : '') + '">' + esc(r.status) + '</span></td></tr>').join('') +
    '</tbody><tfoot><tr><th scope="row">총합계</th><td class="num">' + won(sumBy(rows, r => r.loan)) + '</td><td class="num">' + won(sumBy(rows, r => r.ret)) + '</td><td class="num"><strong>' + won(bal) + '</strong></td><td></td><td class="num">' + won(int) + '</td><td colspan="2"></td></tr></tfoot></table></div></article>';
}

root.WLN = { start, render, clear, _model: model };
})(typeof window !== 'undefined' ? window : globalThis);
