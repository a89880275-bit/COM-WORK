import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createWork,emptyStore,updateWork,majorReportText,monthlyHighlights} from '../lib.mjs';
import {buildMonthlyServiceReport} from '../monthly-report.mjs';
import {majorTable} from '../public/dashboard.js';
const input={title:'빨간 제목 업무',isMajor:true,assignees:[{team:'시스템',name:'김도형'}],status:'진행',category:'기타',created:'2026-10-01',activityDate:'2026-10-30'};
test('중요 체크 저장·해제와 월간보고 자동 제안에 같은 기준을 사용한다',()=>{
 const store=emptyStore(),major=createWork(input,store.settings),normal=createWork({...input,title:'일반 업무',isMajor:false},store.settings);store.works=[major,normal];
 const report=buildMonthlyServiceReport(store,'2026-10','2026-11-04');assert.ok(report.summary.includes(major.title));assert.ok(!report.summary.includes(normal.title));assert.ok(majorReportText(store.works).includes(major.title));assert.ok(!majorReportText(store.works).includes(normal.title));
 const cleared=updateWork(major,{...input,isMajor:false},store.settings);assert.equal(cleared.isMajor,false);assert.equal(monthlyHighlights([cleared,normal],store.settings.teams,{from:'2026-10-01',to:'2026-10-31',asOf:'2026-10-31'}).length,0);
});
test('빨간 제목 표시를 저장하고 일반 수정에서도 유지한다',()=>{const w=createWork(input,emptyStore().settings);const {isMajor,...ordinary}=input;assert.equal(updateWork(w,ordinary,emptyStore().settings).isMajor,true);});
test('주요업무는 빨간 제목만 표시하고 상태로 제외하거나 6건으로 자르지 않는다',()=>{const red=Array.from({length:8},(_,i)=>createWork({...input,title:'주요 '+i,status:i===0?'완료':'진행'},emptyStore().settings));const normal=createWork({...input,title:'일반 업무',isMajor:false},emptyStore().settings);const html=majorTable([...red,normal]);assert.ok(!html.includes('일반 업무'));assert.ok(html.includes('주요 0'));assert.ok(html.includes('주요 7'));});
