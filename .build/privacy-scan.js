/* 诗匣分发包隐私扫描：逐文件检查敏感信息 */
'use strict';
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const zips = [
  'C:/Users/SUOZHIYUAN/Desktop/索致远/现代诗/诗匣完整包-win-x64-20261125.zip',
  'C:/Users/SUOZHIYUAN/Desktop/索致远/现代诗/诗匣升级包-20261125.zip',
];
const scanRoot = path.join(__dirname, 'privacy-scan');
fs.rmSync(scanRoot, { recursive: true, force: true });
fs.mkdirSync(scanRoot, { recursive: true });

// 解压两个 zip 到独立目录
zips.forEach((z, i) => {
  const dst = path.join(scanRoot, 'zip' + (i + 1));
  fs.mkdirSync(dst, { recursive: true });
  execSync(`powershell -NoProfile -Command "$ProgressPreference='SilentlyContinue'; Expand-Archive -LiteralPath '${z.split('/').join('\\')}' -DestinationPath '${dst.split('/').join('\\')}' -Force"`, { stdio: 'ignore' });
});

// 敏感模式（大小写不敏感按需）
const PATTERNS = [
  { name: 'Windows 用户名 SUOZHIYUAN', re: /SUOZHIYUAN/i },
  { name: '真实姓名目录 索致远', re: /索致远/ },
  { name: '桌面路径 Desktop', re: /Desktop/i },
  { name: '绝对盘符路径 C:\\Users / C:/Users', re: /C:[\\/]+Users/i },
  { name: 'API Key 形态 (sk-…)', re: /sk-[A-Za-z0-9]{8,}/ },
  { name: '非空 apiKey 字段', re: /"apiKey"\s*:\s*"[^"]+"/ },
  { name: '笔名相关 不离', re: /不离/ },
  { name: '私人诗题 德法尔我', re: /德法尔我/ },
  { name: '私人名字 任祁', re: /任祁/ },
  { name: '私有诗题 瑞雪', re: /瑞雪/ },
];

const TEXT_EXT = new Set(['.js', '.json', '.bat', '.ps1', '.md', '.txt', '.html', '.css', '.mjs']);
const SKIP_DIRS = new Set(['runtime']);   // 官方二进制不扫描
const findings = [];
let fileCount = 0, byteCount = 0;

function walk(dir) {
  for (const f of fs.readdirSync(dir)) {
    const full = path.join(dir, f);
    const st = fs.statSync(full);
    if (st.isDirectory()) {
      if (!SKIP_DIRS.has(f)) walk(full);
      continue;
    }
    fileCount++; byteCount += st.size;
    const ext = path.extname(f).toLowerCase();
    if (!TEXT_EXT.has(ext)) continue;
    let t;
    try { t = fs.readFileSync(full, 'utf8').replace(/^\uFEFF/, ''); } catch { continue; }
    for (const p of PATTERNS) {
      if (p.re.test(t)) findings.push(path.relative(scanRoot, full) + '  ←  ' + p.name);
    }
  }
}
for (const d of fs.readdirSync(scanRoot)) walk(path.join(scanRoot, d));

console.log('扫描文件数:', fileCount, '| 合计', (byteCount / 1048576).toFixed(1), 'MB（runtime 二进制按官方包信任，未逐字节扫描）');
if (!findings.length) {
  console.log('✅ 全部文件零命中——未发现任何隐私信息');
} else {
  console.log('⚠ 发现以下命中：');
  [...new Set(findings)].forEach(f => console.log('  ' + f));
}
// 附加：zip 条目名检查（路径里不应含用户名）
for (const z of zips) {
  const names = execSync(`powershell -NoProfile -Command "Add-Type -AssemblyName System.IO.Compression.FileSystem; $z=[IO.Compression.ZipFile]::OpenRead('${z.split('/').join('\\')}'); $z.Entries | ForEach-Object { $_.FullName }; $z.Dispose()"`, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const bad = names.split('\n').filter(l => /SUOZHIYUAN|索致远|Desktop/i.test(l));
  console.log(path.basename(z), '条目名检查:', bad.length ? '⚠ ' + bad.join(';') : '✓ 干净');
}
