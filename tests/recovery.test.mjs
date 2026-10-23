import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../web/checkout.js',import.meta.url),'utf8');
const translations=readFileSync(new URL('../web/recovery-text.js',import.meta.url),'utf8');
async function setup({callback=false,paid=false,fail=false}={}) {
 const elements=Object.fromEntries(['status','details','payButton','payment-diagnostics'].map(id=>[id,{textContent:'',classList:{add(){},remove(){}},addEventListener(e,fn){this.click=fn;}}]));
 let creates=0;const calls=[];
 const context={console,URLSearchParams,AbortSignal,Date,setTimeout,clearTimeout,location:{search:'?token=secret&lang=fa'},navigator:{language:'en'},document:{getElementById:id=>elements[id]},addEventListener(){},confirm:()=>true,FOP_CONFIG:{SUPABASE_URL:'https://test',SUPABASE_ANON_KEY:'public'},
 Pi:{init:async()=>{},authenticate:async(scopes,cb)=>{if(callback)cb({identifier:'pi1'});return {accessToken:'access'};},createPayment:async()=>{creates++;}},
 fetch:async(url,init)=>{
 const body=init.body?JSON.parse(init.body):null;calls.push({url,body});
 if(!body)return Response.json({status:'approved',hasLinkedPayment:true,amountPi:11,plan:'max'});
 if(fail)return Response.json({error:'pi_unavailable'},{status:502});
 return Response.json(paid?{ok:true}:body.cancel?{ok:true,cancelled:true}:{ok:true,awaitingConfirmation:true,paymentId:'pi1'});
 }};context.window=context;vm.createContext(context);vm.runInContext(translations,context);vm.runInContext(source,context);
 await new Promise(r=>setImmediate(r));return {elements,calls,get creates(){return creates;}};
}
test('linked unpaid payment becomes cancellable; rapid repeated clicks send one cancellation',async()=>{
 const f=await setup();await f.elements.payButton.click();assert.equal(f.creates,0);
 assert.equal(f.elements.payButton.disabled,false);assert.match(f.elements.payButton.textContent,/لغو/);
 await Promise.all([f.elements.payButton.click(),f.elements.payButton.click()]);
 assert.equal(f.calls.filter(c=>c.body?.cancel).length,1);assert.equal(f.elements.payButton.disabled,true);
});
test('incomplete callback before authentication is recovered after identity is available',async()=>{
 const f=await setup({callback:true});await f.elements.payButton.click();
 const request=f.calls.find(c=>c.body);assert.equal(request.body.accessToken,'access');assert.equal(request.body.paymentId,'pi1');assert.equal(f.creates,0);
});
test('paid linked session completes recovery without new payment',async()=>{
 const f=await setup({paid:true});await f.elements.payButton.click();assert.match(f.elements.status.textContent,/Payment completed/);assert.equal(f.creates,0);
});
test('provider error leaves retry enabled instead of deadlocking',async()=>{
 const f=await setup({fail:true});await f.elements.payButton.click();assert.equal(f.elements.payButton.disabled,false);assert.equal(f.creates,0);
});
