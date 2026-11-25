# 制作「诗匣升级包」：只含程序与字表/词谱，不含任何个人数据
# 产出：<现代诗目录>\诗匣升级包-YYYYMMDD.zip
$ErrorActionPreference = 'Stop'
try { [Console]::OutputEncoding = [Text.Encoding]::UTF8 } catch {}
$OutputEncoding = [Text.Encoding]::UTF8

$shixia = Split-Path -Parent $PSScriptRoot          # ...\现代诗\诗匣
$workspace = Split-Path -Parent $shixia             # ...\现代诗
$data = Join-Path $workspace '诗匣数据'
$old = $ProgressPreference
$ProgressPreference = 'SilentlyContinue'

$stage = Join-Path $env:TEMP ("shixia-upgrade-" + [Guid]::NewGuid().ToString('N').Substring(0, 8))
$pkg = Join-Path $stage '诗匣升级包'
try {
  New-Item -ItemType Directory -Force -Path $pkg | Out-Null

  # 1. 一键升级入口
  Copy-Item (Join-Path $shixia 'tools\upgrade-template.bat') (Join-Path $pkg '一键升级.bat') -Force

  # 2. 新程序
  $appDst = Join-Path $pkg '诗匣'
  New-Item -ItemType Directory -Force -Path $appDst | Out-Null
  foreach ($item in @('server.js', 'public', 'tools', 'package.json', 'README.md')) {
    Copy-Item (Join-Path $shixia $item) (Join-Path $appDst $item) -Recurse -Force
  }
  # 工具目录里只保留朋友需要的三个脚本
  Get-ChildItem (Join-Path $appDst 'tools') -File | Where-Object { $_.Name -notin @('launch.ps1', 'setup-runtime.ps1', 'upgrade.ps1') } | Remove-Item -Force

  # 3. 字表与词谱（参考数据更新，随程序放在 数据更新/ 里）
  $dataUpdate = Join-Path $appDst '数据更新'
  New-Item -ItemType Directory -Force -Path $dataUpdate | Out-Null
  foreach ($dir in @('字表', '词谱')) {
    if (Test-Path (Join-Path $data $dir)) {
      Copy-Item (Join-Path $data $dir) (Join-Path $dataUpdate $dir) -Recurse -Force
    }
  }

  # 4. 升级说明
  @'
诗匣 · 一键升级包

【升级方法】
把这个解压出来的「诗匣升级包」文件夹，放到你现在的诗匣文件夹里
（和「诗匣」「诗匣数据」并排的位置），然后双击「一键升级.bat」。

它会自动完成：
· 备份你的全部数据（升级备份-日期 文件夹）
· 更新程序：才女对谈、格律面板大幅增强（按标点断句、自动匹配词牌体、
  常用词牌选择器、小序栏、字体切换、目录分数徽章与版本下拉、
  模型预设更新到各家最新型号等）
· 更新字表与词谱数据

你的诗稿、AI 评价、对谈记录、你修改过的评分准则、API Key —— 全部原样保留。
升级完成后：关闭旧的黑色窗口，双击「启动诗匣.bat」继续使用。

【两个小提示】
· 你修改过的评分准则会原样保留；想体验新版「才女」评分风格，
  到「设置」页点对应栏的「恢复默认准则」即可（随时可再改回来）。
· 写词可以写小序了：编辑器日期下方新增「小序」栏，序言不计入格律检视。
'@ | Out-File (Join-Path $pkg '升级说明.txt') -Encoding utf8

  # 5. 压缩
  $zipPath = Join-Path $workspace ('诗匣升级包-' + (Get-Date -Format 'yyyyMMdd') + '.zip')
  if (Test-Path $zipPath) { Remove-Item $zipPath -Force }
  Compress-Archive -Path $pkg -DestinationPath $zipPath -Force
  $size = [Math]::Round((Get-Item $zipPath).Length / 1MB, 1)
  Write-Host ("[诗匣] 升级包已生成：{0}（{1} MB）" -f $zipPath, $size)
  Write-Host "[诗匣] 发给她后：解压到她的诗匣目录里，双击「一键升级.bat」即可。"
} finally {
  $ProgressPreference = $old
  Remove-Item $stage -Recurse -Force -ErrorAction SilentlyContinue
}
