import {test} from 'node:test';
import assert from 'node:assert/strict';
import {normalizeWeekLabel,filenameWeekLabel,includeWeeklyRow,validateExcelMapping} from '../lib.mjs';
test('누적 파일은 지정 주차와 예정 구분을 포함하고 다른 주차는 제외한다',()=>{assert.equal(includeWeeklyRow('10월4주','완료','10월4주'),true);assert.equal(includeWeeklyRow('10월3주','완료','10월4주'),false);assert.equal(includeWeeklyRow('1월1주','진행','10월4주'),false);assert.equal(includeWeeklyRow('예정','접수','10월4주'),true);assert.equal(includeWeeklyRow('10월3주','예정','10월4주'),false);});
test('주차 표기 공백과 주차 접미사는 정규화한다',()=>{assert.equal(normalizeWeekLabel('10월 4주차'),'10월4주');assert.equal(normalizeWeekLabel('13월4주'),'');assert.equal(includeWeeklyRow('','접수',''),false);});
test('공통 매핑에 주간구분 컬럼을 저장한다',()=>{assert.equal(validateExcelMapping({header:1,map:{title:0,assignees:1,week:5}}).map.week,5);});

test('파일명 주차는 공백 유무와 관계없이 추출하고 같은 주간구분과 예정을 포함한다',()=>{for(const name of ['주간업무_2026년 10월5주차.xlsx','주간업무_2026년 10월 5주차.xlsx']){const week=filenameWeekLabel(name);assert.equal(week,'10월5주');assert.equal(includeWeeklyRow('10월 5주','완료',week),true);assert.equal(includeWeeklyRow('10월5주','예정',week),true);assert.equal(includeWeeklyRow('10월4주','예정',week),false);assert.equal(includeWeeklyRow('예정','예정',week),true);}assert.equal(filenameWeekLabel('추가항목.xlsx'),'');});
