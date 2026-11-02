import {authenticatedClient} from './auth-client.mjs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn,execFileSync} from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
test('파일 저장·재시작·실제 XLSX·중복 차단·갱신·취소·스냅샷 통합 검증',async()=>{
 const dir=await fs.mkdtemp(path.join(root,'tmp','test-')),port=14317,base=`http://127.0.0.1:${port}`;let child;let clientFetch=authenticatedClient(base);
 async function boot(){clientFetch=authenticatedClient(base);child=spawn(process.execPath,['server.mjs'],{cwd:root,env:{...process.env,PORT:String(port),IT_DATA_DIR:dir},stdio:['ignore','pipe','pipe']});await new Promise((resolve,reject)=>{child.stdout.once('data',resolve);child.once('error',reject);child.once('exit',c=>reject(Error('서버 시작 실패 '+c)));});}
 async function stop(){const done=new Promise(r=>child.once('exit',r));child.kill();await done;}
 let token;
 async function request(url,method='GET',data,headers={}){const r=await clientFetch(base+url,{method,headers:{'X-IT-Token':token,'Content-Type':'application/json',...headers},body:data===undefined?undefined:Buffer.isBuffer(data)?data:JSON.stringify(data)});const result=await r.json();return {status:r.status,...result};}
 try{
  await boot();let state=await request('/api/state');token=state.token;
  const created=await request('/api/works','POST',{title:'직접 입력 유지 검증',category:'기능개선',assignees:[{team:'시스템',name:'김시섭'}],status:'진행',created:'2026-10-01',activityDate:'2026-10-02'});assert.equal(created.status,'진행');
  await stop();await boot();state=await request('/api/state');token=state.token;assert.equal(state.works.length,1);assert.equal(state.works[0].id,created.id);
  const file=path.join(dir,'fixture.xlsx');const ps=`Add-Type -AssemblyName System.IO.Compression.FileSystem; $z=[IO.Compression.ZipFile]::Open('${file.replaceAll("'","''")}','Create'); $xml=@{ 'xl/workbook.xml'='<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="시스템" sheetId="1" r:id="rId1"/><sheet name="원무" sheetId="2" r:id="rId1"/><sheet name="통계" sheetId="3" r:id="rId1"/></sheets></workbook>'; 'xl/_rels/workbook.xml.rels'='<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Target="worksheets/sheet1.xml" Type="worksheet"/></Relationships>'; 'xl/styles.xml'='<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><color rgb="FF000000"/></font><font><color rgb="FFFF0000"/></font></fonts><cellXfs count="2"><xf fontId="0"/><xf fontId="1"/></cellXfs></styleSheet>'; 'xl/worksheets/sheet1.xml'='<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>업무명</t></is></c><c r="B1" t="inlineStr"><is><t>담당자</t></is></c><c r="C1" t="inlineStr"><is><t>상태</t></is></c></row><row r="2"><c r="A2" s="1" t="inlineStr"><is><t>엑셀 파싱 확인</t></is></c><c r="B2" t="inlineStr"><is><t>김도형</t></is></c><c r="C2" t="inlineStr"><is><t>개발중</t></is></c></row></sheetData></worksheet>'}; foreach($key in $xml.Keys){$e=$z.CreateEntry($key);$w=[IO.StreamWriter]::new($e.Open(),[Text.UTF8Encoding]::new($false));$w.Write($xml[$key]);$w.Dispose()};$z.Dispose()`;
  execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(ps,'utf16le').toString('base64')],{windowsHide:true});
  const preset={header:1,map:{title:0,assignees:1,status:2},assigneeSource:'column',statusText:'개발중=진행',kind:'개발업무'};
  assert.equal((await request('/api/settings/excel-mapping','PUT',preset)).ok,true);
  await stop();await boot();state=await request('/api/state');token=state.token;assert.equal(state.settings.excelMapping.map.assignees,1);
  const notice=await request('/api/notices','POST',{title:'테스트 공지',content:'확인 내용',category:'공지',pinned:true});assert.equal(notice.version,1);assert.equal((await request('/api/notices/'+notice.id,'PUT',{...notice,archived:true})).archived,true);
  const bytes=await fs.readFile(file);const up=await request('/api/upload','POST',bytes,{'X-File-Name':encodeURIComponent('주간업무.xlsx')});assert.equal(up.status,200,JSON.stringify(up));assert.equal(up.sheets[0].name,'시스템');assert.equal(up.sheets.length,2);assert.deepEqual(up.excludedSheets,['통계']);assert.equal(up.sheets[0].rows[1].cells[0],'엑셀 파싱 확인');
  const shared=await request('/api/upload/validate','POST',{id:up.id,sheets:['시스템','원무'],commonHeader:1,commonMap:{title:0,assignees:1,status:2,team:0},assigneeSource:'column',period:'2026-10-20'});
  assert.equal(shared.rows.length,2);assert.ok(shared.rows.every(r=>r.input.assignees[0].team==='시스템'));assert.ok(shared.rows.every(r=>r.input.status==='진행'));
  const validation=await request('/api/upload/validate','POST',{id:up.id,sheets:['시스템'],headers:{'시스템':1},maps:{'시스템':{title:0,assignees:1,status:2}},period:'2026-10-20'});assert.equal(validation.rows[0].error,'');assert.equal(validation.rows[0].input.status,'진행');
  const key=validation.rows[0].key;const batch=await request('/api/upload/commit','POST',{id:up.id,revision:validation.revision,choices:{[key]:{action:'new'}}});assert.equal(batch.status,'반영완료');
  const repeat=await request('/api/upload','POST',bytes,{'X-File-Name':'again.xlsx'});assert.equal(repeat.metadataUpdated,true);
  state=await request('/api/state');assert.equal(state.works.length,2);const imported=state.works.find(w=>w.title==='엑셀 파싱 확인');assert.equal(imported.source.row,2);assert.equal(imported.isMajor,true);
  const report=await request('/api/reports','POST',{title:'검증 보고',content:'확정 문구',filters:{from:'2026-10-01',to:'2026-10-31',asOf:'2026-10-30',basis:'activity'}});assert.equal(report.metrics.total,2);
  const update=await request('/api/works/'+imported.id,'PUT',{...imported,status:'완료',activityDate:'2026-10-25',completed:'2026-10-25'});assert.equal(update.status,'완료');
  const conflict=await request('/api/rollback/'+batch.id,'POST',{});assert.match(conflict.error,/修|수정/);
  state=await request('/api/state');assert.equal(state.reports[0].works.find(w=>w.id===imported.id).status,'진행');
  const csv=Buffer.from('업무명,담당자,상태\r\n취소 테스트,김도형,접수\r\n');const second=await request('/api/upload','POST',csv,{'X-File-Name':'test.csv'});const v2=await request('/api/upload/validate','POST',{id:second.id,sheets:['CSV'],headers:{CSV:1},maps:{CSV:{title:0,assignees:1,status:2}},period:'2026-10-26'});const b2=await request('/api/upload/commit','POST',{id:second.id,revision:v2.revision,choices:{[v2.rows[0].key]:{action:'new'}}});assert.equal(b2.status,'반영완료');assert.equal((await request('/api/rollback/'+b2.id,'POST',{})).ok,true);state=await request('/api/state');assert.equal(state.works.length,2);assert.equal(state.batches.at(-1).status,'취소');assert.ok((await fs.readdir(path.join(dir,'backups'))).length>=6);
  const unauth=await fetch(base+'/api/works',{method:'POST',body:'{}'});assert.equal(unauth.status,401);
 }finally{if(child?.exitCode===null)await stop();}
});
