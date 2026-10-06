(function(){
'use strict';
const $=id=>document.getElementById(id),CFG=window.APP_CONFIG||{},TABS=['dash','acct','stock','allocation','rebalance','dividend','tax','risk','trade','journal','quality'];
const labels={on:'소유자',o:'구분',b:'증권사',t:'계좌성격',m:'자산'};
let H=[],issues=[],asof='',rawData=null,symsMap={},currentPin='',demo=false,loaded=false,timer=null,generation=0,pendingLoad=null,pendingQuote=null,busy=false;
let quoteState={at:null,updated:0,error:'',rates:{KRW:1}},sel={on:'',o:'',b:'',t:'',m:''},query='',sortKey='ev',sortDir=-1,detailKey=null,allOpen=false;
const won=n=>Number.isFinite(n)?Math.round(n).toLocaleString('ko-KR'):'—';
const number=n=>n===null||!Number.isFinite(n)?'—':n.toLocaleString('ko-KR',{maximumFractionDigits:6});
const signed=n=>(n>0?'+':n<0?'−':'')+won(Math.abs(n));
const pct=n=>n===null||!Number.isFinite(n)?'—':(n>0?'+':n<0?'−':'')+Math.abs(n).toFixed(2)+'%';
const percent=n=>(Number.isFinite(n)?n:0).toFixed(1)+'%';
const cls=n=>n>0?'up':n<0?'down':'';
const esc=v=>String(v==null?'':v).replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]));
const stamp=t=>t?new Date(t).toLocaleString('ko-KR',{timeZone:'Asia/Seoul',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false})+' KST':'미제공';
const html=(id,s)=>{$(id).innerHTML=s;};
const empty=s=>'<div class="empty">'+esc(s)+'</div>';
const selected=()=>H.filter(h=>Object.keys(sel).every(k=>!sel[k]||h[k]===sel[k]));
const tile=(label,value,note='',className='')=>'<div class="tile '+className+'"><div class="tile-label">'+esc(label)+'</div><div class="tile-value">'+value+'</div><div class="tile-note">'+esc(note)+'</div></div>';
const money=n=>won(n)+'<span class="unit">원</span>';
const signMoney=n=>'<span class="'+cls(n)+'">'+signed(n)+'<span class="unit">원</span></span>';
const stockButton=s=>'<button class="stock-button" type="button" data-stock="'+esc(encodeURIComponent(s.key))+'">'+esc(s.n)+'</button>';
function quality(rows){const invest=rows.filter(h=>!h.cash&&!h.bond&&!h.fixed),received=invest.filter(h=>h.attempt==='수신'),valued=invest.filter(h=>h.source==='quote');return{total:invest.length,received:received.length,valued:valued.length,pending:invest.length-received.length,unmapped:invest.filter(h=>!h.symbol).length,halt:invest.filter(h=>h.halt).length};}
function initializeFilters(){Object.keys(sel).forEach(k=>{const options=[...new Set(H.map(h=>h[k]))].sort((a,b)=>k==='b'?(PF.brokerRank(a)-PF.brokerRank(b)||a.localeCompare(b,'ko')):a.localeCompare(b,'ko'));html('filter-'+k,'<option value="">전체</option>'+options.map(v=>'<option value="'+esc(v)+'">'+esc(v)+'</option>').join(''));$('filter-'+k).value=sel[k];});}
function sourceText(h){if(h.cash)return'현금 · 기준자료';if(h.halt)return'거래정지 · 기준자료';if(h.bond)return'채권 · 증권사 평가금액';if(h.fixed)return'계좌 합산 · 증권사 평가금액';return h.source==='quote'?(h.symbol.startsWith('KR:')?'네이버 시세':'Yahoo 시세'):'증권사 기준자료';}
function overview(rows,T,list){
 html('tiles',tile('총 평가금액',money(T.ev),'계좌 '+T.accounts+'개 · 합산 종목 '+T.n+'개','featured')+tile('투자 원금',money(T.inv),'현금 제외 · 매입금액')+tile('순평가손익',signMoney(T.pl),T.unknownFee?'제비용 미확인 '+T.unknownFee+'건':'입력 제비용 반영')+tile('평가수익률','<span class="'+cls(T.r)+'">'+pct(T.r)+'</span>','순평가손익 ÷ 투자 원금')+tile('현금성 자산',money(T.cash),'총자산 중 '+percent(T.ev?T.cash/T.ev*100:0)));
 const top=[...list].sort((a,b)=>b.ev-a.ev),top3=top.slice(0,3).reduce((n,s)=>n+s.ev,0),Q=quality(rows);
 html('dash-brief',rows.length?'<strong>'+T.accounts+'개 계좌 · '+T.n+'개 종목</strong><span>투자자산 '+percent(T.ev?T.invEv/T.ev*100:0)+' · 현금 '+percent(T.ev?T.cash/T.ev*100:0)+'</span><span>시세 반영 '+Q.received+'/'+Q.total+'건'+(demo?' · 예시 기준자료':' · 기준자료 '+esc(asof))+'</span>':empty('선택한 범위에 보유 데이터가 없습니다. 필터를 초기화해 주세요.'));
 const allocations=PF.allocation(rows,'m'),colors=['var(--c1)','var(--c2)','var(--c3)','#a58953','#6276a1'];
 let offset=0;const stops=allocations.map((a,i)=>{const from=offset;offset+=a.w;return colors[i%colors.length]+' '+from+'% '+offset+'%';});
 html('dash-allocation',T.ev?'<div class="donut-layout"><div class="donut" role="img" aria-label="'+esc(allocations.map(a=>a.name+' '+percent(a.w)).join(', '))+'" style="background:conic-gradient('+stops.join(',')+')"><div class="donut-center"><strong>'+allocations.length+'</strong><span>자산 구분</span></div></div><div class="allocation-legend">'+allocations.map((a,i)=>'<div class="legend-row"><span class="label"><i class="swatch" style="background:'+colors[i%colors.length]+'"></i>'+esc(a.name)+'</span><b>'+percent(a.w)+'</b></div>').join('')+'</div></div><p class="caption" style="margin-top:17px">현금 포함 · 원화 평가금액 기준</p>':empty('평가금액이 없습니다.'));
 html('dash-risk','<div class="metric-list"><div><span>최대 종목<small>'+esc(top[0]?top[0].n:'보유 종목 없음')+'</small></span><strong>'+percent(T.invEv&&top[0]?top[0].ev/T.invEv*100:0)+'</strong></div><div><span>상위 '+Math.min(3,top.length)+'종목 비중<small>투자자산 중 평가금액</small></span><strong>'+percent(T.invEv?top3/T.invEv*100:0)+'</strong></div><div><span>현금성 자산<small>전체 자산 대비</small></span><strong>'+percent(T.ev?T.cash/T.ev*100:0)+'</strong></div></div>');
 html('dash-quality','<div class="health-number"><strong>'+Q.received+'</strong><span class="caption">/ '+Q.total+'건 시세 반영</span></div><div class="progress" aria-hidden="true"><i style="width:'+(Q.total?Q.received/Q.total*100:0)+'%"></i></div><p class="caption">'+(demo?'예시의 평가금액은 가상 기준자료입니다.':'최근 요청 '+stamp(quoteState.at))+'</p><ul class="checklist"><li><span>기준자료·이전 수신가 유지</span><strong>'+Q.pending+'건</strong></li><li><span>심볼 미연결</span><strong>'+Q.unmapped+'건</strong></li><li><span>거래정지</span><strong>'+Q.halt+'건</strong></li></ul>');
 function movers(id,title,arr){html(id,'<div class="card-heading"><h3>'+title+'</h3><span class="caption">계좌 간 합산</span></div>'+(arr.length?arr.map(s=>'<div class="mover"><div>'+stockButton(s)+'<div class="subline">'+esc(s.symbol||s.rows[0].k||'코드 미확인')+' · '+new Set(s.rows.map(h=>h.accountKey)).size+'개 계좌</div></div><div class="num '+cls(s.pl)+'"><strong>'+signed(s.pl)+'원</strong><div class="subline '+cls(s.r)+'">'+pct(s.r)+'</div></div></div>').join(''):empty('해당 종목이 없습니다.')));}
 movers('gain','수익 기여 상위 5',list.filter(s=>s.pl>0).sort((a,b)=>b.pl-a.pl).slice(0,5));movers('loss','손실 기여 상위 5',list.filter(s=>s.pl<0).sort((a,b)=>a.pl-b.pl).slice(0,5));
 renderMatrix(rows);
}
function renderMatrix(rows){
 if(!rows.length){html('matrix',empty('해당 계좌가 없습니다.'));return;}
 const brokers=[...new Set(rows.map(h=>h.b))],types=[...new Set(rows.map(h=>h.t))];
 let s='<table><thead><tr><th scope="col">증권사</th>'+types.map(t=>'<th scope="col" class="num">'+esc(t)+'</th>').join('')+'<th scope="col" class="num">합계</th></tr></thead><tbody>';
 brokers.forEach(b=>{const br=rows.filter(h=>h.b===b);s+='<tr><th scope="row">'+esc(b)+'</th>'+types.map(t=>'<td class="num">'+won(PF.sum(br.filter(h=>h.t===t)).ev)+'</td>').join('')+'<td class="num"><strong>'+won(PF.sum(br).ev)+'</strong></td></tr>';});
 s+='<tr class="summary-row"><th scope="row">합계</th>'+types.map(t=>'<td class="num">'+won(PF.sum(rows.filter(h=>h.t===t)).ev)+'</td>').join('')+'<td class="num">'+won(PF.sum(rows).ev)+'</td></tr></tbody></table>';html('matrix',s);
}
function holdingTable(rows,includeAccount=false){
 return'<table><thead><tr>'+(includeAccount?'<th scope="col">계좌</th>':'<th scope="col">종목</th>')+'<th scope="col" class="num">수량</th><th scope="col" class="num">매입단가</th><th scope="col" class="num">현재가</th><th scope="col" class="num">매입금액(원)</th><th scope="col" class="num">평가금액(원)</th><th scope="col" class="num">제비용(원)</th><th scope="col" class="num">순평가손익(원)</th><th scope="col" class="num">수익률</th></tr></thead><tbody>'+rows.map(h=>{
 const pl=h.ev-h.buy-h.fee,r=h.buy>0?pl/h.buy*100:null,unit=h.pk==='KRW'?'KRW':h.currency||h.pk||'통화 미확인';
 return'<tr><td>'+(includeAccount?esc(h.b+' · '+h.t)+'<div class="subline">'+esc(h.o+' · '+h.on+' · '+h.a)+'</div>':esc(h.n)+'<div class="subline">'+esc(h.symbol||h.k||'코드 미확인')+' · '+esc(sourceText(h))+'</div>')+'</td><td class="num">'+(h.cash?'—':number(h.q))+'</td><td class="num">'+(h.cash?'—':number(h.bp)+'<div class="subline">'+esc(unit)+'</div>')+'</td><td class="num">'+(h.cash?'—':number(h.p)+'<div class="subline">'+esc(unit)+'</div>')+'</td><td class="num">'+won(h.buy)+'</td><td class="num">'+won(h.ev)+'</td><td class="num">'+(h.cash?'—':h.missingFee?'미확인':won(h.fee))+'</td><td class="num '+cls(pl)+'">'+(h.cash?'—':signed(pl))+'</td><td class="num '+cls(r)+'">'+(h.cash?'—':pct(r))+'</td></tr>';}).join('')+'</tbody></table>';
}
function accounts(rows,T){
 html('account-summary',tile('계좌 수',T.accounts+'<span class="unit">개</span>','보유 데이터 기준')+tile('평가금액',money(T.ev),'현금 포함')+tile('투자 원금',money(T.inv),'현금 제외')+tile('순평가손익',signMoney(T.pl),'입력 제비용 반영'));
 const open=new Set([...document.querySelectorAll('details.account[open]')].map(e=>e.dataset.account));
 const map=new Map();rows.forEach(h=>{if(!map.has(h.accountKey))map.set(h.accountKey,[]);map.get(h.accountKey).push(h);});
 html('accts',map.size?[...map].map(([key,items])=>{const h=items[0],g=PF.sum(items),encoded=encodeURIComponent(key);return'<details class="account" data-account="'+esc(encoded)+'"'+(allOpen||open.has(encoded)?' open':'')+'><summary><div><div class="account-title">'+esc(h.b+' · '+h.t)+'</div><div class="subline">'+esc(h.o+' · '+h.on+' · '+h.a)+'</div></div><div class="num"><strong>'+won(g.ev)+'원</strong><div class="subline '+cls(g.pl)+'">'+(g.inv? signed(g.pl)+'원 · '+pct(g.r):'투자 원금 없음')+'</div></div></summary><div class="table-scroll">'+holdingTable(items)+'</div></details>';}).join(''):empty('선택한 범위에 해당하는 계좌가 없습니다.'));
}
function stocks(rows,T,list){
 let found=list.map(s=>({...s,w:T.ev?s.ev/T.ev*100:0})).filter(s=>!query||[s.n,s.symbol,s.rows[0].k].join(' ').toLowerCase().includes(query.toLowerCase()));
 found.sort((a,b)=>{const av=a[sortKey],bv=b[sortKey];if(av===null)return bv===null?0:1;if(bv===null)return-1;return sortDir*(typeof av==='string'?av.localeCompare(bv,'ko'):av-bv);});
 const th=(key,label)=>'<th scope="col"'+(key!=='n'?' class="num"':'')+(sortKey===key?' aria-sort="'+(sortDir===1?'ascending':'descending')+'"':'')+'><button class="sort-button" data-sort="'+key+'" type="button">'+label+(sortKey===key?(sortDir===1?' ↑':' ↓'):'')+'</button></th>';
 html('stocks',found.length?'<table><thead><tr>'+th('n','종목')+th('ev','평가금액(원)')+th('w','총자산 비중')+th('pl','순평가손익(원)')+th('r','수익률')+th('buy','매입금액(원)')+th('q','수량')+'</tr></thead><tbody>'+found.map(s=>'<tr><td>'+stockButton(s)+'<div class="subline">'+esc(s.symbol||s.rows[0].k||'코드 미확인')+' · '+esc(s.currency||'통화 미확인')+'</div><div class="subline">'+new Set(s.rows.map(h=>h.accountKey)).size+'개 계좌 · '+esc(s.m)+'</div></td><td class="num"><strong>'+won(s.ev)+'</strong></td><td class="num">'+percent(T.ev?s.ev/T.ev*100:0)+'</td><td class="num '+cls(s.pl)+'">'+signed(s.pl)+'</td><td class="num '+cls(s.r)+'">'+pct(s.r)+'</td><td class="num">'+won(s.buy)+'</td><td class="num">'+(s.quantityKnown?number(s.q):'미확인')+'</td></tr>').join('')+'</tbody></table>':empty(query?'검색 결과가 없습니다. 검색어를 확인해 주세요.':'선택한 범위에 투자 종목이 없습니다.'));
 renderDetail(list,T);
}
function renderDetail(list,T){
 const s=list.find(x=>x.key===detailKey);$('stock-detail').hidden=!s;if(!s){html('stock-detail','');return;}
 const sources=new Set(s.rows.map(h=>sourceText(h)));
 html('stock-detail','<div class="detail-heading"><div><div class="eyebrow">HOLDING DETAIL</div><h3>'+esc(s.n)+'</h3><p class="caption">'+esc(s.symbol||s.rows[0].k||'코드 미확인')+' · '+esc(s.currency||'통화 미확인')+' · '+esc(s.m)+'</p></div><button class="text-button" id="close-detail" type="button">상세 닫기</button></div><div class="mini-tiles">'+tile('합산 평가금액',money(s.ev),'총자산 중 '+percent(T.ev?s.ev/T.ev*100:0))+tile('매입금액',money(s.buy),'기준자료의 원화 매입금액')+tile('순평가손익',signMoney(s.pl),'입력 제비용 '+won(s.fee)+'원')+tile('평가수익률','<span class="'+cls(s.r)+'">'+pct(s.r)+'</span>',s.quantityKnown?'합산 '+number(s.q)+'주':'일부 수량 미확인')+'</div><div class="detail-facts"><span>가격 출처: '+esc([...sources].join(' · '))+'</span><span>최근 가격 기준: '+esc(stamp(Math.max(...s.rows.map(h=>h.quoteTime||0))))+'</span></div><div class="table-scroll">'+holdingTable(s.rows,true)+'</div><p class="caption" style="margin-top:13px">개별 보유분의 단가 통화와 원화 평가금액을 구분합니다. 평균매입단가는 계좌별 취득환율이 없어 합산하지 않습니다.</p>');
}
function allocationPanel(id,title,rows,key,note=''){
 const items=PF.allocation(rows,key);html(id,'<h3>'+title+'</h3>'+(items.length?items.map(a=>'<div class="allocation-line"><div class="allocation-line-head"><strong>'+esc(a.name)+'</strong><span class="num">'+won(a.ev)+'원 · '+percent(a.w)+'</span></div><div class="progress" aria-hidden="true"><i style="width:'+Math.max(0,Math.min(a.w,100))+'%"></i></div><div class="allocation-meta"><span>'+a.accounts+'개 계좌 · '+a.n+'개 종목</span><span class="'+cls(a.pl)+'">'+signed(a.pl)+'원 · '+pct(a.r)+'</span></div></div>').join(''):empty('선택한 범위에 데이터가 없습니다.'))+(note?'<p class="caption" style="margin-top:13px">'+note+'</p>':''));
}
function allocations(rows){allocationPanel('alloc-market','국내·해외·현금',rows,'m');allocationPanel('alloc-owner','개인·법인',rows,'o');allocationPanel('alloc-broker','증권사별',rows,'b');allocationPanel('alloc-type','계좌성격별',rows,'t');allocationPanel('alloc-currency','종목 표시통화별',rows.map(h=>({...h,currency:h.currency||'미확인'})),'currency','원화 평가금액으로 비교합니다. 국내 상장 해외 ETF의 기초자산 통화·환헤지 여부는 이 구분에 반영되지 않습니다.');}
function risk(rows,T,list){
 const winners=list.filter(s=>s.pl>0).length,losers=list.filter(s=>s.pl<0).length,top=[...list].sort((a,b)=>b.ev-a.ev);
 html('risk-summary',tile('수익 종목',winners+'<span class="unit">개</span>','합산 순평가손익 > 0')+tile('손실 종목',losers+'<span class="unit">개</span>','합산 순평가손익 < 0')+tile('입력 제비용',money(T.fee),T.unknownFee?'미확인 '+T.unknownFee+'건 제외':'보유분에 입력된 비용')+tile('비용 차감 전 손익',signMoney(T.invEv-T.inv),'평가금액 − 매입금액'));
 html('concentration','<h3>상위 종목 집중도</h3>'+(top.length?top.slice(0,5).map((s,i)=>'<div class="allocation-line"><div class="allocation-line-head"><span>'+String(i+1).padStart(2,'0')+' · '+stockButton(s)+'</span><strong>'+percent(T.invEv?s.ev/T.invEv*100:0)+'</strong></div><div class="progress" aria-hidden="true"><i style="width:'+(T.invEv?s.ev/T.invEv*100:0)+'%"></i></div><p class="caption">'+won(s.ev)+'원 · 투자자산 기준</p></div>').join(''):empty('투자 종목이 없습니다.'))+'<p class="caption" style="margin-top:13px">같은 종목의 여러 계좌 보유분을 합산합니다. ETF 간 기초자산 중복은 포함하지 않습니다.</p>');
 const byProfit=[...list].sort((a,b)=>Math.abs(b.pl)-Math.abs(a.pl));
 html('contribution','<h3>종목별 손익 기여</h3>'+(byProfit.length?'<div class="table-scroll"><table><thead><tr><th scope="col">종목</th><th scope="col" class="num">순평가손익(원)</th><th scope="col" class="num">수익률 기여</th></tr></thead><tbody>'+byProfit.map(s=>'<tr><td>'+stockButton(s)+'</td><td class="num '+cls(s.pl)+'">'+signed(s.pl)+'</td><td class="num '+cls(s.pl)+'">'+(T.inv?(s.pl/T.inv*100>0?'+':'')+(s.pl/T.inv*100).toFixed(2)+'%p':'—')+'</td></tr>').join('')+'</tbody></table></div>':empty('투자 종목이 없습니다.'))+'<p class="caption" style="margin-top:13px">순평가손익 ÷ 전체 투자 원금. 각 종목 기여의 합이 전체 평가수익률입니다.</p>');
 scenario(T);
}
function scenario(T=PF.sum(selected())){const shock=Number($('shock').value)/100,change=-T.invEv*shock,ev=T.ev+change,pl=T.pl+change;$('shock-label').textContent='−'+Math.round(shock*100)+'%';html('scenario',tile('예상 평가금액',money(ev),'일괄 가격 하락 가정')+tile('현재 대비 변화',signMoney(change),'현금성 자산은 유지')+tile('가정 후 순평가손익',signMoney(pl),'현재 원금·비용 고정'));}
function dataQuality(rows,T){
 const Q=quality(rows),excluded=issues.filter(i=>i.excluded).length;
 html('quality-summary',tile('시세 반영',Q.received+' / '+Q.total+'<span class="unit">건</span>','최근 요청에서 재평가한 보유행')+tile('기준자료·이전 수신가',Q.pending+'<span class="unit">건</span>','평가금액 유지')+tile('심볼 미연결',Q.unmapped+'<span class="unit">건</span>','종목별 코드 연결 확인')+tile('원본 데이터 점검',issues.length+'<span class="unit">건</span>','전체 원본 기준 · 합계 제외 '+excluded+'행'));
 const currencies=[...new Set(rows.filter(h=>!h.cash&&h.currency&&h.currency!=='KRW').map(h=>h.currency))];
 html('fx-panel','<h3>환율 수신 상태</h3><p class="caption">기준자료 '+esc(asof)+'</p><div class="metric-list">'+(currencies.length?currencies.map(c=>'<div><span>'+esc(c)+'/KRW<small>외화 1단위당 원화</small></span><strong>'+(quoteState.rates[c]?number(quoteState.rates[c])+'원':'미수신')+'</strong></div>').join(''):'<div><span>외화 투자종목</span><strong>없음</strong></div>')+'</div><p class="caption" style="margin-top:13px">'+(demo?'예시는 1 USD = 1,350원을 사용한 가상 기준자료입니다.':'최근 시세 요청 '+stamp(quoteState.at)+' · 환율 누락 시 해외 평가금액 유지')+'</p>'+(quoteState.error?'<p class="form-message">'+esc(quoteState.error)+'</p>':''));
 const warns=[...issues];rows.filter(h=>!h.cash&&!h.bond&&!h.fixed&&h.attempt!=='수신').forEach(h=>warns.push({name:h.n,message:h.attempt==='기준자료'?'시세 갱신 전 · 기준자료 유지':h.attempt}));
 html('issues-panel','<h3>확인할 항목</h3>'+(warns.length?'<ul class="issue-list">'+warns.map(i=>'<li><strong>'+esc(i.name)+'</strong><span class="caption">'+(i.row?'원본 '+i.row+'행 · ':'')+esc(i.message)+'</span></li>').join('')+'</ul>':empty('선택한 보유분에 점검 항목이 없습니다.'))+'<p class="caption" style="margin-top:13px">원본 오류는 전체 데이터 기준, 시세 상태는 선택한 범위 기준입니다.</p>');
 html('quote-table',rows.length?'<table><thead><tr><th scope="col">종목·계좌</th><th scope="col">심볼 / 통화</th><th scope="col">평가금액 출처</th><th scope="col">최근 요청 상태</th><th scope="col">가격 기준시각</th><th scope="col">수신시각</th><th scope="col" class="num">평가금액(원)</th></tr></thead><tbody>'+rows.map(h=>'<tr><td>'+esc(h.n)+'<div class="subline">'+esc(h.b+' · '+h.a)+'</div></td><td>'+esc(h.symbol||h.k||'미연결')+'<div class="subline">'+esc(h.currency||'통화 미확인')+'</div></td><td><span class="badge '+(h.source==='quote'?'ok':'neutral')+'">'+esc(sourceText(h))+'</span></td><td class="quality-status">'+esc(h.attempt)+'</td><td class="caption">'+(h.source==='quote'?stamp(h.quoteTime)+(h.timeBasis==='received'?'<div class="subline">수신 기준 · 거래시각 미제공</div>':''):esc(asof))+'</td><td class="caption">'+stamp(h.fetchedAt)+'</td><td class="num">'+won(h.ev)+'</td></tr>').join('')+'</tbody></table>':empty('해당 보유 데이터가 없습니다.'));
}
function render(){
 if(!loaded)return;const rows=selected(),T=PF.sum(rows),list=PF.aggregate(rows);
 const conditions=Object.keys(sel).filter(k=>sel[k]).map(k=>labels[k]+' '+sel[k]);$('filter-summary').textContent=conditions.length?conditions.join(' · '):'전체 자산';
 const excluded=issues.filter(i=>i.excluded).length;$('data-warning').hidden=!issues.length;$('data-warning').textContent=excluded?'원본 '+excluded+'행은 금액·형식 오류로 합계에서 제외했습니다. 표시 금액은 확인 가능한 데이터의 합계입니다. 데이터 점검 탭에서 확인해 주세요.':'원본 데이터 '+issues.length+'건 확인 필요 · 데이터 점검 탭에서 비용·수량·계좌 정보를 확인해 주세요.';if(!demo&&!H.length&&!issues.length){$('data-warning').hidden=false;$('data-warning').textContent=(PEOPLE_NAMES[person]||'')+(person==='all'?' 탭은 4개 탭의 데이터를 합산해 보여줍니다. 아직 입력된 데이터가 없습니다.':' 탭에는 아직 입력된 보유 데이터가 없습니다. 계좌 스캔 자료를 보내 주시면 반영합니다.');}
 overview(rows,T,list);accounts(rows,T);stocks(rows,T,list);allocations(rows);risk(rows,T,list);dataQuality(rows,T);
 if(window.PFX)PFX.render({rows,all:H,T,list,demo,syms:symsMap,rates:quoteState.rates,raw:rawData,asof});if(window.WTR)WTR.render({raw:rawData,rates:quoteState.rates,person,demo});if(window.WGRP)WGRP.render({all:H,person,demo});
}
function showTab(name,focus=false){if(!TABS.includes(name))name='dash';TABS.forEach(t=>{const on=t===name;$('tb-'+t).setAttribute('aria-selected',String(on));$('tb-'+t).tabIndex=on?0:-1;$('pn-'+t).hidden=!on;});try{localStorage.setItem('wsg_tab',name);}catch(e){}if(focus)$('tb-'+name).focus();}
function setStatus(t){$('status').textContent=t;}
async function request(path,options={},controller){const timeout=setTimeout(()=>controller.abort(),18000);try{const response=await fetch(CFG.api.replace(/\/$/,'')+path,{...options,signal:controller.signal});if(!response.ok){const err=new Error(response.status===401?'PIN이 맞지 않습니다.':response.status===404?'보유 데이터가 아직 준비되지 않았습니다.':'서버 응답 오류 ('+response.status+')');err.status=response.status;throw err;}return await response.json();}finally{clearTimeout(timeout);}}
let person=(()=>{try{return sessionStorage.getItem('wsg_person')||'tc';}catch(e){return 'tc';}})();
const PEOPLE_NAMES={tc:'월송티앤씨',co:'월송앤컴퍼니',mp:'문앤파인트리',hk:'한규자님',all:'월송그룹 통합'};
function showPeople(on){const n=$('people');if(!n)return;n.hidden=!on;n.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.p===person)));if(on&&!H.length)$('data-warning').textContent=PEOPLE_NAMES[person]+' 탭에는 아직 입력된 보유 데이터가 없습니다. 계좌 스캔 자료를 보내 주시면 반영합니다.';}
const xapi=(path,options={})=>request(path+(path.includes('?')?'&':'?')+'p='+person,{...options,headers:{...(options.headers||{}),'X-PIN':currentPin},cache:'no-store'},new AbortController());
async function refresh(){
 if(!loaded||demo||busy)return;
 if(!CFG.api){setStatus('시세 서버 미연결 · 현재 평가금액 유지');return;}
 const token=generation,controller=new AbortController();pendingQuote=controller;busy=true;$('refresh').disabled=true;setStatus('시세와 환율을 확인하는 중…');
 const symbols=[...new Set(H.filter(h=>!h.cash&&!h.halt&&h.symbol&&h.q!==null).map(h=>h.symbol))];
 const foreign=[...new Set(H.filter(h=>!h.cash&&h.currency&&h.currency!=='KRW').map(h=>h.currency+'KRW=X'))];
 const all=[...new Set([...foreign,...symbols])],quotes={};let batchErrors=0;
 try{
  // The existing proxy caps requests at 60 symbols. Batches include currencies only once.
  for(let start=0;start<all.length;start+=50){try{const data=await request('/quote?symbols='+encodeURIComponent(all.slice(start,start+50).join(',')),{cache:'no-store'},controller);if(data&&data.quotes&&typeof data.quotes==='object')Object.assign(quotes,data.quotes);else batchErrors++;}catch(err){if(controller.signal.aborted)throw err;batchErrors++;}}
  if(token!==generation)return;
  const now=Date.now(),out=PF.applyQuotes(H,quotes,now);H=out.rows;quoteState={at:now,updated:out.updated.length,rates:out.rates,error:batchErrors?'일부 시세 요청에 실패했습니다. 미수신 보유분은 현재 평가금액을 유지합니다.':''};
  const total=H.filter(h=>!h.cash).length;
  setStatus(out.updated.length?'최근 요청 '+stamp(now)+' · 시세 반영 '+out.updated.length+'/'+total+'건'+(batchErrors?' · 일부 요청 실패':''):symbols.length?'시세 미수신 · 현재 평가금액 유지':'연결된 시세 없음 · 기준자료 유지');
  render();if(window.PFX)PFX.afterQuote({all:H,demo,updated:out.updated.length});
 }catch(err){if(token===generation){quoteState.at=Date.now();quoteState.updated=0;quoteState.error=err.name==='AbortError'?'시세 응답시간을 초과했습니다.':'시세 서버에 연결하지 못했습니다.';H=H.map(h=>({...h,attempt:h.cash?'현금 · 기준자료':'갱신 실패 · 현재 값 유지',priceDelta:null}));setStatus('시세 갱신 실패 · 현재 평가금액 유지');render();}}
 finally{if(token===generation){busy=false;pendingQuote=null;$('refresh').disabled=false;}}
}
function start(data,isDemo){clearInterval(timer);timer=null;const normalized=PF.normalize(data);rawData=data;symsMap=normalized.syms||{};if(window.PFX)PFX.start({demo:isDemo,api:xapi});if(window.WTR)WTR.start({demo:isDemo,api:xapi,reload:()=>load(currentPin)});H=normalized.rows;issues=normalized.issues;asof=normalized.asof;demo=isDemo;loaded=true;quoteState={at:null,updated:0,error:'',rates:{KRW:1}};sel={on:'',o:'',b:'',t:'',m:''};query='';detailKey=null;allOpen=false;$('q').value='';$('toggleAll').textContent='모두 펼치기';$('gate').hidden=true;$('main').hidden=false;$('mode-label').hidden=!demo;$('demo-notice').hidden=!demo;$('lock').hidden=false;$('refresh').disabled=demo;$('refresh').title=demo?'예시는 가상 기준자료를 사용합니다.':'';initializeFilters();render();showPeople(!isDemo);setStatus(demo?'예시 데이터 · 시세 자동 갱신 안 함':'증권사 기준자료 '+asof);if(!demo){refresh();timer=setInterval(()=>{if(!document.hidden)refresh();},60000);}}
function clearSensitiveView(){for(const id of ['tiles','dash-brief','dash-allocation','dash-risk','dash-quality','gain','loss','matrix','account-summary','accts','stocks','stock-detail','alloc-market','alloc-owner','alloc-broker','alloc-type','alloc-currency','risk-summary','concentration','contribution','scenario','quality-summary','fx-panel','issues-panel','quote-table'])html(id,'');for(const k of Object.keys(sel))html('filter-'+k,'<option value="">전체</option>');$('data-warning').textContent='';$('filter-summary').textContent='전체 자산';$('q').value='';}
function lock(){generation++;currentPin='';if(window.PFX)PFX.clear();if(window.WTR)WTR.clear();if(window.WGRP)WGRP.render({all:[],person:'',demo:false});pendingLoad?.abort();pendingQuote?.abort();pendingLoad=null;pendingQuote=null;clearInterval(timer);timer=null;busy=false;loaded=false;demo=false;H=[];issues=[];asof='';detailKey=null;quoteState={at:null,updated:0,error:'',rates:{KRW:1}};try{localStorage.removeItem('wsg_pin');sessionStorage.removeItem('wsg_pin');}catch(e){}clearSensitiveView();showPeople(false);$('main').hidden=true;$('gate').hidden=false;$('mode-label').hidden=true;$('lock').hidden=true;$('refresh').disabled=true;$('refresh').title='';$('pin').value='';$('gmsg').textContent='';$('unlock').disabled=false;$('demo').disabled=false;setStatus('보유 데이터 대기');$('pin').focus();}
async function load(pin){
 if(!CFG.api)throw new Error('보유 데이터 서버가 설정되지 않았습니다.');
 const token=++generation,controller=new AbortController();pendingLoad?.abort();pendingLoad=controller;$('unlock').disabled=true;$('demo').disabled=true;$('gmsg').textContent='보유 데이터를 확인하는 중…';
 try{const d=await request('/data?p='+person,{headers:{'X-PIN':pin},cache:'no-store'},controller);if(token!==generation)return;currentPin=pin;start(d,false);try{sessionStorage.setItem('wsg_pin',pin);}catch(e){}$('pin').value='';$('gmsg').textContent='';}
 catch(err){if(token===generation){try{sessionStorage.removeItem('wsg_pin');}catch(e){}$('gmsg').textContent=err.name==='AbortError'?'응답시간을 초과했습니다. 다시 시도해 주세요.':err.message;}}
 finally{if(token===generation){pendingLoad=null;$('unlock').disabled=false;$('demo').disabled=false;}}
}
$('people').addEventListener('click',e=>{const b=e.target.closest('button[data-p]');if(!b||b.dataset.p===person||!currentPin)return;person=b.dataset.p;try{sessionStorage.setItem('wsg_person',person);}catch(x){}if(window.PFX)PFX.clear();showTab('dash');load(currentPin);});
$('gform').addEventListener('submit',e=>{e.preventDefault();const p=$('pin').value.trim();if(p)load(p);});
$('demo').addEventListener('click',()=>{generation++;showTab('dash');start(window.PF_DEMO,true);});$('demo-exit').addEventListener('click',lock);$('lock').addEventListener('click',lock);$('refresh').addEventListener('click',refresh);
Object.keys(sel).forEach(k=>$('filter-'+k).addEventListener('change',()=>{sel[k]=$('filter-'+k).value;render();}));
$('clear-filters').addEventListener('click',()=>{Object.keys(sel).forEach(k=>{sel[k]='';$('filter-'+k).value='';});render();});
$('q').addEventListener('input',()=>{query=$('q').value.trim();stocks(selected(),PF.sum(selected()),PF.aggregate(selected()));});
$('shock').addEventListener('input',()=>scenario());
$('toggleAll').addEventListener('click',()=>{allOpen=!allOpen;$('toggleAll').textContent=allOpen?'모두 접기':'모두 펼치기';document.querySelectorAll('details.account').forEach(d=>{d.open=allOpen;});});
$('main').addEventListener('click',e=>{const t=e.target.closest('button');if(!t)return;if(t.dataset.tab)showTab(t.dataset.tab);if(t.dataset.openTab){showTab(t.dataset.openTab,true);$('pn-'+t.dataset.openTab).scrollIntoView({block:'start'});}if(t.dataset.sort){if(sortKey===t.dataset.sort)sortDir=-sortDir;else{sortKey=t.dataset.sort;sortDir=sortKey==='n'?1:-1;}stocks(selected(),PF.sum(selected()),PF.aggregate(selected()));}if(t.dataset.stock){detailKey=decodeURIComponent(t.dataset.stock);showTab('stock');renderDetail(PF.aggregate(selected()),PF.sum(selected()));$('stock-detail').focus();$('stock-detail').scrollIntoView({block:'start'});}if(t.id==='close-detail'){detailKey=null;renderDetail([],PF.sum(selected()));$('q').focus();}});
 document.querySelector('.tabs').addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;const current=TABS.indexOf(document.querySelector('.tab[aria-selected="true"]').dataset.tab);const next=e.key==='Home'?0:e.key==='End'?TABS.length-1:(current+(e.key==='ArrowRight'?1:-1)+TABS.length)%TABS.length;e.preventDefault();showTab(TABS[next],true);});
let theme='light';try{theme=localStorage.getItem('wsg_theme')||'light';}catch(e){}function applyTheme(){document.documentElement.dataset.theme=theme;$('theme').textContent=theme==='dark'?'밝은 화면':'어두운 화면';}applyTheme();$('theme').addEventListener('click',()=>{theme=theme==='dark'?'light':'dark';applyTheme();try{localStorage.setItem('wsg_theme',theme);}catch(e){}});
try{showTab(localStorage.getItem('wsg_tab')||'dash');}catch(e){}
// Migrate the previous persistent PIN into this tab's session, then remove local storage.
let saved='';try{saved=sessionStorage.getItem('wsg_pin')||localStorage.getItem('wsg_pin')||'';localStorage.removeItem('wsg_pin');}catch(e){}
if(saved)load(saved);else $('pin').focus();
})();
