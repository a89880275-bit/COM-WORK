import {authenticatedClient} from './auth-client.mjs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
test('팀장 이름 저장·재조회 및 기존 설정 요청 호환',async()=>{
 const dir=await fs.mkdtemp(path.resolve('tmp/leader-test-'));
 const child=spawn(process.execPath,['server.mjs'],{env:{...process.env,PORT:'14324',IT_DATA_DIR:dir},stdio:['ignore','pipe','pipe']});
 await new Promise((resolve,reject)=>{child.stdout.once('data',resolve);child.once('error',reject);});
 const base='http://127.0.0.1:14324';
 const clientFetch=authenticatedClient(base);try{const state=await(await clientFetch(base+'/api/state')).json();
 const save=data=>clientFetch(base+'/api/settings',{method:'PUT',headers:{'X-IT-Token':state.token,'Content-Type':'application/json'},body:JSON.stringify(data)});
 assert.equal((await save({...state.settings,teamLeaderName:'  테스트팀장  '})).status,200);
 assert.equal((await(await clientFetch(base+'/api/state')).json()).settings.teamLeaderName,'테스트팀장');
 const {teamLeaderName,...legacy}=state.settings;assert.equal((await save(legacy)).status,200);
 assert.equal((await(await clientFetch(base+'/api/state')).json()).settings.teamLeaderName,'테스트팀장');
 assert.equal((await save({...state.settings,teamLeaderName:'가'.repeat(51)})).status,400);
 const stored=JSON.parse(await fs.readFile(path.join(dir,'work-data.json'),'utf8'));assert.equal(stored.settings.teamLeaderName,'테스트팀장');
 }finally{child.kill();}
});
