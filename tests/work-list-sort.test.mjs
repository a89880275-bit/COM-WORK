import {test} from 'node:test';
import assert from 'node:assert/strict';
import {sortWorkList} from '../lib.mjs';
test('오래된 예정도 완료·진행보다 위에, 예정끼리는 최근 접수 순서로 표시한다',()=>{
 const rows=[{id:'done',status:'완료',created:'2026-11-02',completed:'2026-11-03'},{id:'old',status:'예정',created:'2026-01-01'},{id:'progress',status:'진행',created:'2026-11-03'},{id:'new',status:'접수',created:'2026-10-29'}];
 assert.deepEqual(sortWorkList(rows).map(w=>w.id),['new','old','progress','done']);
 assert.equal(rows[0].id,'done');
});
test('완료는 완료일, 예정은 등록일로 내림차순 정렬한다',()=>{const rows=[{id:'1',status:'완료',created:'2026-01-01',completed:'2026-10-30'},{id:'2',status:'예정',created:'2026-11-01',completed:'2026-12-01'},{id:'3',status:'완료',created:'2026-10-25',completed:'2026-10-26'}];assert.deepEqual(sortWorkList(rows).map(w=>w.id),['2','1','3']);assert.deepEqual(rows.map(w=>w.id),['1','2','3']);});
test('완료일이 없는 진행·보류도 등록일을 사용한다',()=>{const rows=[{id:'1',status:'진행',created:'2026-10-01'},{id:'2',status:'보류',created:'2026-10-20'}];assert.deepEqual(sortWorkList(rows).map(w=>w.id),['2','1']);});
