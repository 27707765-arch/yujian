/**
 * VIP增强控制器
 */
const { NobleLevel, DressUpItem } = require('../models/NobleLevel');
const vipService = require('../services/vip.service');
const { success, error, serverError } = require('../utils/response');

async function getNobleLevels(req, res) {
  try { success(res, await NobleLevel.getAll()); } catch (err) { serverError(res, err, '获取贵族等级失败'); }
}

async function getDressUpShop(req, res) {
  try {
    const { type } = req.query;
    const items = type ? await DressUpItem.getByType(type) : await DressUpItem.findAll();
    success(res, items);
  } catch (err) { serverError(res, err, '获取装扮商城失败'); }
}

async function getMyDressUps(req, res) {
  try {
    const items = await DressUpItem.getUserItems(req.user.id);
    success(res, items);
  } catch (err) { serverError(res, err, '获取我的装扮失败'); }
}

async function purchaseDressUp(req, res) {
  try {
    await DressUpItem.purchase(req.user.id, parseInt(req.params.itemId));
    success(res, null, '购买成功');
  } catch (err) { serverError(res, err, '购买装扮失败'); }
}

async function useDressUp(req, res) {
  try {
    await DressUpItem.setUsing(req.user.id, parseInt(req.params.itemId), true);
    success(res, null, '使用成功');
  } catch (err) { serverError(res, err, '使用装扮失败'); }
}

module.exports = { getNobleLevels, getDressUpShop, getMyDressUps, purchaseDressUp, useDressUp };
