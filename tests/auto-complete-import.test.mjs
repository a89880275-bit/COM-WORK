import {test} from 'node:test';
import assert from 'node:assert/strict';
import {autoCompleteChoices,createWork,updateWork,emptyStore} from '../lib.mjs';
test('동일 제목의 완료 행은 유일한 예정 업무를 갱신하고 등록일과 업무ID를 보존한다',()=>{
 const settings=emptyStore().settings,team=settings.teams[0];
 const old=createWork({title:'동일 업무',status:'예정',category:settings.categories[0],assignees:[{team,name:settings.people[team][0]}],created:'2026-10-01',activityDate:'2026-10-01'},settings);
 const input={...old,status:'완료',created:'2026-11-01',activityDate:'2026-11-03',completed:'2026-11-03'};
 const [row]=autoCompleteChoices([{input}], [old]);assert.deepEqual(row.autoChoice,{action:'update',target:old.id});
 const updated=updateWork(old,{...input,created:old.created},settings);assert.equal(updated.id,old.id);assert.equal(updated.created,old.created);assert.equal(updated.status,'완료');assert.equal(updated.completed,'2026-11-03');
});
test('복수 후보·복수 완료 행·오류 행·진행 업무에는 자동 갱신을 제안하지 않는다',()=>{
 const old={id:'1',title:'업무',status:'예정'},row={input:{title:'업무',status:'완료'}};
 assert.equal(autoCompleteChoices([row],[old,{...old,id:'2'}])[0].autoChoice,null);
 assert.ok(autoCompleteChoices([row,row],[old]).every(r=>r.autoChoice===null));
 assert.equal(autoCompleteChoices([{...row,error:'오류'}],[old])[0].autoChoice,null);
 assert.equal(autoCompleteChoices([row],[{...old,status:'진행'}])[0].autoChoice,null);
});
test('최초 예정 엑셀 업로드일보다 실제 완료일이 빨라도 반영하고 후속 이력은 보호한다',()=>{
 const settings=emptyStore().settings,team=settings.teams[0],source={sheet:'직원',row:2};
 const old=createWork({title:'늦게 업로드한 예정 업무',status:'예정',category:settings.categories[0],assignees:[{team,name:settings.people[team][0]}],created:'2026-10-26',activityDate:'2026-11-02'},settings,source);
 const input={...old,status:'완료',completed:'2026-10-29',activityDate:'2026-11-03'};
 const updated=updateWork(old,input,settings,source);
 assert.deepEqual(updated.history.map(h=>[h.date,h.status]),[['2026-10-26','예정'],['2026-10-29','완료']]);
 assert.equal(old.history[0].date,'2026-11-02');assert.equal(updated.activities[0].date,'2026-11-02');
 assert.throws(()=>updateWork({...old,history:[...old.history,{date:'2026-11-02',status:'진행'}]},input,settings,source),/완료일/);
});
