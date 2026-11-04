import {test} from 'node:test';
import assert from 'node:assert/strict';
import {includeWeeklyRow,prepareImportedWork,createWork,emptyStore} from '../lib.mjs';
test('보류 행은 주차와 관계없이 포함하고 날짜·사유 미기재도 보류로 반영한다',()=>{
 assert.equal(includeWeeklyRow('1월1주','보류','10월5주'),true);assert.equal(includeWeeklyRow('보류','보류','10월5주'),true);
 assert.equal(includeWeeklyRow('1월1주','진행','10월5주'),false);
 const work=createWork(prepareImportedWork({title:'보류 업무',status:'보류',created:'미정',completed:'추후',activityDate:'2026-10-30',category:'기타',assignees:[{team:'시스템',name:'김도형'}]},'2026-10-30'),emptyStore().settings);
 assert.equal(work.status,'보류');assert.equal(work.completed,'');assert.equal(work.reason,'엑셀 보류 상태 (사유 미기재)');
});
