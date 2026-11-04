export async function openMonthlyServiceReport({month,api,openDialog,esc,safe,currentUser,onSaved}){
 const result=await api('/api/monthly-service-report?month='+encodeURIComponent(month));
 let report=result.report,revision=result.revision,saved=result.saved;
 const editable=currentUser.role==='admin',q=s=>document.querySelector(s);
 const collect=()=>{
  if(!editable)return;
  report.summary=q('#service-summary').value;report.issues=q('#service-issues').value;
  report.attendance=report.attendance.map((p,i)=>({...p,name:p.external?q(`[data-service-name="${i}"]`).value:p.name,status:q(`[data-service-attendance="${i}"]`).value}));
  for(const k of ['implemented','requestDept','requestContact','due'])report.rawMap[k]=Number(q(`[data-service-map="${k}"]`).value);
 };
 const draw=()=>{
  const disabled=editable?'':'disabled';
  openDialog(`<div class="dialog-head"><div><div class="eyebrow">MONTHLY SERVICE REPORT</div><h2>${esc(month)} 서비스 결과보고서 및 근태</h2></div><button data-close>✕</button></div><div class="dialog-body service-report-editor"><p>선택한 월의 전체 파트를 보고합니다. 퇴사자만 담당하는 예정 업무는 제외합니다. 완료는 해당 월 완료일, 미결은 ${esc(report.range.asOf)} 상태 기준입니다. ‘요청건수’는 완료와 미결의 합계, ‘진행중 건수’는 예정·진행·보류를 포함합니다. 공동담당은 참여 파트마다 집계합니다.</p><div class="table-wrap"><table><thead><tr><th>업무</th><th>요청건수</th><th>진행중 건수</th><th>완료건수</th></tr></thead><tbody>${report.teamRows.map(t=>`<tr><td>${esc(t.team)}</td><td>${t.total}</td><td>${t.remaining}</td><td>${t.completed}</td></tr>`).join('')}</tbody></table></div><p>상세내역 엑셀: <b>${report.detailRows.length}건</b> · 원본과 같은 10개 칼럼으로 생성합니다. 파트·담당자는 관리자 설정 순서, 날짜는 오래된 순서입니다(완료: 완료일 / 미결: 접수일). 공동담당은 관리자 설정상 앞선 담당자 위치에 한 번 표시합니다.</p>${editable?'<button id="reload-major-report">화면의 파트별 주요내용 불러오기</button>':''}<label>주요 보고내용 (PPT에 1. 2. 3. 번호 자동 적용 · 15줄 이내 · 화면과 같은 항목·순서)<textarea id="service-summary" rows="10" ${disabled}>${esc(report.summary)}</textarea></label><label>이슈사항 (PPT 3줄 이내)<textarea id="service-issues" rows="3" ${disabled}>${esc(report.issues)}</textarea></label><div class="panel-head"><div><h3>월별 근태</h3><p>관리자 설정의 팀장·파트별 재직 인원을 기본으로 불러옵니다. 근태를 직접 입력해 저장하세요.</p></div>${editable?'<button id="service-all-working">전체 근무로 입력</button>':''}</div><div class="service-attendance-grid">${report.attendance.map((p,i)=>`<div><label>${p.external?`비상주 인원<input data-service-name="${i}" maxlength="12" value="${esc(p.name)}" ${disabled}>`:esc(p.name)}<input data-service-attendance="${i}" maxlength="16" placeholder="예: 근무, 연차 2일" value="${esc(p.status)}" ${disabled}></label>${editable&&p.external?`<button data-remove-service-person="${i}" class="danger">제거</button>`:''}</div>`).join('')}</div>${editable?'<button id="service-add-person">＋ 비상주 인원 추가</button>':''}<details><summary>상세내역의 원본 열 연결</summary><p>시행일자·현업담당자·예정일자와 미입력 요청부서는 원본 업로드 행에서 아래 열을 읽습니다. 제공하신 주간업무 양식을 기본 적용하며, 다른 양식은 열을 변경하세요. 원본 값이 없으면 공란입니다. 현업담당자 공란 ${report.missingContact}건.</p><div class="form-grid">${[['implemented','시행일자'],['requestDept','요청부서'],['requestContact','현업담당자'],['due','예정일자']].map(([key,label])=>`<label>${label}<select data-service-map="${key}" ${disabled}><option value="-1" ${report.rawMap[key]===-1?'selected':''}>연결 안 함</option>${Array.from({length:150},(_,i)=>`<option value="${i}" ${report.rawMap[key]===i?'selected':''}>${i+1}열</option>`).join('')}</select></label>`).join('')}</div></details><p id="service-save-status" class="muted">${saved?'저장된 월별 입력을 불러왔습니다. 관리자가 저장하면 현재 업무 현황으로 갱신됩니다.':'아직 저장하지 않은 보고서입니다.'}</p></div><div class="dialog-actions"><span>근태는 자동 추정하지 않습니다.</span><div>${editable?'<button id="save-service-report">월별 입력 저장</button>':''}<button id="download-service-ppt" class="primary" ${!editable&&!saved?'disabled':''}>PPT 다운로드</button><button id="download-service-xlsx" ${!editable&&!saved?'disabled':''}>상세내역 Excel</button></div></div>`);
  document.querySelectorAll('#modal [data-close]').forEach(b=>b.onclick=()=>q('#modal').close());
  const save=async()=>{collect();const value=await api('/api/monthly-service-report','PUT',{...report,revision});report=value.report;revision=value.revision;saved=true;onSaved(revision);q('#service-save-status').textContent='월별 근태·보고내용과 현재 업무 현황을 저장했습니다.';};
  if(editable){
   q('#save-service-report').onclick=()=>safe(save);
   q('#reload-major-report').onclick=()=>safe(async()=>{collect();const latest=await api('/api/monthly-service-report?month='+encodeURIComponent(month));report={...latest.report,summary:latest.report.suggestedSummary||'',issues:report.issues,attendance:report.attendance,rawMap:report.rawMap};revision=latest.revision;draw();});
   q('#service-all-working').onclick=()=>{document.querySelectorAll('[data-service-attendance]').forEach(e=>e.value='근무');};
   q('#service-add-person').onclick=()=>{collect();report.attendance.push({name:'',status:'',external:true});draw();};
   document.querySelectorAll('[data-remove-service-person]').forEach(b=>b.onclick=()=>{collect();report.attendance.splice(Number(b.dataset.removeServicePerson),1);draw();});
  }
  const download=async format=>{
   const button=q(format==='pptx'?'#download-service-ppt':'#download-service-xlsx');button.disabled=true;
   try{
    if(editable)await save();
    const response=await fetch('/api/monthly-service-report/export?month='+encodeURIComponent(month)+'&format='+format);
    if(!response.ok){const error=await response.json();throw Error(error.error||'파일 생성 실패');}
    const url=URL.createObjectURL(await response.blob()),a=document.createElement('a');a.href=url;
    a.download=format==='pptx'?`(전산정보팀)_${month.slice(0,4)}년 ${Number(month.slice(5))}월_서비스결과보고서및근태.pptx`:`전산서비스 보고_${month.slice(0,4)}년${Number(month.slice(5))}월_상세내역.xlsx`;
    a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);
   }finally{button.disabled=false;}
  };
  q('#download-service-ppt').onclick=()=>safe(()=>download('pptx'));q('#download-service-xlsx').onclick=()=>safe(()=>download('xlsx'));
 };
 draw();
}
