/**
 * 用户控制器
 * 处理用户相关的HTTP请求，包括用户信息、相册、隐私设置、标签等功能
 */

const User = require('../models/User');
const UserPhoto = require('../models/UserPhoto');
const UserSettings = require('../models/UserSettings');
const Like = require('../models/Like');
const View = require('../models/View');
const Checkin = require('../models/Checkin');
const Wallet = require('../models/Wallet');
const { success, error, serverError } = require('../utils/response');
const { validateMagicBytes } = require('../services/upload.service');
const { executeQuery, isDbAvailable } = require('../utils/database');
const path = require('path');

/**
 * 逆地理编码：调用高德地图 Web API 根据经纬度查行政区划
 * @param {number} lat - 纬度
 * @param {number} lng - 经度
 * @returns {Promise<Object|null>} - { province, city, district, location }，无 Key 时降级返回 null
 */
async function reverseGeocode(lat, lng) {
  const key = process.env.GAODE_MAP_KEY;
  // 没配 Key 时降级返回 null，location 由调用方拼坐标字符串
  if (!key) {
    return null;
  }
  try {
    const url = `https://restapi.amap.com/v3/geocode/regeo?location=${lng},${lat}&key=${key}`;
    const resp = await fetch(url);
    const data = await resp.json();
    if (data.status === '1' && data.regeocode) {
      const addrComp = data.regeocode.addressComponent || {};
      let province = addrComp.province || '';
      // 直辖市高德返回 city 为空数组，用 province 顶替
      let city = addrComp.city;
      if (Array.isArray(city) && city.length === 0) {
        city = province;
      } else if (!city) {
        city = province;
      }
      const district = addrComp.district || '';
      const location = data.regeocode.formatted_address || '';
      return { province, city, district, location };
    }
    return null;
  } catch (err) {
    console.error('逆地理编码失败:', err.message);
    return null;
  }
}

/**
 * 获取用户信息
 */
async function getUserInfo(req, res) {
  try {
    const { id } = req.user;
    const user = await User.findById(id);

    if (!user) {
      return error(res, 404, '用户不存在');
    }

    // 同时获取照片数量和设置（防御性：settings 可能为 null）
    const photosCount = await UserPhoto.getCount(id);
    const settings = await UserSettings.get(id) || {};

    success(res, {
      id: user.id,
      phone: user.phone,
      nickname: user.nickname,
      avatar: user.avatar,
      gender: user.gender,
      age: user.age,
      height: user.height,
      occupation: user.occupation,
      location: user.location,
      province: user.province || null,
      city: user.city || null,
      district: user.district || null,
      tags: user.tags ? (typeof user.tags === 'string' ? JSON.parse(user.tags) : user.tags) : [],
      bio: user.bio,
      is_vip: user.is_vip,
      vip_expire_time: user.vip_expire_time,
      role: user.role || 'user',
      photos_count: photosCount,
      settings: {
        hide_distance: settings.hide_distance === 1,
        hide_online_status: settings.hide_online_status === 1,
        hide_last_active: settings.hide_last_active === 1,
        allow_stranger_chat: settings.allow_stranger_chat !== 0,
        message_notify: settings.message_notify !== 0,
        match_notify: settings.match_notify !== 0,
        like_notify: settings.like_notify !== 0,
        view_notify: settings.view_notify !== 0
      }
    });
  } catch (err) {
    serverError(res, err, '获取用户信息失败');
  }
}

/**
 * 更新用户信息
 */
async function updateUserInfo(req, res) {
  try {
    const { id } = req.user;
    const { nickname, gender, age, height, occupation, location, lat, lng, bio, tags } = req.body;

    if (nickname && (nickname.length < 2 || nickname.length > 50)) {
      return error(res, 400, '昵称长度必须在2-50之间');
    }

    if (bio && bio.length > 500) {
      return error(res, 400, '个性签名长度不能超过500');
    }

    // 验证标签数量
    if (tags && tags.length > 10) {
      return error(res, 400, '标签最多选择10个');
    }

    const updateData = { nickname, gender, age, height, occupation, location, bio };
    // lat/lng 单独处理：有值才传，防止前端传 undefined 覆盖数据库已有的坐标
    if (lat != null) updateData.lat = parseFloat(lat);
    if (lng != null) updateData.lng = parseFloat(lng);
    if (tags !== undefined) {
      updateData.tags = JSON.stringify(tags);
    }

    // 当同时传了 lat 和 lng（都不是 null）时，自动逆地理编码填充行政区划
    if (lat != null && lng != null) {
      const geo = await reverseGeocode(lat, lng);
      if (geo) {
        updateData.province = geo.province;
        updateData.city = geo.city;
        updateData.district = geo.district;
        // 高德返回的格式化地址更准确，覆盖 location 文本
        if (geo.location) {
          updateData.location = geo.location;
        }
      }
    }
    // 如果只传了 location 文本不传坐标，上面已只更新文本

    const updatedUser = await User.update(id, updateData);

    // 触发每日任务：完善个人资料
    Checkin.updateTaskProgress(id, 'complete_profile').catch(() => {});

    success(res, {
      id: updatedUser.id,
      phone: updatedUser.phone,
      nickname: updatedUser.nickname,
      avatar: updatedUser.avatar,
      gender: updatedUser.gender,
      age: updatedUser.age,
      height: updatedUser.height,
      occupation: updatedUser.occupation,
      location: updatedUser.location,
      province: updatedUser.province || null,
      city: updatedUser.city || null,
      district: updatedUser.district || null,
      tags: updatedUser.tags ? (typeof updatedUser.tags === 'string' ? JSON.parse(updatedUser.tags) : updatedUser.tags) : [],
      bio: updatedUser.bio,
      is_vip: updatedUser.is_vip,
      vip_expire_time: updatedUser.vip_expire_time,
      role: updatedUser.role || 'user'
    }, '更新成功');
  } catch (err) {
    serverError(res, err, '更新用户信息失败');
  }
}

/**
 * 上报/更新当前位置
 * POST /api/user/location
 * 接收 lat、lng，校验后逆地理编码填充城市信息并更新用户记录
 */
async function updateLocation(req, res) {
  try {
    const { id } = req.user;
    const { lat, lng } = req.body;

    // 校验坐标格式
    const latNum = parseFloat(lat);
    const lngNum = parseFloat(lng);
    if (isNaN(latNum) || latNum < -90 || latNum > 90) {
      return error(res, 400, '纬度格式不正确');
    }
    if (isNaN(lngNum) || lngNum < -180 || lngNum > 180) {
      return error(res, 400, '经度格式不正确');
    }

    const updateData = { lat: latNum, lng: lngNum };

    // 逆地理编码填充行政区划
    const geo = await reverseGeocode(latNum, lngNum);
    if (geo) {
      updateData.province = geo.province;
      updateData.city = geo.city;
      updateData.district = geo.district;
      if (geo.location) {
        updateData.location = geo.location;
      }
    }

    await User.update(id, updateData);

    success(res, {
      location: updateData.location || `${latNum},${lngNum}`,
      province: updateData.province || null,
      city: updateData.city || null,
      district: updateData.district || null
    }, '位置更新成功');
  } catch (err) {
    serverError(res, err, '更新位置失败');
  }
}

/**
 * 上传头像
 */
async function uploadAvatar(req, res) {
  try {
    const { id } = req.user;

    if (!req.file) {
      return error(res, 400, '请选择要上传的文件');
    }

    const filePath = path.resolve(req.file.path);
    const isValid = await validateMagicBytes(filePath);
    if (!isValid) {
      return error(res, 400, '文件类型不合法，仅支持 JPG/PNG/GIF/WEBP 格式');
    }

    const avatarUrl = `/${req.file.filename}`;
    const updatedUser = await User.update(id, { avatar: avatarUrl });

    success(res, { avatar: updatedUser.avatar }, '头像上传成功');
  } catch (err) {
    serverError(res, err, '上传头像失败');
  }
}

// ==================== 相册管理 ====================

/**
 * 上传照片到相册
 */
async function uploadPhoto(req, res) {
  try {
    const { id } = req.user;

    if (!req.file) {
      return error(res, 400, '请选择要上传的文件');
    }

    // 检查照片数量限制（最多9张）
    const count = await UserPhoto.getCount(id);
    if (count >= 9) {
      return error(res, 400, '相册最多9张照片，请先删除旧照片');
    }

    const filePath = path.resolve(req.file.path);
    const isValid = await validateMagicBytes(filePath);
    if (!isValid) {
      return error(res, 400, '文件类型不合法，仅支持 JPG/PNG/GIF/WEBP 格式');
    }

    const photoUrl = `/${req.file.filename}`;
    const photo = await UserPhoto.create(id, photoUrl, count);

    // 如果这是用户的第一张照片，自动设为头像
    if (count === 0) {
      await UserPhoto.setCover(photo.id, id);
    }

    // 触发每日任务：上传照片（每张+1进度）
    Checkin.updateTaskProgress(id, 'upload_photo').catch(() => {});

    success(res, photo, '照片上传成功');
  } catch (err) {
    serverError(res, err, '上传照片失败');
  }
}

/**
 * 删除照片
 */
async function deletePhoto(req, res) {
  try {
    const { id } = req.user;
    const photoId = parseInt(req.params.photoId);

    if (!photoId) return error(res, 400, '照片ID无效');

    const photo = await UserPhoto.findById(photoId);
    if (!photo || photo.user_id !== id) {
      return error(res, 404, '照片不存在');
    }

    await UserPhoto.delete(photoId, id);
    success(res, null, '照片删除成功');
  } catch (err) {
    serverError(res, err, '删除照片失败');
  }
}

/**
 * 设置封面照片
 */
async function setCoverPhoto(req, res) {
  try {
    const { id } = req.user;
    const photoId = parseInt(req.params.photoId);

    if (!photoId) return error(res, 400, '照片ID无效');

    const photo = await UserPhoto.findById(photoId);
    if (!photo || photo.user_id !== id) {
      return error(res, 404, '照片不存在');
    }

    await UserPhoto.setCover(photoId, id);
    success(res, null, '封面设置成功');
  } catch (err) {
    serverError(res, err, '设置封面失败');
  }
}

/**
 * 获取相册照片列表
 */
async function getPhotos(req, res) {
  try {
    const userId = parseInt(req.params.userId) || req.user.id;
    const photos = await UserPhoto.getByUserId(userId);
    success(res, photos);
  } catch (err) {
    serverError(res, err, '获取照片列表失败');
  }
}

// ==================== 隐私设置 ====================

/**
 * 获取隐私设置
 */
async function getSettings(req, res) {
  try {
    const { id } = req.user;
    const settings = await UserSettings.get(id) || {};
    success(res, {
      hide_distance: settings.hide_distance === 1,
      hide_online_status: settings.hide_online_status === 1,
      hide_last_active: settings.hide_last_active === 1,
      allow_stranger_chat: settings.allow_stranger_chat !== 0,
      message_notify: settings.message_notify !== 0,
      match_notify: settings.match_notify !== 0,
      like_notify: settings.like_notify !== 0,
      view_notify: settings.view_notify !== 0
    });
  } catch (err) {
    serverError(res, err, '获取隐私设置失败');
  }
}

/**
 * 更新隐私设置
 */
async function updateSettings(req, res) {
  try {
    const { id } = req.user;
    const settings = await UserSettings.update(id, req.body);
    success(res, {
      hide_distance: settings.hide_distance === 1,
      hide_online_status: settings.hide_online_status === 1,
      hide_last_active: settings.hide_last_active === 1,
      allow_stranger_chat: settings.allow_stranger_chat === 1,
      message_notify: settings.message_notify === 1,
      match_notify: settings.match_notify === 1,
      like_notify: settings.like_notify === 1,
      view_notify: settings.view_notify === 1
    }, '设置更新成功');
  } catch (err) {
    serverError(res, err, '更新隐私设置失败');
  }
}

// ==================== 兴趣标签 ====================

/**
 * 获取所有可用标签
 */
async function getAllTags(req, res) {
  try {
    if (isDbAvailable()) {
      const [rows] = await executeQuery('SELECT * FROM tags ORDER BY sort_order ASC, id ASC');
      return success(res, rows);
    }
    // 内存 fallback
    success(res, [
      { id: 1, name: '健身', category: '运动' },
      { id: 2, name: '旅行', category: '生活' },
      { id: 3, name: '美食', category: '生活' },
      { id: 4, name: '摄影', category: '生活' },
      { id: 5, name: '音乐', category: '文化' },
      { id: 6, name: '电影', category: '文化' },
      { id: 7, name: '宠物', category: '生活' },
      { id: 8, name: '游戏', category: '娱乐' },
      { id: 9, name: '阅读', category: '文化' },
      { id: 10, name: '跑步', category: '运动' }
    ]);
  } catch (err) {
    serverError(res, err, '获取标签列表失败');
  }
}

// ==================== 其他 ====================

/**
 * 获取其他用户资料
 */
async function getUserProfile(req, res) {
  try {
    const userId = parseInt(req.params.id);
    if (!userId) return error(res, 400, '用户ID无效');

    const user = await User.findById(userId);
    if (!user) return error(res, 404, '用户不存在');

    // 获取用户相册
    const photos = await UserPhoto.getByUserId(userId);

    // 获取动态数和粉丝数
    let postsCount = 0;
    let fansCount = 0;
    try {
      if (isDbAvailable()) {
        const [[pc]] = await executeQuery('SELECT COUNT(*) as cnt FROM posts WHERE user_id = ? AND status = 1', [userId]);
        postsCount = pc?.cnt || 0;
        const [[fc]] = await executeQuery('SELECT COUNT(*) as cnt FROM likes WHERE liked_user_id = ?', [userId]);
        fansCount = fc?.cnt || 0;
      }
    } catch (e) { /* 静默 */ }

    success(res, {
      id: user.id,
      nickname: user.nickname,
      avatar: user.avatar,
      gender: user.gender,
      age: user.age,
      height: user.height,
      occupation: user.occupation,
      location: user.location,
      tags: user.tags ? (typeof user.tags === 'string' ? JSON.parse(user.tags) : user.tags) : [],
      bio: user.bio,
      is_vip: user.is_vip,
      posts_count: postsCount,
      fans_count: fansCount,
      gifts_received_count: user.gifts_received_count || 0,
      photos: photos
    });
  } catch (err) {
    serverError(res, err, '获取用户资料失败');
  }
}

/**
 * 获取粉丝列表
 */
async function getFans(req, res) {
  try {
    const { id } = req.user;
    const { limit = 20, offset = 0 } = req.query;
    const fans = await Like.getLikedByUsers(id, parseInt(limit), parseInt(offset));
    success(res, fans);
  } catch (err) {
    serverError(res, err, '获取粉丝列表失败');
  }
}

/**
 * 获取关注列表
 */
async function getFollowing(req, res) {
  try {
    const { id } = req.user;
    const { limit = 20, offset = 0 } = req.query;
    const following = await Like.getUserLikes(id, parseInt(limit), parseInt(offset));
    success(res, following);
  } catch (err) {
    serverError(res, err, '获取关注列表失败');
  }
}

/**
 * 获取看过我的人
 */
async function getViewers(req, res) {
  try {
    const { id } = req.user;
    const { limit = 20, offset = 0 } = req.query;
    const viewers = await View.getViewers(id, parseInt(limit), parseInt(offset));
    success(res, viewers);
  } catch (err) {
    serverError(res, err, '获取浏览记录失败');
  }
}

/**
 * 搜索用户
 */
async function searchUsers(req, res) {
  try {
    const { q, tags, location, limit = 20, offset = 0 } = req.query;
    if (!q && !tags && !location) {
      return error(res, 400, '请输入搜索关键词或标签');
    }

    let query = 'SELECT id, nickname, avatar, gender, age, location, tags, bio FROM users WHERE status = 1';
    const params = [];

    if (q) {
      query += ' AND (nickname LIKE ? OR bio LIKE ?)';
      params.push(`%${q}%`, `%${q}%`);
    }
    if (tags) {
      const tagList = tags.split(',');
      tagList.forEach(tag => {
        query += ' AND JSON_CONTAINS(tags, ?, "$")';
        params.push(JSON.stringify(tag.trim()));
      });
    }
    if (location) {
      query += ' AND location LIKE ?';
      params.push(`%${location}%`);
    }

    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));

    const result = await require('../utils/database').executeQuery(query, params);
    const rows = Array.isArray(result) ? result : (result && result[0]) || [];
    (rows).forEach(u => {
      u.tags = u.tags ? (typeof u.tags === 'string' ? JSON.parse(u.tags) : u.tags) : [];
    });
    success(res, rows);
  } catch (err) {
    serverError(res, err, '搜索用户失败');
  }
}

// ==================== 新手引导 ====================

/**
 * 获取新手引导完成状态
 * GET /api/user/onboarding-status
 * 返回三步完成状态：头像、标签(>=3)、个性签名(>=2字)
 */
async function getOnboardingStatus(req, res) {
  try {
    const { id } = req.user;
    const status = await User.getOnboardingStatus(id);

    if (!status) {
      return error(res, 404, '用户不存在');
    }

    success(res, status);
  } catch (err) {
    serverError(res, err, '获取引导状态失败');
  }
}

/**
 * 完成新手引导
 * POST /api/user/onboarding/complete
 * 标记引导完成，奖励 15 金币（仅首次）
 */
async function completeOnboarding(req, res) {
  try {
    const { id } = req.user;

    // 先检查当前状态，防止重复领取
    const status = await User.getOnboardingStatus(id);
    if (!status) {
      return error(res, 404, '用户不存在');
    }

    // 校验三步是否都已填写完整
    if (!status.avatar) {
      return error(res, 400, '请先设置头像');
    }
    if (!status.tags) {
      return error(res, 400, '请至少选择3个兴趣标签');
    }
    if (!status.bio) {
      return error(res, 400, '请填写个性签名（至少2个字）');
    }

    // 防止重复领取
    if (status.completed) {
      return error(res, 400, '新手引导已完成，不可重复领取奖励');
    }

    // 更新引导状态
    const updated = await User.completeOnboarding(id);
    if (!updated) {
      return error(res, 500, '更新引导状态失败');
    }

    // 发放首次完成引导奖励：15 金币
    try {
      await Wallet.recharge(id, 15, 'onboarding_reward', null);
    } catch (rewardErr) {
      console.error('引导奖励发放失败:', rewardErr.message);
      // 奖励发放失败不影响引导完成状态，但告知用户
      return success(res, { coins_rewarded: 0 }, '引导已完成（奖励发放异常，请联系客服）');
    }

    // 获取最新余额返回
    const balance = await Wallet.getBalance(id);

    success(res, {
      onboarding_completed: true,
      coins_rewarded: 15,
      balance
    }, '恭喜完成新手引导！获得 15 金币奖励 🎉');
  } catch (err) {
    serverError(res, err, '完成引导失败');
  }
}

module.exports = {
  getUserInfo,
  updateUserInfo,
  updateLocation,
  uploadAvatar,
  uploadPhoto,
  deletePhoto,
  setCoverPhoto,
  getPhotos,
  getSettings,
  updateSettings,
  getAllTags,
  getUserProfile,
  getFans,
  getFollowing,
  getViewers,
  searchUsers,
  getOnboardingStatus,
  completeOnboarding
};
