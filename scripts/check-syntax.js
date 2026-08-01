#!/usr/bin/env node
/**
 * 全项目 JS 语法检查（跨平台，CI 与本地共用）
 * 遍历 src/、public/、根目录 server.js / websocket-server.js，逐个 node --check。
 * 用法：node scripts/check-syntax.js
 */
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

// 收集待检查文件
function collectFiles() {
  const files = [];
  const scan = (dir) => {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) scan(full);
      else if (entry.name.endsWith('.js')) files.push(full);
    }
  };
  scan(path.join(ROOT, 'src'));
  scan(path.join(ROOT, 'public'));
  for (const f of ['server.js', 'websocket-server.js']) {
    const p = path.join(ROOT, f);
    if (fs.existsSync(p)) files.push(p);
  }
  return files;
}

const files = collectFiles();
let failed = 0;

for (const file of files) {
  try {
    execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
  } catch (e) {
    failed++;
    console.error(`❌ ${path.relative(ROOT, file)}: ${e.stderr ? e.stderr.toString() : e.message}`);
  }
}

if (failed > 0) {
  console.error(`\n❌ ${failed} 个文件语法错误`);
  process.exit(1);
}
console.log(`✅ ${files.length} 个 JS 文件语法全部通过`);
