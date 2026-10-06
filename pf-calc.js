/* Pure helpers for rebalancing, dividend estimates and capital-gain tax simulation (KRW). */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.PFC=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const num=v=>Number.isFinite(Number(v))?Number(v):0;
const KST=9*3600;
/* rows → [{name, ev}] grouped by basis ('m','t','b','o' or 'stock'); cash is its own item for 'stock' */
function group(rows,basis){const map=new Map();rows.forEach(h=>{const name=basis==='stock'?(h.cash?'현금성 자산':h.n):String(h[basis]||'미분류');map.set(name,(map.get(name)||0)+num(h.ev));});return[...map].map(([name,ev])=>({name,ev})).sort((a,b)=>b.ev-a.ev);}
/* targets: {name: percent}. mode 'full' = rebalance by selling/buying; 'inflow' = buy-only with new money. */
function rebalance(items,targets,opt={}){
 const mode=opt.mode==='inflow'?'inflow':'full',band=num(opt.band)||5,inflow=Math.max(0,num(opt.inflow));
 const total=items.reduce((n,i)=>n+num(i.ev),0),tsum=items.reduce((n,i)=>n+Math.max(0,num(targets[i.name])),0);
 const rows=items.map(i=>{const t=Math.max(0,num(targets[i.name])),tn=tsum>0?t/tsum:0,w=total>0?num(i.ev)/total*100:0;return{name:i.name,ev:num(i.ev),w,target:t,tn,drift:w-tn*100};});
 if(mode==='full'){rows.forEach(r=>{r.adj=tsum>0?Math.round(r.tn*total-r.ev):0;r.flag=tsum>0&&Math.abs(r.drift)>=band;});}
 else{
  const newTotal=total+inflow;let need=0;rows.forEach(r=>{r.need=Math.max(0,r.tn*newTotal-r.ev);need+=r.need;});
  rows.forEach(r=>{let buy=need>0?r.need*Math.min(1,inflow/need):0;if(need>0&&need<inflow)buy+=(inflow-need)*r.tn;if(need===0&&tsum>0)buy=inflow*r.tn;r.adj=Math.round(buy);r.flag=tsum>0&&Math.abs(r.drift)>=band;});
 }
 return{rows,total,targetSum:tsum,mode,band};
}
/* items: [{t: unixSeconds, a: amountPerShare}] — trailing-12-month sum, count and last payment */
function ttm(items,nowSec,days=365){const from=nowSec-days*86400,list=(items||[]).filter(x=>x&&num(x.t)>=from&&num(x.t)<=nowSec+86400&&num(x.a)>0);return{sum:list.reduce((n,x)=>n+num(x.a),0),count:list.length,last:list.length?Math.max(...list.map(x=>num(x.t))):null,list};}
/* amount per calendar month (index 0..11, Korea time) from the same trailing-12-month list */
function byMonth(list,mult){const out=Array(12).fill(0);(list||[]).forEach(x=>{const d=new Date((num(x.t)+KST)*1000);out[d.getUTCMonth()]+=num(x.a)*mult;});return out;}
/* Overseas capital-gain tax: gain = selected unrealized gain (KRW) + realized gain already booked this year */
function capGainTax({gain=0,realized=0,deduction=2500000,rate=0.22}={}){const net=num(gain)+num(realized),taxable=Math.max(0,net-num(deduction)),tax=Math.round(taxable*num(rate));return{net,taxable,tax,room:Math.max(0,num(deduction)-net)};}
return{group,rebalance,ttm,byMonth,capGainTax};
});
