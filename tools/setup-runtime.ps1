# 诗匣便携运行时安装器（兜底用）
# 仅当包内 runtime\node.exe 缺失且电脑上没有 Node.js 时，由 启动诗匣.bat 调用。
# 从国内镜像下载官方便携版 Node，解压出 node.exe，无需管理员权限、不写注册表。
param(
  [string]$Version = "24.21.0",
  [string]$RuntimeDir = (Join-Path $PSScriptRoot "..\runtime")
)
$ErrorActionPreference = 'Stop'
try { [Console]::OutputEncoding = [Text.Encoding]::UTF8 } catch {}

if (-not $RuntimeDir -or -not [IO.Path]::IsPathRooted($RuntimeDir)) {
  $RuntimeDir = Join-Path $PSScriptRoot $RuntimeDir
}

$arch = $env:PROCESSOR_ARCHITECTURE
if ($arch -eq 'ARM64') { $sub = 'win-arm64' }
elseif ($arch -eq 'AMD64') { $sub = 'win-x64' }
else {
  Write-Host "[诗匣] 这台电脑是 32 位系统（$arch），便携包只支持 64 位。"
  Write-Host "[诗匣] 请到 https://nodejs.org 安装对应版本后重试。"
  exit 1
}
$zipName = "node-v$Version-$sub.zip"
$urls = @(
  "https://registry.npmmirror.com/-/binary/node/v$Version/$zipName",
  "https://nodejs.org/dist/v$Version/$zipName"
)

New-Item -ItemType Directory -Force -Path $RuntimeDir | Out-Null
$target = Join-Path $RuntimeDir 'node.exe'
if (Test-Path $target) {
  Write-Host "[诗匣] 便携运行时已存在，跳过下载。"
  exit 0
}

$tmp = Join-Path $env:TEMP ("shixia-node-" + [Guid]::NewGuid().ToString('N').Substring(0, 8))
New-Item -ItemType Directory -Force -Path $tmp | Out-Null
$zipFile = Join-Path $tmp $zipName

$done = $false
foreach ($url in $urls) {
  try {
    Write-Host "[诗匣] 正在下载便携运行时（约 55MB，只需一次）……"
    Write-Host "        $url"
    $old = $ProgressPreference
    $ProgressPreference = 'SilentlyContinue'
    Invoke-WebRequest -Uri $url -OutFile $zipFile -UseBasicParsing -TimeoutSec 600
    $ProgressPreference = $old
    if ((Get-Item $zipFile).Length -lt 10MB) { throw "下载的文件不完整" }
    $done = $true
    break
  } catch {
    Write-Host "[诗匣] 这个源失败了（$($_.Exception.Message)），换下一个源……"
  }
}
if (-not $done) {
  Write-Host "[诗匣] 下载失败。请检查网络，或到 nodejs.org 手动安装 Node.js 后再运行 启动诗匣.bat。"
  exit 1
}

Write-Host "[诗匣] 正在解压……"
$old = $ProgressPreference
$ProgressPreference = 'SilentlyContinue'
Expand-Archive -Path $zipFile -DestinationPath $tmp -Force
$ProgressPreference = $old

$exe = Join-Path $tmp "node-v$Version-$sub\node.exe"
if (-not (Test-Path $exe)) { Write-Host "[诗匣] 解压结果异常，未找到 node.exe。"; exit 1 }
Copy-Item $exe $target -Force
Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue

& $target -v
Write-Host "[诗匣] 便携运行时就绪：$target"
exit 0
