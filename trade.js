/* 매매 입력: 수동 입력 · 캡쳐 첨부 · 붙여넣기 일괄입력 · 매매 기록 · 마지막 매매 되돌리기
 * 보유 데이터(rows)를 직접 갱신하고, 기록은 서버 KV(trades, trade-undo, trade-img-<id>)에 저장합니다. */
(function (root) {
'use strict';
const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const won = n => Number.isFinite(n) ? Math.round(n).toLocaleString('ko-KR') : '—';
const signed = n => (n > 0 ? '+' : n < 0 ? '−' : '') + won(Math.abs(n));
const num = v => { const x = Number(String(v == null ? '' : v).replace(/,/g, '').trim()); return Number.isFinite(x) ? x : NaN; };
const today = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
const clone = o => JSON.parse(JSON.stringify(o));
const akey = r => JSON.stringify([r.o, r.on, r.b, r.t, r.a]);
const BROKERS = ['삼성증권', '신한투자증권', '한국투자증권'];
const TYPES = ['위탁', 'CMA', '개인연금', 'IRP', '퇴직연금', 'ISA'];
const CURS = ['USD', 'JPY', 'HKD', 'EUR', 'CNY'];
const rank = n => { const i = ['삼성', '신한', '한국투자', '한투'].findIndex(k => String(n || '').includes(k)); return i < 0 ? 99 : (i === 3 ? 2 : i); };

/* ---------- 순수 계산 ---------- */
function symbolOf(code, market) {
  code = String(code || '').trim();
  if (!code) return '';
  if (market === '국내') return /^\d{6}$/.test(code) ? 'KR:' + code : '';
  return code.toUpperCase();
}

/* t: {acct:{o,on,b,t,a}, side, n, code, market, currency, qty, price, fx, fee, cash} */
function applyTrade(raw, t) {
  const r2 = clone(raw || { rows: [] });
  r2.rows = r2.rows || []; r2.syms = r2.syms || {};
  const cur = t.market === '국내' ? 'KRW' : (t.currency || 'USD'), fx = cur === 'KRW' ? 1 : t.fx;
  if (!t.n || !String(t.n).trim()) return { error: '종목명을 입력하세요.' };
  if (!(t.qty > 0)) return { error: '수량을 확인하세요.' };
  if (!(t.price > 0)) return { error: '단가를 확인하세요.' };
  if (!(fx > 0)) return { error: '환율을 확인하세요.' };
  const fee = t.fee > 0 ? t.fee : 0, gross = Math.round(t.qty * t.price * fx), key = akey(t.acct);
  const idx = r2.rows.findIndex(r => !r.cash && akey(r) === key && r.n === t.n);
  let realized = null, cashNote = '', cashNeg = false, removed = false;

  if (t.side === '매수') {
    if (idx >= 0) {
      const r = r2.rows[idx], q0 = num(r.q);
      if (!(q0 >= 0)) return { error: '기존 보유 수량이 확인되지 않아 매수를 반영할 수 없습니다.' };
      const nq = q0 + t.qty, bp0 = num(r.bp);
      r.bp = (bp0 > 0 && q0 > 0) ? (bp0 * q0 + t.price * t.qty) / nq : t.price;
      r.q = nq; r.buy = Math.round((num(r.buy) || 0) + gross); r.ev = Math.round((num(r.ev) || 0) + gross);
      r.fee = Math.round((num(r.fee) || 0) + fee); r.p = t.price;
    } else {
      const row = { o: t.acct.o, on: t.acct.on, b: t.acct.b, t: t.acct.t, a: t.acct.a, n: String(t.n).trim(), m: t.market, q: t.qty, bp: t.price, p: t.price, buy: gross, ev: gross, fee: Math.round(fee), k: String(t.code || '').trim(), pk: cur };
      if (cur !== 'KRW') row.currency = cur;
      r2.rows.push(row);
      const sym = symbolOf(t.code, t.market);
      if (sym) r2.syms[row.n] = [sym, cur];
    }
  } else {
    if (idx < 0) return { error: '이 계좌에 보유 중인 종목이 아닙니다. 종목명과 계좌를 확인하세요.' };
    const r = r2.rows[idx], q0 = num(r.q);
    if (!(q0 > 0)) return { error: '기존 보유 수량이 확인되지 않아 매도를 반영할 수 없습니다.' };
    if (t.qty > q0 + 1e-9) return { error: '보유 수량(' + q0.toLocaleString('ko-KR') + ')보다 많이 매도할 수 없습니다.' };
    const ratio = Math.min(1, t.qty / q0), costPart = Math.round((num(r.buy) || 0) * ratio);
    realized = gross - costPart - fee;
    if (t.qty >= q0 - 1e-9) { r2.rows.splice(idx, 1); removed = true; }
    else { r.q = q0 - t.qty; r.buy = Math.round((num(r.buy) || 0) - costPart); r.ev = Math.round((num(r.ev) || 0) * (1 - ratio)); r.p = t.price; }
  }

  if (t.cash) {
    const ci = r2.rows.findIndex(r => r.cash && akey(r) === key && (!r.currency || r.currency === 'KRW'));
    if (ci >= 0) {
      const delta = t.side === '매수' ? -(gross + fee) : (gross - fee), c = r2.rows[ci];
      const nv = Math.round((num(c.ev) || 0) + delta);
      if (nv < 0) cashNeg = true;
      c.ev = nv; c.buy = nv;
    } else cashNote = '이 계좌에 예수금 행이 없어 예수금은 반영하지 않았습니다.';
  }
  return { raw: r2, realized, gross, fee, cashNote, cashNeg, removed };
}

/* 붙여넣기 한 줄 → 거래. 일자,구분,증권사,계좌,종목명,수량,단가,수수료,통화,환율,종목코드 */
function normDate(s) {
  s = String(s || '').trim().replace(/[./]/g, '-');
  if (/^\d{8}$/.test(s)) return s.slice(0, 4) + '-' + s.slice(4, 6) + '-' + s.slice(6);
  const m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  return m ? m[1] + '-' + m[2].padStart(2, '0') + '-' + m[3].padStart(2, '0') : '';
}
function resolveAcct(rows, brokerText, acctText) {
  let bk = String(brokerText || '').trim().replace('한투', '한국투자');
  const accts = new Map();
  rows.forEach(r => { if (!accts.has(akey(r))) accts.set(akey(r), { o: r.o, on: r.on, b: r.b, t: r.t, a: r.a }); });
  let c = [...accts.values()].filter(x => bk && (x.b.includes(bk) || bk.includes(x.b)));
  if (!c.length) return { error: '"' + brokerText + '" 증권사의 계좌가 이 탭에 없습니다.' };
  const at = String(acctText || '').trim();
  if (at) c = c.filter(x => x.a.includes(at) || x.t.includes(at));
  if (!c.length) return { error: '"' + acctText + '"에 맞는 계좌가 없습니다.' };
  if (c.length > 1) return { error: '계좌가 여러 개입니다. 계좌번호 끝자리나 계좌성격(위탁·IRP 등)을 적어 주세요.' };
  return { acct: c[0] };
}
function parseLine(line, rows) {
  const p = line.split(/\t|,/).map(s => s.trim());
  if (p.length < 7) return { error: '열이 부족합니다 (일자,구분,증권사,계좌,종목명,수량,단가 필요).' };
  const d = normDate(p[0]);
  if (!d) return { error: '일자 형식을 확인하세요 (예: 2026-10-06).' };
  const sd = /^(매수|buy|b)$/i.test(p[1]) ? '매수' : /^(매도|sell|s)$/i.test(p[1]) ? '매도' : '';
  if (!sd) return { error: '구분은 매수 또는 매도로 적으세요.' };
  const ra = resolveAcct(rows, p[2], p[3]);
  if (ra.error) return ra;
  const cur = (p[8] || 'KRW').toUpperCase();
  return { d, t: { acct: ra.acct, side: sd, n: p[4], code: p[10] || '', market: cur === 'KRW' ? '국내' : '해외', currency: cur, qty: num(p[5]), price: num(p[6]), fee: num(p[7]) || 0, fx: cur === 'KRW' ? 1 : num(p[9]), cash: true } };
}

/* ---------- 화면 ---------- */
let ctx = null, st = { raw: null, rows: [], rates: {}, person: '', demo: false, sig: '' }, store = { log: [], undo: null, ready: false };
const PEOPLE = { tc: '월송티앤씨', co: '월송앤컴퍼니', mp: '문앤파인트리', hk: '한규자님', all: '월송그룹 통합' };

async function kvGet(n) { if (!ctx || ctx.demo) return null; try { return await ctx.api('/kv/' + n); } catch (e) { return null; } }
async function kvSet(n, v) { if (!ctx || ctx.demo) return true; try { await ctx.api('/kv/' + n, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(v) }); return true; } catch (e) { return false; } }
async function putData(raw) { await ctx.api('/data', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(raw) }); }

function start(c) {
  ctx = c; store = { log: [], undo: null, ready: false }; st.sig = '';
  if (c.demo) { store.ready = true; return; }
  Promise.all([kvGet('trades'), kvGet('trade-undo')]).then(([l, u]) => {
    store.log = Array.isArray(l) ? l : []; store.undo = u && u.raw ? u : null; store.ready = true; st.sig = ''; paint();
  });
}
function clear() { logSig = ''; ctx = null; store = { log: [], undo: null, ready: false }; st = { raw: null, rows: [], rates: {}, person: '', demo: false, sig: '' }; ['tr-form', 'tr-bulk', 'tr-log', 'tr-tiles'].forEach(i => { if ($(i)) $(i).innerHTML = ''; }); }
function render(d) { st.raw = d.raw; st.rows = (d.raw && d.raw.rows) || []; st.rates = d.rates || {}; st.person = d.person; st.demo = d.demo; paint(); }

function accounts() {
  const m = new Map();
  st.rows.forEach(r => { if (!m.has(akey(r))) m.set(akey(r), { o: r.o, on: r.on, b: r.b, t: r.t, a: r.a }); });
  return [...m.values()].sort((x, y) => rank(x.b) - rank(y.b));
}
const acctLabel = x => x.on + ' · ' + x.b + ' · ' + x.t + ' · ' + x.a;
const blocked = () => st.demo ? '예시 화면에서는 매매를 입력할 수 없습니다.' : st.person === 'all' ? '통합 탭은 읽기 전용입니다. 위의 개별 탭(월송티앤씨·월송앤컴퍼니·문앤파인트리·한규자님)에서 입력하세요.' : '';

function paint() {
  if (!$('tr-form')) return;
  const sig = JSON.stringify([st.person, st.demo, store.ready, accounts().map(acctLabel), st.rows.length]);
  if (sig !== st.sig) { st.sig = sig; paintForm(); paintBulk(); }
  paintLog();
}

function paintForm() {
  const msg = blocked();
  if (msg) { $('tr-form').innerHTML = '<h3>매매 입력</h3><p class="empty">' + esc(msg) + '</p>'; return; }
  const ac = accounts();
  const opts = ac.map((x, i) => '<option value="' + i + '">' + esc(acctLabel(x)) + '</option>').join('') + '<option value="new">새 계좌 입력…</option>';
  $('tr-form').innerHTML =
    '<div class="card-heading"><h3>매매 입력 · ' + esc(PEOPLE[st.person] || '') + '</h3><span class="caption">입력하면 보유 수량·매입금액·예수금이 바로 바뀝니다</span></div>' +
    '<div class="field-row"><label>일자<input id="tr-date" type="date" value="' + today() + '"></label>' +
    '<label>구분<select id="tr-side"><option>매수</option><option>매도</option></select></label>' +
    '<label style="flex:2 1 260px">계좌<select id="tr-acct">' + opts + '</select></label></div>' +
    '<div id="tr-newacct" class="field-row" hidden>' +
    '<label>구분<select id="tr-o"><option>법인</option><option>개인</option></select></label>' +
    '<label>소유자명<input id="tr-on" placeholder="예: ' + esc(PEOPLE[st.person] || '') + '"></label>' +
    '<label>증권사<input id="tr-b" list="tr-brokers" placeholder="삼성증권"></label><datalist id="tr-brokers">' + BROKERS.map(b => '<option value="' + b + '">').join('') + '</datalist>' +
    '<label>계좌성격<select id="tr-t">' + TYPES.map(t => '<option>' + t + '</option>').join('') + '</select></label>' +
    '<label>계좌번호<input id="tr-a" placeholder="끝 4자리 등"></label></div>' +
    '<div class="field-row"><label style="flex:2 1 200px">종목명<input id="tr-name" list="tr-names" autocomplete="off" placeholder="보유 종목 선택 또는 직접 입력"></label><datalist id="tr-names"></datalist>' +
    '<label>종목코드(선택)<input id="tr-code" placeholder="005930 / NVDA"></label>' +
    '<label>시장<select id="tr-mkt"><option>국내</option><option>해외</option></select></label>' +
    '<label id="tr-curw" hidden>통화<select id="tr-cur">' + CURS.map(c => '<option>' + c + '</option>').join('') + '</select></label></div>' +
    '<div class="field-row"><label>수량<input id="tr-qty" inputmode="decimal" placeholder="0"></label>' +
    '<label>단가<input id="tr-price" inputmode="decimal" placeholder="체결단가"></label>' +
    '<label id="tr-fxw" hidden>환율(원)<input id="tr-fx" inputmode="decimal" placeholder="1,350"></label>' +
    '<label>수수료·세금(원)<input id="tr-fee" inputmode="decimal" placeholder="0"></label></div>' +
    '<div class="field-row"><label style="flex:2 1 220px">메모(선택)<input id="tr-memo" placeholder="매매 이유"></label>' +
    '<label style="flex:2 1 220px">체결 캡쳐 첨부(선택)<input id="tr-img" type="file" accept="image/*"></label>' +
    '<label style="flex:0 0 auto;display:flex;gap:8px;align-items:center;padding-bottom:10px"><input id="tr-cash" type="checkbox" checked> 예수금에 반영</label></div>' +
    '<p id="tr-hint" class="caption"></p>' +
    '<div class="field-row"><button id="tr-submit" class="button primary" type="button">매매 반영</button><span id="tr-msg" class="caption" role="status" aria-live="polite"></span></div>';
  wireForm();
  syncForm();
}

function selAcct() {
  const v = $('tr-acct').value;
  if (v === 'new') {
    const o = $('tr-o').value, on = $('tr-on').value.trim(), b = $('tr-b').value.trim(), t = $('tr-t').value, a = $('tr-a').value.trim();
    if (!on || !b || !a) return null;
    return { o, on, b, t, a };
  }
  return accounts()[Number(v)] || null;
}
function nameRow(name) { const a = selAcct(); if (!a) return null; const k = akey(a); return st.rows.find(r => !r.cash && akey(r) === k && r.n === name) || null; }

function syncForm() {
  if (!$('tr-form') || !$('tr-acct')) return;
  $('tr-newacct').hidden = $('tr-acct').value !== 'new';
  const a = selAcct(), k = a ? akey(a) : '';
  $('tr-names').innerHTML = st.rows.filter(r => !r.cash && akey(r) === k).map(r => '<option value="' + esc(r.n) + '">').join('');
  const foreign = $('tr-mkt').value === '해외';
  $('tr-curw').hidden = !foreign; $('tr-fxw').hidden = !foreign;
  if (foreign && !$('tr-fx').value) { const r = st.rates[$('tr-cur').value]; if (r > 0) $('tr-fx').value = Math.round(r * 100) / 100; }
  const q = num($('tr-qty').value), p = num($('tr-price').value), fx = foreign ? num($('tr-fx').value) : 1, fee = num($('tr-fee').value) || 0;
  const ex = nameRow($('tr-name').value.trim());
  let h = '';
  if (q > 0 && p > 0 && fx > 0) h += '거래금액 ' + won(q * p * fx) + '원' + (fee ? ' · 수수료·세금 ' + won(fee) + '원' : '');
  if (ex) h += (h ? ' · ' : '') + '현재 보유 ' + (num(ex.q) >= 0 ? Number(ex.q).toLocaleString('ko-KR') + '주' : '수량 미확인');
  else if ($('tr-name').value.trim()) h += (h ? ' · ' : '') + ($('tr-side').value === '매수' ? '이 계좌의 새 종목으로 추가됩니다' : '이 계좌에 없는 종목입니다');
  $('tr-hint').textContent = h;
}
function wireForm() {
  ['tr-acct', 'tr-side', 'tr-mkt', 'tr-cur', 'tr-o', 'tr-on', 'tr-b', 'tr-t', 'tr-a', 'tr-qty', 'tr-price', 'tr-fx', 'tr-fee', 'tr-name'].forEach(id => $(id).addEventListener('input', syncForm));
  $('tr-name').addEventListener('change', () => {
    const r = nameRow($('tr-name').value.trim());
    if (r) { $('tr-code').value = r.k || ''; $('tr-mkt').value = r.m === '해외' ? '해외' : '국내'; const c = r.currency || r.pk; if (c && c !== 'KRW' && CURS.includes(c)) $('tr-cur').value = c; syncForm(); }
  });
  $('tr-cur').addEventListener('change', () => { $('tr-fx').value = ''; syncForm(); });
  $('tr-submit').addEventListener('click', submitOne);
}

function setMsg(t, bad) { const e = $('tr-msg'); if (e) { e.textContent = t; e.style.color = bad ? 'var(--up)' : ''; } }

function compress(file) {
  return new Promise((res, rej) => {
    const fr = new FileReader(); fr.onerror = () => rej(new Error('read'));
    fr.onload = () => {
      const im = new Image(); im.onerror = () => rej(new Error('img'));
      im.onload = () => {
        let s = Math.min(1, 1000 / Math.max(im.width, im.height)), q = .72, url = '';
        const c = document.createElement('canvas');
        for (let i = 0; i < 5; i++) { c.width = Math.round(im.width * s); c.height = Math.round(im.height * s); c.getContext('2d').drawImage(im, 0, 0, c.width, c.height); url = c.toDataURL('image/jpeg', q); if (url.length < 700000) break; s *= .8; q *= .9; }
        res(url);
      };
      im.src = fr.result;
    };
    fr.readAsDataURL(file);
  });
}

async function commit(items, undoRaw, imgByIndex) {
  // items: [{entry, raw}] 마지막 raw가 최종 데이터
  const finalRaw = items[items.length - 1].raw;
  await putData(finalRaw);
  const ids = items.map(i => i.entry.id);
  await kvSet('trade-undo', { ids, raw: undoRaw, at: Date.now() });
  for (const [i, url] of Object.entries(imgByIndex || {})) await kvSet('trade-img-' + items[i].entry.id, url);
  store.log = items.map(i => i.entry).reverse().concat(store.log).slice(0, 500);
  store.undo = { ids, raw: undoRaw };
  await kvSet('trades', store.log);
}

async function submitOne() {
  const btn = $('tr-submit'); if (btn.disabled) return;
  const a = selAcct(); if (!a) { setMsg('계좌 정보를 모두 입력하세요.', true); return; }
  const mkt = $('tr-mkt').value, cur = mkt === '국내' ? 'KRW' : $('tr-cur').value;
  const t = { acct: a, side: $('tr-side').value, n: $('tr-name').value.trim(), code: $('tr-code').value.trim(), market: mkt, currency: cur, qty: num($('tr-qty').value), price: num($('tr-price').value), fx: mkt === '국내' ? 1 : num($('tr-fx').value), fee: num($('tr-fee').value) || 0, cash: $('tr-cash').checked };
  btn.disabled = true; setMsg('최신 데이터를 확인하는 중…');
  try {
    const latest = await ctx.api('/data');
    const res = applyTrade(latest, t);
    if (res.error) { setMsg(res.error, true); return; }
    if (res.cashNeg && !confirm('예수금이 부족해 잔액이 마이너스가 됩니다. 그래도 반영할까요?')) { setMsg('취소했습니다.'); return; }
    const id = Date.now() + '' + Math.floor(Math.random() * 90 + 10);
    const entry = { id, d: $('tr-date').value || today(), side: t.side, acct: acctLabel(a), n: t.n, qty: t.qty, price: t.price, cur, fx: t.fx, gross: res.gross, fee: res.fee, realized: res.realized, memo: $('tr-memo').value.trim(), img: false, cash: t.cash && !res.cashNote, note: res.cashNote || '' };
    const imgs = {}; const f = $('tr-img').files && $('tr-img').files[0];
    if (f) { setMsg('캡쳐 이미지를 줄이는 중…'); try { imgs[0] = await compress(f); entry.img = true; } catch (e) { setMsg('이미지를 읽지 못해 캡쳐 없이 반영합니다.'); } }
    setMsg('저장하는 중…');
    await commit([{ entry, raw: res.raw }], latest, imgs);
    st.sig = ''; setMsg('반영했습니다. ' + t.side + ' ' + t.n + ' ' + t.qty.toLocaleString('ko-KR') + ' · ' + won(res.gross) + '원' + (res.realized != null ? ' · 실현손익 ' + signed(res.realized) + '원' : '') + (res.cashNote ? ' · ' + res.cashNote : ''));
    if (ctx.reload) await ctx.reload();
  } catch (e) { setMsg('저장하지 못했습니다. 연결을 확인하고 다시 시도하세요.', true); }
  finally { const b = $('tr-submit'); if (b) b.disabled = false; }
}

/* ---------- 붙여넣기 일괄 입력 ---------- */
function paintBulk() {
  if (blocked()) { $('tr-bulk').innerHTML = ''; return; }
  $('tr-bulk').innerHTML =
    '<div class="card-heading"><h3>붙여넣기 일괄 입력</h3><span class="caption">캡쳐 여러 장을 채팅으로 보내 정리한 표를 그대로 붙여넣을 수 있습니다</span></div>' +
    '<p class="caption" style="margin:0 0 10px">한 줄에 한 건 · 쉼표 또는 탭 구분 · <strong>일자, 구분, 증권사, 계좌, 종목명, 수량, 단가, 수수료, 통화, 환율, 종목코드</strong> (수수료 이후는 생략 가능, 통화 기본 KRW)</p>' +
    '<label class="block"><textarea id="tr-bulk-text" rows="5" placeholder="2026-10-06, 매수, 삼성증권, 위탁, 삼성전자, 10, 72000, 1500, KRW, , 005930&#10;2026-10-06, 매도, 한국투자증권, 위탁, NVDA, 5, 190, 12000, USD, 1343"></textarea></label>' +
    '<div class="field-row" style="margin-top:10px"><button id="tr-bulk-preview" class="button subtle" type="button">미리보기</button><button id="tr-bulk-apply" class="button primary" type="button" disabled>일괄 반영</button><span id="tr-bulk-msg" class="caption" role="status" aria-live="polite"></span></div><div id="tr-bulk-out" class="table-scroll"></div>';
  $('tr-bulk-preview').addEventListener('click', bulkPreview);
  $('tr-bulk-apply').addEventListener('click', bulkApply);
  $('tr-bulk-text').addEventListener('input', () => { $('tr-bulk-apply').disabled = true; bulkPlan = null; });
}
let bulkPlan = null;
function runBulk(baseRaw, text) {
  const lines = text.split(/\r?\n/).map(s => s.trim()).filter(Boolean).filter((s, i) => !(i === 0 && /일자|date/i.test(s) && !/^\d/.test(s)));
  let cur = clone(baseRaw), ok = 0; const out = [], items = [];
  lines.forEach((ln, i) => {
    const p = parseLine(ln, cur.rows || []);
    if (p.error) { out.push({ i: i + 1, ln, error: p.error }); return; }
    const res = applyTrade(cur, p.t);
    if (res.error) { out.push({ i: i + 1, ln, error: res.error }); return; }
    cur = res.raw; ok++;
    const a = p.t.acct, id = Date.now() + '' + (100 + i);
    items.push({ entry: { id, d: p.d, side: p.t.side, acct: acctLabel(a), n: p.t.n, qty: p.t.qty, price: p.t.price, cur: p.t.currency, fx: p.t.fx, gross: res.gross, fee: res.fee, realized: res.realized, memo: '일괄입력', img: false, cash: !res.cashNote, note: res.cashNote || '' }, raw: cur });
    const sym = symbolOf(p.t.code, p.t.market), existed = (baseRaw.rows || []).some(r => r.n === p.t.n);
    out.push({ i: i + 1, ln, ok: true, text: p.t.side + ' ' + p.t.n + ' ' + p.t.qty.toLocaleString('ko-KR') + ' · ' + won(res.gross) + '원' + (res.realized != null ? ' · 실현손익 ' + signed(res.realized) : '') + (!existed && !sym && p.t.side === '매수' ? ' · 코드 없음(시세 미연결)' : '') + (res.cashNeg ? ' · 예수금 부족' : '') + (res.cashNote ? ' · ' + res.cashNote : '') });
  });
  return { out, items, ok, total: lines.length };
}
async function bulkPreview() {
  const m = $('tr-bulk-msg'); const txt = $('tr-bulk-text').value;
  if (!txt.trim()) { m.textContent = '붙여넣을 내용이 없습니다.'; return; }
  m.textContent = '확인하는 중…';
  try {
    const latest = await ctx.api('/data'); const r = runBulk(latest, txt);
    bulkPlan = { latest, r, txt };
    $('tr-bulk-out').innerHTML = '<table><thead><tr><th>줄</th><th>결과</th></tr></thead><tbody>' + r.out.map(o => '<tr><td class="num">' + o.i + '</td><td>' + (o.ok ? '<span class="badge ok">반영 가능</span> ' + esc(o.text) : '<span class="badge">오류</span> ' + esc(o.error) + '<div class="caption">' + esc(o.ln) + '</div>') + '</td></tr>').join('') + '</tbody></table>';
    m.textContent = r.ok + '/' + r.total + '건 반영 가능' + (r.ok < r.total ? ' · 오류 줄은 제외됩니다' : '');
    $('tr-bulk-apply').disabled = r.ok === 0;
  } catch (e) { m.textContent = '데이터를 불러오지 못했습니다.'; }
}
async function bulkApply() {
  if (!bulkPlan || !bulkPlan.r.items.length) return;
  const m = $('tr-bulk-msg'), b = $('tr-bulk-apply'); b.disabled = true; m.textContent = '저장하는 중…';
  try {
    const latest = await ctx.api('/data'), r = runBulk(latest, bulkPlan.txt);
    if (!r.items.length) { m.textContent = '반영할 건이 없습니다.'; return; }
    await commit(r.items, latest, {});
    $('tr-bulk-text').value = ''; $('tr-bulk-out').innerHTML = ''; bulkPlan = null; st.sig = '';
    m.textContent = r.ok + '건을 반영했습니다.' + (r.ok < r.total ? ' (오류 ' + (r.total - r.ok) + '건 제외)' : '');
    if (ctx.reload) await ctx.reload();
  } catch (e) { m.textContent = '저장하지 못했습니다. 다시 시도하세요.'; b.disabled = false; }
}

/* ---------- 기록 · 되돌리기 ---------- */
let logSig = '';
function paintLog() {
  if (!$('tr-log')) return;
  const lsig = JSON.stringify([store.log.map(x => x.id), store.undo && store.undo.ids, !!blocked(), st.person]);
  if (lsig === logSig && $('tr-log').innerHTML) return;
  logSig = lsig;
  const log = store.log, yr = String(new Date(Date.now() + 9 * 3600e3).getUTCFullYear());
  const ytd = log.filter(x => String(x.d).startsWith(yr));
  const real = ytd.reduce((n, x) => n + (Number.isFinite(x.realized) ? x.realized : 0), 0), fees = ytd.reduce((n, x) => n + (x.fee || 0), 0);
  $('tr-tiles').innerHTML = '<div class="tile"><div class="tile-label">올해 매매 기록</div><div class="tile-value">' + ytd.length + '<span class="unit">건</span></div></div>' +
    '<div class="tile"><div class="tile-label">올해 실현손익</div><div class="tile-value ' + (real > 0 ? 'up' : real < 0 ? 'down' : '') + '">' + signed(real) + '<span class="unit">원</span></div><div class="tile-note">매도 시 평균단가 기준 · 수수료·세금 차감</div></div>' +
    '<div class="tile"><div class="tile-label">올해 수수료·세금</div><div class="tile-value">' + won(fees) + '<span class="unit">원</span></div></div>';
  const canUndo = !blocked() && store.undo && store.undo.raw;
  $('tr-log').innerHTML = '<div class="card-heading"><h3>매매 기록</h3>' + (canUndo ? '<button id="tr-undo" class="button subtle" type="button">마지막 매매 되돌리기</button>' : '') + '</div>' +
    (log.length ? '<div class="table-scroll"><table><thead><tr><th>일자</th><th>구분</th><th>계좌</th><th>종목</th><th class="num">수량</th><th class="num">단가</th><th class="num">금액(원)</th><th class="num">실현손익</th><th>메모</th><th>캡쳐</th></tr></thead><tbody>' +
      log.slice(0, 100).map(x => '<tr><td>' + esc(x.d) + '</td><td>' + esc(x.side) + '</td><td>' + esc(x.acct) + '</td><td>' + esc(x.n) + '</td><td class="num">' + Number(x.qty).toLocaleString('ko-KR') + '</td><td class="num">' + Number(x.price).toLocaleString('ko-KR') + (x.cur && x.cur !== 'KRW' ? ' ' + esc(x.cur) : '') + '</td><td class="num">' + won(x.gross) + '</td><td class="num ' + (x.realized > 0 ? 'up' : x.realized < 0 ? 'down' : '') + '">' + (Number.isFinite(x.realized) ? signed(x.realized) : '—') + '</td><td>' + esc(x.memo || '') + '</td><td>' + (x.img ? '<button class="text-button" data-img="' + esc(x.id) + '" type="button">보기</button>' : '') + '</td></tr>').join('') + '</tbody></table></div>' : '<p class="empty">아직 입력한 매매가 없습니다. 위에서 첫 매매를 입력해 보세요.</p>') +
    '<div id="tr-imgview"></div><p class="caption">되돌리기는 가장 최근에 입력한 매매 1회(일괄 입력은 한 번으로 계산)만 가능하며, 그 이후 다른 곳에서 바꾼 보유 데이터도 매매 직전 상태로 돌아갑니다.</p>';
  const u = $('tr-undo'); if (u) u.addEventListener('click', undo);
  $('tr-log').querySelectorAll('[data-img]').forEach(bn => bn.addEventListener('click', async () => {
    const box = $('tr-imgview'); box.innerHTML = '<p class="caption">불러오는 중…</p>';
    const url = await kvGet('trade-img-' + bn.dataset.img);
    box.innerHTML = typeof url === 'string' && url.startsWith('data:image/') ? '<img alt="체결 캡쳐" style="max-width:100%;border:1px solid var(--line);border-radius:8px;margin-top:12px" src="' + url + '">' : '<p class="caption">이미지를 불러오지 못했습니다.</p>';
  }));
}
async function undo() {
  if (!store.undo || !store.undo.raw || !confirm('마지막 매매 입력(' + store.undo.ids.length + '건)을 되돌리고 보유 데이터를 그 직전 상태로 복원합니다. 계속할까요?')) return;
  try {
    await putData(store.undo.raw);
    store.log = store.log.filter(x => !store.undo.ids.includes(x.id));
    await kvSet('trades', store.log); await kvSet('trade-undo', null); store.undo = null; st.sig = '';
    if (ctx.reload) await ctx.reload();
  } catch (e) { alert('되돌리지 못했습니다. 다시 시도하세요.'); }
}

root.WTR = { start, render, clear, _t: { applyTrade, parseLine, runBulk, resolveAcct, normDate } };
})(typeof window !== 'undefined' ? window : globalThis);
