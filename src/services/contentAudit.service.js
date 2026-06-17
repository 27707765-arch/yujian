/**
 * 内容审核服务
 * 用于检查和过滤内容中的敏感信息，包括文本和图片审核
 */

// 敏感词列表（生产环境应从配置文件或数据库加载）
const sensitiveWords = [
  // 英文
  'fuck', 'shit', 'damn', 'asshole', 'bastard',
  // 色情
  '色情', '裸聊', '约炮', '一夜情', '上门服务', '按摩服务',
  // 赌博
  '赌博', '博彩', '六合彩', '赌场', '彩票', '投注', '下注',
  // 毒品
  '毒品', '冰毒', '大麻', '海洛因', 'k粉', '摇头丸', '吸毒',
  // 枪支
  '枪支', '手枪', '步枪', '弹药', '军火', '枪械',
  // 诈骗
  '诈骗', '骗子', '传销', '资金盘', '投资理财', '稳赚',
  '刷单', '兼职打字', '日赚',
  // 其他违规
  '代开发票', '办证', '高利贷', '贷款', '套现', '信用卡',
  '贩卖', '嫖娼', '卖淫', '人贩子',
  // 政治敏感
  '法轮功', 'falungong',
  // 侮辱/歧视
  '傻逼', 'sb', '草泥马', 'cnm', '操你妈'
];

/**
 * 检查内容是否包含敏感词
 * @param {string} content - 待检查的内容
 * @returns {Object} - 检查结果对象
 * @returns {boolean} return.pass - 是否通过审核
 * @returns {string} return.message - 审核结果消息
 * @returns {string} [return.sensitiveWord] - 检测到的敏感词（仅当未通过审核时）
 */
function checkSensitiveContent(content) {
  // 检查内容是否为空或格式不正确
  if (!content || typeof content !== 'string') {
    return {
      pass: true,
      message: '内容为空或格式不正确'
    };
  }

  // 检查敏感词
  for (const word of sensitiveWords) {
    if (content.includes(word)) {
      return {
        pass: false,
        message: `内容包含敏感词: ${word}`,
        sensitiveWord: word
      };
    }
  }

  // 审核通过
  return {
    pass: true,
    message: '内容审核通过'
  };
}

/**
 * 过滤内容中的敏感词
 * @param {string} content - 待过滤的内容
 * @param {string} replacement - 替换字符，默认为'*'
 * @returns {string} - 过滤后的内容
 */
function filterSensitiveContent(content, replacement = '*') {
  // 检查内容是否为空或格式不正确
  if (!content || typeof content !== 'string') {
    return content;
  }

  let filteredContent = content;
  // 替换所有敏感词
  for (const word of sensitiveWords) {
    const regex = new RegExp(word, 'gi'); // 不区分大小写
    filteredContent = filteredContent.replace(regex, replacement.repeat(word.length));
  }

  return filteredContent;
}

/**
 * 检查图片是否合规（模拟实现）
 * @param {string} imageUrl - 图片URL
 * @returns {Promise<Object>} - 检查结果对象
 * @returns {boolean} return.pass - 是否通过审核
 * @returns {string} return.message - 审核结果消息
 * @returns {number} return.confidence - 审核置信度
 */
async function checkImageContent(imageUrl) {
  // 实际项目中，这里应该调用第三方图片审核API
  // 这里仅做模拟实现
  return {
    pass: true,
    message: '图片审核通过',
    confidence: 0.99
  };
}

module.exports = {
  checkSensitiveContent,  // 检查内容是否包含敏感词
  filterSensitiveContent, // 过滤内容中的敏感词
  checkImageContent       // 检查图片是否合规
};