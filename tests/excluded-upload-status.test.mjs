import {test} from 'node:test';
import assert from 'node:assert/strict';
import {isExcludedUploadStatus} from '../lib.mjs';
test('보류 행은 업로드에서 제외하며 다른 상태는 유지',()=>{assert.equal(isExcludedUploadStatus('보류'),true);assert.equal(isExcludedUploadStatus(' 보류 '),true);for(const status of ['진행','완료','예정','접수'])assert.equal(isExcludedUploadStatus(status),false);});
