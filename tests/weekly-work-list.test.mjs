import {test} from 'node:test';
import assert from 'node:assert/strict';
import {weeklyWorkList} from '../lib.mjs';
const make=(id,status,created,completed='')=>({id,title:id,created,completed,status,assignees:[{team:'시스템',name:'담당자'}],history:[{date:created,status:'예정'},...(completed?[{date:completed,status:'완료'}]:[{date:created,status}])],activities:[],tags:''});
test('주간은 해당 주 완료와 이전부터 남은 미결을 표시하고 이전 완료는 제외한다',()=>{
 const works=[make('old','완료','2026-10-01','2026-10-30'),make('week','완료','2026-10-01','2026-11-02'),make('pending','진행','2026-01-01'),make('hold','보류','2026-02-01'),make('future','완료','2026-10-01','2026-11-10')];
 const f={from:'2026-11-02',to:'2026-11-08',asOf:'2026-11-03'};
 assert.deepEqual(weeklyWorkList(works,f).map(w=>w.id),['week','pending','hold','future']);
 assert.deepEqual(weeklyWorkList(works,{...f,status:'완료'}).map(w=>w.id),['week']);
 assert.deepEqual(weeklyWorkList(works,{...f,team:'원무'}),[]);
});
