/**
 * 遇见APP - 聊天消息收发问题诊断报告
 * 日期: 2026-07-30
 */

/**
 * === 问题1：send_message 不传 receiver_id ===
 * 文件: yujian-app.js sendMsg 方法
 *
 * 前端发送:
 *   wsSend({type:"send_message", conversation_id:self.convId, content:t, type:0})
 *
 * 后端 handleSendMessage:
 *   238: let { receiver_id, conversation_id, content, type } = data;
 *   243: if (!receiver_id && conversation_id) {
 *   244:   const conv = await Conversation.findById(conversation_id);
 *   246:   if (conv) receiver_id = conv.user1_id === userId ? conv.user2_id : conv.user1_id;
 *   247: }
 *   264: if (!receiver_id) return;  // ← 静默失败！
 *
 * 根因: 如果 Conversation.findById 失败或 conv 为 null，
 * receiver_id 为空 → 直接 return，消息被丢弃，不报任何错误。
 * 前端不知道发送失败，msg._sending 永远不会被设置为 false。
 *
 * 修复: 在第 264 行，改为主动通过 HTTP 回退而不是静默丢弃。
 */

/**
 * === 问题2：前端 sendMsg 的 wsSend 失败回退逻辑 ===
 * 文件: yujian-app.js sendMsg 方法 (287行)
 *
 * 前端逻辑:
 *   289: if(!wsSend({type:"send_message", ...})){
 *   290:   // HTTP回退
 *   291: }
 *
 * wsSend 实现:
 *   16: function wsSend(d){return ws&&ws.readyState===1&&!!ws.send(JSON.stringify(d))}
 *
 * wsSend 返回 true 只表示 WebSocket.send() 被调用了，
 * 不代表消息被处理成功。后端静默丢弃时前端也不知道。
 *
 * 修复: 改为始终先 HTTP 发送，然后通过 WS 推送通知对方。
 */

/**
 * === 问题3：消息列表 getByConversationId 的 JOIN 列名冲突 ===
 * 文件: src/models/Message.js
 *
 * 之前的代码:
 *   SELECT m.*, u.nickname AS sender_nickname, u.avatar AS sender_avatar, ...
 *   CASE WHEN m.is_recalled = 1 THEN '...' ELSE m.content END AS content
 *   FROM messages m LEFT JOIN users u ON m.sender_id = u.id
 *   WHERE m.conversation_id = ? ORDER BY m.created_at DESC LIMIT ? OFFSET ?
 *
 * 问题: m.* 已经包含了 content 和 created_at，然后又 AS content 覆盖。
 * 这样在执行 .reverse() 后，前端的:
 *   if(!m.id&&!m._local)return 会把真实消息过滤掉。
 * 
 * 修复: 不要 AS content 覆盖，用独立字段名。
 */
