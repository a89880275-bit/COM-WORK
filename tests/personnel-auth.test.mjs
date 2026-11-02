import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import {authenticatedClient} from './auth-client.mjs';
test('팀장 명단 생성·퇴사자 로그인 차단·기존 세션 종료·과거 업무 유지',async()=>{
 const dir=await fs.mkdtemp(path.resolve('tmp/personnel-test-')),base='http://127.0.0.1:14331';
 const child=spawn(process.execPath,['server.mjs'],{env:{...process.env,PORT:'14331',IT_DATA_DIR:dir},stdio:['ignore','pipe','pipe']});await new Promise((resolve,reject)=>{child.stdout.once('data',resolve);child.once('error',reject);});
 try{
 const client=authenticatedClient(base),post=(url,data,method='POST')=>client(base+url,{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
 const created=await(await post('/api/works',{title:'과거 담당자 업무',assignees:[{team:'시스템',name:'김도형'}],category:'기타',status:'진행',created:'2026-10-01',activityDate:'2026-10-02'})).json();
 const login=(name,password='1')=>fetch(base+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,password})});
 const staff=await login('김도형'),cookie=staff.headers.get('set-cookie').split(';')[0];
 assert.equal((await post('/api/settings/personnel',{teamLeaderName:'이기영',departedNames:['김도형']},'PUT')).status,200);
 const users=await(await fetch(base+'/api/auth/users')).json();assert.ok(users.users.some(u=>u.name==='이기영'&&u.role==='leader'));assert.ok(!users.users.some(u=>u.name==='김도형'));
 assert.equal((await login('김도형')).status,401);assert.equal((await fetch(base+'/api/state',{headers:{Cookie:cookie}})).status,401);assert.equal((await login('이기영')).status,200);
 const state=await(await client(base+'/api/state')).json();assert.equal(state.accounts.find(u=>u.name==='김도형').departed,true);assert.ok(state.works.some(w=>w.id===created.id));assert.ok(state.settings.people['시스템'].includes('김도형'));
 assert.equal((await post('/api/settings/personnel',{teamLeaderName:'이기영',departedNames:['이창주']},'PUT')).status,400);
 assert.equal((await post('/api/settings/personnel',{teamLeaderName:'이기영',departedNames:[]},'PUT')).status,200);assert.equal((await login('김도형')).status,200);
 }finally{child.kill();}
});
