param([string]$Path)
$ErrorActionPreference='Stop'
[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false)
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip=[IO.Compression.ZipFile]::OpenRead($Path)
try {
  if($zip.Entries.Count -gt 4000){throw 'ZIP 항목 수 제한 초과'}
  $total=($zip.Entries | Measure-Object Length -Sum).Sum
  if($total -gt 80MB){throw '압축 해제 크기 제한 초과'}
  function ReadXml([string]$entry){
    $e=$zip.GetEntry($entry); if(!$e){return $null}
    $s=$e.Open(); try {$reader=[IO.StreamReader]::new($s); $text=$reader.ReadToEnd(); if($text -match '<!DOCTYPE'){throw 'DTD 금지'}; return [xml]$text} finally {$s.Dispose()}
  }
  $shared=ReadXml 'xl/sharedStrings.xml'; $strings=@()
  if($shared){$strings=@($shared.SelectNodes('//*[local-name()="si"]') | ForEach-Object {($_.SelectNodes('.//*[local-name()="t"]') | ForEach-Object {$_.InnerText}) -join ''})}
  $workbook=ReadXml 'xl/workbook.xml'; $rels=ReadXml 'xl/_rels/workbook.xml.rels'
  if(!$workbook -or !$rels){throw '올바른 XLSX 워크북이 아닙니다.'}
  $result=@();$count=0
  foreach($sheet in $workbook.SelectNodes('//*[local-name()="sheet"]')){
    $rid=$sheet.GetAttribute('id','http://schemas.openxmlformats.org/officeDocument/2006/relationships')
    $rel=$rels.SelectNodes('//*[local-name()="Relationship"]') | Where-Object {$_.Id -eq $rid}
    $target=$rel.Target.TrimStart('/'); if(!$target.StartsWith('xl/')){$target='xl/'+$target}
    if($target.Contains('..')){throw '잘못된 시트 경로'}
    $xml=ReadXml $target; $rows=@()
    foreach($row in $xml.SelectNodes('//*[local-name()="sheetData"]/*[local-name()="row"]')){
      $count++;if($count -gt 20000){throw '전체 20,000행까지 지원합니다.'}
      $values=@{}
      foreach($cell in $row.SelectNodes('./*[local-name()="c"]')){
        $letters=$cell.r -replace '[0-9]','';$col=0
        foreach($c in $letters.ToCharArray()){$col=$col*26+([int]$c-64)}
        if($col -gt 150){continue}
        $v=$cell.SelectSingleNode('./*[local-name()="v"]');$value=if($v){$v.InnerText}else{''}
        if($cell.t -eq 's'){$value=$strings[[int]$value]}
        if($cell.t -eq 'inlineStr'){$value=($cell.SelectNodes('.//*[local-name()="t"]') | ForEach-Object {$_.InnerText}) -join ''}
        $values[[string]($col-1)]=[string]$value
      }
      if($values.Count){$max=($values.Keys | ForEach-Object {[int]$_} | Measure-Object -Maximum).Maximum;$cells=@();for($i=0;$i -le $max;$i++){$cells+=([string]$values[[string]$i])};$rows+=@{number=[int]$row.r;cells=$cells}}
    }
    $result+=@{name=[string]$sheet.name;rows=$rows}
  }
  @{sheets=$result} | ConvertTo-Json -Depth 10 -Compress
} finally {$zip.Dispose()}
