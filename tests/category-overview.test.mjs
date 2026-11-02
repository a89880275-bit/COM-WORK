import {test} from 'node:test';
import assert from 'node:assert/strict';
import {categoryOverview} from '../lib.mjs';
const settings={teams:['A','B'],people:{A:['가','나'],B:['다']},categories:['개선','장애']};
test('전체는 고유업무, 담당자는 공동담당별 1건으로 구분한다',()=>{const a={id:'1',category:'개선',assignees:[{team:'A',name:'가'},{team:'A',name:'가'},{team:'B',name:'다'}]},b={id:'2',category:'장애',assignees:[{team:'A',name:'가'}]};const data=categoryOverview([a,a,b],settings);assert.equal(data.total,2);assert.equal(data.people.find(p=>p.name==='가').total,2);assert.equal(data.people.find(p=>p.name==='다').total,1);assert.equal(data.people.find(p=>p.name==='나').total,0);});
test('파트별 담당자와 과거 담당자 스냅샷을 보존한다',()=>{const data=categoryOverview([{id:'1',category:'과거분류',assignees:[{team:'A',name:'이전직원'}]}],settings,'A');assert.ok(data.people.some(p=>p.name==='이전직원'));assert.ok(!data.people.some(p=>p.team==='B'));assert.equal(data.totals.find(c=>c.name==='과거분류').count,1);});
