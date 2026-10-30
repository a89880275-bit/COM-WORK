import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createWork,prepareScheduledImport,emptyStore} from '../lib.mjs';
const sample={title:'예정 업무',assignees:[{team:'시스템',name:'김도형'}],status:'예정',category:'기타',created:'2026-10-01',activityDate:'2026-10-30'};
test('주간구분 예정은 완료일 누락·임의문구·등록일 이전 날짜 모두 검사하지 않는다',()=>{for(const completed of ['', '미정','-', '2026-01-01'])assert.equal(createWork(prepareScheduledImport({...sample,completed},' 예 정 '),emptyStore().settings).completed,'');});
test('일반 주차의 완료일 검증은 유지한다',()=>assert.throws(()=>createWork(prepareScheduledImport({...sample,completed:'미정'},'10월4주'),emptyStore().settings),/날짜 형식/));
