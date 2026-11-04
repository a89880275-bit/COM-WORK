param([string]$InputPath,[string]$TemplatePath,[string]$OutputPath,[ValidateSet('pptx','xlsx')][string]$Format)
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$data=Get-Content -LiteralPath $InputPath -Raw -Encoding UTF8 | ConvertFrom-Json
Copy-Item -LiteralPath $TemplatePath -Destination $OutputPath
$zip=[IO.Compression.ZipFile]::Open($OutputPath,'Update')
function Read-Xml($name){$reader=[IO.StreamReader]::new($zip.GetEntry($name).Open());try{[xml]$reader.ReadToEnd()}finally{$reader.Dispose()}}
function Write-Xml($name,$doc){$entry=$zip.GetEntry($name);if($entry){$entry.Delete()};$entry=$zip.CreateEntry($name);$stream=$entry.Open();$settings=[Xml.XmlWriterSettings]::new();$settings.Encoding=[Text.UTF8Encoding]::new($false);$writer=[Xml.XmlWriter]::Create($stream,$settings);try{$doc.Save($writer)}finally{$writer.Dispose();$stream.Dispose()}}
function Safe-Text($value){[regex]::Replace([string]$value,'[\x00-\x08\x0B\x0C\x0E-\x1F]','')}
function Set-Text($target,[string]$value){
 $tx=$target.SelectSingleNode('a:txBody',$ns);if(!$tx){$tx=$target.SelectSingleNode('p:txBody',$ns)}
 $first=$tx.SelectSingleNode('a:p',$ns).CloneNode($true)
 foreach($p in @($tx.SelectNodes('a:p',$ns))){$null=$tx.RemoveChild($p)}
 foreach($line in ($value -split "`n",0,'SimpleMatch')){
  $p=$first.CloneNode($true);$rPr=$p.SelectSingleNode('a:r/a:rPr',$ns);if($rPr){$rPr=$rPr.CloneNode($true)}
  $pp=$p.SelectSingleNode('a:pPr',$ns);if($pp){foreach($bullet in @($pp.ChildNodes | Where-Object {$_.LocalName -match '^bu'})){$null=$pp.RemoveChild($bullet)};$bulletNode=$doc.CreateElement('a','buNone',$ans);$following=$pp.SelectSingleNode('a:tabLst|a:defRPr|a:extLst',$ns);if($following){$null=$pp.InsertBefore($bulletNode,$following)}else{$null=$pp.AppendChild($bulletNode)}}
  foreach($child in @($p.ChildNodes)){if($child.LocalName -ne 'pPr'){$null=$p.RemoveChild($child)}}
  $r=$doc.CreateElement('a','r',$ans);if($rPr){$null=$r.AppendChild($rPr)};$t=$doc.CreateElement('a','t',$ans);$t.InnerText=Safe-Text $line;$null=$r.AppendChild($t);$null=$p.AppendChild($r);$null=$tx.AppendChild($p)
 }
}
function Shape($id){$doc.SelectSingleNode("//p:cNvPr[@id='$id']/../..",$ns)}
try{
 if($Format -eq 'pptx'){
  $doc=Read-Xml 'ppt/slides/slide1.xml';$ns=[Xml.XmlNamespaceManager]::new($doc.NameTable);$ans='http://schemas.openxmlformats.org/drawingml/2006/main';$ns.AddNamespace('a',$ans);$ns.AddNamespace('p','http://schemas.openxmlformats.org/presentationml/2006/main')
  $year=$data.month.Substring(0,4);$month=[int]$data.month.Substring(5,2)
  Set-Text (Shape '3095') "[일산전산팀] ${year}년 ( ${month})월 서비스 결과보고서 및 근태"
  $outer=Shape '2095';$cells=$outer.SelectNodes('.//a:tc',$ns);Set-Text $cells[0] '내용';Set-Text $cells[1] '현업 요청사항 및 근무인원 현황';Set-Text $cells[2] '보고사항'
  $body=$cells[3].SelectSingleNode('a:txBody',$ns);$paragraphs=@($body.SelectNodes('a:p',$ns));$heading=$paragraphs[0].CloneNode($true);$normal=$paragraphs[15].CloneNode($true)
  foreach($p in $paragraphs){$null=$body.RemoveChild($p)}
  function Add-BodyLine([string]$text,[bool]$bold=$false,[string]$lineHeight="1050",[string]$fontSize="900"){
   $p=$(if($bold){$heading.CloneNode($true)}else{$normal.CloneNode($true)})
   $pPr=$p.SelectSingleNode('a:pPr',$ns);if($pPr){foreach($b in @($pPr.ChildNodes)){$null=$pPr.RemoveChild($b)};$pPr.SetAttribute('marL','0');$pPr.SetAttribute('indent','0');$ln=$doc.CreateElement('a','lnSpc',$ans);$val=$doc.CreateElement('a','spcPts',$ans);$val.SetAttribute('val',$(if($bold){'1300'}else{$lineHeight}));$null=$ln.AppendChild($val);$null=$pPr.AppendChild($ln);$null=$pPr.AppendChild($doc.CreateElement('a','buNone',$ans))}
   foreach($child in @($p.ChildNodes)){if($child.LocalName -ne 'pPr'){$null=$p.RemoveChild($child)}}
   $r=$doc.CreateElement('a','r',$ans);$rp=$doc.CreateElement('a','rPr',$ans);$rp.SetAttribute('sz',$(if($bold){'1100'}else{$fontSize}));$rp.SetAttribute('b',$(if($bold){'1'}else{'0'}));foreach($tag in @('latin','ea')){$font=$doc.CreateElement('a',$tag,$ans);$font.SetAttribute('typeface','맑은 고딕');$null=$rp.AppendChild($font)};$null=$r.AppendChild($rp);$t=$doc.CreateElement('a','t',$ans);$t.InnerText=Safe-Text $text;$null=$r.AppendChild($t);$null=$p.AppendChild($r);$null=$body.AppendChild($p)
  }
  Add-BodyLine '1. 현업요청 건수' $true
  # Original table overlays these blank paragraphs. Preserve its vertical space.
  for($i=0;$i -lt 12;$i++){Add-BodyLine ''}
  Add-BodyLine '2. 현업요청 완료, 진행, 보류 내용 작성' $true
  Add-BodyLine ''
  $lines=@($data.numberedSummary);$usedLines=0;foreach($line in $lines){Add-BodyLine $line $false "850" "850";$units=0;foreach($ch in $line.ToCharArray()){$units+=$(if([int]$ch -gt 255){1}else{0.55})};$usedLines+=[Math]::Max(1,[Math]::Ceiling($units/65))}
  for($i=$usedLines;$i -lt 15;$i++){Add-BodyLine '' $false "850" "850"}
  Add-BodyLine ''
  Add-BodyLine '3. 근태사항' $true
  $table=Shape '6';$rows=$table.SelectNodes('.//a:tr',$ns);$headers=@('업무','요청건수','진행중 건수','완료건수')
  for($i=0;$i -lt 4;$i++){Set-Text $rows[0].SelectNodes('a:tc',$ns)[$i] $headers[$i]}
  for($i=0;$i -lt 5;$i++){$v=$data.teamRows[$i];$label=$v.team;if($label -eq '진료간호'){$label='진료/간호'};if($label -eq '원무'){$label='원무/심사'};$values=@($label,[string]$v.total,[string]$v.remaining,[string]$v.completed);$tc=$rows[$i+1].SelectNodes('a:tc',$ns);for($j=0;$j -lt 4;$j++){Set-Text $tc[$j] $values[$j]}}
  $issue=(Shape '5').SelectNodes('.//a:tc',$ns);Set-Text $issue[0] '이슈사항';Set-Text $issue[1] $data.issues
  foreach($r in $issue[1].SelectNodes('.//a:r',$ns)){$rp=$r.SelectSingleNode('a:rPr',$ns);if(!$rp){$rp=$doc.CreateElement('a','rPr',$ans);$null=$r.PrependChild($rp)};$rp.SetAttribute('sz','900')}
  $attendance=Shape '8';$tbl=$attendance.SelectSingleNode('.//a:tbl',$ns);$grid=$tbl.SelectSingleNode('a:tblGrid',$ns);$rowNodes=$tbl.SelectNodes('a:tr',$ns);$samples=@($rowNodes[0].SelectSingleNode('a:tc',$ns).CloneNode($true),$rowNodes[1].SelectSingleNode('a:tc',$ns).CloneNode($true));$count=$data.attendance.Count
  foreach($r in $rowNodes){foreach($c in @($r.SelectNodes('a:tc',$ns))){$null=$r.RemoveChild($c)}};$grid.RemoveAll()
  if($count -gt 0){for($i=0;$i -lt $count;$i++){$col=$doc.CreateElement('a','gridCol',$ans);$col.SetAttribute('w',[string][int](6696745/$count));$null=$grid.AppendChild($col);for($j=0;$j -lt 2;$j++){$cell=$samples[$j].CloneNode($true);$text=$(if($j -eq 0){$data.attendance[$i].name}else{$data.attendance[$i].status});Set-Text $cell $text;foreach($rp in $cell.SelectNodes('.//a:rPr',$ns)){$rp.SetAttribute('sz',$(if($count -gt 13){'750'}else{'900'}))};$rowExtension=$rowNodes[$j].SelectSingleNode('a:extLst',$ns);if($rowExtension){$null=$rowNodes[$j].InsertBefore($cell,$rowExtension)}else{$null=$rowNodes[$j].AppendChild($cell)}}}}
  Write-Xml 'ppt/slides/slide1.xml' $doc
 }else{
  $doc=Read-Xml 'xl/worksheets/sheet1.xml';$sns='http://schemas.openxmlformats.org/spreadsheetml/2006/main';$ns=[Xml.XmlNamespaceManager]::new($doc.NameTable);$ns.AddNamespace('s',$sns);$sheetData=$doc.SelectSingleNode('//s:sheetData',$ns);$header=$sheetData.SelectSingleNode('s:row[@r="1"]',$ns);$sample=$sheetData.SelectSingleNode('s:row[@r="2"]',$ns).CloneNode($true)
  function Set-Cell($cell,$value,[bool]$date=$false){foreach($node in @($cell.ChildNodes)){$null=$cell.RemoveChild($node)};$cell.RemoveAttribute('t');if($date -and $value){$v=$doc.CreateElement('v',$sns);$v.InnerText=([datetime]::ParseExact($value,'yyyy-MM-dd',[Globalization.CultureInfo]::InvariantCulture).ToOADate()).ToString([Globalization.CultureInfo]::InvariantCulture);$null=$cell.AppendChild($v)}else{$cell.SetAttribute('t','inlineStr');$is=$doc.CreateElement('is',$sns);$t=$doc.CreateElement('t',$sns);$t.SetAttribute('space','http://www.w3.org/XML/1998/namespace','preserve');$t.InnerText=Safe-Text $value;$null=$is.AppendChild($t);$null=$cell.AppendChild($is)}}
  $styles=Read-Xml 'xl/styles.xml';$stylesNs=[Xml.XmlNamespaceManager]::new($styles.NameTable);$stylesNs.AddNamespace('s',$sns);$fonts=$styles.SelectSingleNode('//s:fonts',$stylesNs);$xfs=$styles.SelectSingleNode('//s:cellXfs',$stylesNs);$baseStyle=$xfs.ChildNodes[[int]$sample.SelectNodes('s:c',$ns)[3].GetAttribute('s')];$font=$fonts.ChildNodes[[int]$baseStyle.GetAttribute('fontId')].CloneNode($true);$color=$font.SelectSingleNode('s:color',$stylesNs);if(!$color){$color=$styles.CreateElement('color',$sns);$null=$font.AppendChild($color)};$color.RemoveAll();$color.SetAttribute('rgb','FFFF0000');$redFont=$fonts.ChildNodes.Count;$null=$fonts.AppendChild($font);$fonts.SetAttribute('count',[string]$fonts.ChildNodes.Count);$xf=$baseStyle.CloneNode($true);$xf.SetAttribute('fontId',[string]$redFont);$xf.SetAttribute('applyFont','1');$redStyle=$xfs.ChildNodes.Count;$null=$xfs.AppendChild($xf);$xfs.SetAttribute('count',[string]$xfs.ChildNodes.Count)
  $cells=$header.SelectNodes('s:c',$ns);for($i=0;$i -lt 10;$i++){Set-Cell $cells[$i] $data.detailHeaders[$i]}
  foreach($r in @($sheetData.SelectNodes('s:row',$ns))){if($r.GetAttribute('r') -ne '1'){$null=$sheetData.RemoveChild($r)}}
  $index=2;foreach($item in $data.detailRows){$row=$sample.CloneNode($true);$row.SetAttribute('r',[string]$index);$cells=$row.SelectNodes('s:c',$ns);for($i=0;$i -lt 10;$i++){$cells[$i].SetAttribute('r',([string][char](65+$i))+$index);Set-Cell $cells[$i] $item.values[$i] (@(1,2,8,9) -contains $i)};if($item.isMajor){$cells[3].SetAttribute('s',[string]$redStyle)}
   # Preserve template widths, fills and borders. Fit long details without truncation.
   $detail=[string]$item.values[4];$title=[string]$item.values[3];$wrapped=0;foreach($line in ($detail -split "`n")){$wrapped+=[Math]::Max(1,[Math]::Ceiling($line.Length/38))};$row.SetAttribute('ht',[string][Math]::Min(409,[Math]::Max(36,[Math]::Max($wrapped,[Math]::Ceiling($title.Length/16))*13+8)));$row.SetAttribute('customHeight','1');$null=$sheetData.AppendChild($row);$index++
  }
  $last=[Math]::Max(1,$index-1);$doc.SelectSingleNode('//s:dimension',$ns).SetAttribute('ref',"A1:J$last");$doc.SelectSingleNode('//s:autoFilter',$ns).SetAttribute('ref',"A1:J$last");Write-Xml 'xl/worksheets/sheet1.xml' $doc
  $book=Read-Xml 'xl/workbook.xml';$bookNs=[Xml.XmlNamespaceManager]::new($book.NameTable);$bookNs.AddNamespace('s',$sns);$filterName=$book.SelectSingleNode('//s:definedName[@name="_xlnm._FilterDatabase"]',$bookNs);if($filterName){$filterName.InnerText='월상세내역!$A$1:$J$'+$last};Write-Xml 'xl/workbook.xml' $book
  foreach($fmt in $styles.SelectNodes('//s:numFmt',$stylesNs)){if($fmt.GetAttribute('numFmtId') -eq '165'){$fmt.SetAttribute('formatCode','yyyy-mm-dd')}};Write-Xml 'xl/styles.xml' $styles
 }
}finally{$zip.Dispose()}
