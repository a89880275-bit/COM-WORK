import {monthRange,reportPeriodFlow,monthlyHighlights,sortWorkList,normalizeExcelDate,dateOK,classifyWorkStatus} from './lib.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';

export const detailHeaders=['상태','접수일자','시행일자','제목','상세내용','요청부서','현업담당자','개발자','예정일자','완료일자'];
function compareReportAssignees(a,b,settings){
 const teamRank=t=>{const i=settings.teams.indexOf(t);return i<0?settings.teams.length:i;};
 const personRank=p=>{const names=settings.people[p.team]||[],i=names.indexOf(p.name);return i<0?names.length:i;};
 return teamRank(a.team)-teamRank(b.team)||a.team.localeCompare(b.team,'ko')||personRank(a)-personRank(b)||a.name.localeCompare(b.name,'ko');
}
export function sortMonthlyDetailWorks(works,settings,cutoff){
 const owner=w=>[...w.assignees].sort((a,b)=>compareReportAssignees(a,b,settings))[0]||{team:'',name:''};
 const date=w=>w.status==='완료'?(w.history.filter(h=>classifyWorkStatus(h.status)==='완료'&&h.date<=cutoff).at(-1)?.date||w.completed||w.created):w.created;
 return [...works].sort((a,b)=>compareReportAssignees(owner(a),owner(b),settings)||date(a).localeCompare(date(b))||a.created.localeCompare(b.created)||a.id.localeCompare(b.id));
}
export function numberedSummaryLines(summary){let number=0;return String(summary||'').replace(/\r/g,'').split('\n').map(line=>line.trim()?`${++number}. ${line.trim().replace(/^\d{1,2}\.\s*/, '')}`:'');}
export function reportRoster(settings){
 const departed=new Set(settings.departedNames||[]),names=[settings.teamLeaderName,...settings.teams.flatMap(t=>settings.people[t]||[])];
 return [...new Set(names.filter(n=>n&&!departed.has(n)))].map(name=>({name,status:'',external:false}));
}
export function reportTextLines(value,maxLines,label){
 if(typeof value!=='string')throw Error(label+'를 입력하세요.');
 const lines=value.replace(/\r/g,'').split('\n');
 if(lines.length>maxLines||lines.reduce((n,line)=>n+Math.max(1,Math.ceil([...line].reduce((w,c)=>w+(c.charCodeAt(0)>255?1:0.55),0)/65)),0)>maxLines)throw Error(label+'는 양식에 맞게 '+maxLines+'줄 이내로 정리하세요.');
 return lines;
}
export function buildMonthlyServiceReport(store,month,today,input={}){
 const range=monthRange(month,today);if(range.from>today)throw Error('미래 월은 보고서를 만들 수 없습니다.');
 const rawMap={implemented:6,requestDept:9,requestContact:10,due:12,...input.rawMap};
 for(const key of ['implemented','requestDept','requestContact','due'])if(!Number.isInteger(rawMap[key])||rawMap[key]<-1||rawMap[key]>149)throw Error('원본 열 연결은 연결 안 함 또는 1~150열로 지정하세요.');
 const reportFlow=reportPeriodFlow(store.works,range,store.settings.departedNames||[]);
 const works=sortWorkList(reportFlow.rows.filter(w=>w.status!=='취소'&&(w.status!=='완료'||[w.completed,...w.history.filter(h=>classifyWorkStatus(h.status)==='완료').map(h=>h.date)].some(d=>d>=range.from&&d<=range.asOf))));
 const teamRows=store.settings.teams.map(team=>{const rows=works.filter(w=>w.assignees.some(a=>a.team===team)),completed=rows.filter(w=>w.status==='완료').length;return {team,total:rows.length,remaining:rows.length-completed,completed};});
 const rawIndex=new Map();for(const b of store.batches)for(const row of b.rows||[])rawIndex.set(b.id+'|'+row.sheet+'|'+row.row,row.raw);
 let missingContact=0;
 const detailRows=sortMonthlyDetailWorks(works,store.settings,range.asOf).map(w=>{
  const refs=[w.source,...(w.activities||[]).filter(a=>a.date<=range.asOf).map(a=>a.source)].filter(Boolean).reverse();
  const raw=refs.map(s=>rawIndex.get(s.batchId+'|'+s.sheet+'|'+s.row)).find(Boolean)||[];
  const sourceDate=key=>{const v=normalizeExcelDate(raw[rawMap[key]]);return dateOK(v)?v:'';};
  const contact=w.requestContact||String(raw[rawMap.requestContact]||'');if(!contact)missingContact++;
  const completion=w.status==='완료'?(w.history.filter(h=>classifyWorkStatus(h.status)==='완료'&&h.date<=range.asOf).at(-1)?.date||w.completed||''):'';
  return {id:w.id,isMajor:!!w.isMajor,values:[w.status,w.created,w.implemented||sourceDate('implemented'),w.title,w.description||'',w.requestDept||String(raw[rawMap.requestDept]||''),contact,[...w.assignees].sort((a,b)=>compareReportAssignees(a,b,store.settings)).map(a=>a.name).join(', '),w.due||sourceDate('due'),completion]};
 });
 const highlights=monthlyHighlights(reportFlow.rows,store.settings.teams,range,store.settings.departedNames||[]);
 const defaultSummary=highlights.map(({team,work:w})=>{const title=w.title.replace(/\s+/g,' ').trim();return `${team}: ${title} (${w.status})`;}).join('\n');
 const legacySummary=input.savedAt&&input.summaryFormatVersion!==2;
 const summary=legacySummary||input.summary===input.suggestedSummary?defaultSummary:(input.summary??defaultSummary),issues=input.issues??'';
 reportTextLines(summary,15,'주요 보고내용');reportTextLines(issues,3,'이슈사항');
 const roster=reportRoster(store.settings),supplied=input.attendance||[];
 if(!Array.isArray(supplied)||supplied.length>30)throw Error('근태 인원은 30명 이내로 입력하세요.');
 const attendance=roster.map(p=>({...p,status:String(supplied.find(v=>!v.external&&v.name===p.name)?.status||'').trim()}));
 for(const p of supplied.filter(v=>v.external)){const name=String(p.name||'').trim();if(!name||name.length>12||attendance.some(v=>v.name===name))throw Error('비상주 인원 이름은 중복 없이 12자 이내로 입력하세요.');attendance.push({name,status:String(p.status||'').trim(),external:true});}
 if(attendance.some(p=>p.status.length>16))throw Error('근태 내용은 인원별 16자 이내로 입력하세요.');
 return {month,range,teamRows,detailRows,detailHeaders,summary,summaryFormatVersion:2,suggestedSummary:defaultSummary,issues,attendance,rawMap,missingContact,generatedAt:new Date().toISOString()};
}
export function validatePptReport(report){
 if(report.attendance.some(p=>!p.status))throw Error('PPT를 생성하려면 모든 인원의 근태를 입력하세요.');
 if(report.attendance.length>18)throw Error('현재 1장 양식의 근태 인원은 최대 18명입니다.');
 reportTextLines(numberedSummaryLines(report.summary).join('\n'),15,'주요 보고내용');reportTextLines(report.issues,3,'이슈사항');
}
export async function exportMonthlyServiceReport(report,format){
 if(!['pptx','xlsx'].includes(format))throw Error('파일 형식을 확인하세요.');
 if(format==='pptx')validatePptReport(report);
 const root=path.dirname(fileURLToPath(import.meta.url));
 const dir=await fs.mkdtemp(path.join(root,'tmp','monthly-report-'));
 try{
  const input=path.join(dir,'input.json'),output=path.join(dir,'report.'+format);
  await fs.writeFile(input,JSON.stringify({...report,numberedSummary:numberedSummaryLines(report.summary)}));
  await new Promise((resolve,reject)=>{
   const child=spawn('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',path.join(root,'scripts/export-monthly-report.ps1'),'-InputPath',input,'-TemplatePath',path.join(root,'report-templates',format==='pptx'?'service-monthly.pptx':'service-details.xlsx'),'-OutputPath',output,'-Format',format],{windowsHide:true});
   let error='';const timer=setTimeout(()=>{child.kill();reject(Error('보고서 생성 시간이 초과되었습니다.'));},90000);
   child.stderr.on('data',v=>{error+=v.toString();});child.on('error',e=>{clearTimeout(timer);reject(e);});child.on('exit',code=>{clearTimeout(timer);code===0?resolve():reject(Error('보고서 생성 실패: '+error.slice(0,700)));});
  });
  return await fs.readFile(output);
 }finally{await fs.rm(dir,{recursive:true,force:true});}
}
