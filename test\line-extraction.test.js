import test from 'node:test';
import assert from 'node:assert/strict';
import { extractWithOllama, LINE_LIMITS } from '../src/ollama.js';
import { validateModelPayload, makeLines } from '../src/validation.js';
const notes = text => ({lines:makeLines(text)});
const reply = (candidate, done=true) => new Response(JSON.stringify({done,response:JSON.stringify({candidate})}));
const candidate = (id='L0001', text='Jordan will check rollback; no deadline was set.') => ({action:'Check rollback',sourceLineId:id,sourceQuote:text,owner:{value:'Jordan',evidence:'Jordan'},dueDate:null});

test('per-line exact binding, duplicate preservation, blank skipping and no invented deadline', async()=>{
 const text='Jordan will check rollback; no deadline was set.';
 const n=notes(text+'\n\n'+text);const bodies=[];
 const r=await extractWithOllama(n,async(url,init)=>{const b=JSON.parse(init.body);bodies.push(b);assert.equal(url,'http://127.0.0.1:11434/api/generate');
 const prop=b.format.properties.candidate.anyOf[1].properties;return reply(candidate(prop.sourceLineId.const,prop.sourceQuote.const));});
 assert.equal(r.tasks.length,2);assert.equal(r.calls,2);assert.equal(r.partial,false);
 assert.deepEqual(r.tasks.map(t=>t.sourceLineId),['L0001','L0003']);
 assert(r.tasks.every(t=>t.dueDate===null));assert(bodies.every(b=>b.model==='gemma4:26b-a4b-it-qat'&&b.options.num_predict===700));
 assert.equal(validateModelPayload(r,n).accepted.length,2);
});
test('malformed/incomplete/invalid source output gets at most one shorter retry, no JSON repair',async()=>{
 for(const bad of [new Response('{bad'),new Response(JSON.stringify({done:false,response:'{"candidate":null}'})),new Response(JSON.stringify({done:true,response:'{"candidate":'})),reply(candidate('L0099')),reply({...candidate(),sourceQuote:'invented'})]){
  let calls=0;const budgets=[];
  const r=await extractWithOllama(notes(candidate().sourceQuote),async(u,i)=>{calls++;budgets.push(JSON.parse(i.body).options.num_predict);return bad.clone();});
  assert.equal(calls,2);assert.deepEqual(budgets,[700,450]);assert.equal(r.tasks.length,0);assert.equal(r.partial,true);assert.equal(r.lineResults[0].attempts,2);assert.equal(r.lineResults[0].errors.length,2);
 }
});
test('successful shorter retry retains failed-attempt evidence',async()=>{
 let calls=0;const r=await extractWithOllama(notes(candidate().sourceQuote),async()=>++calls===1?new Response('{'):reply(candidate()));
 assert.equal(r.tasks.length,1);assert.equal(r.partial,false);assert.equal(r.lineResults[0].errors.length,1);
});
test('explicit no-action is distinct from provider failure; failures do not silently omit later lines',async()=>{
 const n=notes('No action.\n'+candidate().sourceQuote+'\nProvider unavailable.');let calls=0;
 const r=await extractWithOllama(n,async()=>{calls++;if(calls===1)return reply(null);if(calls===2)return reply(candidate('L0002'));throw Error('private connection details');});
 assert.deepEqual(r.lineResults.map(x=>x.status),['no_action','candidate','failed']);assert.equal(r.partial,true);assert.equal(r.tasks.length,1);assert.equal(calls,3);assert(!JSON.stringify(r).includes('private connection'));
});
test('hard line and call bounds expose every unprocessed source line',async()=>{
 let calls=0;const r=await extractWithOllama(notes(Array(32).fill('Check item.').join('\n')+'\n'+'x'.repeat(501)),async()=>{calls++;return new Response('{');});
 assert.equal(calls,LINE_LIMITS.calls);assert.equal(r.lineResults.length,33);assert.equal(r.lineResults[30].code,'call_limit');assert.equal(r.lineResults[32].code,'line_too_long');assert(r.partial);
});
test('unsupported deadline is cleared, exact evidence remains required',async()=>{
 const c=candidate();c.dueDate={value:'2026-11-01',evidence:'no deadline was set'};
 const n=notes(c.sourceQuote);const r=await extractWithOllama(n,async()=>reply(c));const checked=validateModelPayload(r,n);
 assert.equal(checked.accepted[0].dueDate,null);assert.equal(checked.accepted[0].warnings.length,1);
});
test('overall deadline and concurrency bound are enforced, remaining lines disclosed',async()=>{
 const realNow=Date.now;let now=realNow();Date.now=()=>now;
 let release;const pending=extractWithOllama(notes('Check one.\nCheck two.'),()=>new Promise(resolve=>{release=resolve;}));
 try{
  await assert.rejects(extractWithOllama(notes('Other.')),e=>e.code==='provider_busy');
  now+=120001;release(reply(null));const r=await pending;
  assert.equal(r.calls,1);assert.equal(r.lineResults[1].code,'overall_timeout');assert(r.partial);
 }finally{Date.now=realNow;}
});
