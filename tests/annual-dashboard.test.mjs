import {test} from 'node:test';
import assert from 'node:assert/strict';
import {yearRange,periodFlow} from '../lib.mjs';
test('연간 조회는 1월1일부터 12월31일까지, 올해 기준일은 오늘',()=>{assert.deepEqual(yearRange('2026','2026-11-02'),{from:'2026-01-01',to:'2026-12-31',asOf:'2026-11-02'});assert.equal(yearRange('2025','2026-11-02').asOf,'2025-12-31');});
test('전년 이월의 올해 완료와 전월 완료를 연간에 포함하지만 해당 주 완료에는 제외',()=>{const w={id:'1',created:'2025-12-01',completed:'2026-10-15',history:[{date:'2025-12-01',status:'진행'},{date:'2026-10-15',status:'완료'}],assignees:[{team:'시스템'}]};const annual=periodFlow([w],yearRange('2026','2026-11-02'));assert.equal(annual.carry,1);assert.equal(annual.completed,1);assert.equal(periodFlow([w],{from:'2026-11-02',to:'2026-11-08',asOf:'2026-11-02'}).completed,0);});
