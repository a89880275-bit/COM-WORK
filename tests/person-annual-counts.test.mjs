import {test} from 'node:test';
import assert from 'node:assert/strict';
import {personAnnualCounts,yearRange} from '../lib.mjs';
const settings={teams:['A'],people:{A:['가','나','다']},categories:['기타']};
const works=[{id:'1',category:'기타',created:'2026-01-01',completed:'2026-03-01',assignees:[{team:'A',name:'가'},{team:'A',name:'나'}],history:[{date:'2026-01-01',status:'진행'},{date:'2026-03-01',status:'완료'}]},{id:'2',category:'기타',created:'2026-01-02',assignees:[{team:'A',name:'가'}],history:[{date:'2026-01-02',status:'진행'}]}];
test('담당자별 연간 완료와 기준일 미완료를 계산하며 잔여를 월별 합산하지 않는다',()=>{const data=personAnnualCounts(works,settings,yearRange('2026','2026-11-02'));assert.deepEqual(data.map(p=>[p.name,p.completed,p.remaining]),[['가',1,1],['나',1,0],['다',0,0]]);});
test('과거 연도의 기준일과 고유업무 중복 제거를 적용한다',()=>{const data=personAnnualCounts([...works,works[0]],settings,{from:'2026-01-01',to:'2026-12-31',asOf:'2026-02-01'});assert.equal(data[0].completed,0);assert.equal(data[0].remaining,2);});
