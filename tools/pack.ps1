﻿# 诗匣分发包打包脚本
# 产出：<现代诗目录>\诗匣完整包-win-x64.zip
#   诗匣完整包/
#     启动诗匣.bat      ← 智能启动器（内置运行时→系统Node→自动下载）
#     诗匣/              程序（含 tools 兜底安装器）
#     诗匣数据/          干净数据：空诗稿 + 字表 + 词谱；不含 config.json（API Key 不外泄）
#     runtime/node.exe   便携版 Node 运行时
#     使用说明.txt
param(
  [string]$NodeVersion = "24.21.0"
)
$ErrorActionPreference = 'Stop'
try { [Console]::OutputEncoding = [Text.Encoding]::UTF8 } catch {}

$shixia = Split-Path -Parent $PSScriptRoot          # ...\现代诗\诗匣
$workspace = Split-Path -Parent $shixia             # ...\现代诗
$data = Join-Path $workspace '诗匣数据'
$stage = Join-Path $env:TEMP ("shixia-pack-" + [Guid]::NewGuid().ToString('N').Substring(0, 8))
$pkg = Join-Path $stage '诗匣完整包'
$old = $ProgressPreference
$ProgressPreference = 'SilentlyContinue'

try {
  New-Item -ItemType Directory -Force -Path $pkg | Out-Null

  # 1. 程序（白名单复制，不带开发与测试杂物）
  $appDst = Join-Path $pkg '诗匣'
  New-Item -ItemType Directory -Force -Path $appDst | Out-Null
  foreach ($item in @('server.js', 'package.json', 'README.md', 'public', 'tools')) {
    Copy-Item (Join-Path $shixia $item) (Join-Path $appDst $item) -Recurse -Force
  }
  # 打包脚本本身与启动器模板不进分发包
  foreach ($junk in @('pack.ps1', 'launcher-template.bat', 'make-upgrade.ps1', 'upgrade-template.bat')) {
    Remove-Item (Join-Path $appDst ('tools\' + $junk)) -Force -ErrorAction SilentlyContinue
  }

  # 2. 智能启动器放包根目录
  Copy-Item (Join-Path $shixia 'tools\launcher-template.bat') (Join-Path $pkg '启动诗匣.bat') -Force

  # 3. 干净数据（绝不含 config.json —— API Key 与个人提示词不外泄）
  $dataDst = Join-Path $pkg '诗匣数据'
  New-Item -ItemType Directory -Force -Path (Join-Path $dataDst 'poems'), (Join-Path $dataDst 'gushi') | Out-Null
  foreach ($dir in @('字表', '词谱')) {
    if (Test-Path (Join-Path $data $dir)) {
      Copy-Item (Join-Path $data $dir) (Join-Path $dataDst $dir) -Recurse -Force
    }
  }

  # 4. 便携运行时
  $rtSrc = Join-Path $shixia 'runtime\node.exe'
  if (-not (Test-Path $rtSrc)) { throw "缺少便携运行时 $rtSrc —— 请先完成 runtime 准备" }
  New-Item -ItemType Directory -Force -Path (Join-Path $pkg 'runtime') | Out-Null
  Copy-Item $rtSrc (Join-Path $pkg 'runtime\node.exe') -Force

  # 5. 使用说明
  @'
诗匣 · 私人诗歌写作台（完整包）

【开始使用】
双击「启动诗匣.bat」，浏览器会自动打开。关闭黑色窗口即停止诗匣。
包内已带便携运行时，不需要安装 Node.js，也不需要管理员权限。

【写作】
· 甲编 = 现代诗；乙编 = 古体诗与词（绝句/律诗/古风/诗经体/词牌）。
· 乙编右侧是格律面板：逐字平仄、韵脚韵部、粘对孤平出韵提示，随写随检；
  多音字有虚线标记，点击即可为它选读音。
· 改稿保存时可勾选「把旧版本存入历史」，随时对比、恢复、删除（删除都有确认）。

【AI 评价】
先到「设置」→「新增模型配置」，填三样：接口地址、API Key、模型名
（智谱/DeepSeek/Kimi/通义/GPT 等 OpenAI 兼容接口都可以），点「测试连接」。
API Key 只存在你自己的电脑里。诗匣不会把它发给任何人。

【数据与隐私】
· 你的全部诗稿在「诗匣数据」文件夹里，一首诗一个纯文本文件；
  备份 = 拷走整个文件夹；想清空重来 = 删掉 poems 和 gushi 里的文件。
· 换电脑 = 把「诗匣完整包」整个文件夹拷过去，双击即可，诗稿跟着走。

【更完整的说明】
网页右上角有「手册」按钮；也可以直接双击 诗匣\public\manual.html 用浏览器打开，
里面有全部功能的图文详解：两卷说明、格律面板图例、AI 配置步骤、常见问题速查表。

【小贴士】
· 若 Windows 或杀毒软件首次提示，选择「允许/仍要运行」（官方 Node 运行时）。
· 万一电脑上既无内置运行时也无法联网，可到 nodejs.org 安装 Node.js 后再启动。
'@ | Out-File (Join-Path $pkg '使用说明.txt') -Encoding utf8

  # 6. 包根 README（GitHub 上直接可见）
  @'
# 诗匣 · 私人诗歌写作台

甲编收现代诗，乙编收古体诗与词（绝句/律诗/古风/诗经体/词牌）。
离线格律面板（逐字平仄、韵脚、孤平出韵提示、817 调词谱对照）、
版本管理、AI 评价与才女对谈，全部数据存在本地。

## 快速开始
解压后双击「启动诗匣.bat」，浏览器自动打开。无需安装 Node.js。
首次使用请读「使用说明.txt」；完整图文手册在 诗匣\public\manual.html。

## 目录
- 诗匣\ 程序　- 诗匣数据\ 你的全部数据（备份=拷走此文件夹）
- runtime\ 便携运行时（Windows x64）

> API Key 只存在本机 config.json，不会随仓库或打包外泄。
'@ | Out-File (Join-Path $pkg 'README.md') -Encoding utf8

  # 7. 压缩（带日期，避免新旧混淆）
  $zipPath = Join-Path $workspace ('诗匣完整包-win-x64-' + (Get-Date -Format 'yyyyMMdd') + '.zip')
  if (Test-Path $zipPath) { Remove-Item $zipPath -Force }
  Compress-Archive -Path (Join-Path $stage '诗匣完整包') -DestinationPath $zipPath -Force
  $size = [Math]::Round((Get-Item $zipPath).Length / 1MB, 1)
  Write-Host ("[诗匣] 打包完成：{0}（{1} MB）" -f $zipPath, $size)
  Write-Host "[诗匣] 把这个 zip 发给任何人，解压到任意位置，双击 启动诗匣.bat 即用。"
} finally {
  $ProgressPreference = $old
  Remove-Item $stage -Recurse -Force -ErrorAction SilentlyContinue
}
