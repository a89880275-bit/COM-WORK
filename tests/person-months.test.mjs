import {test} from 'node:test';
import assert from 'node:assert/strict';
import {personMonthlySeries,yearRange} from '../lib.mjs';
const settings={teams:['A','B'],people:{A:['가'],B:['나']},categories:['기타']};
const work={id:'1',title:'이월',category:'기타',created:'2026-01-01',completed:'2026-02-10',assignees:[{team:'A',name:'가'},{team:'B',name:'나'}],history:[{date:'2026-01-01',status:'진행'},{date:'2026-02-10',status:'완료'}]};
test('담당자별 12개월 완료·월말 미완료, 미래월 공란',()=>{const rows=personMonthlySeries([work],settings,yearRange('2026','2026-03-02'));assert.equal(rows.length,2);for(const p of rows){assert.equal(p.months.length,12);assert.equal(p.months[0].remaining,1);assert.equal(p.months[1].completed,1);assert.equal(p.months[1].remaining,0);assert.equal(p.months[3].completed,null);}});
test('파트와 담당자 선택 필터를 함께 적용한다',()=>{const rows=personMonthlySeries([work],settings,{...yearRange('2026','2026-03-02'),team:'A'},'A|가');assert.equal(rows.length,1);assert.equal(rows[0].name,'가');});
