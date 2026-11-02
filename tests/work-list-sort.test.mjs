import {test} from 'node:test';
import assert from 'node:assert/strict';
import {sortWorkList} from '../lib.mjs';
test('완료는 완료일, 예정은 등록일로 내림차순 정렬한다',()=>{const rows=[{id:'1',status:'완료',created:'2026-01-01',completed:'2026-10-30'},{id:'2',status:'예정',created:'2026-11-01',completed:'2026-12-01'},{id:'3',status:'완료',created:'2026-10-25',completed:'2026-10-26'}];assert.deepEqual(sortWorkList(rows).map(w=>w.id),['2','1','3']);assert.deepEqual(rows.map(w=>w.id),['1','2','3']);});
test('완료일이 없는 진행·보류도 등록일을 사용한다',()=>{const rows=[{id:'1',status:'진행',created:'2026-10-01'},{id:'2',status:'보류',created:'2026-10-20'}];assert.deepEqual(sortWorkList(rows).map(w=>w.id),['2','1']);});
