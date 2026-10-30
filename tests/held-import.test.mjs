import {test} from 'node:test';
import assert from 'node:assert/strict';
import {prepareImportedWork,createWork,emptyStore} from '../lib.mjs';
const base={title:'보류 업무',status:'보류',reason:'외부 협의',assignees:[{team:'시스템',name:'김도형'}],category:'기타',activityDate:'2026-10-30'};
test('보류 업로드는 빈값·잘못된 날짜·역전된 날짜를 오류로 처리하지 않는다',()=>{for(const dates of [{created:'미정',completed:'추후'},{created:'2026-12-01',completed:'2026-01-01'},{created:'',completed:''}]){const work=createWork(prepareImportedWork({...base,...dates},base.activityDate),emptyStore().settings);assert.equal(work.status,'보류');assert.equal(work.created,base.activityDate);assert.equal(work.completed,'');}});
test('다른 상태의 업로드 날짜 검증은 유지한다',()=>{const input=prepareImportedWork({...base,status:'완료',created:'2026-10-30',completed:'미정'},base.activityDate);assert.throws(()=>createWork(input,emptyStore().settings),/날짜 형식/);});
