import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {Store} from '../src/store.js';
import {validateModelPayload,validateManualCandidate,validateNotes} from '../src/validation.js';

test('storage failures before and after rename preserve truthful state and close handles', async () => {
 for (const phase of ['file-sync','rename','directory-open','directory-sync']) {
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'meeting-fault-'));
  const s=new Store(dir);await s.init();await s.saveNotes('Old source',0);
  const originalOpen=fs.open,originalRename=fs.rename;let opened=0,closed=0;
  fs.open=async (name,...args)=>{
   if(name===dir&&phase==='directory-open')throw Error('injected directory-open');
   const h=await originalOpen(name,...args);opened++;
   const sync=h.sync.bind(h),close=h.close.bind(h);
   h.sync=async()=>{if((name===dir&&phase==='directory-sync')||(name!==dir&&phase==='file-sync'))throw Error('injected sync');return sync();};
   h.close=async()=>{try{return await close();}finally{closed++;}};return h;
  };
  fs.rename=async(...args)=>{if(phase==='rename')throw Error('injected rename');return originalRename(...args);};
  let error;
  try{await s.saveNotes('New source',1);}catch(e){error=e;}
  finally{fs.open=originalOpen;fs.rename=originalRename;}
  assert(error,phase);assert.equal(opened,closed,phase+' handle leak');
  const committed=phase.startsWith('directory');
  assert.equal(error.code,committed?'storage_durability_uncertain':'storage_failure');
  const restarted=new Store(dir);await restarted.init();
  assert.deepEqual(s.snapshot(),restarted.snapshot(),phase+' memory vs disk');
  assert.equal(s.snapshot().notes.text,committed?'New source':'Old source');
  if(committed){assert.deepEqual(error.committedState,s.snapshot());assert.match(error.message,/committed/);assert.doesNotMatch(error.message,/preserved/);}
  await s.saveNotes('Next valid save',committed?2:1);
  assert.equal(s.snapshot().notes.text,'Next valid save');
  assert.deepEqual((await fs.readdir(dir)).sort(),['state.json']);
  await fs.rm(dir,{recursive:true});
 }
});
test('manual and model dates validate actual calendar days including leap years',()=>{
 for(const date of [['2026-01-01'], {}, 20260101, '2026-99-99','2026-02-29','2026-04-31','0000-01-01','next week']){
  assert.throws(()=>validateManualCandidate({action:'Review',owner:'',dueDate:date}),/calendar/);
  if (typeof date !== 'string') continue;
  const text='Review by '+date;
  const r=validateModelPayload({tasks:[{action:'Review',sourceLineId:'L0001',sourceQuote:text,owner:null,dueDate:{value:date,evidence:date}}]},{lines:validateNotes(text)});
  assert.equal(r.accepted[0].dueDate,null);assert.equal(r.accepted[0].warnings.length,1);
 }
 for(const date of ['2024-02-29','2000-02-29','2026-04-30','0099-01-01'])assert.equal(validateManualCandidate({action:'Review',owner:'',dueDate:date}).dueDate,date);
 assert.throws(()=>validateManualCandidate({action:'Review',owner:'',dueDate:'1900-02-29'}),/calendar/);
});


