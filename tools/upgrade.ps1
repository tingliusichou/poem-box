# 诗匣一键升级脚本（给已安装旧版的朋友用）
# 1) 备份她的数据  2) 覆盖程序  3) 更新字表/词谱  4) 诗稿/评价/对话/提示词/Key 原样保留
$ErrorActionPreference = 'Stop'
try { [Console]::OutputEncoding = [Text.Encoding]::UTF8 } catch {}
$OutputEncoding = [Text.Encoding]::UTF8

function Info($m) { [Console]::Out.WriteLine("[诗匣升级] " + $m) }

try {

# ---- 定位她的安装目录：从本脚本向上最多走 5 层，找「诗匣程序 + 诗匣数据」并存的目录 ----
$appPkg = Split-Path -Parent $PSScriptRoot            # 升级包里的 诗匣\ (程序，含 数据更新)
$dirs = @()
$d = $PSScriptRoot
for ($i = 0; $i -lt 5; $i++) { $d = Split-Path -Parent $d; if (-not $d) { break }; $dirs += $d }

$target = $null
foreach ($c in $dirs) {
  if ((Test-Path (Join-Path $c '诗匣\server.js')) -and (Test-Path (Join-Path $c '诗匣数据'))) { $target = $c; break }
}
if (-not $target) {
  foreach ($c in $dirs) {
    if (Test-Path (Join-Path $c '诗匣数据\config.json')) { $target = $c; break }
  }
}
if (-not $target) {
  Info '没有找到你的诗匣安装目录（需要同时存在「诗匣」和「诗匣数据」文件夹）。'
  Info '请把这个升级包解压到你的诗匣文件夹所在位置，再双击一键升级。'
  [Console]::Error.WriteLine('NOT-FOUND, walked: ' + ($dirs -join '  |  '))
  Read-Host '按回车关闭'
  exit 1
}
Info ('找到安装目录：' + $target)

$appDst = Join-Path $target '诗匣'
$dataDst = Join-Path $target '诗匣数据'
$dataUpdate = Join-Path $appPkg '数据更新'

# ---- 1. 备份她的数据 ----
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$backup = Join-Path $target ('升级备份-' + $stamp)
New-Item -ItemType Directory -Force -Path $backup | Out-Null
foreach ($item in @('config.json', 'poems', 'gushi', '对话')) {
  $src = Join-Path $dataDst $item
  if (Test-Path $src) { Copy-Item $src (Join-Path $backup $item) -Recurse -Force }
}
Info ('已备份你的数据到：' + $backup)

# ---- 2. 覆盖程序（源与目标是同一目录时跳过，说明程序已是最新） ----
Info '进度：开始更新程序……'
$selfCopy = (Resolve-Path $appPkg).Path -eq (Resolve-Path $appDst).Path
if (-not $selfCopy) {
  foreach ($item in @('server.js', 'public', 'tools', 'package.json', 'README.md')) {
    Copy-Item (Join-Path $appPkg $item) (Join-Path $appDst $item) -Recurse -Force
  }
  $tpl = Join-Path $appPkg 'tools\launcher-template.bat'
  if (Test-Path $tpl) {
    Copy-Item $tpl (Join-Path $target '启动诗匣.bat') -Force
  }
  Info '程序已更新（才女对谈、格律面板增强、词牌选择器、小序栏、字体切换、目录分数徽章等全部新功能）'
} else {
  Info '程序目录与升级包相同，跳过程序覆盖（已是最新）。'
}

# ---- 3. 更新字表与词谱（参考数据） ----
foreach ($dir in @('字表', '词谱')) {
  $src = Join-Path $dataUpdate $dir
  if (Test-Path $src) {
    Copy-Item $src (Join-Path $dataDst $dir) -Recurse -Force
  }
}
Info '字表与词谱已更新。'

Info '升级成功结束。'

Info '你的诗稿、AI 评价、对谈记录、修改过的评分准则、API Key —— 全部原样保留。'
Info ''
Info '升级完成！请关闭旧的黑色窗口，然后双击「启动诗匣.bat」继续使用。'
Info '提示：你修改过的评分准则会原样保留；想体验新版「才女」评分风格，到设置页点对应栏的「恢复默认准则」。'

} catch {
  Info ('升级出错：' + $_.Exception.Message)
  Start-Sleep -Seconds 20
  exit 1
}
