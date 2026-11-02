import {authenticatedClient} from './auth-client.mjs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
test('과거 완료 기간 반영·중복 원본 연결·멱등성·되돌리기',async()=>{
 const dir=await fs.mkdtemp(path.resolve('tmp/history-test-')),base='http://127.0.0.1:14321';
 const child=spawn(process.execPath,['server.mjs'],{env:{...process.env,PORT:'14321',IT_DATA_DIR:dir},stdio:['ignore','pipe','pipe']});
 await new Promise((resolve,reject)=>{child.stdout.once('data',resolve);child.once('error',reject);});
 try{
 const clientFetch=authenticatedClient(base);const state=await (await clientFetch(base+'/api/state')).json();
 async function post(url,data,headers={}){const r=await clientFetch(base+url,{method:'POST',headers:{'X-IT-Token':state.token,'Content-Type':'application/json',...headers},body:Buffer.isBuffer(data)?data:JSON.stringify(data)});return await r.json();}
 const csv=Buffer.from('제목,담당자,상태,접수일,완료일,내용\n동일업무,김도형,완료,2026-02-01,2026-02-03,처리내용\n동일업무,김도형,완료,2026-02-01,2026-02-03,처리내용\n기간외,김도형,완료,2026-10-01,2026-10-03,처리내용\n');
 async function validate(){const up=await post('/api/upload',csv,{'X-File-Name':'history.csv','X-Import-Mode':'historical-completed'});const v=await post('/api/upload/validate',{id:up.id,sheets:['CSV'],commonHeader:1,commonMap:{title:0,assignees:1,status:2,created:3,completed:4,description:5},period:'2026-09-30',completionFrom:'2026-01-01',completionTo:'2026-09-30'});return {up,v};}
 const {up,v}=await validate();assert.equal(v.rows.length,2);
 const choices={[v.rows[0].key]:{action:'new'},[v.rows[1].key]:{action:'link',targetRow:v.rows[0].key}};
 const batch=await post('/api/upload/commit',{id:up.id,revision:v.revision,choices});assert.equal(batch.scope,'completed:2026-01-01:2026-09-30');assert.equal(batch.changes.length,1);
 let after=await (await clientFetch(base+'/api/state')).json();assert.equal(after.works.length,1);assert.equal(after.works[0].activities.length,2);assert.equal(after.works[0].activities[0].date,'2026-02-03');
 const again=await validate();assert.match((await post('/api/upload/commit',{id:again.up.id,revision:again.v.revision,choices})).error,/이미 반영/);
 assert.equal((await post('/api/rollback/'+batch.id,{})).ok,true);after=await (await clientFetch(base+'/api/state')).json();assert.equal(after.works.length,0);
 }finally{child.kill();}
});
