# 遇见APP 设计规范（Design System）

> S17 视觉统一：单一主视觉（粉红系）+ 单一 Toast + 品牌渐变变量。
> 依据《整改方案-2026-08-01.md》S17 收敛三套品牌色（粉/紫/橙）到粉红主视觉。

## 色板（单一路径）

| Token | 值 | 用途 |
|---|---|---|
| `--primary` | `#FF5E7D` | 主色（按钮/强调/导航激活） |
| `--primary-dark` | `#E84D6A` | 主色加深（hover/渐变终点） |
| `--primary-light` | `#FF8099` | 主色变浅（渐变起点/浅背景） |
| `--primary-bg` | `#FFF0F3` | 主色浅背景（标签/头像底） |
| `--gradient-a` | `#FF5E7D` | **品牌渐变起点**（收敛 `#667eea`/`#FF6B6B` 残留） |
| `--gradient-b` | `#FF9A8B` | **品牌渐变终点**（收敛 `#764ba2`/`#FF8E8E` 残留） |
| `--bg-white` | `#FFFFFF` | 卡片/内容背景 |
| `--bg-page` | `#F5F5F7` | 页面背景 |
| `--text` | `#1D1D1F` | 主文本 |
| `--text-secondary` | `#86868B` | 次级文本 |
| `--text-muted` | `#AEAEB2` | 弱化文本/占位 |
| `--border` | `#E5E5EA` | 边框/分隔线 |
| `--success` | `#34C759` | 成功（已读/送达） |
| `--error` | `#FF3B30` | 错误/危险操作 |
| `--warning` | `#FF9500` | 警告 |
| `--link` | `#007AFF` | 链接 |
| `--gold` | `#FFD60A` | 金币/VIP 点缀 |

**规则**：
- 新增渐变一律用 `var(--gradient-a),var(--gradient-b)`，禁止硬编码其他色系渐变。
- `#667eea/#764ba2`（紫）、`#FF6B9D/#FF8E53`（橙红）已废弃，禁止新引入。
- 金色系 `#F6D365/#FDA085` 保留（超级喜欢/金币语义色），不属于品牌主视觉。

## 间距 / 圆角 / 阴影

| Token | 值 |
|---|---|
| `--radius` | `16px`（卡片/大圆角） |
| `--radius-sm` | `10px`（小圆角/输入框） |
| `--shadow` | `0 2px 8px rgba(0,0,0,.06)`（卡片投影） |

间距体系：4 的倍数（4/8/12/16/20/24），页面边距 16px，卡片间距 12px。

## 字体

- 系统字体栈（`-apple-system, ...`），无需引入 web font。
- 正文 14px，标题 18-22px，辅助信息 12px。

## 按钮

| 变体 | 样式 |
|---|---|
| `.btn.bp` | 主按钮（粉红渐变背景，白字） |
| `.btn.bs` | 次按钮（白底，主色边框/文字） |
| `.btn.bo` | 描边按钮（透明底，主色描边） |
| `.btn.bw` | 宽按钮（`width:100%`） |
| `.btn.bl` | 大按钮（更大内边距） |

## 卡片

`.card` / `.conv-item` / `.post-card`：白底 + `--radius` + `--shadow`，圆角 16px。

## Toast（单一套）

- 统一走 `NotificationUtils.showToast(msg, type)`（`public/js/notification.js`，DOM 自建 `#toast-container`）。
- `public/js/yujian-app.js` 的 `toast()` 已映射旧类型：`tok→success`、`terr→error`、`tinfo→info`。
- 旧 `.tm` 类 + `toasts` 数组渲染仅作 NotificationUtils 未加载时的兜底，禁止新增使用。

## 头像缺失占位

- 用户头像缺失用 `👤`（兜底）；新用户登录自动分配随机头像（`a839d6f`）。
- 认证中心/资料编辑头像位用 `📷`/`🛡️`。

## 骨架屏（配合 S18）

- `.skeleton-card` / `.skeleton-avatar` / `.skeleton-text`：`skeletonShimmer` 动画（index.html:76）。
- 加载态优先骨架屏，替代纯 `.spin` 菊花。
