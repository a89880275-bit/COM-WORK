import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {authenticatedClient} from './auth-client.mjs';
test('누적 엑셀의 과거 주차 보류도 검증·저장하고 상태 매핑으로 예정이 되지 않는다',async()=>{
 const dir=await fs.mkdtemp(path.resolve('tmp/held-upload-test-')),base='http://127.0.0.1:14351';
 const child=spawn(process.execPath,['server.mjs'],{env:{...process.env,PORT:'14351',IT_DATA_DIR:dir},stdio:['ignore','pipe','pipe']});await new Promise((r,j)=>{child.stdout.once('data',r);child.once('error',j);});
 try{
  const client=authenticatedClient(base),csv='주간구분,제목,담당자,상태,접수일,완료일,내용\n1월1주,보류 대상,김도형,보류,미정,추후,원본 유지\n10월5주,이번주 업무,김도형,진행,2026-10-29,,정상\n10월4주,다른 주차,김도형,진행,2026-10-21,,제외';
  const upload=await(await client(base+'/api/upload',{method:'POST',headers:{'X-File-Name':encodeURIComponent('2026년 10월 5주차.csv')},body:Buffer.from(csv)})).json();
  const post=(url,value)=>client(base+url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(value)});
  const response=await post('/api/upload/validate',{id:upload.id,sheets:['CSV'],period:'2026-10-30',weeklyOnly:true,weekLabel:'10월5주',commonHeader:1,commonMap:{week:0,title:1,assignees:2,status:3,created:4,completed:5,description:6},statusText:'보류=예정'});assert.equal(response.status,200);const validation=await response.json();assert.equal(validation.rows.length,2);const held=validation.rows.find(r=>r.input.title==='보류 대상');assert.equal(held.input.status,'보류');assert.equal(held.error,'');assert.equal(held.raw[4],'미정');
  const commit=await post('/api/upload/commit',{id:upload.id,revision:validation.revision,choices:Object.fromEntries(validation.rows.map(r=>[r.key,{action:'new'}]))});assert.equal(commit.status,200);
  const data=JSON.parse(await fs.readFile(path.join(dir,'work-data.json'),'utf8'));assert.equal(data.works.length,2);assert.equal(data.works.find(w=>w.title==='보류 대상').status,'보류');
 }finally{const stopped=new Promise(r=>child.once('exit',r));child.kill();await stopped;}
});
