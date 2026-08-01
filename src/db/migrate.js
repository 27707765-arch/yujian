#!/usr/bin/env node
/**
 * ============================================================
 * 遇见APP - 数据库迁移执行器
 * ============================================================
 * 用途：按编号顺序执行 src/db/migrations/*.sql，每脚本仅执行一次（幂等）。
 *       执行记录写入 schema_migrations 表。
 * 运行：node src/db/migrate.js
 *       可追加 --baseline 参数：只登记已应用脚本、不执行（用于已手工跑过迁移的生产库初始化记录表）
 * 依赖：src/config/database.js 的 MySQL 连接池（环境变量 DB_HOST/DB_USER/DB_PASSWORD/DB_NAME）
 * 说明：本地无 MySQL 时无法实际执行；验收需在 ECS（有 MySQL）环境跑。
 * ============================================================
 */

const fs = require('fs');
const path = require('path');
const { pool } = require('../config/database');

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

/**
 * 列出迁移目录下的所有 .sql 文件，按文件名（NNNN_xxx.sql）字典序排序
 */
function listMigrationFiles() {
  if (!fs.existsSync(MIGRATIONS_DIR)) {
    console.error(`[migrate] 迁移目录不存在: ${MIGRATIONS_DIR}`);
    process.exit(1);
  }
  return fs.readdirSync(MIGRATIONS_DIR)
    .filter((f) => /^\d{4}_.+\.sql$/.test(f))
    .sort();
}

/**
 * 初始化 schema_migrations 表
 */
async function ensureMigrationsTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      migration_name VARCHAR(255) NOT NULL UNIQUE,
      applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      checksum CHAR(32) NOT NULL COMMENT '脚本内容 MD5，用于检测脚本被修改'
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='数据库迁移记录表'
  `);
}

/**
 * 读取已应用的迁移（name -> checksum）
 */
async function getAppliedMigrations() {
  const [rows] = await pool.query('SELECT migration_name, checksum FROM schema_migrations');
  const map = {};
  for (const r of rows) map[r.migration_name] = r.checksum;
  return map;
}

/**
 * 计算脚本内容 MD5（Node 内置 crypto）
 */
function md5(content) {
  const crypto = require('crypto');
  return crypto.createHash('md5').update(content, 'utf8').digest('hex');
}

/**
 * 执行单个 SQL 文件（multiStatement: true）
 */
async function runSqlFile(conn, file) {
  const content = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
  // 去掉纯注释行，避免空语句
  const statements = content
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => !l.startsWith('--') && l !== '')
    .join('\n');
  if (!statements) return;
  await conn.query({ sql: statements, multipleStatements: true });
}

async function main() {
  const baseline = process.argv.includes('--baseline');
  const files = listMigrationFiles();
  if (!files.length) {
    console.log('[migrate] 无迁移脚本');
    return;
  }

  let conn;
  try {
    conn = await pool.getConnection();
    await ensureMigrationsTable();

    if (baseline) {
      // baseline 模式：只登记不执行（生产库已手工跑过全部脚本）
      console.log('[migrate] baseline 模式：登记已应用脚本，不执行 SQL');
      await conn.beginTransaction();
      try {
        for (const file of files) {
          const content = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
          const checksum = md5(content);
          await conn.query(
            'INSERT IGNORE INTO schema_migrations (migration_name, checksum) VALUES (?, ?)',
            [file, checksum]
          );
        }
        await conn.commit();
      } catch (e) {
        await conn.rollback();
        throw e;
      }
      console.log(`[migrate] baseline 完成：登记 ${files.length} 个脚本`);
      return;
    }

    const applied = await getAppliedMigrations();
    const pending = files.filter((f) => !applied[f]);

    if (!pending.length) {
      console.log('[migrate] 无需执行，全部脚本已应用');
      return;
    }

    console.log(`[migrate] 待执行 ${pending.length} 个脚本: ${pending.join(', ')}`);

    await conn.beginTransaction();
    try {
      for (const file of pending) {
        const content = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
        const checksum = md5(content);

        // 已登记但 checksum 变化 → 告警（防止脚本被篡改）
        if (applied[file] && applied[file] !== checksum) {
          console.warn(`[migrate] ⚠️ ${file} 内容已变更（checksum 不一致），跳过`);
          continue;
        }

        console.log(`[migrate] 执行 ${file} ...`);
        await runSqlFile(conn, file);
        await conn.query(
          'INSERT INTO schema_migrations (migration_name, checksum) VALUES (?, ?)',
          [file, checksum]
        );
        console.log(`[migrate] ✅ ${file} 完成`);
      }
      await conn.commit();
      console.log('[migrate] 全部迁移完成');
    } catch (e) {
      await conn.rollback();
      console.error('[migrate] 迁移失败，已回滚:', e.message);
      process.exitCode = 1;
    }
  } catch (e) {
    console.error('[migrate] 无法连接数据库:', e.message);
    process.exitCode = 1;
  } finally {
    if (conn) conn.release();
    await pool.end();
  }
}

main();
