import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {emptyStore,createWork,updateWork,candidates,hasDocumentNumber} from '../lib.mjs';
import {authenticatedClient} from './auth-client.mjs';
const settings=emptyStore().settings,input={title:'내부 업무',assignees:[{team:'시스템',name:'김도형'}],category:'기타',status:'예정',created:'2026-10-01',activityDate:'2026-10-02',description:'요청 내용'};
test('빈 문서번호·내부문서는 서로 다른 자동번호를 부여하고 재수정 시 번호를 유지한다',()=>{
 const works=['','내부문서',' 내부 문서 '].map(externalId=>createWork({...input,externalId},settings));
 assert.equal(new Set(works.map(w=>w.externalId)).size,3);for(const w of works){assert.match(w.externalId,/^INT-2026-[A-F0-9]{32}$/);for(const incoming of ['',undefined,'내부문서'])assert.equal(updateWork(w,{...input,externalId:incoming},settings).externalId,w.externalId);}
 const real=createWork({...input,externalId:'일산차병원-2026-00001'},settings);assert.equal(real.externalId,'일산차병원-2026-00001');assert.equal(updateWork(real,{...input,externalId:'내부문서'},settings).externalId,real.externalId);
 const legacy={...works[0],externalId:'내부문서'};assert.match(updateWork(legacy,input,settings).externalId,/^INT-2026-/);
});
test('내부문서는 ID 중복으로 판단하지 않고 제목·내용 일치를 계속 확인한다',()=>{
 const old={...input,id:'old',externalId:'내부문서'};assert.equal(hasDocumentNumber('내부 문서'),false);assert.deepEqual(candidates({...input,title:'다른 추가개발',externalId:'내부문서'},[old]),[]);assert.equal(candidates({...input,externalId:''},[old]).length,1);
});
test('문서번호를 매핑한 엑셀 업로드의 빈칸·내부문서에는 저장 시 자동번호를 부여한다',async()=>{
 const dir=await fs.mkdtemp(path.resolve('tmp/auto-document-test-')),base='http://127.0.0.1:14354';
 const child=spawn(process.execPath,['server.mjs'],{env:{...process.env,PORT:'14354',IT_DATA_DIR:dir},stdio:['ignore','pipe','pipe']});await new Promise((r,j)=>{child.stdout.once('data',r);child.once('error',j);});
 try{
  const client=authenticatedClient(base),post=(url,value)=>client(base+url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(value)});
  const csv='제목,담당자,상태,등록일,문서번호,상세내용\n내부 요청1,김도형,예정,2026-10-01,,내용1\n내부 요청2,김도형,예정,2026-10-01,내부문서,내용2\n공식 요청,김도형,예정,2026-10-01,기관-2026-001,내용3';
  const upload=await(await client(base+'/api/upload',{method:'POST',headers:{'X-File-Name':encodeURIComponent('문서번호.csv')},body:Buffer.from(csv)})).json();
  const validation=await(await post('/api/upload/validate',{id:upload.id,sheets:['CSV'],period:'2026-10-30',weeklyOnly:false,commonHeader:1,commonMap:{title:0,assignees:1,status:2,created:3,externalId:4,description:5}})).json();assert.equal(validation.rows.length,3);
  const committed=await post('/api/upload/commit',{id:upload.id,revision:validation.revision,choices:Object.fromEntries(validation.rows.map(r=>[r.key,{action:'new'}]))});assert.equal(committed.status,200);
  const data=JSON.parse(await fs.readFile(path.join(dir,'work-data.json'),'utf8'));assert.match(data.works[0].externalId,/^INT-2026-/);assert.match(data.works[1].externalId,/^INT-2026-/);assert.notEqual(data.works[0].externalId,data.works[1].externalId);assert.equal(data.works[2].externalId,'기관-2026-001');
  const htmlInput={...input,htmlDocument:true,htmlFilename:'내부.html',externalId:'내부문서'};assert.equal((await post('/api/works',htmlInput)).status,201);assert.equal((await post('/api/works',{...htmlInput,title:'다른 내부업무'})).status,201);
 }finally{const stopped=new Promise(r=>child.once('exit',r));child.kill();await stopped;}
});
