import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import {authenticatedClient} from './auth-client.mjs';
test('관리자 선택 삭제·복구, 권한 차단, 동시 변경 검사와 파일 보존',async()=>{
 const dir=await fs.mkdtemp(path.resolve('tmp/delete-test-')),base='http://127.0.0.1:14347';
 const child=spawn(process.execPath,['server.mjs'],{env:{...process.env,PORT:'14347',IT_DATA_DIR:dir},stdio:['ignore','pipe','pipe']});
 await new Promise((resolve,reject)=>{child.stdout.once('data',resolve);child.once('error',reject);});
 try{
  const client=authenticatedClient(base),state=async()=>await(await client(base+'/api/state')).json();
  const post=(url,data)=>client(base+url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
  const work=await(await post('/api/works',{title:'삭제 및 복구 검증',assignees:[{team:'시스템',name:'김도형'}],category:'기타',status:'진행',created:'2026-10-01',activityDate:'2026-10-02'})).json();
  let current=await state();
  const login=await fetch(base+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'김시섭',password:'1'})});
  const cookie=login.headers.get('set-cookie').split(';')[0],staff=await(await fetch(base+'/api/state',{headers:{Cookie:cookie}})).json();
  const denied=await fetch(base+'/api/works/delete-selected',{method:'POST',headers:{Cookie:cookie,'Content-Type':'application/json','X-IT-Token':staff.token},body:JSON.stringify({ids:[work.id],revision:current.revision})});assert.equal(denied.status,403);
  assert.equal((await post('/api/works/delete-selected',{ids:[work.id],revision:current.revision-1})).status,400);
  assert.equal((await post('/api/works/delete-selected',{ids:[work.id,'missing'],revision:current.revision})).status,400);assert.equal((await state()).works.length,1);
  assert.equal((await post('/api/works/delete-selected',{ids:[work.id],revision:current.revision})).status,200);
  current=await state();assert.equal(current.works.length,0);assert.equal(current.deletedWorks.length,1);assert.deepEqual(current.deletedWorks[0].work,work);
  const disk=JSON.parse(await fs.readFile(path.join(dir,'work-data.json'),'utf8'));assert.equal(disk.deletedWorks.length,1);assert.ok(disk.audit.some(v=>v.action.includes('업무 선택 삭제')));
  const staffAfter=await(await fetch(base+'/api/state',{headers:{Cookie:cookie}})).json();assert.deepEqual(staffAfter.deletedWorks,[]);
  assert.equal((await post('/api/works/restore-selected',{ids:[current.deletedWorks[0].id],revision:current.revision})).status,200);
  current=await state();assert.deepEqual(current.works,[work]);assert.equal(current.deletedWorks.length,0);
  const ownLogin=await fetch(base+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'김도형',password:'1'})});
  const ownCookie=ownLogin.headers.get('set-cookie').split(';')[0],ownState=await(await fetch(base+'/api/state',{headers:{Cookie:ownCookie}})).json();
  const ownPost=(url,data)=>fetch(base+url,{method:'POST',headers:{Cookie:ownCookie,'Content-Type':'application/json','X-IT-Token':ownState.token},body:JSON.stringify(data)});
  assert.equal((await ownPost('/api/works/delete-selected',{ids:[work.id],revision:ownState.revision})).status,200);
  current=await state();assert.equal(current.works.length,0);assert.equal(current.deletedWorks[0].deletedBy,'김도형');
  assert.equal((await ownPost('/api/works/restore-selected',{ids:[current.deletedWorks[0].id],revision:current.revision})).status,403);

 }finally{const stopped=new Promise(r=>child.once('exit',r));child.kill();await stopped;}
});
