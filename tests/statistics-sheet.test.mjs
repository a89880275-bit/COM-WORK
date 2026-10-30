import {test} from 'node:test';
import assert from 'node:assert/strict';
import {isStatisticsSheet} from '../lib.mjs';
test('통계 시트와 공백 포함 통계 시트명은 등록에서 제외',()=>{for(const name of ['통계',' 통계 ','통계 시트'])assert.equal(isStatisticsSheet(name),true);});
test('개발자 시트와 일반 업무 시트는 유지',()=>{for(const name of ['김도형','시스템','통계개발','통계요청업무'])assert.equal(isStatisticsSheet(name),false);});
