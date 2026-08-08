# 遇见APP 整改实施步骤（UI/UX 专项 · 机器可执行版 v2，2026-08-08）

> **本版相对 v1（2026-08-04）的关键修正**（均已对照未提交工作区实测）：
> - ❗ **U6 前提失效**：心跳 ping/pong 实际已匹配（前端发 `pong`、服务端 `WsEvents.PONG='pong'` 已处理），v1 照做会改坏正常代码 → 本版降级为「核验项」，不动代码。
> - ❗ **行号全部漂移**：本版一律改用 **grep 锚点** 定位（行号仅作参考，标 `≈`）。
> - ❗ **U14 文件归属写错**：预览浮层元素在 `yujian-app.js` AppRoot，CSS 才在 `index.html`。
> - ❗ **自检脚本 3 条 grep 写错**：本版给出可直接跑通的版本。
> - ❗ **U11/U16 重叠**：合并说明、共用一套 touch handler。
> - ❗ **交叉索引命名冲突**：后端工单由 `B1-B9` 改名 `BK1-BK9`，避免与报告维度 `A-N` 混淆。
> - ✅ 每步新增 `- [ ]` 进度勾选 + 顶部进度总览表。
>
> 配合阅读：
> - 上游体检：[整改方案-2026-08-01.md](./整改方案-2026-08-01.md)（后端/安全/主链路，独立并行）
> - 本文件**只收录前端 UI/UX/操控/布局/视觉/性能/A11y/离线/媒体**，不重复后端与 S 期任务。

---

## §0 执行约定

- 仓库根：`E:\项目文件\APP\yujian`
- 运行时前端 = `public/index.html` + `public/js/yujian-app.js` + `public/js/notification.js` + `public/sw.js` + `public/manifest.json`（**勿动根目录同名散落文件**）
- 运行时后端 = `src/**`
- 单步独立 commit：`UX: <描述>` / `WIRE: <描述>`；失败 `git revert HEAD --no-edit`
- **不轮换密钥 / 不改 .env / 不动 schema**（归 [整改实施步骤-机器可执行.md](./整改实施步骤-机器可执行.md)）
- 前端变更**不需要 pm2 restart**；仅 `scp` 覆盖 `public/`
- 严禁：删 `public/index.html`、`public/sw.js`、`server.js`；`git filter-repo`；`pm2 delete`
- 定位代码**优先用 grep 锚点**，行号会漂移

**每步四要素**：目标 / 改动文件（grep 锚点）/ 操作 / 验收
**优先级**：🔴P0 破损或合规 · 🟠P1 核心链路 · 🟡P2 毛刺与可达性 · 🟢P3 视觉与 Nice-to-have

---

## §0.5 进度总览（执行时逐项勾选）

| # | 步骤 | 期 | 级 | 状态 |
|---|---|---|---|---|
| U1 | 解除全局 user-select，消息可复制 | 1 | 🔴 | - [ ] |
| U2 | PWA manifest 主题色对齐 #FF5E7D | 1 | 🔴 | - [ ] |
| U3 | 下架"敬请期待"视频通话按钮 | 1 | 🔴 | - [ ] |
| U4 | 退出登录二次确认 | 1 | 🔴 | - [ ] |
| U5 | 401 重定向保留 referrer | 1 | 🔴 | - [ ] |
| U6 | 心跳 ping/pong 核验（**无需改码**） | 1 | ✅ | - [ ] |
| U7 | 18+ 勾选 + 注销账号入口 | 1 | 🔴 | - [ ] |
| U8 | 首页 like/skip/super-like 主链路 | 2 | 🟠 | - [ ] |
| U9 | 定位改显式授权+高精度 | 2 | 🟠 | - [ ] |
| U10 | 全局搜索入口 | 2 | 🟠 | - [ ] |
| U11 | 会话长按菜单+滑动操作（含原U16） | 2 | 🟠 | - [ ] |
| U12 | 头像/图片上传客户端压缩 | 2 | 🟠 | - [ ] |
| U13 | 表单字段级校验 | 3 | 🟠 | - [ ] |
| U14 | 图片预览 swipe+双击放大 | 3 | 🟠 | - [ ] |
| U15 | 语音波形+倍速+上滑取消 | 3 | 🟠 | - [ ] |
| U17 | 路由 404 兜底 | 3 | 🟡 | - [ ] |
| U18 | WelcomePage 500ms 快进 | 3 | 🟡 | - [ ] |
| U19 | 离线状态 banner | 3 | 🟡 | - [ ] |
| U20 | 礼物接收方 top-banner | 3 | 🟡 | - [ ] |
| U21 | 通话补静音/扬声器/切视频 | 3 | 🟡 | - [ ] |
| U22 | 图片 404 兜底占位 | 3 | 🟡 | - [ ] |
| U23 | 内联 style 收敛到组件 | 4 | 🟡 | - [ ] |
| U24 | 圆角/阴影/字号 token 收敛 | 4 | 🟡 | - [ ] |
| U25 | 底部 nav emoji→SVG | 4 | 🟡 | - [ ] |
| U26 | 旧 Toast 路径下架 | 4 | 🟡 | - [ ] |
| U27 | 匹配/礼物成功动效 | 4 | 🟢 | - [ ] |
| U28 | PWA 图标多尺寸 | 4 | 🟢 | - [ ] |
| U29 | prefers-reduced-motion + focus | 4 | 🟢 | - [ ] |
| U30 | WebPush 真注册 | 4 | 🟢 | - [ ] |
| U31 | 拆 chunk 懒加载 | 5 | 🟢 | - [ ] |
| U32 | 列表虚拟滚动 | 5 | 🟢 | - [ ] |
| U33 | 多 tab BroadcastChannel | 5 | 🟢 | - [ ] |
| U34 | A2HS 提示横幅 | 5 | 🟢 | - [ ] |

---

## 第 1 期 · 止血（🔴P0）

### U1 解除全局 user-select，让消息可复制
- [ ] **目标**：聊天文字/地址/ID/验证码可长按复制、翻译、搜索
- **锚点**：`public/index.html` 搜 `user-select:none`（≈65 行，`html,body{...}` 规则内）
- **操作**：
  ```css
  html,body{...;user-select:none;-webkit-user-select:none}
  input,textarea,[contenteditable="true"]{user-select:auto;-webkit-user-select:auto}
  .msg-b,.msg-b *{user-select:text;-webkit-user-select:text}
  ```
  同时给 `.msg-b:focus-visible` 加 1px 主色描边，勿全局 `outline:none`。
- **验收**：DevTools Mobile + 真机 Safari，聊天气泡长按出"复制/全选/翻译"；`<input>` 内仍可编辑选中。

### U2 PWA manifest 主题色对齐
- [ ] **目标**：A2HS 安装后状态栏/启动屏与主色一致
- **锚点**：`public/manifest.json` 搜 `"theme_color": "#FF6B6B"`（≈8 行）
- **操作**：`theme_color` 与需要的品牌处统一改 `#FF5E7D`；`index.html` 的 `<meta name="theme-color" content="#FF5E7D">` 已正确，不动。
- **验收**：DevTools→Application→Manifest 颜色为 `#FF5E7D`；安装后顶栏粉红一致。

### U3 下架"敬请期待"视频通话按钮
- [ ] **目标**：消除"能点但永远不通"的误导
- **锚点**：`public/js/yujian-app.js` 搜 `敬请期待`（≈799、802、1304、2418 行）
- **操作**：删除「+」面板中 `onVideoCall` 的整段 `<div ...>📹<span ...>敬请期待</span>`，保留 相册/拍摄/语音通话/礼物/贴纸 五项；删除 `onVideoCall` 方法（≈798 行），保留 `onVoiceCall`。
- **验收**：「+」面板仅 5 图标、无"敬请期待"；点视频相关无报错。

### U4 退出登录二次确认
- [ ] **目标**：防误触清空 localStorage
- **锚点**：`public/js/yujian-app.js` 搜 `logout: function(){localStorage.clear()`（≈1419 行）
- **操作**：
  1. `logout` 顶部加 `if(!window.confirm("确定退出登录？登录态与本地缓存将一并清除"))return;`
  2. 在 AppRoot 新增集中 `appLogout()`：`localStorage.clear()` + `try{ws&&ws.close()}catch(e){}` + `router.replace('/login')`，MyPage 调它。
- **验收**：取消确认仍停留「我的」；确认后 WS 关闭、跳登录。

### U5 401 重定向保留 referrer
- [ ] **目标**：登录态过期被踢，重登后回到原页面
- **锚点**：`public/js/yujian-app.js` 搜 `r.status===401`（≈54 行）
- **操作**：
  ```js
  if(r.status===401){
    var here=location.hash.replace(/^#/,'');
    if(here && here!=='/login' && here!=='/')localStorage.setItem('postLoginRedirect',here);
    localStorage.clear(); try{ws&&ws.close()}catch(e){}
    location.hash="#/login"; throw new Error("登录已过期，请重新登录");
  }
  ```
  LoginPage `doLogin` 成功后：读 `postLoginRedirect` → `removeItem` → `router.replace(back||'/home')`。
- **验收**：在 `/chat/123` 触发 401 → 登录页 → 重登 → 回 `/chat/123`。

### U6 心跳 ping/pong —— ✅ 已核实无需改码（v1 此项前提失效）
- [ ] **结论**：前端 `wsConnect`（≈73 行）每 30s 发 `{type:"pong"}`；服务端 `websocket-server.js:158` 处理 `WsEvents.PONG`，而 `src/constants/wsEvents.js` 中 `PONG:'pong'` —— **两者已匹配，无 bug**。另有协议级 `ws.ping()/on('pong')`（≈68/93 行）兜底。
- **操作**：**不改代码**。仅核验：连接保持 30 分钟无"未知消息类型 pong"日志。
- **验收**：`grep "type:\"pong\"" public/js/yujian-app.js` 命中；服务端无 unknown-type 告警。

### U7 18+ 勾选 + 注销账号入口
- [ ] **目标**：合规底线 + 账号生命周期
- **锚点**：`public/js/yujian-app.js` 搜 `LoginPage`（≈104 行）与 `SettingsPage`（≈1736 行）
- **操作**：
  1. LoginPage 登录按钮上方加 `<label><input type="checkbox" v-model="adult">我已年满18周岁并同意《用户协议》《隐私政策》</label>`，登录按钮 `:disabled="!adult||loading"`。
  2. SettingsPage 底部加 `{i:'🗑️',l:'注销账号',p:'/deactivate'}`；新增 `DeactivatePage`（说明 14 天冷静期 → 调 `/api/user/deactivate`，无接口则显示"筹备中"）；路由表追加 `/deactivate`。
- **验收**：未勾选无法登录；设置页可见注销入口并可进入。

### 🚦 第 1 期闸门
```
[ ] U1-U5、U7 完成并 commit（U6 仅核验）
[ ] 实机：聊天长按复制 / 401 回原页 / 桌面图标顶栏 #FF5E7D / 18+ 拦截
[ ] 推 origin main（不含密钥）
```

---

## 第 2 期 · 核心链路回归（🟠P1）

### U8 首页 like / skip / super-like 主链路
- [ ] **现状核对**：后端 `src/routes/match.routes.js` **已齐**（recommend/like/skip/matches/unmatch/likes/super-like/undo/daily-quota）；`UserProfilePage`（≈1613/1629 行）**已有** like + super-like；**唯独 HomePage 没有**，仍是"打招呼/发消息"。
- **锚点**：`public/js/yujian-app.js` 搜 `_has_conversation?'发消息':'打招呼'`（≈236 行）与 `chatUp: async`
- **操作**：
  1. HomePage `data` 加 `quota:{likes:20,supers:5}`，`load` 并行 `api('/match/daily-quota')` 写入。
  2. 每卡右下把「打招呼」按钮换成三按钮组：
     ```html
     <button class="act-skip"  @click.stop="skip(u)">✕</button>
     <button class="act-super" @click.stop="superLike(u)" :disabled="!quota.supers">⭐</button>
     <button class="act-like"  @click.stop="like(u)" :disabled="!quota.likes">❤</button>
     ```
  3. methods 加 `like/skip/superLike`，命中 `matched` 复用现有 `matchModal`。
  4. 列表顶加配额条「今日 n/20」+ VIP 标识。
- **验收**：点❤配额-1，匹配弹 modal；⭐走 super-like；配额耗尽 disabled+toast。

### U9 定位改显式授权 + 高精度
- [ ] **锚点**：搜 `enableHighAccuracy:false`（HomePage `initLocation`，≈150 行）
- **操作**：去掉 mounted 自动 `getCurrentPosition`，改为点「附近」tab/定位按钮触发；`enableHighAccuracy:true`、`timeout:12000`；失败按 `PERMISSION_DENIED/TIMEOUT/POSITION_UNAVAILABLE` 分别 toast。
- **验收**：首次点「附近」弹权限；拒绝后文案变"附近（未开启定位）"。

### U10 全局搜索入口
- [ ] **现状核对**：当前**无 SearchPage**。
- **锚点**：`public/js/yujian-app.js` 路由表（≈2425 行）
- **操作**：
  1. 新增 `SearchPage`（q/tab/results/loading/hasMore），tabs：用户/动态/圈子。
  2. 一级 tab 头部右上加 🔍 跳 `/search`。
  3. 接口：`GET /api/user/search?q=`、`GET /api/posts?q=`、`GET /api/community/list?q=`（缺的走 §6 工单 BK8）。
- **验收**：搜"广东"出对应用户/动态；回车分页加载。

### U11 会话长按菜单 + 滑动操作（合并原 U16）
- [ ] **锚点**：`public/js/yujian-app.js` ChatListPage `.conv-item`（≈527 行）；CSS `index.html:458`
- **操作**：抽一个共用 touch handler：
  1. **长按**（750ms）弹底部 Sheet：标已读 / 置顶 / 免打扰 / 删除 / 拉黑。
  2. **左滑**（>80px）露"标已读/删除"；**右滑**露"屏蔽"。
  3. 置顶本地存 `localStorage.pinnedConvs`；删除调 `DELETE /api/chat/conversations/:id`（缺则 BK 工单）；拉黑复用 `/block/add`。
- **验收**：长按弹 5 项菜单；左右滑各露对应操作并可触发。

### U12 上传客户端压缩
- [ ] **锚点**：搜 `uploadImage`、`pubImageChange`、`onPhotoPick`
- **操作**：新增 `compressImage(file,maxW=1080,q=0.85)`（canvas→`toBlob('image/webp')`），三处上传前调用，失败回退原图。
- **验收**：iPhone 4032×3024 JPEG(≈3.4MB) → ≤1080px、≤800KB WebP。

### 🚦 第 2 期闸门
```
[ ] U8-U12 commit & push
[ ] 实机：首页三按钮全链路 / 长按+滑动会话 / 3MB 图压缩后 <800KB
```

---

## 第 3 期 · 可达性 / 表单 / 富交互（🟠P1-🟡P2）

### U13 表单字段级校验
- [ ] **锚点**：LoginPage / EditProfilePage / RechargePage
- **操作**：抽 `validate(field,rules)`；输入框 `:class="{'has-error':errors.x}"` + 下方 `.err-hint`；提交按钮 `:disabled="hasErrors||submitting"`。
- **验收**：错误字段红边+红字提示；提交按钮错误时禁用。

### U14 图片预览 swipe + 双击放大
- [ ] **锚点修正**：预览浮层**元素**在 `yujian-app.js` AppRoot（搜 `image-preview-overlay`，≈2578 行）；**CSS** 在 `index.html:407`。v1 写成只改 index.html 是错的。
- **操作**：浮层加 `@touchstart/@touchend` 算 deltaX，>60px 触发 `preview.prev/next`；`<img>` 加 `@dblclick` 切 `.scale-1x/.scale-2x`（CSS `transform:scale()`）。
- **验收**：滑动翻页、双击放大/还原。

### U15 语音波形 + 倍速 + 上滑取消
- [ ] **锚点**：ChatDetailPage 录音（搜 `startRecording`/`stopRecording`）与语音气泡（`m.type===2`）
- **操作**：
  1. `@touchmove` 算 deltaY：>60px 文案"松手取消"，>120px"移到此处取消"；释放超阈值 → 不发送。
  2. 录音 >60s 自动 stop + 提示。
  3. 气泡长按弹"1.0×/1.5×/2.0×/收藏"。
  4. 波形：`decodeAudioData` 取 peak → 30 柱竖条。
- **验收**：上滑取消不进 timeline；60s 自动停；倍速可切。

### U17 路由 404 兜底
- [ ] **锚点**：路由表末尾（≈2425 行）
- **操作**：新增 `NotFoundPage`（🚧+回首页按钮）；追加 `{path:'/:pathMatch(.*)*',component:NotFoundPage}`。
- **验收**：`#/garbage/path` 显示 404 页。

### U18 WelcomePage 500ms 快进
- [ ] **锚点**：搜 `setTimeout(function(){s.go()},2000)`（WelcomePage，≈100 行）
- **操作**：`2000`→`500`；router.beforeEach 中 `if(to.path!=='/'&&from.path==='/')` 直接放行跳过欢迎页。
- **验收**：直访 `#/user/1` 不现欢迎页；冷启动仍有短暂品牌帧。

### U19 离线状态 banner
- [ ] **锚点**：AppRoot（`yujian-app.js` 底部 `var AppRoot`）
- **操作**：data 加 `online:navigator.onLine`，监听 `online/offline`；nav 上方 `<div v-if="!online" class="offline-banner">📡 当前离线，部分功能暂不可用</div>`；CSS 黄底。
- **验收**：断网出 banner，恢复自动消失。

### U20 礼物接收方 top-banner
- [ ] **锚点**：ChatDetailPage `handleWs`
- **操作**：`message` type=6（或 `gift_received`）时顶部挂 5s banner，点击 `scrollIntoView` 定位该气泡。
- **验收**：对方送礼 → 顶部 5s 出"🎁 TA 送了你 [名]"可点击。

### U21 通话补静音 / 扬声器 / 切视频
- [ ] **锚点**：搜 `endCall` 通话全屏（≈1163 行）
- **操作**：单挂断键改四键组：🎙静音（`getAudioTracks()[0].enabled`）/ 📞挂断 / 🔊扬声器（`audio.muted`）/ 📹切视频（`v-if="canVideo"`）。
- **验收**：通话中可静音/切扬声器，按钮有 active 态。

### U22 图片 404 兜底占位
- [ ] **锚点**：全站 `<img loading="lazy" v-if="...avatar">`
- **操作**：全局 `@error="imgFallback($event)"`：置渐变底 + 去 src + 显 👤。
- **验收**：故意改坏 uploads 地址，列表不留白、显占位。

### 🚦 第 3 期闸门
```
[ ] U13-U22 commit & push
[ ] 实机：表单红字 / 预览滑动双击 / 通话四键 / 离线 banner
```

---

## 第 4 期 · 视觉统一 / 设计系统（🟡P2-🟢P3）

### U23 内联 style 收敛到组件
- [ ] **操作**：抽 Button/Card/Modal/Sheet/Avatar/Tag/Empty/Loading/Toast/Input/Toolbar/ListItem 12 组件；逐步替换裸 `style="..."`。
- **验收**：首页/我的/钱包/圈子 inline style 数量较基线降 50%（见 §11 脚本）。

### U24 圆角/阴影/字号 token 收敛
- [ ] **锚点**：`public/index.html` `:root`
- **操作**：加 `--r-xs:6px;--r-sm:10px;--r-md:14px;--r-lg:18px;--r-xl:24px;--r-pill:9999px` + `--elev-1/2/3` + `--text-12/14/16/18/20`；替换裸 `border-radius:`。
- **验收**：§11 脚本裸圆角计数为 0。

### U25 底部 nav emoji→SVG
- [ ] **锚点**：AppRoot `<nav class="nav">` 模板
- **操作**：4 个 tab 换 24×24、stroke 1.8 的 inline SVG；active `fill:var(--p)` + `translateY(-2px)`。
- **验收**：跨 iOS/Android/鸿蒙渲染一致，active 更清晰。

### U26 旧 Toast 路径下架
- [ ] **锚点**：AppRoot 搜 `<div class="tc">` 与 `toasts.push`
- **操作**：删除 `.tc>.tm` 兜底渲染，统一走 `NotificationUtils.showToast`。
- **验收**：§11 脚本 `.tc` 计数为 0；所有 toast 单一来源。

### U27 匹配/礼物成功动效 🟢
- [ ] canvas + rAF 粒子（飞心/金币），2s 收尾进 modal；低端机不掉帧。

### U28 PWA 图标多尺寸 🟢
- [ ] 生成 `public/icons/icon-192.png / icon-512.png / maskable-512.png`；`manifest.json` icons 数组改多分辨率。Lighthouse PWA 不再告警。

### U29 prefers-reduced-motion + focus-visible 🟢
- [ ] `index.html` 加 `@media(prefers-reduced-motion:reduce)` 关动效；全局 `*:focus-visible{outline:2px solid var(--p);outline-offset:2px}`。

### U30 WebPush 真注册 🟢
- [ ] `public/sw.js` 加 `push` 事件 + 系统通知；AppRoot 在用户点"接收推送"时才 `requestPermission()`。iOS 16.4+ PWA 可弹原生通知。

### 🚦 第 4 期闸门
```
[ ] U23-U30 commit & push
[ ] Lighthouse PWA≥90、A11y≥90；inline style 降 50%；toast 单源
```

---

## 第 5 期 · 性能深度优化（🟢P3，可选）

- [ ] **U31** 拆 chunk：Vite/esbuild 路由懒加载，首屏 JS ≤200KB
- [ ] **U32** 虚拟滚动：1000+ 项 60fps
- [ ] **U33** 多 tab：BroadcastChannel，仅主 tab 弹通知
- [ ] **U34** A2HS：拦截 `beforeinstallprompt`，Discover/Chat 顶部横幅

---

## §6 后端依赖工单（BK，与前端并行；命名改 BK 避免与报告 A-N 冲突）

| ID | 后端缺口 | 支撑前端 |
|---|---|---|
| BK1 | unlike/撤销主链路 | U8 撤销按钮 |
| BK2 | `/api/user/devices` | 设备管理 |
| BK3 | `/api/user/deactivate` | U7 注销 |
| BK4 | 会话置顶持久化 | U11 置顶 |
| BK5 | 通话信令接收方 | U21 切视频 |
| BK6 | 推送真注册 | U30 |
| BK7 | 礼物 type=6 推送 | U20 |
| BK8 | 用户/动态/圈子搜索 | U10 |
| BK9 | `match/daily-quota` 返回结构核对 | U8 配额条 |

---

## §11 阶段自检脚本（修正版，可直接跑）

> Windows PowerShell（仓库根执行）。v1 的 `grep -c 'tc\s*class'`、`node -e require sw.js` 等写法无效，已替换。

```powershell
# 1) 全局禁选仅剩根标签（应 ≤1）
(Select-String -Path public\index.html -Pattern 'user-select:none').Count

# 2) index.html 裸圆角计数（U24 后应为 0；排除 var() 引用）
(Select-String -Path public\index.html -Pattern 'border-radius:\s*\d+px' |
   Where-Object { $_.Line -notmatch 'var\(' }).Count

# 3) yujian-app.js 内联 style 基线/当前（U23 前先跑一次记基线）
(Select-String -Path public\js\yujian-app.js -Pattern 'style="').Count

# 4) 旧 toast 兜底路径残留（U26 后应为 0；注意模板里引号被转义为 class=\"tc\"，故匹配 v-for 源）
(Select-String -Path public\js\yujian-app.js -Pattern 'in toasts').Count + (Select-String -Path public\index.html -Pattern '\.tc\{').Count

# 5) JS 语法体检
node --check public\js\yujian-app.js

# 6) 版本号一致性（index.html 引用 vs APP_VERSION）
Select-String -Path public\index.html -Pattern 'yujian-app\.js\?v='
Select-String -Path public\js\yujian-app.js -Pattern 'APP_VERSION = '
```
**2026-08-08 实测基线**（整改前对照值，执行后应单调改善）：

| 检查项 | 基线 | 目标 |
|---|---|---|
| ① user-select:none 计数 | 1 | ≤1（U1 后消息区另开 text） |
| ② index.html 裸圆角 | 18 | 0（U24） |
| ③ yujian-app.js 内联 style | 454 | ≤227（U23，降 50%） |
| ④ 旧 toast 残留（in toasts + .tc{） | 2 | 0（U26） |
| ⑤ JS 语法 | OK | OK |

另：Lighthouse PWA+A11y≥90；每期闸门列出的实机项逐条过。

---

## §12 部署与回滚

- 前端改动**不 pm2 restart**；覆盖 `public/`：
  ```bash
  scp -i "$YUJIAN_SSH_KEY" public/index.html public/js/yujian-app.js \
    public/js/notification.js public/sw.js public/manifest.json public/icon.png \
    root@182.92.179.97:/home/app/yujian/public/
  # 若新增 public/icons/：scp -r public/icons root@...:/home/app/yujian/public/
  ```
- **cache-bust（每期收尾必做）**：
  - `index.html`（≈777 行）`yujian-app.js?v=v20260804a` → `?v=vYYYYMMDDx`
  - `yujian-app.js`（≈5 行）`APP_VERSION = "v20260804a"` 同步
  - `sw.js`（≈2 行）`CACHE_VERSION='yujian-v4'` → `v5`
- 回滚：`git revert HEAD --no-edit`；线上回退用上一版 `public/` 覆盖即可。

---

## §13 禁做清单

- 不轮换密钥 / 不动 `.env`（归 S1）
- 不改后端 controller/model 字段（归既有 tasks）
- 不删 `public/sw.js`、`public/manifest.json`
- 不把 `vue.global.js`/`vue-router.global.js` 换 npm 版（独立任务）
- 不新增 npm 依赖（除 U15 波形、U31 拆 chunk 明示外）
- 不改主题色变量主体（仅 U2 对齐 manifest）
- **不改 U6 心跳代码**（已核实正常）

---

## 附录 A · 交付物

| 阶段 | 必交 |
|---|---|
| 第1期 | 6 commit（U6 仅核验）+ 实机截图 |
| 第2期 | 5 commit + 首页三按钮/搜索截图 |
| 第3期 | 9 commit + 表单/通话/预览截图 |
| 第4期 | 8 commit + Lighthouse 报告 |
| 第5期 | 4 commit（可选） |
| §6 | 9 张后端工单 |

## 附录 B · 与上游体检报告交叉索引（报告维度 A-N）

| 步骤 | 报告章节 | 步骤 | 报告章节 |
|---|---|---|---|
| U1 | B1 | U14 | B2 |
| U2 | D1 | U15 | J2/J3 |
| U3 | J5 | U17 | L1 |
| U4 | A7/K2 | U18 | L2 |
| U5 | K3 | U19 | H1 |
| U6 | （已修复） | U20 | A8 |
| U7 | O2/K1 | U21 | J1 |
| U8 | A1 | U22 | B5/M3 |
| U9 | I3 | U23-26 | C1/C3/D2/D3/D4 |
| U10 | G1 | U27 | N1 |
| U11 | G2 | U28 | L3 |
| U12 | M1 | U29 | F3 |
| U13 | I1 | U30 | A9/L4 |
