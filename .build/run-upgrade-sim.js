/* 带实时输出的升级模拟（stdin 忽略，避免 Read-Host 挂起） */
'use strict';
const { spawn } = require('child_process');
const path = require('path');
const root = path.join(__dirname, 'friend-b', '诗匣完整包');
const bat = path.join(root, '诗匣升级包', '一键升级.bat');
const fs = require('fs');
if (!fs.existsSync(bat)) { console.error('找不到', bat); process.exit(2); }
const p = spawn('cmd.exe', ['/c', bat], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
let out = '';
p.stdout.on('data', d => { const t = d.toString(); out += t; });
p.stderr.on('data', d => { out += d; });
const timer = setTimeout(() => p.kill(), 60000);
p.on('exit', code => {
  clearTimeout(timer);
  console.log('=== 升级输出 ===');
  console.log(out);
  console.log('=== 退出码:', code, '===');
  process.exit(0);
});
