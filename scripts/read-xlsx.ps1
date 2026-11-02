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
  $styles=ReadXml 'xl/styles.xml';$theme=ReadXml 'xl/theme/theme1.xml'
  $fonts=@();$formats=@();$themeColors=@()
  if($styles){$fonts=@($styles.SelectNodes('//*[local-name()="fonts"]/*'));$formats=@($styles.SelectNodes('//*[local-name()="cellXfs"]/*'))}
  if($theme){$scheme=$theme.SelectSingleNode('//*[local-name()="clrScheme"]');if($scheme){$entries=@($scheme.ChildNodes);foreach($idx in @(1,0,3,2,4,5,6,7,8,9,10,11)){if($idx -lt $entries.Count){$node=$entries[$idx].FirstChild;$rgb=$node.GetAttribute('val');if($node.LocalName -eq 'sysClr'){$rgb=$node.GetAttribute('lastClr')};$themeColors+=,$rgb}}}}
  function IsRed($color){
    if(!$color){return $false};$rgb=$color.GetAttribute('rgb')
    if(!$rgb -and $color.HasAttribute('indexed')){return [int]$color.GetAttribute('indexed') -in @(2,10)}
    if(!$rgb -and $color.HasAttribute('theme')){$i=[int]$color.GetAttribute('theme');if($i -lt $themeColors.Count){$rgb=$themeColors[$i]}}
    if($rgb -notmatch '^[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$'){return $false};$rgb=$rgb.Substring($rgb.Length-6)
    $r=[Convert]::ToInt32($rgb.Substring(0,2),16);$g=[Convert]::ToInt32($rgb.Substring(2,2),16);$b=[Convert]::ToInt32($rgb.Substring(4,2),16)
    return $r -ge 120 -and $g -le $r*0.55 -and $b -le $r*0.65
  }
  function HasRedRun($node){if(!$node){return $false};foreach($c in $node.SelectNodes('.//*[local-name()="rPr"]/*[local-name()="color"]')){if(IsRed $c){return $true}};return $false}
  $shared=ReadXml 'xl/sharedStrings.xml'; $strings=@();$sharedRed=@()
  if($shared){$strings=@($shared.SelectNodes('//*[local-name()="si"]') | ForEach-Object {($_.SelectNodes('.//*[local-name()="t"]') | ForEach-Object {$_.InnerText}) -join ''})}
  if($shared){$sharedRed=@($shared.SelectNodes('//*[local-name()="si"]') | ForEach-Object {HasRedRun $_})}
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
      $values=@{};$redColumns=@()
      foreach($cell in $row.SelectNodes('./*[local-name()="c"]')){
        $letters=$cell.r -replace '[0-9]','';$col=0
        foreach($c in $letters.ToCharArray()){$col=$col*26+([int]$c-64)}
        if($col -gt 150){continue}
        $red=$false;$styleIndex=0;if($cell.HasAttribute('s')){$styleIndex=[int]$cell.s}
        if($styleIndex -lt $formats.Count){$fontId=[int]$formats[$styleIndex].fontId;if($fontId -lt $fonts.Count){$red=IsRed ($fonts[$fontId].SelectSingleNode('./*[local-name()="color"]'))}}
        $v=$cell.SelectSingleNode('./*[local-name()="v"]');$value=if($v){$v.InnerText}else{''}
        if($cell.t -eq 's'){$sharedIndex=[int]$value;$value=$strings[$sharedIndex];if($sharedRed[$sharedIndex]){$red=$true}}
        if($cell.t -eq 'inlineStr'){$value=($cell.SelectNodes('.//*[local-name()="t"]') | ForEach-Object {$_.InnerText}) -join ''}
        if($cell.t -eq 'inlineStr' -and (HasRedRun $cell)){$red=$true}
        if($red){$redColumns+=($col-1)}
        $values[[string]($col-1)]=[string]$value
      }
      if($values.Count){$max=($values.Keys | ForEach-Object {[int]$_} | Measure-Object -Maximum).Maximum;$cells=@();for($i=0;$i -le $max;$i++){$cells+=([string]$values[[string]$i])};$rows+=@{number=[int]$row.r;cells=$cells;redColumns=$redColumns}}
    }
    $result+=@{name=[string]$sheet.name;rows=$rows}
  }
  @{sheets=$result} | ConvertTo-Json -Depth 10 -Compress
} finally {$zip.Dispose()}
