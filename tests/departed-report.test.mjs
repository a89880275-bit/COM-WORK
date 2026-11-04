import {test} from 'node:test';
import assert from 'node:assert/strict';
import {emptyStore,createWork,reportEligibleWorks,monthlyHighlights,majorReportText,reportPeriodFlow} from '../lib.mjs';
import {buildMonthlyServiceReport} from '../monthly-report.mjs';
test('퇴사자 단독 예정은 보고·주요내용에서 제외하며 완료와 재직 공동담당은 유지한다',()=>{
 const s=emptyStore(),team=s.settings.teams[0],[retired,active]=s.settings.people[team];s.settings.departedNames=[retired];
 const make=(title,names,status='예정')=>createWork({title,isMajor:true,assignees:names.map(name=>({team,name})),category:'기타',status,created:'2026-10-01',activityDate:'2026-10-29',completed:status==='완료'?'2026-10-29':''},s.settings);
 const excluded=make('퇴사자 예정',[retired]),completed=make('퇴사자 완료',[retired],'완료'),joint=make('공동 예정',[retired,active]),own=make('재직자 예정',[active]);s.works=[excluded,completed,joint,own];
 const filter={from:'2026-10-01',to:'2026-10-31',asOf:'2026-10-31'};
 assert.deepEqual(reportEligibleWorks(s.works,[retired]).map(w=>w.id),[completed.id,joint.id,own.id]);
 const rows=monthlyHighlights(s.works,[team],filter,[retired]);assert.equal(rows.length,3);assert.ok(!rows.some(r=>r.work.id===excluded.id));assert.ok(!majorReportText(s.works,[retired]).includes(excluded.title));
 const flow=reportPeriodFlow(s.works,filter,[retired]);assert.equal(flow.remaining,2);assert.equal(flow.completed,1);assert.equal(flow.received,3);
 const report=buildMonthlyServiceReport(s,'2026-10','2026-11-04');assert.equal(report.detailRows.length,3);assert.ok(!report.summary.includes(excluded.title));assert.equal(report.teamRows[0].remaining,2);
 assert.equal(s.works.length,4);assert.ok(s.works.some(w=>w.id===excluded.id));
});
