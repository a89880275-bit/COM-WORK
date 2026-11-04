import {accountUsers,loginUsers,hashPassword,verifyPassword,syncAccounts} from './auth.mjs';
import {buildMonthlyServiceReport,exportMonthlyServiceReport} from './monthly-report.mjs';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash,randomBytes} from 'node:crypto';
import {spawn} from 'node:child_process';
import {emptyStore,createWork,updateWork,candidates,autoCompleteChoices,hasDocumentNumber,dateOK,id,today,validateExcelMapping,normalizeExcelDate,isStatisticsSheet,prepareImportedWork,normalizeWeekLabel,filenameWeekLabel,includeWeeklyRow,prepareScheduledImport,validateImportStatusDate,classifyWorkStatus} from './lib.mjs';
const root=path.dirname(fileURLToPath(import.meta.url)), dataDir=process.env.IT_DATA_DIR||path.join(root,'data'), port=Number(process.env.PORT||4317);
const allowedOrigins=new Set([`http://127.0.0.1:${port}`,`http://localhost:${port}`,...String(process.env.IT_PUBLIC_ORIGINS||'').split(',').map(s=>s.trim()).filter(Boolean).map(s=>{const u=new URL(s);if(!['http:','https:'].includes(u.protocol)||u.username||u.password||u.pathname!=='/'||u.search||u.hash)throw Error('IT_PUBLIC_ORIGINS에는 접속 원점만 입력하세요.');return u.origin;})]);
const allowedHosts=new Set([...allowedOrigins].map(s=>new URL(s).host));
await fs.mkdir(path.join(dataDir,'backups'),{recursive:true});await fs.mkdir(path.join(root,'tmp'),{recursive:true});
const storeFile=path.join(dataDir,'work-data.json');
let store;try{store=JSON.parse(await fs.readFile(storeFile,'utf8'));if(store.schema!==1||!Array.isArray(store.works))throw Error('지원하지 않는 데이터 파일');}catch(e){if(e.code!=='ENOENT')throw e;store=emptyStore();await fs.writeFile(storeFile,JSON.stringify(store,null,2));}
let queue=Promise.resolve();const token=randomBytes(32).toString('hex');const staging=new Map();
store.notices??=[];
function mutate(action,fn){const operation=queue.then(async()=>{const next=structuredClone(store);const result=await fn(next);next.revision++;next.audit.push({id:id(),time:new Date().toISOString(),action});await fs.copyFile(storeFile,path.join(dataDir,'backups',`${Date.now()}-${next.revision}.json`));const temp=storeFile+'.tmp';await fs.writeFile(temp,JSON.stringify(next,null,2));await fs.rename(temp,storeFile);store=next;return result;});queue=operation.catch(()=>{});return operation;}
async function body(req,max=1024*1024){const chunks=[];let n=0;for await(const chunk of req){n+=chunk.length;if(n>max)throw Error('파일/요청 크기 제한을 초과했습니다.');chunks.push(chunk);}return Buffer.concat(chunks);}
function json(res,status,value){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(value));}
function csv(text){const rows=[];let row=[],field='',quote=false;for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'){if(quote&&text[i+1]==='"'){field+='"';i++;}else quote=!quote;}else if(c===','&&!quote){row.push(field);field='';}else if(c==='\n'&&!quote){row.push(field.replace(/\r$/,''));rows.push({number:rows.length+1,cells:row});row=[];field='';}else field+=c;}if(quote)throw Error('CSV 따옴표가 닫히지 않았습니다.');if(field||row.length){row.push(field);rows.push({number:rows.length+1,cells:row});}return {sheets:[{name:'CSV',rows:rows.filter(r=>r.cells.some(Boolean))}]};}
function xlsx(file){return new Promise((resolve,reject)=>{const ps=spawn('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',path.join(root,'scripts/read-xlsx.ps1'),'-Path',file],{windowsHide:true});let out='',err='';const timer=setTimeout(()=>{ps.kill();reject(Error('엑셀 읽기 시간 초과'));},45000);ps.stdout.setEncoding('utf8');ps.stderr.setEncoding('utf8');ps.stdout.on('data',s=>{out+=s;if(out.length>30e6)ps.kill();});ps.stderr.on('data',s=>err+=s);ps.on('error',e=>{clearTimeout(timer);reject(e);});ps.on('exit',code=>{clearTimeout(timer);if(code!==0)return reject(Error('엑셀을 읽을 수 없습니다. 암호·손상·크기 제한을 확인해 주세요.'));try{resolve(JSON.parse(out.replace(/^\uFEFF/,'')));}catch{reject(Error('엑셀 파싱 결과를 읽지 못했습니다.'));}});});}
const normalizeDate=normalizeExcelDate;
function mappedRows(staged,options){
 const result=[];
 for(const sheet of staged.sheets.filter(s=>!isStatisticsSheet(s.name)&&options.sheets.includes(s.name))){
  const header=Number(options.commonHeader||options.headers?.[sheet.name]||1);const map=options.commonMap||options.maps?.[sheet.name]||{};
  for(const raw of sheet.rows.filter(r=>r.number>header)){
   const get=key=>String(raw.cells[Number(map[key])]||'').trim();
   if(!get('title')&&!raw.cells.some(c=>String(c).trim()))continue;
   const nameText=options.assigneeSource==='sheet'?sheet.name:get('assignees'),names=nameText.split(/[,，/、;\n]+/).map(s=>s.trim()).filter(Boolean);
   const assignees=names.map(name=>{const matches=store.settings.teams.filter(t=>store.settings.people[t]?.includes(name));return {name,team:matches.length===1?matches[0]:''};});
   const rawStatus=get('status');
   const mappedStatus=rawStatus==='보류'?'보류':options.statusMap?.[rawStatus]||({'개발중':'진행','처리완료':'완료'}[rawStatus])||rawStatus||'접수';
   const status=classifyWorkStatus(mappedStatus);
   if(options.historical&&(status!=='완료'||!dateOK(normalizeDate(get('completed')))||normalizeDate(get('completed'))<options.completionFrom||normalizeDate(get('completed'))>options.completionTo))continue;
   if(options.weeklyOnly&&!includeWeeklyRow(get('week'),status,options.weekLabel))continue;
   const cat=get('category');const category=store.settings.categories[Number(cat)-1]||cat||'기타';
   const input=prepareImportedWork({title:get('title'),isMajor:(raw.redColumns||[]).includes(Number(map.title)),assignees,status,category,created:normalizeDate(get('created'))||options.period,activityDate:options.period,completed:normalizeDate(get('completed')),requestDept:get('requestDept'),requestContact:Number(map.requestContact??-1)>=0?get('requestContact'):undefined,description:get('description'),reason:get('reason'),kind:options.kind||'개발업무',externalId:get('externalId')},options.period);
   Object.assign(input,prepareScheduledImport(input,get('week')));
   if(options.historical)input.activityDate=input.completed;
   let error='';try{validateImportStatusDate(input,get('week'));createWork(input,store.settings);}catch(e){error=e.message;}
   const key=`${sheet.name}:${raw.number}`;result.push({key,sheet:sheet.name,row:raw.number,raw:raw.cells,input,error,week:get('week'),candidates:error?[]:candidates(input,store.works)});
  }
 }
 return result;
}

const sessions=new Map(),attempts=new Map();
function invalidateSessions(name){for(const [key,value] of sessions)if(value.name===name)sessions.delete(key);}
function issueSession(name,res){for(const [key,value] of sessions)if(value.expires<Date.now())sessions.delete(key);const key=randomBytes(32).toString('hex');sessions.set(key,{name,version:store.auth[name].version,csrf:randomBytes(32).toString('hex'),expires:Date.now()+8*3600000});res.setHeader('Set-Cookie',`it_session=${key}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800`);}
if(loginUsers(store.settings).some(u=>!store.auth?.[u.name]))await mutate('로그인 계정 초기화',syncAccounts);
if(!store.settings.categories.includes('일반관리'))await mutate('업무구분 일반관리 추가',s=>{s.settings.categories.push('일반관리');});
const server=http.createServer(async(req,res)=>{try{
 const url=new URL(req.url,'http://127.0.0.1');const p=url.pathname;
 if(!allowedHosts.has(req.headers.host))return json(res,403,{error:'허용된 접속 주소가 아닙니다.'});

 const allowedOrigin=!req.headers.origin||allowedOrigins.has(req.headers.origin);
 if(req.method!=='GET'&&!allowedOrigin)return json(res,403,{error:'허용하지 않는 요청입니다.'});
 const cookie=String(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith('it_session='))?.slice(11);
 let session=sessions.get(cookie);const user=session&&session.expires>Date.now()?loginUsers(store.settings).find(u=>u.name===session.name&&store.auth[u.name]?.version===session.version):null;
 if(p==='/api/auth/users'&&req.method==='GET')return json(res,200,{users:loginUsers(store.settings),authenticated:!!user});
 if(p==='/api/auth/login'&&req.method==='POST'){
  const input=JSON.parse(await body(req,4096)),name=String(input.name||'');const key=name.slice(0,100),attempt=attempts.get(key);if(attempt&&attempt.until>Date.now()&&attempt.count>=5)return json(res,429,{error:'로그인 실패가 반복되었습니다. 1분 후 다시 시도해 주세요.'});
  if(!loginUsers(store.settings).some(u=>u.name===name)||!verifyPassword(input.password,store.auth[name])){const next=attempt&&attempt.until>Date.now()?attempt:{count:0,until:Date.now()+60000};next.count++;attempts.set(key,next);return json(res,401,{error:'성명 또는 비밀번호를 확인해 주세요.'});}
  attempts.delete(key);issueSession(name,res);return json(res,200,{ok:true});
 }
 if(p.startsWith('/api/')&&!user)return json(res,401,{error:'로그인이 필요합니다.'});
 if(p.startsWith('/api/')&&req.method!=='GET'&&req.headers['x-it-token']!==session.csrf)return json(res,403,{error:'페이지를 새로고침한 뒤 다시 시도해 주세요.'});
 if(p==='/api/auth/logout'&&req.method==='POST'){sessions.delete(cookie);res.setHeader('Set-Cookie','it_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');return json(res,200,{ok:true});}
 if(p==='/api/auth/password'&&req.method==='POST'){
  const input=JSON.parse(await body(req,4096));if(!verifyPassword(input.currentPassword,store.auth[user.name]))return json(res,400,{error:'현재 비밀번호가 맞지 않습니다.'});if(typeof input.newPassword!=='string'||input.newPassword.length<1||input.newPassword.length>128)throw Error('새 비밀번호는 1~128자로 입력하세요.');
  await mutate('본인 비밀번호 변경',s=>{s.auth[user.name]={...hashPassword(input.newPassword),version:s.auth[user.name].version+1};});invalidateSessions(user.name);issueSession(user.name,res);return json(res,200,{ok:true});
 }
 if(p==='/api/auth/reset'&&req.method==='POST'){
  if(user.role!=='admin')return json(res,403,{error:'관리자만 비밀번호를 초기화할 수 있습니다.'});const input=JSON.parse(await body(req,4096));if(!loginUsers(store.settings).some(u=>u.name===input.name))throw Error('등록된 담당자를 선택하세요.');await mutate('비밀번호 초기화: '+input.name,s=>{s.auth[input.name]={...hashPassword('1'),version:s.auth[input.name].version+1};});invalidateSessions(input.name);return json(res,200,{ok:true});
 }
 if(p==='/api/state'&&req.method==='GET'){const {auth,deletedWorks,...visible}=store;return json(res,200,{...visible,deletedWorks:user.role==='admin'?(deletedWorks||[]):[],token:session.csrf,currentUser:user,accounts:user.role==='admin'?accountUsers(store.settings):[],today:today(),storage:'data/work-data.json'});}
 if(p==='/api/backup'&&req.method==='GET'){if(user.role!=='admin')return json(res,403,{error:'관리자 전용 기능입니다.'});const {auth,...visible}=store;res.setHeader('Content-Disposition',`attachment; filename="it-work-backup-${today()}.json"`);return json(res,200,visible);}
 if(p==='/api/monthly-service-report'&&req.method==='GET'){
  const month=url.searchParams.get('month'),saved=store.monthlyServiceReports?.[month];
  return json(res,200,{report:user.role!=='admin'&&saved?saved:buildMonthlyServiceReport(store,month,today(),saved||{}),saved:!!saved,savedAt:saved?.savedAt||null,revision:store.revision});
 }
 if(p==='/api/monthly-service-report/export'&&req.method==='GET'){
  const month=url.searchParams.get('month'),format=url.searchParams.get('format'),saved=store.monthlyServiceReports?.[month];if(!saved)throw Error('관리자가 월간 보고서를 먼저 저장해야 합니다.');
  const bytes=await exportMonthlyServiceReport(saved,format),name=format==='pptx'?`(전산정보팀)_${month.slice(0,4)}년 ${Number(month.slice(5))}월_서비스결과보고서및근태.pptx`:`전산서비스 보고_${month.slice(0,4)}년${Number(month.slice(5))}월_상세내역.xlsx`;
  res.writeHead(200,{'Content-Type':format==='pptx'?'application/vnd.openxmlformats-officedocument.presentationml.presentation':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','Content-Disposition':`attachment; filename="monthly-report.${format}"; filename*=UTF-8''${encodeURIComponent(name)}`,'Cache-Control':'no-store'});return res.end(bytes);
 }
 if(p.startsWith('/api/')&&req.method!=='GET'&&user.role==='leader')return json(res,403,{error:'팀장은 조회 전용입니다. 등록·수정·저장할 수 없습니다.'});
 if(p.startsWith('/api/')&&req.method!=='GET'&&user.role!=='admin'&&!p.startsWith('/api/works'))return json(res,403,{error:'관리자 전용 기능입니다.'});
 if(p==='/api/monthly-service-report'&&req.method==='PUT'){
  const input=JSON.parse(await body(req));const report=await mutate('월간 서비스 보고서 저장: '+input.month,s=>{if(input.revision!==s.revision)throw Error('데이터가 변경되었습니다. 보고서를 다시 열어 확인하세요.');const report={...buildMonthlyServiceReport(s,input.month,today(),input),savedAt:new Date().toISOString(),savedBy:user.name};s.monthlyServiceReports??={};s.monthlyServiceReports[input.month]=report;return report;});return json(res,200,{report,revision:store.revision});
 }
 if(p==='/api/notices'&&req.method==='POST'||p.startsWith('/api/notices/')&&req.method==='PUT'){
  const input=JSON.parse(await body(req));const title=String(input.title||'').trim(),content=String(input.content||'').trim();if(!title||title.length>150||!content||content.length>10000)throw Error('제목(150자 이내)과 내용(10,000자 이내)을 입력해 주세요.');
  if(!['공지','안내','이슈'].includes(input.category))throw Error('공지 구분을 확인해 주세요.');
  const notice=await mutate('공지사항 저장',s=>{s.notices??=[];const existing=req.method==='PUT'?s.notices.find(n=>n.id===p.split('/').at(-1)):null;if(req.method==='PUT'&&(!existing||existing.version!==input.version))throw Error('다른 창에서 수정되었습니다. 새로고침해 주세요.');const n={id:existing?.id||id(),title,content,category:input.category,pinned:input.pinned===true,archived:input.archived===true,date:existing?.date||today(),updatedAt:new Date().toISOString(),version:(existing?.version||0)+1};if(existing)s.notices[s.notices.indexOf(existing)]=n;else s.notices.push(n);return n;});return json(res,200,notice);
 }
 if(['/api/works/delete-selected','/api/works/restore-selected'].includes(p)&&req.method==='POST'){
  if(p.endsWith('/restore-selected')&&user.role!=='admin')return json(res,403,{error:'관리자만 업무를 복구할 수 있습니다.'});
  const input=JSON.parse(await body(req));if(!Array.isArray(input.ids)||!input.ids.length||input.ids.length>20000||input.ids.some(v=>typeof v!=='string')||new Set(input.ids).size!==input.ids.length)throw Error('삭제·복구할 업무를 선택하세요.');
  const restore=p.endsWith('/restore-selected');
  if(!restore&&user.role!=='admin'&&input.ids.some(wid=>!store.works.find(w=>w.id===wid)?.assignees.some(a=>a.name===user.name)))return json(res,403,{error:'본인이 담당하는 업무만 삭제할 수 있습니다.'});
  await mutate(`${restore?'업무 복구':'업무 선택 삭제'}: ${user.name} · ${input.ids.length}건`,s=>{
   if(input.revision!==s.revision)throw Error('데이터가 변경되었습니다. 새로고침 후 다시 선택하세요.');s.deletedWorks??=[];
   const ids=new Set(input.ids);
   if(restore){const items=s.deletedWorks.filter(v=>ids.has(v.id));if(items.length!==ids.size||items.some(v=>s.works.some(w=>w.id===v.work.id)))throw Error('복구할 업무가 변경되었습니다. 새로고침하세요.');s.works.push(...items.map(v=>v.work));s.deletedWorks=s.deletedWorks.filter(v=>!ids.has(v.id));}
   else{const items=s.works.filter(w=>ids.has(w.id));if(items.length!==ids.size)throw Error('삭제할 업무가 변경되었습니다. 새로고침하세요.');if(user.role!=='admin'&&items.some(w=>!w.assignees.some(a=>a.name===user.name)))throw Error('본인이 담당하는 업무만 삭제할 수 있습니다.');const deletedAt=new Date().toISOString();s.deletedWorks.push(...items.map(work=>({id:id(),work,deletedAt,deletedBy:user.name})));s.works=s.works.filter(w=>!ids.has(w.id));}
  });return json(res,200,{ok:true,count:input.ids.length});
 }
 if(p==='/api/works'&&req.method==='POST'){const input=JSON.parse(await body(req));const work=await mutate('업무 등록',s=>{if(user.role!=='admin'&&!input.assignees?.some(a=>a.name===user.name))throw Error('본인이 담당하는 업무만 등록할 수 있습니다.');if(input.htmlDocument===true&&hasDocumentNumber(input.externalId)&&input.allowDuplicateDocument!==true&&s.works.some(w=>String(w.externalId||'').replace(/\s/g,'')===String(input.externalId).replace(/\s/g,'')))throw Error('같은 문서번호로 등록된 업무가 있습니다. 기존 업무를 확인하세요.');const w=createWork(input,s.settings);if(input.htmlDocument===true){w.registrationSource='groupware-html';w.sourceFilename=String(input.htmlFilename||'').split(/[\\/]/).at(-1).slice(0,200);}s.works.push(w);return w;});return json(res,201,work);}
 if(p.startsWith('/api/works/')&&req.method==='PUT'){const input=JSON.parse(await body(req)),wid=p.split('/').at(-1);const work=await mutate('업무 수정',s=>{const i=s.works.findIndex(w=>w.id===wid);if(i<0)throw Error('업무가 없습니다.');if(user.role!=='admin'&&(!s.works[i].assignees.some(a=>a.name===user.name)||!input.assignees?.some(a=>a.name===user.name)))throw Error('본인이 담당하는 업무만 수정할 수 있습니다.');if(input.version!==s.works[i].version)throw Error('다른 창에서 수정되었습니다. 새로고침해 주세요.');return s.works[i]=updateWork(s.works[i],input,s.settings);});return json(res,200,work);}
 if(p==='/api/upload'&&req.method==='POST'){
  const name=decodeURIComponent(req.headers['x-file-name']||''),bytes=await body(req,10*1024*1024);if(!/\.(xlsx|csv)$/i.test(name))throw Error('XLSX 또는 UTF-8 CSV 파일만 지원합니다.');
  const historical=req.headers['x-import-mode']==='historical-completed';
  const hash=createHash('sha256').update(bytes).digest('hex');const existingBatch=historical?null:store.batches.find(b=>b.hash===hash&&b.status==='반영완료');
  if(existingBatch&&/\.csv$/i.test(name))throw Error('이미 반영된 파일입니다. 업로드 이력에서 확인해 주세요.');
  let parsed;if(/\.csv$/i.test(name))parsed=csv(bytes.toString('utf8').replace(/^\uFEFF/,''));else{if(bytes[0]!==80||bytes[1]!==75)throw Error('XLSX 파일 형식이 아닙니다.');const f=path.join(root,'tmp',id()+'.xlsx');try{await fs.writeFile(f,bytes);parsed=await xlsx(f);}finally{await fs.rm(f,{force:true});}}
  if(!parsed.sheets?.length||parsed.sheets.reduce((n,s)=>n+s.rows.length,0)>20000)throw Error('비어 있거나 20,000행을 초과하는 파일입니다.');
  parsed.excludedSheets=parsed.sheets.filter(s=>isStatisticsSheet(s.name)).map(s=>s.name);
  parsed.sheets=parsed.sheets.filter(s=>!isStatisticsSheet(s.name));
  if(!parsed.sheets.length)throw Error('통계 시트는 등록에서 제외됩니다. 등록할 개발자 업무 시트가 없습니다.');
  if(existingBatch){const updated=await mutate('기존 업로드 제목 색상 갱신',s=>{const batch=s.batches.find(b=>b.id===existingBatch.id);let count=0;for(const row of batch.rows){const raw=parsed.sheets.find(sheet=>sheet.name===row.sheet)?.rows.find(r=>r.number===row.row);if(!raw)continue;const column=raw.cells.findIndex(value=>String(value).trim()===row.input.title);if(column<0)continue;const major=(raw.redColumns||[]).includes(column);row.input.isMajor=major;const work=s.works.find(w=>w.id===row.linkedWorkId);if(!work||work.title!==row.input.title)continue;const latest=[...work.activities].reverse().find(a=>a.source)?.source;if(latest?.batchId!==batch.id)continue;if(work.isMajor!==major){const previousVersion=work.version;work.isMajor=major;work.version++;const change=batch.changes.find(c=>c.id===work.id);if(change?.afterVersion===previousVersion)change.afterVersion=work.version;count++;}}return count;});return json(res,200,{metadataUpdated:true,updated});}
  for(const [k,v] of staging)if(Date.now()-v.time>3600000)staging.delete(k);if(staging.size>=10)throw Error('임시 업로드가 많습니다. 서버를 재시작해 주세요.');
  const sid=id();staging.set(sid,{owner:user.name,...parsed,name:path.basename(name),hash,historical,time:Date.now()});return json(res,200,{id:sid,...parsed});
 }
 if(p==='/api/upload/validate'&&req.method==='POST'){const o=JSON.parse(await body(req));if(!dateOK(o.period))throw Error('활동일을 지정해 주세요.');if(o.commonMap){const valid=validateExcelMapping({header:o.commonHeader,map:o.commonMap,assigneeSource:o.assigneeSource,statusText:o.statusText,kind:o.kind});o.commonHeader=valid.header;o.commonMap=valid.map;o.statusMap=Object.fromEntries(valid.statusText.split(',').filter(Boolean).map(s=>s.split('=').map(v=>v.trim())));}if(o.weeklyOnly&&(!normalizeWeekLabel(o.weekLabel)||Number(o.commonMap?.week??-1)<0))throw Error('현재 주차(예: 10월4주)와 주간구분 컬럼을 지정해 주세요.');const st=staging.get(o.id);if(!st)throw Error('업로드 세션이 만료되었습니다.');const fileWeek=filenameWeekLabel(st.name);if(fileWeek&&!st.historical){o.weeklyOnly=true;o.weekLabel=fileWeek;if(Number(o.commonMap?.week??o.maps?.[o.sheets?.[0]]?.week??-1)<0)throw Error('파일명 주차에 맞춰 반영하려면 주간구분 컬럼을 연결하세요.');}if(st.historical){if(!dateOK(o.completionFrom)||!dateOK(o.completionTo)||o.completionFrom>o.completionTo||o.completionTo>today())throw Error('과거 완료 반영 기간을 확인해 주세요.');o.historical=true;o.weeklyOnly=false;st.scope='completed:'+o.completionFrom+':'+o.completionTo;}else{o.historical=false;}const rows=autoCompleteChoices(mappedRows(st,o),store.works);if(!rows.length)throw Error('선택된 시트에 반영할 데이터가 없습니다.');st.options=o;st.rows=rows;return json(res,200,{rows,revision:store.revision});}
 if(p==='/api/settings/excel-mapping'&&req.method==='PUT'){const mapping=validateExcelMapping(JSON.parse(await body(req)));await mutate('공통 엑셀 매핑 저장',s=>{s.settings.excelMapping=mapping;});return json(res,200,{ok:true,mapping});}
 if(p==='/api/settings/personnel'&&req.method==='PUT'){
  const input=JSON.parse(await body(req));if(typeof input.teamLeaderName!=='string'||input.teamLeaderName.trim().length>50||!Array.isArray(input.departedNames)||input.departedNames.some(n=>typeof n!=='string'||n.length>50)||input.departedNames.includes('이창주'))throw Error('팀장 이름과 퇴사 여부를 확인해 주세요. 관리자는 퇴사 처리할 수 없습니다.');
  await mutate('팀장·퇴사 설정 변경',s=>{s.settings.teamLeaderName=input.teamLeaderName.trim();s.settings.departedNames=[...new Set(input.departedNames)];syncAccounts(s);});for(const name of input.departedNames)invalidateSessions(name);return json(res,200,{ok:true});
 }
 if(p==='/api/upload/commit'&&req.method==='POST'){
  const input=JSON.parse(await body(req)),st=staging.get(input.id);if(!st?.rows)throw Error('먼저 검증해 주세요.');
  const batch=await mutate('엑셀 반영',s=>{
   if(s.batches.some(b=>b.hash===st.hash&&(b.scope||'weekly')===(st.scope||'weekly')&&b.status==='반영완료'))throw Error('이미 반영된 파일·기간입니다.');
   if(input.revision!==s.revision)throw Error('데이터가 변경되었습니다. 다시 검증해 주세요.');
   const b={id:id(),filename:st.name,hash:st.hash,scope:st.scope||'weekly',completionFrom:st.options.completionFrom||null,completionTo:st.options.completionTo||null,time:new Date().toISOString(),period:st.options.period,weeklyOnly:st.options.weeklyOnly===true,weekLabel:st.options.weeklyOnly?st.options.weekLabel:null,status:'반영완료',rows:[],changes:[]};
   for(const row of st.rows){const choice=input.choices?.[row.key]||row.autoChoice||{action:'exclude'};const record={...row,action:choice.action,linkedWorkId:choice.target||null};b.rows.push(record);if(choice.action==='exclude')continue;if(row.error)throw Error('오류 행은 제외하거나 매핑을 수정해 주세요.');const source={batchId:b.id,filename:b.filename,sheet:row.sheet,row:row.row};
    if(choice.action==='link'){const prior=b.rows.find(r=>r.key===choice.targetRow&&r.key!==row.key&&r.linkedWorkId);if(!prior)throw Error('먼저 반영된 원본 행을 연결 대상으로 선택하세요.');const w=s.works.find(w=>w.id===prior.linkedWorkId);const a=row.input,c=prior.input;if(!w||a.title!==c.title||a.created!==c.created||a.completed!==c.completed||a.description!==c.description||JSON.stringify(a.assignees.map(p=>p.team+'|'+p.name).sort())!==JSON.stringify(c.assignees.map(p=>p.team+'|'+p.name).sort()))throw Error('내용이 다른 원본 행은 같은 업무로 연결할 수 없습니다.');record.linkedWorkId=w.id;w.activities.push({date:a.activityDate,content:a.description,source});w.isMajor=w.isMajor||a.isMajor;w.version++;b.changes.find(c=>c.id===w.id).afterVersion=w.version;}
    else if(choice.action==='new'){const w=createWork(row.input,s.settings,source);s.works.push(w);record.linkedWorkId=w.id;b.changes.push({id:w.id,before:null,afterVersion:w.version});}
    else if(['update','activity'].includes(choice.action)){const i=s.works.findIndex(w=>w.id===choice.target);if(i<0)throw Error('연결할 업무를 선택해 주세요.');if(b.changes.some(c=>c.id===choice.target))throw Error('동일 배치에서 같은 업무를 두 번 갱신할 수 없습니다. 행을 분리 검토해 주세요.');const old=structuredClone(s.works[i]);if(choice.action==='update')s.works[i]=updateWork(old,{...row.input,created:old.created},s.settings,source);else{s.works[i].activities.push({date:st.options.period,content:row.input.description,source});s.works[i].isMajor=row.input.isMajor===true;s.works[i].version++;}b.changes.push({id:old.id,before:old,afterVersion:s.works[i].version});}
    else throw Error('지원하지 않는 반영 방식입니다.');
   }
   if(!b.changes.length)throw Error('반영할 행이 없습니다.');s.batches.push(b);return b;
  });staging.delete(input.id);return json(res,200,batch);
 }
 if(p.startsWith('/api/rollback/')&&req.method==='POST'){const bid=p.split('/').at(-1);await mutate('업로드 되돌리기',s=>{const b=s.batches.find(b=>b.id===bid);if(!b||b.status!=='반영완료')throw Error('반영완료 배치만 취소할 수 있습니다.');for(const c of b.changes){const w=s.works.find(w=>w.id===c.id);if(!w||w.version!==c.afterVersion)throw Error('반영 이후 수정된 업무가 있어 취소할 수 없습니다. 후속 배치를 먼저 취소해 주세요.');}for(const c of b.changes){const i=s.works.findIndex(w=>w.id===c.id);if(c.before)s.works[i]=c.before;else s.works.splice(i,1);}b.status='취소';b.cancelledAt=new Date().toISOString();});return json(res,200,{ok:true});}
 if(p==='/api/reports'&&req.method==='POST'){const input=JSON.parse(await body(req));if(!String(input.title||'').trim()||!input.filters)throw Error('보고서 제목과 조회 기준이 필요합니다.');const {selectWorks,metrics,reportPeriodFlow,reportEligibleWorks}=await import('./lib.mjs');const report=await mutate('보고서 확정',s=>{const flow=input.filters.mode==='flow'?reportPeriodFlow(s.works,input.filters,s.settings.departedNames||[]):null;const works=flow?flow.rows:reportEligibleWorks(selectWorks(s.works,input.filters),s.settings.departedNames||[]),r={id:id(),title:String(input.title).slice(0,200),content:String(input.content||'').slice(0,20000),createdAt:new Date().toISOString(),filters:input.filters,metrics:metrics(works),flowMetrics:flow?{carry:flow.carry,received:flow.received,completed:flow.completed,remaining:flow.remaining,cutoff:flow.cutoff}:null,works};s.reports.push(r);return r;});return json(res,201,report);}
 if(p==='/api/settings'&&req.method==='PUT'){const settings=JSON.parse(await body(req));if(settings.teamLeaderName!==undefined&&(typeof settings.teamLeaderName!=='string'||settings.teamLeaderName.trim().length>50))throw Error('팀장 이름은 50자 이내로 입력해 주세요.');if(!Array.isArray(settings.categories)||!settings.categories.length||settings.categories.some(c=>typeof c!=='string'||!c.trim())||new Set(settings.categories).size!==settings.categories.length)throw Error('업무구분은 중복 없이 한 줄에 하나씩 입력하세요.');if(!settings.people||store.settings.teams.some(t=>!Array.isArray(settings.people[t])||settings.people[t].some(n=>typeof n!=='string'||!n.trim())))throw Error('파트별 직원 목록을 확인해 주세요.');await mutate('설정 변경',s=>{s.settings.categories=settings.categories;s.settings.people=settings.people;if(settings.teamLeaderName!==undefined)s.settings.teamLeaderName=settings.teamLeaderName.trim();syncAccounts(s);});return json(res,200,{ok:true});}
 if(p==='/api/demo'&&req.method==='POST'){await mutate('예제 데이터 생성',s=>{if(s.works.length)throw Error('예제는 업무가 없는 상태에서만 생성할 수 있습니다.');const titles=['간호기록 서식 입력 오류 수정','외래 수납 환불 프로세스 개선','검사 결과 알림 API 연동','인사 발령 권한 일괄 적용','서버 백업 무결성 점검','투약 바코드 검증 로직 개선','모바일 진료비 조회 화면 개발','영상 판독 결과 연계 개선','월간 경영지표 통계 추출','가상화 서버 자원 증설','병동 프린터 출력 장애 조치','수가 개정 코드 반영','예약 변경 이력 화면 개선','검사실 라벨 발행 개선','자동 발주 배치 점검'];for(let i=0;i<titles.length;i++){const t=s.settings.teams[i%5],created=today().slice(0,8)+String(Math.min(25,i+1)).padStart(2,'0');s.works.push(createWork({title:titles[i],assignees:[{team:t,name:s.settings.people[t][0]}],category:s.settings.categories[i%s.settings.categories.length],status:['완료','진행','완료','예정','보류'][i%5],reason:i%5===4?'외부 업체 일정 협의 중':'',created,activityDate:today(),description:'화면 확인용 예제 업무입니다. 실제 업무와 무관합니다.',tags:'예제',kind:i===10?'장비지원':'개발업무'},s.settings));}});return json(res,200,{ok:true});}
 if(p.startsWith('/api/'))return json(res,404,{error:'요청한 API가 없습니다.'});
 if(req.method!=='GET')return json(res,405,{error:'허용하지 않는 메서드입니다.'});
 const files={'/':'index.html','/app.js':'app.js','/monthly-report-ui.js':'monthly-report-ui.js','/groupware-html.js':'groupware-html.js','/style.css':'style.css','/dashboard.js':'dashboard.js','/dashboard.css':'dashboard.css','/login.css':'login.css','/login-reference.css':'login-reference.css','/assets/login-background.jpg':'assets/login-background.jpg','/lib.mjs':'../lib.mjs'};if(!files[p]){res.writeHead(404);return res.end();}
 const f=path.join(root,'public',files[p]);res.writeHead(200,{'Content-Type':p.endsWith('.jpg')?'image/jpeg':p.endsWith('.css')?'text/css; charset=utf-8':p.endsWith('.js')||p.endsWith('.mjs')?'text/javascript; charset=utf-8':'text/html; charset=utf-8','Cache-Control':'no-cache','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'"});res.end(await fs.readFile(f));
 }catch(e){console.error(e.message);if(!res.headersSent)json(res,400,{error:e.message});else res.end();}});
server.listen(port,'127.0.0.1',()=>console.log(`전산팀 업무관리 http://127.0.0.1:${port}\n데이터: ${storeFile}\n종료: Ctrl+C`));
