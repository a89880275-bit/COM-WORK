const fields={title:['제목','업무명'],requestContact:['기안자','작성자'],requestDept:['소속','기안부서','작성부서'],created:['기안일','기안일자','작성일','작성일자'],externalId:['문서번호']};
const labels=new Map(Object.entries(fields).flatMap(([key,names])=>names.map(name=>[name,key])));
const normalizeLabel=text=>String(text||'').replace(/[\s:：]/g,'');
const clean=text=>String(text||'').replace(/\s+/g,' ').trim();
const plainTags=new Set('html body table tbody thead tfoot tr td th p div span br h1 h2 h3 h4 ul ol li pre section article b strong i em u'.split(' '));
function inertHtml(html){
 // Keep only text and structural tags, without any attributes, URLs or active content.
 return html.replace(/<!--[^]*?-->/g,'').replace(/<(script|style|iframe|object|svg|head)\b[^>]*>[^]*?<\/\1\s*>/gi,'').replace(/<[^>]*>/g,tag=>{const match=tag.match(/^<\s*(\/?)\s*([a-z][\w:-]*)/i);return match&&plainTags.has(match[2].toLowerCase())?`<${match[1]}${match[2].toLowerCase()}>`:'';});
}
function nodeText(node){
 if(node.nodeType===3)return node.nodeValue||'';
 if(node.nodeType!==1&&node.nodeType!==9&&node.nodeType!==11)return '';
 if(node.nodeName==='BR')return '\n';
 const text=[...node.childNodes].map(nodeText).join('');
 return text+(['TD','TH'].includes(node.nodeName)?'\t':['P','DIV','TR','TABLE','LI','SECTION','ARTICLE','H1','H2','H3','PRE'].includes(node.nodeName)?'\n':'');
}
function validDate(value){
 const match=String(value||'').match(/(\d{4})[.\-/년]\s*(\d{1,2})[.\-/월]\s*(\d{1,2})/);if(!match)return '';
 const result=`${match[1]}-${match[2].padStart(2,'0')}-${match[3].padStart(2,'0')}`,date=new Date(result+'T00:00:00Z');
 return Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===result?result:'';
}
export function parseGroupwareHtml(html){
 if(typeof html!=='string'||!html.trim())throw Error('내용이 있는 HTML 파일을 선택하세요.');
 const doc=new DOMParser().parseFromString(inertHtml(html),'text/html'),values={},warnings=[];
 let titleRow=null;
 for(const row of doc.querySelectorAll('tr')){
  const cells=[...row.children].filter(c=>['TD','TH'].includes(c.nodeName));
  for(let i=0;i<cells.length-1;i++){const key=labels.get(normalizeLabel(cells[i].textContent));if(!key||values[key])continue;const next=clean(cells[i+1].textContent);if(next&&!labels.has(normalizeLabel(next))){values[key]=next;if(key==='title')titleRow=row;}}
 }
 const marker='__IT_HTML_DOCUMENT_BODY_START__';
 if(titleRow)titleRow.parentNode.insertBefore(doc.createTextNode('\n'+marker+'\n'),titleRow.nextSibling);
 const text=nodeText(doc.body).replace(/\u00a0/g,' ').replace(/\n[ \t]*\n[ \t]*\n/g,'\n\n'),lines=text.split('\n');
 let titleEnd=-1;
 // Support documents whose metadata is arranged as paragraphs instead of table cells.
 for(let i=0;i<lines.length;i++){
  const line=lines[i].trim();if(!line)continue;
  for(const [name,key] of labels){
   const pattern=new RegExp('^'+[...name].join('[ \\t]*')+'(?:[ \\t]*[:：][ \\t]*|[ \\t]+|$)(.*)$'),match=line.match(pattern);if(!match)continue;
   let value=match[1].split('\t')[0].trim(),end=i;
   if(!value){for(let j=i+1;j<lines.length;j++){if(!lines[j].trim())continue;if(!labels.has(normalizeLabel(lines[j]))){value=lines[j].trim();end=j;}break;}}
   if(!values[key]&&value)values[key]=value;if(key==='title')titleEnd=end;
  }
 }
 let description=(titleRow?text.slice(text.indexOf(marker)+marker.length):titleEnd>=0?lines.slice(titleEnd+1).join('\n'):text).trim();
 description=description.replace(/^(?:본문|내용)[ \t]*[:：]?[ \t]*\n/,'').trim();
 if(description.length>20000)throw Error('본문이 20,000자를 초과합니다. 문서 내용을 나누어 등록해 주세요.');
 const created=validDate(values.created);
 for(const [key,label] of [['title','제목'],['requestDept','요청부서(소속)'],['requestContact','현업담당자(기안자)'],['externalId','문서번호']])if(!values[key])warnings.push(label+'를 찾지 못했습니다. 직접 확인해 주세요.');
 if(!created)warnings.push('기안일을 확인하지 못해 접수일을 오늘로 설정합니다. 실제 날짜를 확인해 주세요.');
 if(!description)warnings.push('본문이 비어 있습니다. 업무 내용을 입력해 주세요.');
 return {title:values.title||'',requestDept:values.requestDept||'',requestContact:values.requestContact||'',externalId:values.externalId||'',created,description,warnings};
}
export function decodeGroupwareHtml(buffer){
 const bytes=new Uint8Array(buffer);if(bytes.length>2*1024*1024)throw Error('HTML 파일은 2MB 이내로 선택하세요.');
 if(bytes[0]===0xff&&bytes[1]===0xfe)return new TextDecoder('utf-16le').decode(bytes);
 if(bytes[0]===0xfe&&bytes[1]===0xff)return new TextDecoder('utf-16be').decode(bytes);
 const header=new TextDecoder('windows-1252').decode(bytes.slice(0,4096)),declared=header.match(/charset\s*=\s*["']?\s*([a-z0-9_-]+)/i)?.[1].toLowerCase();
 if(declared){const encoding=['cp949','windows-949','ks_c_5601-1987','ks_c_5601'].includes(declared)?'euc-kr':declared;try{return new TextDecoder(encoding,{fatal:true}).decode(bytes);}catch{throw Error('HTML 파일의 문자 인코딩을 확인하세요. UTF-8로 저장한 파일을 권장합니다.');}}
 try{return new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{return new TextDecoder('euc-kr').decode(bytes);}
}
