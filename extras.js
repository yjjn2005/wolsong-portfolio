/* Extra tabs: rebalancing, dividends, tax simulator, journal, asset trend, backup.
   Loaded before app.js; app.js calls PFX.start / render / afterQuote / clear. */
(function(){
'use strict';
const $=id=>document.getElementById(id),C=window.PFC;
const esc=v=>String(v==null?'':v).replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]));
const won=n=>Number.isFinite(n)?Math.round(n).toLocaleString('ko-KR'):'—';
const signed=n=>(n>0?'+':n<0?'−':'')+won(Math.abs(n));
const cls=n=>n>0?'up':n<0?'down':'';
const pctS=n=>Number.isFinite(n)?(n>0?'+':n<0?'−':'')+Math.abs(n).toFixed(1)+'%p':'—';
const pct1=n=>(Number.isFinite(n)?n:0).toFixed(1)+'%';
const man=n=>Math.abs(n)>=1e8?(n/1e8).toFixed(2)+'억':Math.abs(n)>=1e4?Math.round(n/1e4).toLocaleString('ko-KR')+'만':won(n);
const html=(id,s)=>{const e=$(id);if(e)e.innerHTML=s;};
const empty=s=>'<div class="empty">'+esc(s)+'</div>';
const tile=(l,v,n='',c='')=>'<div class="tile '+c+'"><div class="tile-label">'+esc(l)+'</div><div class="tile-value">'+v+'</div><div class="tile-note">'+esc(n)+'</div></div>';
const money=n=>won(n)+'<span class="unit">원</span>';
const signMoney=n=>'<span class="'+cls(n)+'">'+signed(n)+'<span class="unit">원</span></span>';
const PENSION=['개인연금','퇴직연금','IRP'];
const FXDEF={KRW:1,USD:1350,JPY:9,CNY:190};
const todayKST=()=>new Date(Date.now()+9*3600e3).toISOString().slice(0,10);

let ctx=null,last=null,store={targets:{last:{basis:'m',band:5},sets:{}},journal:[],hist:[]},storeReady=false,storeLoading=null;
let rb={basis:'m',mode:'full',band:5,inflow:0};
let tax={deduction:2500000,rate:22,realized:0,picked:new Set()};
let div={state:'idle',data:{},at:null,err:'',key:''};
let jr={editing:null,filter:'',kind:''};
let histSaved=0;

/* ---------- 서버 저장(KV) ---------- */
async function kvGet(n){if(!ctx||ctx.demo)return null;try{return await ctx.api('/kv/'+n);}catch(e){return null;}}
async function kvSet(n,v){if(!ctx||ctx.demo)return true;try{await ctx.api('/kv/'+n,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(v)});return true;}catch(e){return false;}}
async function loadStore(){
 const [t,j,h]=await Promise.all([kvGet('targets'),kvGet('journal'),kvGet('hist')]);
 if(t&&typeof t==='object'&&t.sets)store.targets=t;
 if(Array.isArray(j))store.journal=j;
 if(Array.isArray(h))store.hist=h;
 const l=store.targets.last||{};rb.basis=l.basis||rb.basis;rb.band=Number(l.band)||rb.band;storeReady=true;
}
function note(id,t,bad){const e=$(id);if(!e)return;e.textContent=t;e.className='save-note'+(bad?' bad':'');}

/* ---------- 리밸런싱 ---------- */
const BASES=[['m','자산 (국내·해외·현금)'],['t','계좌성격'],['b','증권사'],['o','개인·법인'],['stock','개별 종목']];
function rbItems(rows){return C.group(rows,rb.basis);}
function rbTargets(){const s=store.targets.sets;if(!s[rb.basis])s[rb.basis]={};return s[rb.basis];}
function renderRbControls(){
 html('rb-controls','<div class="field-row"><label>기준<select id="rb-basis">'+BASES.map(([k,l])=>'<option value="'+k+'"'+(k===rb.basis?' selected':'')+'>'+l+'</option>').join('')+'</select></label>'+
 '<label>방식<select id="rb-mode"><option value="full"'+(rb.mode==='full'?' selected':'')+'>매도·매수로 맞추기</option><option value="inflow"'+(rb.mode==='inflow'?' selected':'')+'>신규 자금으로만 맞추기</option></select></label>'+
 '<label>괴리 알림 기준(%p)<input id="rb-band" type="number" min="1" max="50" step="1" value="'+rb.band+'"></label>'+
 '<label id="rb-inflow-wrap"'+(rb.mode==='inflow'?'':' hidden')+'>신규 투입금(원)<input id="rb-inflow" type="number" min="0" step="100000" value="'+(rb.inflow||'')+'" placeholder="예: 10000000"></label></div>'+
 '<div class="field-row"><button class="button" id="rb-fill" type="button">현재 비중으로 채우기</button><button class="button primary" id="rb-save" type="button">목표 저장</button><span id="rb-note" class="save-note" role="status"></span></div>');
}
function renderRb(d){
 if(!$('rb-controls'))return;
 if(!$('rb-basis'))renderRbControls();
 const items=rbItems(d.rows);if(!items.length){html('rb-table',empty('선택한 범위에 데이터가 없습니다.'));html('rb-foot','');return;}
 const r=C.rebalance(items,rbTargets(),{mode:rb.mode,band:rb.band,inflow:rb.inflow});
 html('rb-table','<table><thead><tr><th scope="col">항목</th><th scope="col" class="num">평가금액(원)</th><th scope="col" class="num">현재 비중</th><th scope="col" class="num">목표 비중(%)</th><th scope="col" class="num">괴리</th><th scope="col" class="num">'+(rb.mode==='full'?'조정 금액(원)':'신규 매수(원)')+'</th><th scope="col">상태</th></tr></thead><tbody>'+
 r.rows.map(x=>'<tr><th scope="row">'+esc(x.name)+'</th><td class="num">'+won(x.ev)+'</td><td class="num">'+pct1(x.w)+'</td><td class="num"><input class="mini-input rb-t" data-name="'+esc(encodeURIComponent(x.name))+'" type="number" min="0" max="100" step="0.5" value="'+(rbTargets()[x.name]??'')+'" aria-label="'+esc(x.name)+' 목표 비중"></td><td class="num '+(r.targetSum>0?cls(x.drift):'')+'">'+(r.targetSum>0?pctS(x.drift):'—')+'</td><td class="num '+(rb.mode==='full'?cls(x.adj):'')+'">'+(r.targetSum>0?(rb.mode==='full'?signed(x.adj):won(x.adj)):'—')+'</td><td>'+(r.targetSum>0?(x.flag?'<span class="badge">조정 필요</span>':'<span class="badge ok">범위 내</span>'):'<span class="badge neutral">목표 미설정</span>')+'</td></tr>').join('')+
 '</tbody><tfoot><tr><th scope="row">합계</th><td class="num">'+won(r.total)+'</td><td class="num">100.0%</td><td class="num" id="rb-sum">'+(+r.rows.reduce((n,x)=>n+x.target,0).toFixed(1))+'</td><td></td><td class="num">'+(rb.mode==='full'?signed(r.rows.reduce((n,x)=>n+x.adj,0)):won(r.rows.reduce((n,x)=>n+x.adj,0)))+'</td><td></td></tr></tfoot></table>');
 const sum=r.rows.reduce((n,x)=>n+x.target,0);
 html('rb-foot','<p class="caption" style="margin-top:13px">'+(r.targetSum===0?'목표 비중을 입력하고 "목표 저장"을 누르세요.':(Math.abs(sum-100)>0.05?'목표 합계가 '+(+sum.toFixed(1))+'%입니다. 100%가 아니면 입력한 값의 비율로 환산해 계산합니다.':'목표 합계 100%'))+' · 세금·수수료·호가, 연금계좌 안에서만 자산을 옮길 수 있는 제한은 반영하지 않은 단순 계산입니다.</p>');
}
function rbAlerts(d){
 const l=store.targets.last||{},basis=l.basis||'m',tg=store.targets.sets[basis]||{},band=Number(l.band)||5;
 const label=(BASES.find(b=>b[0]===basis)||[0,basis])[1];
 const has=Object.values(tg).some(v=>Number(v)>0);
 if(!has)return'<div class="card-heading"><h3>리밸런싱 점검</h3><button class="text-button" data-open-tab="rebalance" type="button">목표 설정</button></div>'+empty('목표 비중을 설정하면 괴리가 큰 항목을 알려드립니다.');
 const r=C.rebalance(C.group(d.all,basis),tg,{mode:'full',band});
 const flagged=r.rows.filter(x=>x.flag).sort((a,b)=>Math.abs(b.drift)-Math.abs(a.drift));
 return'<div class="card-heading"><h3>리밸런싱 점검</h3><button class="text-button" data-open-tab="rebalance" type="button">상세 보기</button></div>'+
 (flagged.length?'<ul class="issue-list">'+flagged.slice(0,4).map(x=>'<li><strong>'+esc(x.name)+'</strong><span class="caption">목표 '+(+(x.tn*100).toFixed(1))+'% 대비 현재 '+pct1(x.w)+' ('+pctS(x.drift)+') → '+(x.adj<0?'약 '+man(-x.adj)+'원 초과':'약 '+man(x.adj)+'원 부족')+'</span></li>').join('')+'</ul>':'<div class="empty">모든 항목이 목표 대비 ±'+band+'%p 안에 있습니다.</div>')+'<p class="caption" style="margin-top:11px">기준: '+esc(label)+' · 전체 자산</p>';
}

/* ---------- 배당 ---------- */
const ySym=(syms,h)=>{const m=syms&&syms[h.n];return Array.isArray(m)?(m[2]||m[0]||''):'';};
async function fetchDiv(d){
 if(!ctx||ctx.demo){div.state='demo';return;}
 const list=[...new Set(d.all.filter(h=>!h.cash).map(h=>ySym(d.syms,h)).filter(Boolean))].sort(),key=list.join(',');
 if(!list.length){div.state='none';return;}
 if(div.key===key&&(div.state==='ok'||div.state==='loading'))return;
 div.state='loading';div.key=key;div.err='';
 try{const data={};for(let i=0;i<list.length;i+=40){const j=await ctx.api('/div?symbols='+encodeURIComponent(list.slice(i,i+40).join(',')));Object.assign(data,j&&j.divs||{});}
  div.data=data;div.at=Date.now();div.state='ok';}catch(e){div.state='err';div.err='배당 이력을 불러오지 못했습니다.';div.key='';}
 if(last)renderDiv(last);
}
function divCalc(d,rows){
 const nowSec=Date.now()/1000,rates={...FXDEF,...(d.rates||{})},byName=new Map();
 rows.filter(h=>!h.cash&&!h.bond&&h.q>0).forEach(h=>{const k=h.n;if(!byName.has(k))byName.set(k,{n:h.n,y:ySym(d.syms,h),cur:h.currency||'KRW',q:0,ev:0,buy:0,taxable:0,deferred:0,rows:[]});const s=byName.get(k);s.q+=h.q;s.ev+=h.ev;s.buy+=h.buy;s.rows.push(h);});
 const out=[],months=Array(12).fill(0),miss=[];let total=0,taxable=0,deferred=0,fin=0;
 byName.forEach(s=>{const e=div.data[s.y],cur=(e&&e.currency)||s.cur,fx=rates[cur]||(cur==='KRW'?1:0);
  if(!e||!e.items||!e.items.length||!fx){miss.push(s.n);return;}
  const t=C.ttm(e.items,nowSec);if(!t.sum){miss.push(s.n);return;}
  const annual=s.q*t.sum*fx;total+=annual;
  s.rows.forEach(h=>{const a=h.q*t.sum*fx;if(PENSION.includes(h.t))deferred+=a;else{taxable+=a;if(h.o==='개인'&&h.t==='위탁')fin+=a;}});
  C.byMonth(t.list,s.q*fx).forEach((v,i)=>months[i]+=v);
  out.push({...s,cur,perShare:t.sum,count:t.count,last:t.last,annual,yield:s.ev?annual/s.ev*100:0});});
 rows.filter(h=>h.bond&&h.face>0&&h.cpn>0).forEach(h=>{const a=h.face*h.cpn/100,pay=Array.isArray(h.pay)&&h.pay.length?h.pay:[6,12];total+=a;if(PENSION.includes(h.t))deferred+=a;else{taxable+=a;if(h.o==='개인'&&h.t==='위탁')fin+=a;}pay.forEach(m=>{if(m>=1&&m<=12)months[m-1]+=a/pay.length;});out.push({n:h.n,y:'국채이자',cur:'KRW',q:h.face,perShare:h.cpn,count:pay.length,last:null,annual:a,yield:h.ev?a/h.ev*100:0,bond:true,mat:h.mat,faceEst:h.faceEst});});
 out.sort((a,b)=>b.annual-a.annual);
 return{out,months,miss,total,taxable,deferred,fin};
}
function monthChart(months){
 const W=720,Hh=230,pad={l:8,r:8,t:26,b:30},max=Math.max(...months,1),bw=(W-pad.l-pad.r)/12,cur=new Date(Date.now()+9*3600e3).getUTCMonth();
 const bars=months.map((v,i)=>{const h=(Hh-pad.t-pad.b)*v/max,x=pad.l+i*bw+bw*.16,y=Hh-pad.b-h;return'<g><title>'+(i+1)+'월 예상 '+won(v)+'원</title><rect x="'+x.toFixed(1)+'" y="'+y.toFixed(1)+'" width="'+(bw*.68).toFixed(1)+'" height="'+Math.max(h,v>0?1:0).toFixed(1)+'" rx="4" fill="'+(i===cur?'var(--c2)':'var(--c1)')+'"/><text x="'+(x+bw*.34).toFixed(1)+'" y="'+(y-6).toFixed(1)+'" text-anchor="middle" class="chart-val">'+(v>0?man(v):'')+'</text><text x="'+(x+bw*.34).toFixed(1)+'" y="'+(Hh-9)+'" text-anchor="middle" class="chart-axis">'+(i+1)+'월</text></g>';}).join('');
 return'<svg class="chart" viewBox="0 0 '+W+' '+Hh+'" role="img" aria-label="월별 예상 배당금 막대 그래프">'+bars+'</svg>';
}
function renderDiv(d){
 if(!$('dv-tiles'))return;
 if(div.state==='demo'){html('dv-tiles','');html('dv-chart',empty('예시 데이터에서는 배당 이력을 조회하지 않습니다. 실제 계좌를 열면 표시됩니다.'));html('dv-table','');html('dv-note','');return;}
 if(div.state==='loading'||div.state==='idle'){html('dv-tiles','');html('dv-chart',empty('배당 이력을 불러오는 중입니다…'));html('dv-table','');html('dv-note','');return;}
 if(div.state==='err'){html('dv-tiles','');html('dv-chart','<div class="empty">'+esc(div.err)+' <button class="text-button" id="dv-retry" type="button">다시 시도</button></div>');return;}
 const c=divCalc(d,d.rows),T=d.T;
 html('dv-tiles',tile('예상 연 배당(세전)',money(c.total),'최근 12개월 지급 실적 기준','featured')+tile('월 평균',money(c.total/12),'연 예상 ÷ 12')+tile('평가금액 대비',pct1(T.invEv?c.total/T.invEv*100:0),'투자자산 평가금액 기준')+tile('원금 대비',pct1(T.inv?c.total/T.inv*100:0),'투자 원금 기준')+tile('일반계좌 / 연금계좌',money(c.taxable)+'<div class="sub-value">'+won(c.deferred)+'원</div>','일반계좌 · 연금·IRP(과세이연)'));
 html('dv-chart','<div class="card-heading"><h3>월별 예상 배당금</h3><span class="caption">지난 12개월 지급월 기준 · 세전 · 원</span></div>'+(c.total?monthChart(c.months):empty('배당 이력이 있는 종목이 없습니다.')));
 html('dv-table',c.out.length?'<table><thead><tr><th scope="col">종목</th><th scope="col" class="num">보유 수량</th><th scope="col" class="num">12개월 1주당 배당</th><th scope="col" class="num">지급 횟수</th><th scope="col" class="num">예상 연 배당(원)</th><th scope="col" class="num">평가 대비</th><th scope="col">최근 지급</th></tr></thead><tbody>'+c.out.map(s=>'<tr><td>'+esc(s.n)+'<div class="subline">'+esc(s.y)+' · '+esc(s.cur)+'</div></td><td class="num">'+(s.bond?'액면 '+won(s.q)+(s.faceEst?' (추정)':''):s.q.toLocaleString('ko-KR',{maximumFractionDigits:4}))+'</td><td class="num">'+(s.bond?'표면금리 '+s.perShare+'%':s.perShare.toLocaleString('ko-KR',{maximumFractionDigits:4}))+'</td><td class="num">'+s.count+'회'+(s.bond?'/년':'')+'</td><td class="num"><strong>'+won(s.annual)+'</strong></td><td class="num">'+pct1(s.yield)+'</td><td class="caption">'+(s.bond?'만기 '+esc(s.mat||'—'):s.last?new Date(s.last*1000).toLocaleDateString('ko-KR',{timeZone:'Asia/Seoul'}):'—')+'</td></tr>').join('')+'</tbody></table>':empty('표시할 배당 종목이 없습니다.'));
 html('dv-note','<h3>해석 시 유의</h3><ul class="plain-list"><li>국채이자는 액면금액 × 표면금리를 연 2회 지급일에 나눠 계산한 값입니다. 액면금액은 매수금액을 바탕으로 추정한 값이니 실제 보유 액면과 다르면 알려 주세요.</li><li>지난 12개월에 실제 지급된 1주당 금액 × 현재 보유 수량입니다. 배당 삭감·증액, 신규 편입, 종목 변경은 반영하지 않습니다.</li><li>세전 금액입니다. 해외 배당은 현지 원천징수 후 국내 과세가 달라질 수 있고, 연금·IRP 계좌의 분배금은 계좌 안에서 재투자되며 과세가 이연됩니다.</li><li>개인 위탁계좌 예상 배당 '+won(c.fin)+'원 — 금융소득종합과세 판단은 이자소득 등 다른 금융소득과 합산해야 하므로 세금 탭의 기준과 함께 확인하세요.</li>'+(c.miss.length?'<li>배당 이력이 없거나 조회되지 않은 종목 '+c.miss.length+'개: '+esc(c.miss.slice(0,8).join(', '))+(c.miss.length>8?' 외':'')+'</li>':'')+'</ul><p class="caption">데이터: Yahoo Finance 배당 이력 · 조회 '+(div.at?new Date(div.at).toLocaleTimeString('ko-KR',{timeZone:'Asia/Seoul',hour:'2-digit',minute:'2-digit'}):'—')+'</p>');
}
function dashDiv(d){
 if(div.state!=='ok'){return'<div class="card-heading"><h3>예상 배당</h3><button class="text-button" data-open-tab="dividend" type="button">상세 보기</button></div>'+empty(div.state==='demo'?'예시에서는 조회하지 않습니다.':div.state==='err'?div.err:'배당 이력을 불러오는 중입니다…');}
 const c=divCalc(d,d.rows),cur=new Date(Date.now()+9*3600e3).getUTCMonth();
 return'<div class="card-heading"><h3>예상 배당</h3><button class="text-button" data-open-tab="dividend" type="button">상세 보기</button></div><div class="metric-list"><div><span>예상 연 배당<small>최근 12개월 실적 기준 · 세전</small></span><strong>'+won(c.total)+'원</strong></div><div><span>월 평균<small>연 예상 ÷ 12</small></span><strong>'+won(c.total/12)+'원</strong></div><div><span>이번 달 예상<small>'+(cur+1)+'월 지급 패턴</small></span><strong>'+won(c.months[cur])+'원</strong></div></div>';
}

/* ---------- 세금 ---------- */
function taxRows(d){return d.all.filter(h=>!h.cash&&h.o==='개인'&&h.t==='위탁'&&h.m==='해외');}
function renderTax(d){
 if(!$('tx-inputs'))return;
 const rows=taxRows(d);
 html('tx-inputs','<div class="field-row"><label>기본공제(원)<input id="tx-ded" type="number" min="0" step="10000" value="'+tax.deduction+'"></label><label>세율(%)<input id="tx-rate" type="number" min="0" max="60" step="0.1" value="'+tax.rate+'"></label><label>올해 이미 실현한 해외주식 손익(원)<input id="tx-real" type="number" step="10000" value="'+(tax.realized||'')+'" placeholder="이익은 +, 손실은 −"></label></div><p class="caption">기본값은 해외주식 양도소득 기본공제 250만 원, 세율 22%(지방소득세 포함)입니다. 세법이 바뀌었을 수 있으니 직접 확인해 입력값을 수정하세요.</p>');
 const chosen=rows.filter(h=>tax.picked.has(h.id)),gain=chosen.reduce((n,h)=>n+(h.ev-h.buy-h.fee),0),r=C.capGainTax({gain,realized:tax.realized,deduction:tax.deduction,rate:tax.rate/100});
 const all=rows.reduce((n,h)=>n+(h.ev-h.buy-h.fee),0),rAll=C.capGainTax({gain:all,realized:tax.realized,deduction:tax.deduction,rate:tax.rate/100});
 html('tx-tiles',tile('매도 가정 손익 합계',signMoney(gain),chosen.length+'개 보유분 선택','featured')+tile('과세표준',money(r.taxable),'(가정 손익 + 실현 손익) − 기본공제')+tile('예상 양도소득세',money(r.tax),'세율 '+tax.rate+'% 적용')+tile('남은 공제 여유',money(r.room),'이익 실현 시 세금 없이 쓸 수 있는 한도')+tile('전량 매도 시 예상 세액',money(rAll.tax),'해외주식 개인 위탁 전체 '+won(all)+'원 손익'));
 html('tx-table',rows.length?'<table><thead><tr><th scope="col">매도</th><th scope="col">종목</th><th scope="col" class="num">매입금액(원)</th><th scope="col" class="num">평가금액(원)</th><th scope="col" class="num">평가손익(원)</th><th scope="col" class="num">수익률</th></tr></thead><tbody>'+rows.map(h=>{const pl=h.ev-h.buy-h.fee;return'<tr><td><input class="tx-pick" type="checkbox" data-id="'+esc(h.id)+'"'+(tax.picked.has(h.id)?' checked':'')+' aria-label="'+esc(h.n)+' 매도 가정"></td><td>'+esc(h.n)+'<div class="subline">'+esc(h.b+' · '+h.a)+'</div></td><td class="num">'+won(h.buy)+'</td><td class="num">'+won(h.ev)+'</td><td class="num '+cls(pl)+'">'+signed(pl)+'</td><td class="num '+cls(pl)+'">'+(h.buy?(pl/h.buy*100>0?'+':pl<0?'−':'')+Math.abs(pl/h.buy*100).toFixed(2)+'%':'—')+'</td></tr>';}).join('')+'</tbody></table><div class="field-row" style="margin-top:12px"><button class="button" id="tx-all" type="button">전체 선택</button><button class="button" id="tx-gain" type="button">이익 종목만</button><button class="button" id="tx-loss" type="button">손실 종목만</button><button class="button" id="tx-none" type="button">선택 해제</button></div>':empty('개인 위탁계좌의 해외주식이 없습니다.'));
 const corp=d.all.filter(h=>!h.cash&&h.o==='법인'&&h.m==='해외').reduce((n,h)=>n+(h.ev-h.buy-h.fee),0);
 const losers=rows.filter(h=>h.ev-h.buy-h.fee<0).sort((a,b)=>(a.ev-a.buy-a.fee)-(b.ev-b.buy-b.fee));
 const fin=div.state==='ok'?divCalc(d,d.all).fin:null;
 html('tx-notes','<h3>절세 점검 메모</h3><ul class="plain-list"><li>같은 해에 실현한 해외주식 이익과 손실은 통산됩니다. 이익 종목을 팔 때 손실 종목을 함께 팔면 과세표준이 줄어듭니다.'+(losers.length?' 현재 평가손실 종목: '+esc(losers.slice(0,4).map(h=>h.n+' '+signed(h.ev-h.buy-h.fee)+'원').join(', '))+'.':'')+'</li><li>기본공제는 연 단위이고 이월되지 않으므로, 이익 실현 계획이 있다면 공제 여유('+won(r.room)+'원)를 연말 전에 나눠 쓰는 방법을 비교해 볼 수 있습니다.</li><li>양도소득세는 신고·납부 시기와 환율(취득·양도 시점) 적용이 달라 이 화면 값과 차이가 날 수 있습니다. 비용은 입력된 제비용만 반영했습니다.</li><li>법인 명의 해외주식(평가손익 '+signed(corp)+'원)은 양도소득세 대상이 아니라 법인 소득에 반영됩니다. 연금·IRP 계좌 안의 매매는 계좌 안에서 과세가 이연되므로 이 계산에서 제외했습니다.</li>'+(fin!==null?'<li>개인 위탁계좌 예상 배당 '+won(fin)+'원 — 금융소득(이자+배당)이 연 2,000만 원을 넘으면 종합과세 대상이 될 수 있습니다. 다른 금융소득과 합산해 확인하세요.</li>':'')+'</ul><p class="caption">일반적인 참고 계산이며 세무 자문이 아닙니다. 중요한 거래 전에는 세무 전문가나 국세청 안내로 확인하세요.</p>');
}

/* ---------- 일지 ---------- */
function renderJournal(d){
 if(!$('jr-form'))return;
 const names=[...new Set(d.all.filter(h=>!h.cash).map(h=>h.n))].sort((a,b)=>a.localeCompare(b,'ko')),e=jr.editing?store.journal.find(x=>x.id===jr.editing):null;
 if(!$('jr-date')||jr.dirtyForm!==(e?e.id:'new')){
  html('jr-form','<h3>'+(e?'기록 수정':'새 기록')+'</h3><div class="field-row"><label>날짜<input id="jr-date" type="date" value="'+esc(e?e.d:todayKST())+'"></label><label>구분<select id="jr-kind">'+['매수','매도','관찰','메모'].map(k=>'<option'+(e&&e.k===k?' selected':'')+'>'+k+'</option>').join('')+'</select></label><label>종목<input id="jr-name" list="jr-names" placeholder="종목명(직접 입력 가능)" value="'+esc(e?e.n:'')+'"></label><datalist id="jr-names">'+names.map(n=>'<option value="'+esc(n)+'">').join('')+'</datalist><label>수량<input id="jr-qty" type="number" step="any" min="0" value="'+esc(e?e.q:'')+'"></label><label>가격<input id="jr-price" type="number" step="any" min="0" value="'+esc(e?e.p:'')+'"></label></div><label class="block">이유·판단 근거<textarea id="jr-why" rows="3" placeholder="왜 사거나 팔았는지, 앞으로의 계획">'+esc(e?e.w:'')+'</textarea></label><label class="block">당시 시장 상황<textarea id="jr-mkt" rows="2" placeholder="금리·환율·뉴스 등">'+esc(e?e.s:'')+'</textarea></label><div class="field-row"><button class="button primary" id="jr-save" type="button">'+(e?'수정 저장':'기록 저장')+'</button>'+(e?'<button class="button" id="jr-cancel" type="button">취소</button>':'')+'<span id="jr-note" class="save-note" role="status"></span></div>');
  jr.dirtyForm=e?e.id:'new';
 }
 const q=jr.filter.toLowerCase(),list=store.journal.filter(x=>(!jr.kind||x.k===jr.kind)&&(!q||[x.n,x.w,x.s].join(' ').toLowerCase().includes(q))).sort((a,b)=>b.d.localeCompare(a.d)||b.id-a.id);
 html('jr-list','<div class="field-row"><label>종류<select id="jr-fk"><option value="">전체</option>'+['매수','매도','관찰','메모'].map(k=>'<option'+(jr.kind===k?' selected':'')+'>'+k+'</option>').join('')+'</select></label><label>검색<input id="jr-fq" type="search" value="'+esc(jr.filter)+'" placeholder="종목·내용"></label><span class="caption">'+list.length+'건</span></div>'+(list.length?list.map(x=>'<div class="journal-item"><div class="journal-head"><span class="badge '+(x.k==='매수'?'ok':x.k==='매도'?'':'neutral')+'">'+esc(x.k)+'</span><strong>'+esc(x.n||'종목 미지정')+'</strong><span class="caption">'+esc(x.d)+(x.q?' · '+esc(x.q)+'주':'')+(x.p?' · '+esc(Number(x.p).toLocaleString('ko-KR'))+'':'')+'</span><span class="journal-actions"><button class="text-button" data-jr-edit="'+x.id+'" type="button">수정</button><button class="text-button" data-jr-del="'+x.id+'" type="button">삭제</button></span></div>'+(x.w?'<p>'+esc(x.w)+'</p>':'')+(x.s?'<p class="caption">시장: '+esc(x.s)+'</p>':'')+'</div>').join(''):empty('기록이 없습니다. 위 양식으로 첫 기록을 남겨 보세요.')));
}
async function saveJournalEntry(){
 const n=$('jr-name').value.trim(),w=$('jr-why').value.trim(),s=$('jr-mkt').value.trim(),d=$('jr-date').value||todayKST();
 if(!n&&!w&&!s){note('jr-note','종목이나 내용을 입력해 주세요.',true);return;}
 const entry={id:jr.editing||Date.now(),d,k:$('jr-kind').value,n,q:$('jr-qty').value,p:$('jr-price').value,w,s};
 if(jr.editing)store.journal=store.journal.map(x=>x.id===jr.editing?entry:x);else store.journal.push(entry);
 jr.editing=null;jr.dirtyForm=null;
 const ok=await kvSet('journal',store.journal);if(last)renderJournal(last);note('jr-note',ok?'저장했습니다.':'서버 저장에 실패했습니다. 잠시 후 다시 시도해 주세요.',!ok);
}

/* ---------- 자산 추이 ---------- */
function snapshot(all){const inv=all.filter(h=>!h.cash),T={ev:0,inv:0,pl:0,cash:0};all.forEach(h=>{T.ev+=h.ev;if(h.cash)T.cash+=h.ev;else{T.inv+=h.buy;T.pl+=h.ev-h.buy-h.fee;}});return{d:todayKST(),ev:Math.round(T.ev),inv:Math.round(T.inv),pl:Math.round(T.pl),cash:Math.round(T.cash)};}
function trendChart(h,key){
 const pts=h.map(x=>({d:x.d,v:x[key]})),W=720,Hh=210,pad={l:10,r:10,t:18,b:28};
 const vs=pts.map(p=>p.v),min=Math.min(...vs),max=Math.max(...vs),span=(max-min)||Math.abs(max)||1;
 const X=i=>pad.l+(pts.length===1?0:i*(W-pad.l-pad.r)/(pts.length-1)),Y=v=>Hh-pad.b-(Hh-pad.t-pad.b)*(v-min)/span;
 const line=pts.map((p,i)=>(i?'L':'M')+X(i).toFixed(1)+' '+Y(p.v).toFixed(1)).join(' ');
 const labels=[0,Math.floor((pts.length-1)/2),pts.length-1].filter((v,i,a)=>a.indexOf(v)===i);
 return'<svg class="chart" viewBox="0 0 '+W+' '+Hh+'" role="img" aria-label="자산 추이 선 그래프"><path d="'+line+' L'+X(pts.length-1).toFixed(1)+' '+(Hh-pad.b)+' L'+X(0).toFixed(1)+' '+(Hh-pad.b)+' Z" fill="var(--accent-soft)" opacity=".7"/><path d="'+line+'" fill="none" stroke="var(--c1)" stroke-width="2.5" stroke-linejoin="round"/>'+pts.map((p,i)=>'<g><title>'+p.d+' · '+won(p.v)+'원</title><circle cx="'+X(i).toFixed(1)+'" cy="'+Y(p.v).toFixed(1)+'" r="'+(pts.length>40?2.5:4)+'" fill="var(--c1)"/><circle cx="'+X(i).toFixed(1)+'" cy="'+Y(p.v).toFixed(1)+'" r="11" fill="transparent"/></g>').join('')+labels.map(i=>'<text x="'+X(i).toFixed(1)+'" y="'+(Hh-8)+'" text-anchor="'+(i===0?'start':i===pts.length-1?'end':'middle')+'" class="chart-axis">'+pts[i].d.slice(5)+'</text>').join('')+'<text x="'+pad.l+'" y="12" class="chart-axis">'+man(max)+'</text></svg>';
}
function renderTrend(d){
 if(!$('dash-trend'))return;
 const h=store.hist,key=jr.trendKey||'ev';
 const head='<div class="card-heading"><h3>자산 추이</h3><div class="seg" role="group" aria-label="추이 지표"><button class="seg-btn" data-trend="ev" aria-pressed="'+(key==='ev')+'" type="button">평가금액</button><button class="seg-btn" data-trend="pl" aria-pressed="'+(key==='pl')+'" type="button">순평가손익</button></div></div>';
 if(d.demo){html('dash-trend',head+empty('예시에서는 추이를 기록하지 않습니다.'));return;}
 if(h.length<2){html('dash-trend',head+empty('접속할 때마다 하루 한 번 전체 자산이 기록됩니다. 2일 이상 쌓이면 그래프가 나타납니다.'+(h.length?' (현재 '+h.length+'일 기록)':'')));return;}
 const a=h[0][key],b=h[h.length-1][key];
 html('dash-trend',head+trendChart(h,key)+'<p class="caption" style="margin-top:8px">'+h[0].d+' → '+h[h.length-1].d+' · '+(key==='ev'?'평가금액':'순평가손익')+' '+signed(b-a)+'원 · 입출금·매매가 포함된 전체 자산 기준입니다.</p>');
}

/* ---------- 백업 ---------- */
function renderBackup(d){
 if(!$('backup-panel'))return;
 html('backup-panel','<h3>백업과 내보내기</h3><p class="caption">보유 데이터·목표 비중·거래 일지·자산 추이를 파일로 저장해 두세요. 복원하면 서버의 해당 데이터가 교체됩니다.</p><div class="field-row" style="margin-top:12px"><button class="button" id="bk-json" type="button"'+(d.demo?' disabled':'')+'>전체 백업(JSON)</button><button class="button" id="bk-csv" type="button"'+(d.demo?' disabled':'')+'>보유 현황(CSV)</button><label class="button file-button">백업 복원<input id="bk-file" type="file" accept="application/json,.json" hidden'+(d.demo?' disabled':'')+'></label><span id="bk-note" class="save-note" role="status"></span></div>');
}
function download(name,type,text){const a=document.createElement('a'),u=URL.createObjectURL(new Blob([text],{type}));a.href=u;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),2000);}
function backupJson(){return JSON.stringify({app:'wolsong-portfolio',version:3,exportedAt:new Date().toISOString(),data:last&&last.raw,targets:store.targets,journal:store.journal,hist:store.hist},null,1);}
function backupCsv(){const cols=['구분','소유자','증권사','계좌성격','계좌','자산','종목','코드','수량','매입단가','현재가','매입금액(원)','평가금액(원)','제비용(원)','순평가손익(원)'],q=v=>{v=v==null?'':String(v);return /[",\n]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v;};
 return'﻿'+[cols.join(',')].concat(last.all.map(h=>[h.o,h.on,h.b,h.t,h.a,h.m,h.n,h.symbol||h.k||'',h.cash?'':h.q,h.cash?'':h.bp,h.cash?'':h.p,h.buy,h.ev,h.cash?'':h.fee,h.cash?'':Math.round(h.ev-h.buy-h.fee)].map(q).join(','))).join('\n');}
async function restore(file){
 try{const j=JSON.parse(await file.text());if(!j||j.app!=='wolsong-portfolio'||!j.data||!Array.isArray(j.data.rows))throw new Error('format');
  if(!confirm('서버의 보유 데이터와 일지·목표·추이를 이 백업('+(j.exportedAt||'').slice(0,10)+')으로 교체합니다. 계속할까요?'))return;
  await ctx.api('/data',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(j.data)});
  if(j.targets)await kvSet('targets',j.targets);if(Array.isArray(j.journal))await kvSet('journal',j.journal);if(Array.isArray(j.hist))await kvSet('hist',j.hist);
  note('bk-note','복원했습니다. 화면을 새로 불러옵니다…');setTimeout(()=>location.reload(),900);
 }catch(e){note('bk-note','백업 파일을 읽지 못했습니다. 이 앱에서 내려받은 JSON인지 확인해 주세요.',true);}
}

/* ---------- 공통 렌더 ---------- */
function renderAll(d){
 last=d;
 renderRb(d);renderDiv(d);renderTax(d);renderJournal(d);renderTrend(d);renderBackup(d);
 html('dash-rb',rbAlerts(d));html('dash-dv',dashDiv(d));
 if(!d.demo&&storeReady&&div.state==='idle')fetchDiv(d);
 if(d.demo&&div.state!=='demo'){div.state='demo';renderDiv(d);html('dash-dv',dashDiv(d));}
}
async function afterQuote(q){
 if(!ctx||ctx.demo||q.demo||!q.updated)return;
 if(!storeReady&&storeLoading)await storeLoading;
 const s=snapshot(q.all),h=store.hist,l=h[h.length-1];
 if(l&&l.d===s.d){if(l.ev===s.ev&&l.pl===s.pl)return;if(Date.now()-histSaved<600000)return;h[h.length-1]=s;}else h.push(s);
 if(h.length>900)h.splice(0,h.length-900);
 histSaved=Date.now();await kvSet('hist',h);if(last)renderTrend(last);
}
function clearAll(){
 ['dash-trend','dash-rb','dash-dv','rb-controls','rb-table','rb-foot','dv-tiles','dv-chart','dv-table','dv-note','tx-inputs','tx-tiles','tx-table','tx-notes','jr-form','jr-list','backup-panel'].forEach(id=>html(id,''));
 ctx=null;last=null;storeReady=false;storeLoading=null;
 store={targets:{last:{basis:'m',band:5},sets:{}},journal:[],hist:[]};rb={basis:'m',mode:'full',band:5,inflow:0};tax={deduction:2500000,rate:22,realized:0,picked:new Set()};div={state:'idle',data:{},at:null,err:'',key:''};jr={editing:null,filter:'',kind:''};histSaved=0;
}
function start(c){
 ctx=c;storeReady=false;div={state:c.demo?'demo':'idle',data:{},at:null,err:'',key:''};jr={editing:null,filter:'',kind:''};tax.picked=new Set();
 storeLoading=(c.demo?Promise.resolve():loadStore()).then(()=>{storeReady=true;if(last){last.syms=last.syms;renderAll(last);}});
}

/* ---------- 이벤트 ---------- */
const root=document;
root.addEventListener('change',e=>{
 const t=e.target;if(!last)return;
 if(t.id==='rb-basis'){rb.basis=t.value;renderRbControls();renderRb(last);}
 else if(t.id==='rb-mode'){rb.mode=t.value;renderRbControls();renderRb(last);}
 else if(t.id==='rb-band'){rb.band=Math.max(1,Number(t.value)||5);renderRb(last);}
 else if(t.id==='rb-inflow'){rb.inflow=Math.max(0,Number(t.value)||0);renderRb(last);}
 else if(t.classList.contains('rb-t')){const name=decodeURIComponent(t.dataset.name),v=t.value===''?null:Math.max(0,Math.min(100,Number(t.value)||0)),tg=rbTargets();if(v===null)delete tg[name];else tg[name]=v;renderRb(last);}
 else if(t.id==='tx-ded'){tax.deduction=Math.max(0,Number(t.value)||0);renderTax(last);}
 else if(t.id==='tx-rate'){tax.rate=Math.max(0,Number(t.value)||0);renderTax(last);}
 else if(t.id==='tx-real'){tax.realized=Number(t.value)||0;renderTax(last);}
 else if(t.classList.contains('tx-pick')){if(t.checked)tax.picked.add(t.dataset.id);else tax.picked.delete(t.dataset.id);renderTax(last);}
 else if(t.id==='jr-fk'){jr.kind=t.value;renderJournal(last);}
 else if(t.id==='bk-file'&&t.files&&t.files[0]){restore(t.files[0]);t.value='';}
});
root.addEventListener('input',e=>{
 const t=e.target;if(!last)return;
 if(t.id==='jr-fq'){jr.filter=t.value.trim();const pos=t.selectionStart;renderJournal(last);const n=$('jr-fq');if(n){n.focus();try{n.setSelectionRange(pos,pos);}catch(x){}}}
 else if(t.classList&&t.classList.contains('rb-t')){const tg=rbTargets();tg[decodeURIComponent(t.dataset.name)]=Number(t.value)||0;const s=$('rb-sum');if(s)s.textContent=+Object.values(tg).reduce((n,v)=>n+(Number(v)||0),0).toFixed(1);}
});
root.addEventListener('click',async e=>{
 const t=e.target.closest('button');if(!t||!last)return;
 if(t.dataset.openTab){const b=$('tb-'+t.dataset.openTab);if(b){b.click();b.scrollIntoView({block:'nearest',inline:'center'});}return;}
 if(t.id==='rb-fill'){const items=rbItems(last.rows),tg=rbTargets(),tot=items.reduce((n,i)=>n+i.ev,0);items.forEach(i=>{tg[i.name]=tot?+(i.ev/tot*100).toFixed(1):0;});renderRb(last);}
 else if(t.id==='rb-save'){store.targets.last={basis:rb.basis,band:rb.band};const ok=await kvSet('targets',store.targets);note('rb-note',ok?'목표를 저장했습니다.':'서버 저장에 실패했습니다.',!ok);html('dash-rb',rbAlerts(last));}
 else if(t.id==='tx-all'){taxRows(last).forEach(h=>tax.picked.add(h.id));renderTax(last);}
 else if(t.id==='tx-gain'){tax.picked=new Set(taxRows(last).filter(h=>h.ev-h.buy-h.fee>0).map(h=>h.id));renderTax(last);}
 else if(t.id==='tx-loss'){tax.picked=new Set(taxRows(last).filter(h=>h.ev-h.buy-h.fee<0).map(h=>h.id));renderTax(last);}
 else if(t.id==='tx-none'){tax.picked=new Set();renderTax(last);}
 else if(t.id==='dv-retry'){div.state='idle';div.key='';fetchDiv(last);}
 else if(t.id==='jr-save')saveJournalEntry();
 else if(t.id==='jr-cancel'){jr.editing=null;jr.dirtyForm=null;renderJournal(last);}
 else if(t.dataset.jrEdit){jr.editing=Number(t.dataset.jrEdit);jr.dirtyForm=null;renderJournal(last);$('jr-form').scrollIntoView({block:'start'});}
 else if(t.dataset.jrDel){if(confirm('이 기록을 삭제할까요?')){store.journal=store.journal.filter(x=>x.id!==Number(t.dataset.jrDel));const ok=await kvSet('journal',store.journal);renderJournal(last);note('jr-note',ok?'삭제했습니다.':'서버 저장에 실패했습니다.',!ok);}}
 else if(t.dataset.trend){jr.trendKey=t.dataset.trend;renderTrend(last);}
 else if(t.id==='bk-json'){download('portfolio-backup-'+todayKST()+'.json','application/json',backupJson());note('bk-note','백업 파일을 내려받았습니다.');}
 else if(t.id==='bk-csv'){download('portfolio-holdings-'+todayKST()+'.csv','text/csv;charset=utf-8',backupCsv());note('bk-note','CSV를 내려받았습니다.');}
});

window.PFX={start,render:renderAll,afterQuote,clear:clearAll};
})();
