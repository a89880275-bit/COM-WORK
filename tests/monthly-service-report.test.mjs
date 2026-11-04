import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn,execFileSync} from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import {emptyStore,createWork,monthlyHighlights,reportPeriodFlow} from '../lib.mjs';
import {buildMonthlyServiceReport,reportRoster,exportMonthlyServiceReport,validatePptReport,sortMonthlyDetailWorks} from '../monthly-report.mjs';
import {authenticatedClient} from './auth-client.mjs';
test('상세내역은 관리자 파트·담당자 순서와 완료일/접수일 오름차순으로 정렬한다',()=>{
 const settings={teams:['진료간호','원무'],people:{진료간호:['직원B','직원A'],원무:['직원C']}};
 const row=(id,name,team,created,completed='')=>({id,assignees:[{name,team}],created,completed,status:completed?'완료':'예정',history:completed?[{status:'완료',date:completed}]:[]});
 const rows=[row('last','직원C','원무','2026-01-01'),row('person2','직원A','진료간호','2026-01-01'),row('done','직원B','진료간호','2026-01-01','2026-10-20'),row('pending','직원B','진료간호','2026-10-10')];
 assert.deepEqual(sortMonthlyDetailWorks(rows,settings,'2026-10-31').map(w=>w.id),['pending','done','person2','last']);
 const joint={...rows[0],id:'joint',assignees:[...rows[0].assignees,{name:'직원B',team:'진료간호'}]};
 assert.equal(sortMonthlyDetailWorks([rows[0],joint],settings,'2026-10-31')[0].id,'joint');assert.equal(rows[0].id,'last');
});
test('서비스 보고내용은 화면 주요내용과 같은 파트별 3건·순서로 최대 15줄을 제안한다',()=>{
 const store=emptyStore();
 store.works=store.settings.teams.flatMap(team=>Array.from({length:4},(_,i)=>createWork({title:team+' 중요업무 '+i,isMajor:true,assignees:[{team,name:store.settings.people[team][0]}],category:'기타',status:'예정',created:'2026-10-01',activityDate:'2026-10-01'},store.settings)));
 const report=buildMonthlyServiceReport(store,'2026-10','2026-11-04'),flow=reportPeriodFlow(store.works,report.range);
 const screen=monthlyHighlights(flow.rows,store.settings.teams,report.range);
 assert.equal(report.summary.split('\n').length,15);
 assert.deepEqual(report.summary.split('\n'),screen.map(({team,work})=>`${team}: ${work.title} (${work.status})`));
 const legacy=buildMonthlyServiceReport(store,'2026-10','2026-11-04',{summary:'이전 10건 문구',suggestedSummary:'다른 이전 문구',savedAt:'2026-11-03',issues:'유지할 이슈',attendance:[{name:'비상주',status:'근무',external:true}]});
 assert.equal(legacy.summary,report.suggestedSummary);assert.equal(legacy.summary.split('\n').length,15);assert.equal(legacy.issues,'유지할 이슈');assert.equal(legacy.attendance.at(-1).name,'비상주');
 report.attendance.forEach(p=>p.status='근무');assert.doesNotThrow(()=>validatePptReport(report));
});
test('월간 보고는 해당 월 완료와 전체 미결, 원본 10칼럼, 근태 인원과 비상주를 반영한다',()=>{
 const s=emptyStore(),team=s.settings.teams[0],name=s.settings.people[team][0];
 s.settings.teamLeaderName='팀장';s.settings.departedNames=[s.settings.people[team][1]];
 const make=(title,status,created,completed)=>createWork({title,status,created,completed,activityDate:completed||created,category:s.settings.categories[0],assignees:[{team,name}],description:'상세내용'},s.settings);
 const done=make('이달 완료','완료','2026-09-01','2026-10-29'),pending=make('이월 예정','예정','2026-08-01'),past=make('전월 완료','완료','2026-08-01','2026-09-30');
 done.source={batchId:'b',sheet:'직원',row:2};const raw=Array(15).fill('');raw[6]='2026-10-28';raw[10]='현업 직원';raw[12]='2026-10-30';s.batches=[{id:'b',rows:[{sheet:'직원',row:2,raw}]}];s.works=[done,pending,past];
 const r=buildMonthlyServiceReport(s,'2026-10','2026-11-04',{attendance:[{name,status:'근무',external:false},{name:'비상주',status:'근무(외주)',external:true}]});
 assert.equal(r.detailRows.length,2);assert.equal(r.detailRows.find(w=>w.id===done.id).values[6],'현업 직원');assert.equal(r.detailRows.find(w=>w.id===done.id).values[2],'2026-10-28');assert.equal(r.teamRows[0].total,2);assert.equal(r.teamRows[0].completed,1);assert.equal(r.teamRows[0].remaining,1);
 assert.equal(r.attendance[0].name,'팀장');assert.ok(!r.attendance.some(p=>s.settings.departedNames.includes(p.name)));assert.equal(r.attendance.at(-1).external,true);assert.equal(r.attendance.find(p=>p.name===name).status,'근무');
 assert.throws(()=>validatePptReport(r),/근태/);assert.equal(reportRoster(s.settings).find(p=>p.name===name).status,'');
 assert.throws(()=>buildMonthlyServiceReport(s,'2026-10','2026-11-04',{summary:Array(16).fill('내용').join('\n')}),/15줄/);
});
test('월별 입력 저장, 권한 차단, 재조회 및 PPT·XLSX 실제 생성',async()=>{
 const dir=await fs.mkdtemp(path.resolve('tmp/monthly-service-test-')),base='http://127.0.0.1:14348';
 const child=spawn(process.execPath,['server.mjs'],{env:{...process.env,PORT:'14348',IT_DATA_DIR:dir},stdio:['ignore','pipe','pipe']});await new Promise((resolve,reject)=>{child.stdout.once('data',resolve);child.once('error',reject);});
 try{
  const client=authenticatedClient(base),request=async(url,method='GET',body)=>client(base+url,{method,headers:{'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});
  const get=await request('/api/monthly-service-report?month=2026-10');assert.equal(get.status,200);const preview=await get.json();assert.equal(preview.saved,false);
  preview.report.attendance.forEach(p=>p.status='근무');preview.report.attendance.push({name:'비상주직원',status:'근무(외주)',external:true});preview.report.issues='이슈 없음';preview.report.summary='업무 A\n\n2. 업무 B\n업무 C';
  const savedResponse=await request('/api/monthly-service-report','PUT',{...preview.report,revision:preview.revision});assert.equal(savedResponse.status,200);const saved=await savedResponse.json();assert.ok(saved.report.savedAt);
  assert.equal((await request('/api/monthly-service-report','PUT',{...preview.report,revision:preview.revision})).status,400);
  const again=await(await request('/api/monthly-service-report?month=2026-10')).json();assert.equal(again.report.attendance.at(-1).name,'비상주직원');assert.equal(again.report.issues,'이슈 없음');
  for(const format of ['pptx','xlsx']){const response=await request('/api/monthly-service-report/export?month=2026-10&format='+format);assert.equal(response.status,200);const bytes=Buffer.from(await response.arrayBuffer());assert.equal(bytes.subarray(0,2).toString(),'PK');await fs.writeFile(path.join(dir,'report.'+format),bytes);}
  const disk=JSON.parse(await fs.readFile(path.join(dir,'work-data.json'),'utf8'));assert.ok(disk.monthlyServiceReports['2026-10']);
  const login=await fetch(base+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'김도형',password:'1'})});const cookie=login.headers.get('set-cookie').split(';')[0],staff=await(await fetch(base+'/api/state',{headers:{Cookie:cookie}})).json();
  assert.equal((await fetch(base+'/api/monthly-service-report',{method:'PUT',headers:{Cookie:cookie,'X-IT-Token':staff.token,'Content-Type':'application/json'},body:JSON.stringify({...again.report,revision:staff.revision})})).status,403);
  const probe=`[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false)
Add-Type -AssemblyName System.IO.Compression.FileSystem
$z=[IO.Compression.ZipFile]::OpenRead('${path.join(dir,'report.pptx').replaceAll("'","''")}')
$r=[IO.StreamReader]::new($z.GetEntry('ppt/slides/slide1.xml').Open());[xml]$d=$r.ReadToEnd();$r.Dispose()
$n=[Xml.XmlNamespaceManager]::new($d.NameTable);$n.AddNamespace('a','http://schemas.openxmlformats.org/drawingml/2006/main');$n.AddNamespace('p','http://schemas.openxmlformats.org/presentationml/2006/main')
$table=$d.SelectSingleNode('//p:cNvPr[@id="8"]/../..//a:tbl',$n)
$counts=@();$bad=0;foreach($row in $table.SelectNodes('a:tr',$n)){$counts+=@($row.SelectNodes('a:tc',$n)).Count;if($row.SelectSingleNode('a:extLst',$n) -and $row.LastChild.LocalName -ne 'extLst'){$bad++}}
$r=[IO.StreamReader]::new($z.GetEntry('docProps/core.xml').Open());[xml]$core=$r.ReadToEnd();$r.Dispose();$z.Dispose()
$created=$core.SelectSingleNode('//*[local-name()="created"]').InnerText
@{cells=$counts;columns=@($table.SelectNodes('a:tblGrid/a:gridCol',$n)).Count;badOrder=$bad;text=($d.SelectNodes('//a:t',$n)|ForEach-Object {$_.InnerText}) -join '|';validDate=!!([datetime]::Parse($created))}|ConvertTo-Json -Compress`;
  const ppt=JSON.parse(execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(probe,'utf16le').toString('base64')],{encoding:'utf8',windowsHide:true}));
  assert.equal(ppt.badOrder,0);assert.equal(ppt.columns,saved.report.attendance.length);assert.deepEqual(ppt.cells,[ppt.columns,ppt.columns]);assert.ok(ppt.validDate);assert.ok(ppt.text.includes('비상주직원'));assert.ok(ppt.text.includes('근무(외주)'));
  for(const line of ['1. 업무 A','2. 업무 B','3. 업무 C'])assert.ok(ppt.text.includes(line));assert.ok(!ppt.text.includes('2. 2.'));
 }finally{const stopped=new Promise(resolve=>child.once('exit',resolve));child.kill();await stopped;}
});
