import {test} from 'node:test';
import assert from 'node:assert/strict';
import {candidates,autoCompleteChoices,hasDocumentNumber} from '../lib.mjs';
const old={id:'1',title:'기존 제목',description:'기존 내용',status:'예정',externalId:'문서-001'};
const target={action:'update',target:'1'};
for(const status of ['예정','진행','보류'])for(const incoming of ['예정','진행','보류','완료'])test(status+' → '+incoming+' 문서번호 일치면 제목·내용과 무관하게 연결',()=>{
 const work={...old,status};const input={...old,title:'변경 제목',description:'완전히 다른 내용',status:incoming};
 assert.deepEqual(autoCompleteChoices([{input}],[work])[0].autoChoice,target);
 assert.equal(candidates(input,[work]).length,1);
});
for(const externalId of ['',undefined,'내부','내부문서',' 내부 문서 '])test('문서번호 대체값 '+externalId+' 은 제목으로 연결',()=>{
 assert.equal(hasDocumentNumber(externalId),false);
 const input={...old,status:'완료',externalId,description:'다른 내용'};
 assert.deepEqual(autoCompleteChoices([{input}],[old])[0].autoChoice,target);
 assert.equal(candidates(input,[old]).length,1);
 assert.equal(autoCompleteChoices([{input:{...input,title:'다른 제목'}}],[old])[0].autoChoice,null);
});
test('실제 문서번호가 다르거나 기존에 없으면 같은 제목이어도 연결하지 않는다',()=>{
 const input={...old,status:'완료',externalId:'문서-002'};
 for(const externalId of ['문서-001','','내부','내부문서']){
 assert.equal(autoCompleteChoices([{input}],[{...old,externalId}])[0].autoChoice,null);
 assert.equal(candidates(input,[{...old,externalId}]).length,0);
 }
});
test('문서번호 공백은 무시하고 완료·취소 업무 자동 갱신 및 복수 대상을 막는다',()=>{
 const input={...old,status:'완료',externalId:' 문서- 001 '};
 assert.deepEqual(autoCompleteChoices([{input}],[old])[0].autoChoice,target);
 for(const status of ['완료','취소'])assert.equal(autoCompleteChoices([{input}],[{...old,status}])[0].autoChoice,null);
 assert.equal(autoCompleteChoices([{input}],[old,{...old,id:'2'}])[0].autoChoice,null);
 assert.ok(autoCompleteChoices([{input},{input}],[old]).every(r=>r.autoChoice===null));
});
