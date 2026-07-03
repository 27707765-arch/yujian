// 文件名：src/services/upload.service.js
// 用途：上传服务

const multer = require('multer');
const path = require('path');

// 配置存储
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, process.env.UPLOAD_DIR || './uploads');
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, file.fieldname + '-' + uniqueSuffix + ext);
  }
});

// 配置文件过滤器
const fileFilter = (req, file, cb) => {
  // 允许的文件类型
  const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('只允许上传图片文件（JPG/PNG/GIF/WEBP）'), false);
  }
};

/**
 * 校验文件 magic bytes，防止 MIME 类型伪装
 * @param {string} filePath - 文件路径
 * @returns {Promise<boolean>}
 */
async function validateMagicBytes(filePath) {
  const fs = require('fs');
  const magicBytes = {
    ffd8: 'image/jpeg',
    '89504e47': 'image/png',
    '47494638': 'image/gif',
    '52494646': 'image/webp'
  };

  return new Promise((resolve) => {
    let fd;
    try {
      // 打开文件并读取前4个字节（magic bytes）
      fd = fs.openSync(filePath, 'r');
      const buffer = Buffer.alloc(4);
      fs.readSync(fd, buffer, 0, 4, 0);

      const hex = buffer.toString('hex');
      const matched = Object.keys(magicBytes).some(prefix => hex.startsWith(prefix));
      if (!matched) {
        // 删除不合规文件
        try {
          fs.unlinkSync(filePath);
        } catch (unlinkErr) {
          console.error('删除不合规文件失败:', unlinkErr.message);
        }
      }
      resolve(matched);
    } catch (err) {
      // 文件不存在、权限不足等异常情况，视为校验失败
      console.error('文件 magic bytes 校验失败:', err.message);
      resolve(false);
    } finally {
      // 确保文件描述符被关闭
      try {
        if (fd !== undefined) fs.closeSync(fd);
      } catch (closeErr) {
        // 忽略关闭文件时的错误
      }
    }
  });
}

// 配置multer
const upload = multer({
  storage: storage,
  limits: {
    fileSize: parseInt(process.env.MAX_UPLOAD_SIZE || '10485760') // 10MB
  },
  fileFilter: fileFilter
});

// 视频文件大小限制（50MB）
const VIDEO_MAX_SIZE = parseInt(process.env.VIDEO_MAX_SIZE || '52428800');
// 视频允许的 MIME 类型
const VIDEO_MIMES = ['video/mp4', 'video/quicktime', 'video/webm'];
// 图片允许的 MIME 类型（用于封面）
const COVER_MIMES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];

// 视频上传过滤器
const videoFileFilter = (req, file, cb) => {
  if (VIDEO_MIMES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('只允许上传视频文件（MP4/MOV/WEBM）'), false);
  }
};

// 封面上传过滤器
const coverFileFilter = (req, file, cb) => {
  if (COVER_MIMES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('只允许上传图片文件作为封面'), false);
  }
};

// 视频上传 multer 实例（限制 50MB）
const videoUpload = multer({ storage, limits: { fileSize: VIDEO_MAX_SIZE }, fileFilter: videoFileFilter });
// 封面上传 multer 实例（限制 10MB，复用图片限制）
const coverUpload = multer({ storage, limits: { fileSize: parseInt(process.env.MAX_UPLOAD_SIZE || '10485760') }, fileFilter: coverFileFilter });

/**
 * 单个文件上传中间件
 * @param {string} fieldName - 字段名
 * @returns {Function}
 */
function singleUpload(fieldName) {
  return (req, res, next) => {
    upload.single(fieldName)(req, res, (err) => {
      if (err) return handleMulterError(err, res);
      next();
    });
  };
}

/**
 * 视频文件上传中间件（单独）
 * @param {string} fieldName - 默认 'video'
 */
function videoUploadMiddleware(fieldName) {
  return (req, res, next) => {
    videoUpload.single(fieldName || 'video')(req, res, (err) => {
      if (err) return handleMulterError(err, res);
      next();
    });
  };
}

/**
 * 混合上传中间件：支持图片 + 视频 + 封面
 * @param {Array} fields - 字段配置，如 [{name:'images',maxCount:9},{name:'video',maxCount:1},{name:'video_cover',maxCount:1}]
 */
function mediaUpload(fields) {
  return (req, res, next) => {
    upload.fields(fields)(req, res, (err) => {
      if (err) {
        // 如果是 multer 标准错误（文件过大等），返回友好信息
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({ code: 400, message: '文件大小超出限制（图片最大10MB，视频最大50MB）', data: null });
        }
        return handleMulterError(err, res);
      }
      next();
    });
  };
}

/**
 * 多个文件上传中间件
 * @param {Object} fields - 字段配置
 * @returns {Function}
 */
function multipleUpload(fields) {
  return (req, res, next) => {
    upload.fields(fields)(req, res, (err) => {
      if (err) return handleMulterError(err, res);
      next();
    });
  };
}

/**
 * 处理 multer 上传错误，返回友好错误信息
 */
function handleMulterError(err, res) {
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({
      code: 400,
      message: '文件大小超出限制（最大10MB）',
      data: null
    });
  }
  if (err.code === 'LIMIT_UNEXPECTED_FILE') {
    return res.status(400).json({
      code: 400,
      message: '文件字段名不匹配',
      data: null
    });
  }
  if (err.message) {
    return res.status(400).json({
      code: 400,
      message: err.message,
      data: null
    });
  }
  return res.status(500).json({
    code: 500,
    message: '文件上传失败',
    data: null
  });
}

module.exports = {
  singleUpload,
  multipleUpload,
  mediaUpload,
  videoUploadMiddleware,
  validateMagicBytes,
  // 常量
  VIDEO_MAX_SIZE,
  VIDEO_MIMES,
};