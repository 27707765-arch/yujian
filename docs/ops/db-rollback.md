# 数据库回滚规范（DB Rollback）

> 迁移体系（`src/db/migrate.js` + `schema_migrations`）**只前进**：每个迁移文件只执行一次，用于**上线变更**。
> 回滚（下线变更）与上线是两回事，**不并入 migrate.js**（避免污染 `schema_migrations` 语义），以独立 SQL 文件 + 人工执行的方式管理。

## 什么时候需要回滚 SQL

当一次发布带**数据库结构变更**（建表 / 加列 / 改列 / 删表）时，若发布后发现问题需要回退到上一版本，结构变更不会随代码回退自动消失，需要**手写下行 SQL** 把结构还原。

## 规范

1. **每个带结构变更的迁移文件，必须配一个下行回滚 SQL**，命名约定：
   ```
   src/db/ops/rollback_<迁移号>_<简述>.sql
   ```
   例如 `src/db/ops/rollback_0004_social_features.sql`

2. **回滚 SQL 必须与迁移严格对称**（迁移加了什么，回滚就删什么），且**幂等**（重复执行不报错），常用写法：
   - 删表：`DROP TABLE IF EXISTS ...`
   - 删列：`ALTER TABLE ... DROP COLUMN IF EXISTS ...` ⚠️ MySQL 8.0 **不支持** `DROP COLUMN IF EXISTS`，需先查 INFORMATION_SCHEMA 或人工确认列存在
   - 删索引：`ALTER TABLE ... DROP INDEX ...`

3. **回滚前必须先备份**：执行 `bash scripts/backup.sh` 拿到可恢复的快照；回滚出错时用 `bash scripts/restore.sh` 恢复。

4. **回滚执行流程**：
   ```
   # 1. 备份当前库
   bash scripts/backup.sh
   # 2. 查看迁移记录确认要回滚的版本
   SELECT * FROM schema_migrations;
   # 3. 人工核对回滚 SQL（尤其 DROP 语句，确认无数据依赖）
   # 4. 在 ECS 执行回滚 SQL
   mysql -u<user> -p <db> < src/db/ops/rollback_0004_social_features.sql
   # 5. 从 schema_migrations 删除该迁移记录（使其可被 migrate.js 重跑）
   DELETE FROM schema_migrations WHERE name = '0004_social_features.sql';
   # 6. 重启应用并核对数据
   pm2 restart yujian-backend --update-env
   ```

## 模板示例

```sql
-- src/db/ops/rollback_0004_social_features.sql
-- 下行回滚：0004 贴纸/装扮 seed 迁移

-- 清空 0004 写入的 seed 数据（按名称/类型过滤，避免误删用户数据）
DELETE FROM stickers WHERE sort_order BETWEEN 1 AND 14;
DELETE FROM dress_up_items WHERE name IN ('粉色光环','金色皇冠框','钻石闪耀框','渐变气泡','爱心气泡','贵族铭牌','闪耀铭牌');

-- 若 0004 建了新表，则 DROP（本迁移只 seed，无新表）
-- DROP TABLE IF EXISTS xxx;

-- 提示：INSERT IGNORE 幂等迁移重跑安全；回滚后若需恢复，直接重跑 migrate.js 即可重新 seed
```

## 迁移文件与回滚文件对照表

| 迁移文件 | 下行回滚 | 说明 |
|---|---|---|
| `0000_baseline.sql` | 无（初始基线，不回滚） | schema.sql 初始化 |
| `0001_batch2_features.sql` | `rollback_0001_batch2_features.sql` | 聊天增强/贵族装扮/社区等 |
| `0002_missing_tables.sql` | `rollback_0002_missing_tables.sql` | 亲密关系/贴纸/话题等缺表 |
| `0003_admin_features.sql` | `rollback_0003_admin_features.sql` | 管理后台相关表 |
| `0004_social_features.sql` | `rollback_0004_social_features.sql`（本仓库） | 贴纸/装扮/破冰 seed |
