/**
 * 内容审核中间件
 * 用于审核请求体中的敏感内容，支持阻止或过滤敏感信息
 */

const contentAuditService = require('../services/contentAudit.service');

/**
 * 内容审核中间件工厂函数
 * @param {Object} options - 配置选项
 * @param {Array<string>} options.fields - 需要审核的字段，默认为['content', 'bio', 'nickname']
 * @param {string} options.mode - 审核模式，可选值：'block'（阻止）或 'filter'（过滤），默认为'block'
 * @param {string} options.message - 审核失败时的错误消息，默认为'内容包含敏感信息，请修改后重试'
 * @returns {Function} - Express中间件函数
 */
function contentAudit(options = {}) {
  // 解构并设置默认值
  const {
    fields = ['content', 'bio', 'nickname'], // 需要审核的字段
    mode = 'block', // 模式：block（阻止）或 filter（过滤）
    message = '内容包含敏感信息，请修改后重试'
  } = options;

  /**
   * 内容审核中间件函数
   * @param {Object} req - Express请求对象
   * @param {Object} res - Express响应对象
   * @param {Function} next - 下一个中间件函数
   * @returns {Object|undefined} - 审核失败且模式为block时返回错误响应，否则调用next()
   */
  return (req, res, next) => {
    try {
      const body = req.body;
      let hasSensitiveContent = false;
      let sensitiveMessage = '';

      // 检查指定字段是否包含敏感内容
      for (const field of fields) {
        if (body[field]) {
          const result = contentAuditService.checkSensitiveContent(body[field]);
          if (!result.pass) {
            hasSensitiveContent = true;
            sensitiveMessage = result.message;
            break;
          }
        }
      }

      // 处理敏感内容
      if (hasSensitiveContent) {
        if (mode === 'block') {
          // 阻止请求
          return res.status(400).json({
            code: 400,
            message: sensitiveMessage || message,
            data: null
          });
        } else if (mode === 'filter') {
          // 过滤敏感词
          for (const field of fields) {
            if (body[field]) {
              body[field] = contentAuditService.filterSensitiveContent(body[field]);
            }
          }
        }
      }

      // 继续处理请求
      next();
    } catch (error) {
      // 审核服务异常时记录错误但允许通过，避免审核服务故障导致整个应用不可用
      console.error('内容审核中间件错误，已降级放行:', error.message);
      next();
    }
  };
}

module.exports = contentAudit;