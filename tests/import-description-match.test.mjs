import {test} from 'node:test';
import assert from 'node:assert/strict';
import {candidates,autoCompleteChoices} from '../lib.mjs';
const old={id:'1',title:'동일 제목',description:'기존 기능 개발',status:'예정',externalId:'EXT1'};
test('완료 행에 기존 내용 뒤 추가된 상세내용은 업데이트로 연결한다',()=>{
 const input={...old,status:'완료',description:'기존 기능 개발\n추가개발: 조회 조건 추가'};
 assert.deepEqual(candidates(input,[old]),[]);
 assert.deepEqual(autoCompleteChoices([{input}],[old])[0].autoChoice,{action:'update',target:'1'});
});
test('제목·내용이 같은 완료 업무만 기존 예정 업무에 연결하고 줄바꿈 형식은 무시한다',()=>{
 const work={...old,description:'기존 기능\r\n개발'};
 const input={...old,status:'완료',description:'기존 기능\n개발'};
 assert.equal(candidates(input,[work]).length,1);
 assert.deepEqual(autoCompleteChoices([{input}],[work])[0].autoChoice,{action:'update',target:'1'});
});
