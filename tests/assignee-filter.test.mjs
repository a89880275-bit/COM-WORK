import {test} from 'node:test';
import assert from 'node:assert/strict';
import {filterByAssignee} from '../lib.mjs';
test('담당자 필터는 공동담당을 포함하고 파트까지 정확히 구분한다',()=>{const rows=[{id:1,assignees:[{team:'A',name:'가'},{team:'B',name:'나'}]},{id:2,assignees:[{team:'B',name:'가'}]}];assert.equal(filterByAssignee(rows).length,2);assert.deepEqual(filterByAssignee(rows,'A|가').map(w=>w.id),[1]);assert.deepEqual(filterByAssignee(rows,'B|나').map(w=>w.id),[1]);assert.deepEqual(filterByAssignee(rows,'B|가').map(w=>w.id),[2]);});
