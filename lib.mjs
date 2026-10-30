export const teams=['진료간호','원무','진료지원','행정','시스템'];
export const people={'진료간호':['이창주','황진솔','장효은'],'원무':['이장우','김완중'],'진료지원':['류한승','신혜린'],'행정':['임영택','김예성'],'시스템':['김시섭','김도형']};
export const categories=['오류수정','기능개선','신규개발','데이터요청','통계/실적','권한관리','정책/수가반영','연동/API','사용자지원','서버/시스템','교육/회의','장애대응','배치/자동화','기타'];
export const statuses=['접수','진행','완료','예정','보류','취소'];
export const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
export const id=()=>globalThis.crypto.randomUUID();
export const isStatisticsSheet=name=>['통계','통계시트'].includes(String(name||'').replace(/\s/g,''));
export const isExcludedUploadStatus=status=>String(status||'').trim()==='보류';
export function validateExcelMapping(input){
 const header=Number(input.header);if(!Number.isInteger(header)||header<1||header>20000)throw Error('공통 헤더 행은 1~20,000 사이로 입력하세요.');
 const keys=['title','assignees','status','category','created','completed','description','reason','externalId','week'];
 const map=Object.fromEntries(keys.map(k=>[k,Number(input.map?.[k]??-1)]));
 if(Object.values(map).some(v=>!Number.isInteger(v)||v< -1||v>149))throw Error('연결 컬럼은 1~150열 범위로 지정하세요.');
 const assigneeSource=input.assigneeSource==='sheet'?'sheet':'column';
 if(map.title<0||assigneeSource==='column'&&map.assignees<0)throw Error('업무 제목과 담당자 컬럼을 연결하세요. 담당자는 시트명 사용으로 변경할 수 있습니다.');
 const statusText=String(input.statusText||'').trim();
 if(statusText.length>2000||statusText&&statusText.split(',').some(s=>{const a=s.split('=').map(s=>s.trim());return a.length!==2||!a[0]||!statuses.includes(a[1]);}))throw Error('상태 매핑은 처리중=진행, 대기=접수 형식으로 입력하세요.');
 return {header,map,assigneeSource,statusText,kind:input.kind==='장비지원'?'장비지원':'개발업무'};
}
export function emptyStore(){return {schema:1,revision:0,settings:{teams,people,categories},works:[],batches:[],reports:[],notices:[],audit:[]};}
export function normalizeWeekLabel(value){const match=String(value||'').replace(/\s/g,'').match(/^(\d{1,2})월(\d)주(?:차)?$/);return match&&Number(match[1])>=1&&Number(match[1])<=12&&Number(match[2])>=1&&Number(match[2])<=6?`${Number(match[1])}월${Number(match[2])}주`:'';}
export function includeWeeklyRow(week,status,selected){return normalizeWeekLabel(week)===normalizeWeekLabel(selected)&&!!normalizeWeekLabel(selected)||String(week).replace(/\s/g,'')==='예정'||status==='예정';}
export function dateOK(s){return typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&!Number.isNaN(Date.parse(s))&&new Date(s).toISOString().slice(0,10)===s;}
export function normalizeExcelDate(value){
 const text=String(value??'').trim();
 if(/^\d{5}(\.\d+)?$/.test(text))return new Date(Date.UTC(1899,11,30)+Math.floor(Number(text))*86400000).toISOString().slice(0,10);
 const match=text.match(/^(\d{4})[./-](\d{1,2})[./-](\d{1,2})(?:\s|T|$)/);
 return match?`${match[1]}-${match[2].padStart(2,'0')}-${match[3].padStart(2,'0')}`:text;
}
export function prepareImportedWork(input,period){
 if(input.status!=='보류')return input;
 // 원본 날짜는 upload_rows.raw에 보존하고 집계용 날짜만 안전하게 설정한다.
 return {...input,created:dateOK(input.created)&&input.created<=period?input.created:period,completed:'',started:'',due:''};
}
export function prepareScheduledImport(input,week){
 return String(week||'').replace(/\s/g,'')==='예정'?{...input,status:'예정',completed:''}:input;
}
export function validateWork(input,settings){
 const title=String(input.title||'').trim();if(!title||title.length>300)throw Error('업무 제목은 1~300자로 입력해 주세요.');
 const assignees=Array.isArray(input.assignees)?input.assignees:[];
 if(!assignees.length||assignees.some(a=>!settings.teams.includes(a.team)||!settings.people[a.team]?.includes(a.name)))throw Error('등록된 파트와 담당자를 선택해 주세요.');
 if(!statuses.includes(input.status)||!settings.categories.includes(input.category))throw Error('상태 또는 업무구분을 확인해 주세요.');
 if(!dateOK(input.created)||!dateOK(input.activityDate||input.created))throw Error('등록일과 활동일을 확인해 주세요.');
 if((input.activityDate||input.created)<input.created)throw Error('활동일은 등록일 이후여야 합니다.');
 if(input.due&&!dateOK(input.due))throw Error('목표일을 확인해 주세요.');
 if(input.completed&&!dateOK(input.completed))throw Error('완료일의 날짜 형식을 확인해 주세요.');
 if(input.completed&&input.completed<input.created)throw Error('완료일은 등록일과 같거나 이후여야 합니다.');
 if(input.status==='보류'&&!String(input.reason||'').trim())throw Error('보류 사유를 입력해 주세요.');
 const progress=input.progress===''||input.progress===undefined||input.progress===null?null:Number(input.progress);
 if(progress!==null&&(!Number.isInteger(progress)||progress<0||progress>100))throw Error('진행률은 0~100 사이의 정수로 입력해 주세요.');
 if(input.status!=='완료'&&progress===100)throw Error('진행률 100%는 완료 상태로 저장해 주세요.');
 if(input.started&&(!dateOK(input.started)||input.started<input.created||input.started>(input.activityDate||today())))throw Error('시작일은 등록일 이후, 활동일 이전이어야 합니다.');
 return {title,assignees:assignees.map(a=>({team:a.team,name:a.name})),category:input.category,status:input.status,created:input.created,started:input.started||'',progress:input.status==='완료'?100:progress,requestDept:String(input.requestDept||'').slice(0,100),equipmentType:String(input.equipmentType||'').slice(0,100),due:input.due||'',completed:input.status==='완료'?(input.completed||input.activityDate||today()):'',description:String(input.description||'').slice(0,20000),reason:String(input.reason||'').slice(0,2000),tags:String(input.tags||'').slice(0,1000),kind:input.kind==='장비지원'?'장비지원':'개발업무'};
}
export function createWork(input,settings,source=null){const w=validateWork(input,settings);if(w.status==='완료'&&w.completed>(input.activityDate||w.created))throw Error('완료일은 활동일 이후일 수 없습니다.');return {...w,id:id(),version:1,updatedAt:new Date().toISOString(),source,history:[{date:w.status==='완료'?w.completed:input.activityDate||w.created,status:w.status,reason:w.reason}],activities:[{date:input.activityDate||w.created,content:w.description,source}]};}
export function updateWork(old,input,settings,source=null){
 const effective=structuredClone(settings);
 for(const a of old.assignees){if(!effective.people[a.team]?.includes(a.name))effective.people[a.team]=[...(effective.people[a.team]||[]),a.name];}
 if(!effective.categories.includes(old.category))effective.categories.push(old.category);
 const w=validateWork({...input,started:input.started??old.started,requestDept:input.requestDept??old.requestDept,equipmentType:input.equipmentType??old.equipmentType,progress:input.progress===undefined&&input.status===old.status?old.progress:input.progress},effective),date=input.activityDate||today();
 if(date<old.created||date<(old.history.at(-1)?.date||old.created))throw Error('최근 상태 이력보다 이전 날짜로 변경할 수 없습니다.');
 const statusDate=w.status==='완료'?w.completed:date;
 if(w.status==='완료'&&(statusDate>date||old.status!=='완료'&&statusDate<(old.history.at(-1)?.date||old.created)))throw Error('완료일은 최근 상태 이력 이후, 활동일 이전이어야 합니다.');
 if(old.status==='완료'&&w.status!=='완료'&&!w.reason.trim())throw Error('완료 업무를 재오픈할 때는 사유가 필요합니다.');
 if(old.status==='완료'&&w.status==='완료'&&old.completed!==w.completed)throw Error('완료일 변경은 재오픈한 뒤 다시 완료 처리해 주세요.');
 return {...old,...w,version:old.version+1,updatedAt:new Date().toISOString(),history:[...old.history,...(old.status!==w.status?[{date:statusDate,status:w.status,reason:w.reason}]:[])],activities:[...old.activities,{date,content:w.reason||w.description,source}]};
}
export function statusAt(w,asOf){return [...w.history].filter(h=>h.date<=asOf).at(-1)?.status||null;}
export function selectWorks(works,{from='0000-01-01',to='9999-12-31',asOf=to,basis='created',team='',status='',q='',kind=''}={}){
 return works.map(w=>({...w,status:statusAt(w,asOf)})).filter(w=>w.status&&(w.status!=='취소'||status==='취소')&&w.created<=asOf&&(!team||w.assignees.some(a=>a.team===team))&&(!status||(status==='기타'?['접수','예정','보류'].includes(w.status):w.status===status))&&(!kind||w.kind===kind)&&(!q||`${w.title} ${w.id} ${w.assignees.map(a=>a.name)} ${w.tags}`.toLowerCase().includes(q.toLowerCase()))&&(basis==='activity'?w.activities.some(a=>a.date>=from&&a.date<=to&&a.date<=asOf):basis==='completed'?w.history.some(h=>h.status==='완료'&&h.date>=from&&h.date<=to&&h.date<=asOf):w.created>=from&&w.created<=to));
}
export function metrics(works){const counts=Object.fromEntries(statuses.map(s=>[s,works.filter(w=>w.status===s).length]));return {total:works.length,...counts,rate:works.length?Math.round(counts['완료']/works.length*100):null,participations:works.reduce((s,w)=>s+new Set(w.assignees.map(a=>a.team)).size,0)};}
export function candidates(row,works){return works.filter(w=>(row.externalId&&w.externalId===row.externalId)||w.title.replace(/\s/g,'')===row.title?.replace(/\s/g,'')).map(w=>({id:w.id,title:w.title,assignees:w.assignees,status:w.status}));}
