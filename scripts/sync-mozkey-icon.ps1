# 公式リポジトリの最新SVGアイコンで同梱軽量版を置き換える。
# ローカルのwebsiteリポジトリのルートから実行する。
$ErrorActionPreference = 'Stop'
$destination = Join-Path (Get-Location) 'public/mozkey/icon.svg'
if (-not (Test-Path 'src/pages/mozkey/index.astro')) { throw 'websiteのルートから実行してください。' }
$uri = 'https://raw.githubusercontent.com/koyasi777/mozkey/main/src/data/images/icon.svg'
$temp = "$destination.download"
try {
  Invoke-WebRequest -Uri $uri -OutFile $temp -UseBasicParsing
  $content = Get-Content $temp -Raw -Encoding utf8
  if ($content -notmatch '<svg' -or $content.Length -lt 1000) { throw '取得したアイコンがSVGではない可能性があります。' }
  Move-Item -Force $temp $destination
  Write-Host '公式Mozkeyアイコンを更新しました:' $destination
} finally {
  if (Test-Path $temp) { Remove-Item $temp -Force }
}
