import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {decodeGroupwareHtml} from '../public/groupware-html.js';
import {authenticatedClient} from './auth-client.mjs';
test('HTML의 UTF-8 선언·UTF-16 BOM·파일 크기를 처리한다',()=>{
 const text='<meta charset="utf-8"><p>업무연락</p>';assert.equal(decodeGroupwareHtml(Buffer.from(text)),text);
 assert.equal(decodeGroupwareHtml(Buffer.concat([Buffer.from([255,254]),Buffer.from('<p>업무</p>','utf16le')])),'<p>업무</p>');
 assert.throws(()=>decodeGroupwareHtml(new Uint8Array(2*1024*1024+1)),/2MB/);
});
test('HTML 업무는 문서번호·현업담당자·출처를 저장하고 동일 문서 신규 등록을 확인한다',async()=>{
 const dir=await fs.mkdtemp(path.resolve('tmp/html-work-test-')),base='http://127.0.0.1:14352';
 const child=spawn(process.execPath,['server.mjs'],{env:{...process.env,PORT:'14352',IT_DATA_DIR:dir},stdio:['ignore','pipe','pipe']});await new Promise((r,j)=>{child.stdout.once('data',r);child.once('error',j);});
 try{
  const client=authenticatedClient(base),post=value=>client(base+'/api/works',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(value)});
  const input={title:'HTML 요청 검증',requestDept:'현업부서',requestContact:'현업직원',externalId:'기관-2026-1234',description:'문서의 요청 내용',htmlDocument:true,htmlFilename:'요청문서.html',category:'기타',status:'예정',created:'2026-06-19',activityDate:'2026-11-04',assignees:[{team:'진료간호',name:'이창주'}]};
  const response=await post(input);assert.equal(response.status,201);const work=await response.json();assert.equal(work.externalId,input.externalId);assert.equal(work.requestContact,input.requestContact);assert.equal(work.registrationSource,'groupware-html');assert.equal(work.sourceFilename,'요청문서.html');
  const duplicate=await post(input);assert.equal(duplicate.status,400);assert.match((await duplicate.json()).error,/같은 문서번호/);
  assert.equal((await post({...input,title:'같은 문서의 별도 업무',allowDuplicateDocument:true})).status,201);
  const update=await client(base+'/api/works/'+work.id,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({title:work.title,assignees:work.assignees,category:work.category,status:work.status,created:work.created,activityDate:'2026-11-04',version:work.version})});assert.equal(update.status,200);assert.equal((await update.json()).externalId,input.externalId);
  const data=JSON.parse(await fs.readFile(path.join(dir,'work-data.json'),'utf8'));assert.equal(data.works.length,2);assert.equal(data.works[0].sourceFilename,'요청문서.html');
 }finally{const stopped=new Promise(r=>child.once('exit',r));child.kill();await stopped;}
});
