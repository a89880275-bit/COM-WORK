import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateImportStatusDate} from '../lib.mjs';
test('접수·진행 등 미완료에 완료일이 있으면 오류이며 정상 완료와 빈 완료일은 허용한다',()=>{
 for(const status of ['접수','예정','진행','개발중',''])assert.throws(()=>validateImportStatusDate({status,completed:'2026-10-29'},'10월5주'),/상태는 미완료/);
 assert.doesNotThrow(()=>validateImportStatusDate({status:'완료',completed:'2026-10-29'},'10월5주'));
 assert.doesNotThrow(()=>validateImportStatusDate({status:'접수',completed:''},'10월5주'));
});
test('주간구분 예정과 보류는 완료일 검사 예외를 유지한다',()=>{
 assert.doesNotThrow(()=>validateImportStatusDate({status:'접수',completed:'2026-10-29'},' 예 정 '));
 assert.doesNotThrow(()=>validateImportStatusDate({status:'보류',completed:'2026-10-29'},'10월5주'));
});
