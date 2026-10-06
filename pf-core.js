/* Pure portfolio calculations. Stored values and costs use KRW. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.PF=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const numeric=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v));
const amount=v=>numeric(v)&&Number(v)>=0,positive=v=>numeric(v)&&Number(v)>0;
const text=(v,fallback='')=>v==null?fallback:String(v);
const BROKER_ORDER=['삼성','신한','한국투자','한투'];
const brokerRank=n=>{const i=BROKER_ORDER.findIndex(k=>String(n||'').includes(k));return i<0?99:(i===3?2:i);};
const accountKey=h=>JSON.stringify([h.o,h.on,h.b,h.t,h.a]);
function mapping(h,syms={}){const m=syms[h.n],mapped=Array.isArray(m)?m:[];let symbol=text(h.symbol||mapped[0]).trim();const code=text(h.k).trim();if(!h.symbol&&/^\d{6}$/.test(code)&&symbol&&!symbol.startsWith(code+'.')&&symbol!=='KR:'+code)symbol='';if(!h.symbol&&/^[A-Z][A-Z0-9.=-]{0,9}$/.test(code)&&symbol&&symbol!==code)symbol='';const currency=text(h.currency||mapped[1]||(h.m==='국내'?'KRW':'')).toUpperCase();return{symbol,currency};}
function normalize(data){
 if(!data||!Array.isArray(data.rows))throw new Error('보유 데이터 형식이 올바르지 않습니다.');
 const issues=[],rows=[],syms=data.syms&&typeof data.syms==='object'?data.syms:{};
 data.rows.forEach((raw,i)=>{
  if(!raw||typeof raw!=='object'){issues.push({row:i+1,name:'이름 없음',message:'행 형식 오류 · 합계 제외',excluded:true});return;}
  const cash=raw.cash===true||raw.cash===1;
  if(!text(raw.n).trim()||!amount(raw.ev)||(!cash&&!amount(raw.buy))){issues.push({row:i+1,name:text(raw.n,'이름 없음'),message:'이름·원금·평가금액 확인 필요 · 합계 제외',excluded:true});return;}
  const h={...raw,id:String(i),n:text(raw.n),o:text(raw.o,'미분류'),on:text(raw.on),b:text(raw.b,'미분류'),t:text(raw.t,'미분류'),a:text(raw.a,'계좌 미확인'),m:cash?'현금':text(raw.m,'미분류'),cash,halt:Boolean(raw.halt),ev:Number(raw.ev),buy:cash?Number(raw.ev):Number(raw.buy),q:amount(raw.q)?Number(raw.q):null,p:amount(raw.p)?Number(raw.p):null,bp:amount(raw.bp)?Number(raw.bp):null,fee:amount(raw.fee)?Number(raw.fee):0,missingFee:!cash&&!amount(raw.fee),snapshotEv:Number(raw.ev),snapshotPrice:amount(raw.p)?Number(raw.p):null,source:'snapshot',quoteTime:null,fetchedAt:null,attempt:'기준자료',priceDelta:null};
  Object.assign(h,mapping(h,syms));h.accountKey=accountKey(h);const code=text(h.k).trim(),validCode=/^[A-Za-z0-9][A-Za-z0-9.^=:/_-]{0,39}$/.test(code)&&!/^(unknown|null|undefined|n\/a|na|-)$/i.test(code);h.instrumentKey=JSON.stringify([h.symbol||(validCode?code:'unknown:'+i),h.currency,h.m]);
  if(!h.cash&&!h.bond&&!h.fixed&&h.q===null)issues.push({row:i+1,name:h.n,message:'수량 미확인 · 시세 재평가 제외'});
  if(h.missingFee)issues.push({row:i+1,name:h.n,message:'제비용 미확인 · 비용 0원 가정'});
  if(!text(raw.a))issues.push({row:i+1,name:h.n,message:'계좌 식별값 미확인'});rows.push(h);
 });rows.sort((x,y)=>brokerRank(x.b)-brokerRank(y.b));return{rows,issues,syms,asof:text(data.asof,'기준일 미제공')};
}
function sum(rows){const r={ev:0,inv:0,invEv:0,fee:0,cash:0,n:0,unknownFee:0},instruments=new Set(),accounts=new Set();rows.forEach(h=>{r.ev+=h.ev;accounts.add(h.accountKey);if(h.cash)r.cash+=h.ev;else{r.inv+=h.buy;r.invEv+=h.ev;r.fee+=h.fee;r.unknownFee+=Number(h.missingFee);instruments.add(h.instrumentKey);}});r.n=instruments.size;r.accounts=accounts.size;r.pl=r.invEv-r.inv-r.fee;r.r=r.inv>0?r.pl/r.inv*100:null;return r;}
function aggregate(rows){const map=new Map();rows.filter(h=>!h.cash).forEach(h=>{if(!map.has(h.instrumentKey))map.set(h.instrumentKey,{key:h.instrumentKey,n:h.n,symbol:h.symbol,currency:h.currency,m:h.m,rows:[],q:0,quantityKnown:true,buy:0,ev:0,fee:0});const s=map.get(h.instrumentKey);s.rows.push(h);s.q+=h.q||0;s.quantityKnown=s.quantityKnown&&h.q!==null;s.buy+=h.buy;s.ev+=h.ev;s.fee+=h.fee;});return[...map.values()].map(s=>({...s,pl:s.ev-s.buy-s.fee,r:s.buy>0?(s.ev-s.buy-s.fee)/s.buy*100:null}));}
function allocation(rows,key){const total=sum(rows).ev,map=new Map();rows.forEach(h=>{const k=text(h[key],'미분류');if(!map.has(k))map.set(k,[]);map.get(k).push(h);});return[...map].map(([name,items])=>{const s=sum(items);return{name,...s,w:total>0?s.ev/total*100:0};}).sort((a,b)=>key==='b'?(brokerRank(a.name)-brokerRank(b.name)||b.ev-a.ev):b.ev-a.ev);}
function applyQuotes(rows,quotes,fetchedAt=Date.now()){
 const rates={KRW:1},updated=[];
 Object.entries(quotes).forEach(([symbol,q])=>{const m=symbol.match(/^([A-Z]{3})KRW=X$/);if(m&&q&&positive(q.price)&&q.currency==='KRW')rates[m[1]]=Number(q.price);});
 const result=rows.map(old=>{const h={...old,priceDelta:null};if(h.cash){h.attempt='현금 · 기준자료';return h;}if(h.halt){h.attempt='거래정지 · 평가금액 유지';return h;}if(h.bond){h.attempt='채권 · 기준자료';return h;}if(h.fixed){h.attempt='계좌 합산 · 종목 상세 미입력';return h;}if(!h.symbol){h.attempt='심볼 미연결';return h;}if(h.q===null){h.attempt='수량 미확인';return h;}const q=quotes[h.symbol];if(!q||!positive(q.price)){h.attempt='시세 미수신';return h;}if(!h.currency||q.currency!==h.currency){h.attempt='통화 확인 필요';return h;}const rate=rates[h.currency];if(!positive(rate)){h.attempt='환율 미수신';return h;}const valuation=h.q*Number(q.price)*rate;if(!Number.isFinite(valuation)){h.attempt='평가금액 범위 오류';return h;}h.nativePrice=Number(q.price);h.p=h.pk==='KRW'?Number(q.price)*rate:Number(q.price);h.ev=Math.round(h.q*Number(q.price)*rate);h.source='quote';h.quoteTime=positive(q.time)?(Number(q.time)>1e12?Number(q.time):Number(q.time)*1000):null;h.timeBasis=h.symbol.startsWith('KR:')?'received':'exchange';h.fetchedAt=fetchedAt;h.attempt='수신';h.appliedRate=rate;if(positive(q.prev))h.priceDelta=h.q*(Number(q.price)-Number(q.prev))*rate;updated.push(h.id);return h;});return{rows:result,rates,updated};
}
return{numeric,amount,positive,normalize,sum,aggregate,allocation,applyQuotes,accountKey,brokerRank};
});
