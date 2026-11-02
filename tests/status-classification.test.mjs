import {test} from 'node:test';
import assert from 'node:assert/strict';
import {classifyWorkStatus,statusAt,metrics,prepareScheduledImport} from '../lib.mjs';
test('미완료 상태는 진행·개발중/보류/그외 예정으로 통일',()=>{for(const status of ['진행','개발중'])assert.equal(classifyWorkStatus(status),'진행');assert.equal(classifyWorkStatus('보류'),'보류');for(const status of ['접수','','대기','기타',null])assert.equal(classifyWorkStatus(status),'예정');assert.equal(classifyWorkStatus('완료'),'완료');assert.equal(classifyWorkStatus('취소'),'취소');});
test('기존 접수 이력도 조회 시 예정으로 집계하며 원본 이력은 유지',()=>{const w={history:[{date:'2026-10-01',status:'접수'}],status:'접수',assignees:[]};assert.equal(statusAt(w,'2026-10-02'),'예정');assert.equal(metrics([w])['예정'],1);assert.equal(w.history[0].status,'접수');});
test('주간구분 예정이라도 진행 상태를 덮어쓰지 않는다',()=>{assert.equal(prepareScheduledImport({status:'진행',completed:'미정'},'예정').status,'진행');});
