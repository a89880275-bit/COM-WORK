import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
test('로그인·비밀번호 변경·관리자 초기화·팀장 서버 쓰기 차단',async()=>{
 const dir=await fs.mkdtemp(path.resolve('tmp/auth-test-')),base='http://127.0.0.1:14330';
 const child=spawn(process.execPath,['server.mjs'],{env:{...process.env,PORT:'14330',IT_DATA_DIR:dir},stdio:['ignore','pipe','pipe']});
 await new Promise((resolve,reject)=>{child.stdout.once('data',resolve);child.once('error',reject);});
 try{
 assert.equal((await fetch(base+'/api/state')).status,401);
 const login=async(name,password)=>{const r=await fetch(base+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,password})});return {response:r,cookie:r.headers.get('set-cookie')?.split(';')[0]};};
 assert.equal((await login('김도형','오류')).response.status,401);
 const admin=await login('이창주','1');let state=await(await fetch(base+'/api/state',{headers:{Cookie:admin.cookie}})).json();assert.equal(state.currentUser.role,'admin');assert.equal(state.auth,undefined);assert.ok(!JSON.stringify(state).includes('salt'));
 const call=(url,session,token,data,method='POST')=>fetch(base+url,{method,headers:{Cookie:session.cookie,'X-IT-Token':token,'Content-Type':'application/json'},body:JSON.stringify(data)});
 assert.equal((await call('/api/settings',admin,state.token,{...state.settings,teamLeaderName:'테스트팀장'},'PUT')).status,200);
 const leader=await login('테스트팀장','1');const ls=await(await fetch(base+'/api/state',{headers:{Cookie:leader.cookie}})).json();assert.equal(ls.currentUser.role,'leader');
 for(const route of ['/api/works','/api/upload','/api/reports','/api/notices','/api/auth/reset'])assert.equal((await call(route,leader,ls.token,{})).status,403);
 const staff=await login('김도형','1'),ss=await(await fetch(base+'/api/state',{headers:{Cookie:staff.cookie}})).json();assert.equal(ss.currentUser.role,'staff');assert.equal((await call('/api/auth/reset',staff,ss.token,{name:'황진솔'})).status,403);
 const change=await call('/api/auth/password',staff,ss.token,{currentPassword:'1',newPassword:'새비밀번호'});assert.equal(change.status,200);assert.equal((await login('김도형','1')).response.status,401);assert.equal((await login('김도형','새비밀번호')).response.status,200);assert.equal((await fetch(base+'/api/state',{headers:{Cookie:staff.cookie}})).status,401);
 assert.equal((await call('/api/auth/reset',admin,state.token,{name:'김도형'})).status,200);assert.equal((await login('김도형','1')).response.status,200);
 assert.equal((await call('/api/auth/password',leader,ls.token,{currentPassword:'1',newPassword:'팀장비밀번호'})).status,200);
 const stored=JSON.parse(await fs.readFile(path.join(dir,'work-data.json'),'utf8'));assert.ok(stored.auth['김도형'].hash);assert.ok(!JSON.stringify(stored.auth).includes('새비밀번호'));
 }finally{child.kill();}
});
