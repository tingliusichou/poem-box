# 诗匣启动逻辑（完整包根启动器调用；纯 PS，无编码坑）
$ErrorActionPreference = 'Stop'
try { [Console]::OutputEncoding = [Text.Encoding]::UTF8 } catch {}
$OutputEncoding = [Text.Encoding]::UTF8

$app  = Split-Path -Parent $PSScriptRoot        # ...\诗匣完整包\诗匣
$root = Split-Path -Parent $app                 # ...\诗匣完整包
$nodeVersion = '24.21.0'

function Info($msg) { Write-Host ("[诗匣] " + $msg) }

# ---- 定位运行时：包根 runtime → 诗匣\runtime → 系统 node → 自动下载 ----
$node = $null
foreach ($cand in @((Join-Path $root 'runtime\node.exe'), (Join-Path $app 'runtime\node.exe'))) {
  if (Test-Path $cand) { $node = $cand; break }
}
if (-not $node) {
  $sys = Get-Command node.exe -ErrorAction SilentlyContinue
  if ($sys) { $node = $sys.Source }
}
if (-not $node) {
  Info '这台电脑没有 Node.js，正在准备便携运行时（约 55MB，只需一次）……'
  & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'setup-runtime.ps1') -Version $nodeVersion -RuntimeDir (Join-Path $root 'runtime')
  if (Test-Path (Join-Path $root 'runtime\node.exe')) { $node = Join-Path $root 'runtime\node.exe' }
}
if (-not $node) {
  Info '运行时准备失败。请检查网络后重试，或到 nodejs.org 安装 Node.js。'
  exit 1
}

if (-not (Test-Path (Join-Path $app 'server.js'))) {
  Info ('程序文件缺失：' + $app)
  exit 1
}

Info '正在启动……浏览器会自动打开；关闭本窗口即停止诗匣。'
Set-Location $app
& $node server.js
$code = $LASTEXITCODE
if ($code -and $code -ne 0) {
  Info ("启动失败（错误码 $code），窗口将保留。")
  exit $code
}
exit 0
