/* 현금성 상세 탭 — RP·CMA·원화 예수금·외화(달러) 예수금을 계좌별로 구분해 보여줍니다.
 * 데이터: 현재 로드된 보유 데이터의 현금성 행(cash:true). 합계는 대시보드의 현금성 자산과 같은 행을 합산합니다. */
(function (root) {
'use strict';
const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const won = n => Number.isFinite(n) ? Math.round(n).toLocaleString('ko-KR') : '—';
const usd = n => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const eok = n => (n / 1e8).toLocaleString('ko-KR', { maximumFractionDigits: 2 }) + '억';

/* 종목명에서 외화 원금액을 읽습니다. 예: "USD 외화예수금 290,160달러 (KORU 매도대금)" → 290160 */
const usdOf = n => { const m = /([\d,]+(?:\.\d+)?)\s*달러/.exec(n || ''); return m ? Number(m[1].replace(/,/g, '')) : null; };
/* 한국투자증권 외화예수금(KORU 매도대금)은 실제 잔고가 사용자 확인 중인 미확인 값입니다. */
const unverified = h => /KORU 매도대금/.test(h.n || '');

function catOf(h) {
  if (/CMA/.test(h.n)) return 'CMA';
  if (/RP|증금예금|발행어음/.test(h.n)) return 'RP·증금예금·발행어음';
  if (h.currency && h.currency !== 'KRW') return '달러 예수금';
  return '원화 예수금';
}
const ORDER = ['CMA', 'RP·증금예금·발행어음', '원화 예수금', '달러 예수금'];

function noteOf(h, cat) {
  if (cat === 'RP·증금예금·발행어음') return '증권사가 합계만 제공 · RP/증금예금/발행어음 구분 불가';
  if (cat === 'CMA') return 'CMA 계좌 별도 잔고 · 위탁 예수금과 중복 아님';
  return '';
}

function render(d) {
  const el = $('cash-body'); if (!el) return;
  const rows = (d.rows || []).filter(h => h.cash);
  if (!rows.length) { el.innerHTML = '<article class="card"><p class="caption">선택한 범위에 현금성 자산이 없습니다.</p></article>'; return; }
  const rate = d.rates && d.rates.USD;
  const total = rows.reduce((s, h) => s + h.ev, 0);
  const uvSum = rows.filter(unverified).reduce((s, h) => s + h.ev, 0);
  const sums = {}; ORDER.forEach(c => sums[c] = 0);
  rows.forEach(h => { sums[catOf(h)] += h.ev; });
  const usdRows = rows.filter(h => catOf(h) === '달러 예수금');
  const usdAmt = usdRows.reduce((s, h) => s + (usdOf(h.n) || 0), 0);

  const tiles = '<div class="mini-tiles">'
    + '<div class="tile featured"><div class="tile-label">현금성 자산 합계</div><div class="tile-value">' + eok(total) + '</div><div class="tile-note">' + won(total) + '원 · 계좌 ' + new Set(rows.map(h => h.accountKey || h.a)).size + '개 · 대시보드 현금성 자산과 동일' + (uvSum ? '<br><span class="badge">미확인 잔고 ' + won(uvSum) + '원 포함</span>' : '') + '</div></div>'
    + '<div class="tile"><div class="tile-label">CMA</div><div class="tile-value">' + eok(sums['CMA']) + '</div><div class="tile-note">' + won(sums['CMA']) + '원 · MMW 등 CMA 계좌 잔고</div></div>'
    + '<div class="tile"><div class="tile-label">RP·증금예금·발행어음</div><div class="tile-value">' + eok(sums['RP·증금예금·발행어음']) + '</div><div class="tile-note">' + won(sums['RP·증금예금·발행어음']) + '원 · 증권사 합계 표기분</div></div>'
    + '<div class="tile"><div class="tile-label">원화 예수금</div><div class="tile-value">' + eok(sums['원화 예수금']) + '</div><div class="tile-note">' + won(sums['원화 예수금']) + '원 · 위탁계좌 원화 잔고</div></div>'
    + '<div class="tile"><div class="tile-label">달러 예수금</div><div class="tile-value">' + eok(sums['달러 예수금']) + '</div><div class="tile-note">' + won(sums['달러 예수금']) + '원 · 원금 $' + usd(usdAmt) + '</div></div>'
    + '</div>';

  const accs = new Map();
  rows.forEach(h => {
    const k = (h.on || '') + '|' + h.b + '|' + h.t + '|' + h.a;
    if (!accs.has(k)) accs.set(k, { on: h.on, b: h.b, t: h.t, a: h.a, rows: [], sum: 0 });
    const g = accs.get(k); g.rows.push(h); g.sum += h.ev;
  });
  const list = [...accs.values()].sort((x, y) => y.sum - x.sum);

  const cards = list.map(g => {
    const body = g.rows.map(h => {
      const cat = catOf(h), ua = usdOf(h.n);
      const fx = ua !== null && rate ? '<div class="subline">참고 · 현재 환율 환산 약 ' + won(ua * rate) + '원 (합계 미반영)</div>' : '';
      const badge = unverified(h) ? ' <span class="badge">잔액 미확인 · 기존 앱 값 유지</span>' : '';
      return '<tr><td>' + esc(cat) + '</td><td>' + esc(h.n) + badge + (noteOf(h, cat) ? '<div class="subline">' + noteOf(h, cat) + '</div>' : '') + '</td>'
        + '<td class="num">' + (ua !== null ? '$' + usd(ua) : '—') + '</td>'
        + '<td class="num">' + won(h.ev) + '원' + fx + '</td></tr>';
    }).join('');
    return '<article class="card"><div class="card-heading"><h3>' + esc(g.b + ' · ' + g.t) + '</h3><span class="caption">' + esc(g.on ? g.on + ' · ' : '') + esc(g.a) + ' · 소계 ' + won(g.sum) + '원</span></div>'
      + '<div class="table-scroll"><table><thead><tr><th>구분</th><th>항목</th><th class="num">외화 원금액</th><th class="num">원화 환산액 (기준자료 고정)</th></tr></thead><tbody>' + body + '</tbody></table></div></article>';
  }).join('');

  const fxNote = rate ? ' 참고로 보이는 현재 환율(USD/KRW ' + rate.toLocaleString('ko-KR', { maximumFractionDigits: 2 }) + '원) 환산액은 참고용이며, 합계·소계에는 스캔 시점의 고정 환산액을 사용합니다.' : '';
  const uvList = rows.filter(unverified).map(h => esc(h.a) + ' ' + won(h.ev) + '원').join(', ');
  const uvNote = uvSum ? ' 한국투자증권 외화예수금(' + uvList + ')은 이번 스캔에 없는 기존 앱 값으로, 실제 잔고 확인 중입니다. 확인 전까지 기존 값을 그대로 유지하며 위 합계에 포함되어 있습니다.' : '';
  el.innerHTML = tiles
    + '<article class="card"><p class="caption">원화 환산액은 기준자료 고정값(이번 스캔 입력분, 잔액 미확인 표시분은 기존 앱 값)으로, 합계는 대시보드의 현금성 자산과 정확히 일치합니다. CMA 계좌(계좌번호 끝자리 -05)는 위탁계좌 예수금과 별도 잔고로 중복 합산 없이 각 계좌 잔고만 더했습니다.' + esc(fxNote) + esc(uvNote) + '</p></article>'
    + cards;
}

function clear() { const el = $('cash-body'); if (el) el.innerHTML = ''; }

root.WCSH = { render, clear };
})(window);
