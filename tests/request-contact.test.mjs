import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import {authenticatedClient} from './auth-client.mjs';
import {emptyStore,createWork,updateWork,selectWorks,periodFlow,validateExcelMapping} from '../lib.mjs';
import {buildMonthlyServiceReport} from '../monthly-report.mjs';
test('현업담당자 등록·수정·명시적 삭제·미입력 보존·검색·보고서 연결',()=>{
 const settings=emptyStore().settings,input={title:'현업 요청',assignees:[{team:'시스템',name:'김도형'}],category:'기타',status:'진행',created:'2026-10-01',activityDate:'2026-10-02',requestContact:'현업홍길동'};
 const w=createWork(input,settings);assert.equal(w.requestContact,'현업홍길동');
 const {requestContact,...rest}=input;assert.equal(updateWork(w,rest,settings).requestContact,'현업홍길동');assert.equal(updateWork(w,{...rest,requestContact:''},settings).requestContact,'');
 const filters={from:'2026-10-01',to:'2026-10-31',asOf:'2026-10-31',q:'현업홍길동'};assert.equal(selectWorks([w],filters).length,1);assert.equal(periodFlow([w],filters).rows.length,1);
 const store=emptyStore();store.works=[w];assert.equal(buildMonthlyServiceReport(store,'2026-10','2026-11-04').detailRows[0].values[6],'현업홍길동');
 assert.equal(validateExcelMapping({header:1,map:{title:0,assignees:1,requestContact:4}}).map.requestContact,4);
});
test('엑셀 공통 매핑 저장과 업로드 확정 후 현업담당자를 파일에 보관한다',async()=>{
 const dir=await fs.mkdtemp(path.resolve('tmp/contact-test-')),base='http://127.0.0.1:14350';
 const child=spawn(process.execPath,['server.mjs'],{env:{...process.env,PORT:'14350',IT_DATA_DIR:dir},stdio:['ignore','pipe','pipe']});await new Promise((r,j)=>{child.stdout.once('data',r);child.once('error',j);});
 try{
  const client=authenticatedClient(base),post=(url,value,method='POST')=>client(base+url,{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(value)});
  const preset={header:1,map:{title:0,assignees:1,status:2,created:3,requestContact:4,description:5},assigneeSource:'column',kind:'개발업무',statusText:''};assert.equal((await post('/api/settings/excel-mapping',preset,'PUT')).status,200);
  const uploaded=await client(base+'/api/upload',{method:'POST',headers:{'X-File-Name':encodeURIComponent('현업담당자.csv')},body:Buffer.from('업무명,담당자,상태,등록일,현업담당자,내용\n새 현업 요청,김도형,진행,2026-10-01,현업김담당,상세 요청')});assert.equal(uploaded.status,200);const upload=await uploaded.json();
  const response=await post('/api/upload/validate',{id:upload.id,sheets:['CSV'],period:'2026-10-30',weeklyOnly:false,commonHeader:1,commonMap:preset.map,assigneeSource:'column'});assert.equal(response.status,200);const validation=await response.json();assert.equal(validation.rows[0].input.requestContact,'현업김담당');assert.equal(validation.rows[0].error,'');
  const committed=await post('/api/upload/commit',{id:upload.id,revision:validation.revision,choices:{[validation.rows[0].key]:{action:'new'}}});assert.equal(committed.status,200);
  const disk=JSON.parse(await fs.readFile(path.join(dir,'work-data.json'),'utf8'));assert.equal(disk.works[0].requestContact,'현업김담당');assert.equal(disk.settings.excelMapping.map.requestContact,4);
 }finally{const stopped=new Promise(r=>child.once('exit',r));child.kill();await stopped;}
});
