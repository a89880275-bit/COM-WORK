import {test} from 'node:test';
import assert from 'node:assert/strict';
import {incidentWorks} from '../lib.mjs';
const filters={from:'2026-01-01',to:'2026-12-31',asOf:'2026-11-02'};
const item=(id,created,team='시스템',status='진행',category='장애대응')=>({id,created,category,status,assignees:[{team,name:'담당자'}],history:[{date:created,status}]});
test('장애 건수는 연간 접수일·기준일·파트·취소 제외 기준으로 집계',()=>{const works=[item('1','2026-10-20'),item('2','2025-10-20'),item('3','2026-12-01'),item('4','2026-10-21','원무'),item('5','2026-10-22','시스템','취소'),item('6','2026-10-23','시스템','진행','오류수정')];assert.deepEqual(incidentWorks(works,{...filters,team:'시스템'}).map(w=>w.id),['1']);assert.equal(incidentWorks(works,filters).length,2);});
test('공동담당 업무는 중복 집계하지 않고 최신순으로 표시',()=>{const w=item('1','2026-10-20');assert.equal(incidentWorks([w,w],filters).length,1);assert.deepEqual(incidentWorks([w,item('2','2026-11-01')],filters).map(w=>w.id),['2','1']);});
