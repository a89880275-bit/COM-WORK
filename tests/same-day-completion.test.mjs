import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createWork,updateWork,emptyStore,normalizeExcelDate} from '../lib.mjs';
const settings=emptyStore().settings;
const input={title:'당일 처리',assignees:[{team:'시스템',name:'김도형'}],category:'오류수정',status:'완료',created:'2026-10-01',completed:'2026-10-01',activityDate:'2026-10-01'};
test('등록일과 완료일이 같은 업무는 당일 및 나중 업로드 모두 허용',()=>{assert.equal(createWork(input,settings).completed,input.created);assert.equal(createWork({...input,activityDate:'2026-10-30'},settings).completed,input.created);});
test('같은 날 등록·진행·완료 전이를 허용',()=>{const w=createWork({...input,status:'진행',completed:''},settings);assert.equal(updateWork(w,input,settings).status,'완료');});
test('엑셀의 같은 날짜는 한 자리 월일·구분자·시간 차이를 정규화',()=>{for(const value of ['2026/1/1','2026.01.01','2026-1-1 15:30:00','2026-01-01T00:00:00'])assert.equal(normalizeExcelDate(value),'2026-01-01');assert.equal(createWork({...input,created:normalizeExcelDate('2026/1/1'),completed:normalizeExcelDate('2026.01.01'),activityDate:'2026-01-01'},settings).status,'완료');});
test('완료일이 등록일보다 이전이면 계속 거부',()=>{assert.throws(()=>createWork({...input,completed:'2026-09-30'},settings),/같거나 이후/);});
