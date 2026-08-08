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

/**
 * 校验音频文件 magic bytes，防止伪装音频的恶意文件
 * 支持: MP3(ID3/MPEG帧) WAV OGG FLAC WebM(MKV) MP4/M4A(ftyp)
 * @param {string} filePath - 文件路径
 * @returns {Promise<boolean>}
 */
async function validateAudioMagicBytes(filePath) {
  const fs = require('fs');
  return new Promise((resolve) => {
    let fd;
    try {
      fd = fs.openSync(filePath, 'r');
      const buffer = Buffer.alloc(12);
      fs.readSync(fd, buffer, 0, 12, 0);

      let matched = false;
      // MP3 (ID3 tag: "ID3")
      if (buffer.toString('hex', 0, 3) === '494433') matched = true;
      // MP3 (MPEG frame sync: 0xFF 0xEx)
      else if (buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0) matched = true;
      // WAV (RIFF....WAVE)
      else if (buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WAVE') matched = true;
      // OGG ("OggS")
      else if (buffer.toString('ascii', 0, 4) === 'OggS') matched = true;
      // FLAC ("fLaC")
      else if (buffer.toString('ascii', 0, 4) === 'fLaC') matched = true;
      // WebM/Matroska (EBML 1A 45 DF A3)
      else if (buffer[0] === 0x1a && buffer[1] === 0x45 && buffer[2] === 0xdf && buffer[3] === 0xa3) matched = true;
      // MP4/M4A ("ftyp" at offset 4)
      else if (buffer.toString('ascii', 4, 8) === 'ftyp') matched = true;

      if (!matched) {
        // 删除不合规文件
        try {
          fs.unlinkSync(filePath);
        } catch (unlinkErr) {
          console.error('删除不合规音频文件失败:', unlinkErr.message);
        }
      }
      resolve(matched);
    } catch (err) {
      // 文件不存在、权限不足等异常情况，视为校验失败
      console.error('音频文件 magic bytes 校验失败:', err.message);
      resolve(false);
    } finally {
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

// 语音文件大小限制（15MB）
const AUDIO_MAX_SIZE = parseInt(process.env.AUDIO_MAX_SIZE || '15728640');
const AUDIO_MIMES = ['audio/mpeg', 'audio/mp3', 'audio/aac', 'audio/wav', 'audio/x-wav', 'audio/mp4', 'audio/x-m4a', 'audio/webm', 'audio/ogg'];

// 语音上传过滤器
const audioFileFilter = (req, file, cb) => {
  if (AUDIO_MIMES.includes(file.mimetype)) { cb(null, true); }
  else { cb(new Error('只允许上传音频文件（MP3/AAC/WAV/M4A/OGG）'), false); }
};

// 语音上传 multer 实例（限制 15MB）
const audioUpload = multer({ storage, limits: { fileSize: AUDIO_MAX_SIZE }, fileFilter: audioFileFilter });

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
 * 混合上传中间件：图片走imageFilter，视频走videoFilter，封面走coverFilter
 * 修复：原实现将 multer 拆成两次调用（先 videoUpload 再 upload），
 * 第一次会消费整个 multipart body 并因字段名不匹配抛 LIMIT_UNEXPECTED_FILE，
 * 导致第二次无法解析（图片收不全、文本字段丢失）。
 * 现改为单次 multer 调用 + 按字段名动态选择文件过滤器。
 */
function mixedUpload(fields) {
  // 记录哪些字段需要视频/封面过滤器
  const videoFieldNames = fields.filter(f => f.name === 'video').map(f => f.name);
  const coverFieldNames = fields.filter(f => f.name === 'video_cover').map(f => f.name);

  // 动态 fileFilter：按字段名分派到对应过滤器
  const mixedFileFilter = (req, file, cb) => {
    if (videoFieldNames.includes(file.fieldname)) {
      return videoFileFilter(req, file, cb);
    }
    if (coverFieldNames.includes(file.fieldname)) {
      return coverFileFilter(req, file, cb);
    }
    // 其余字段走图片过滤器
    return fileFilter(req, file, cb);
  };

  const mixedMulter = multer({
    storage,
    limits: { fileSize: VIDEO_MAX_SIZE }, // 上限取最大值（50MB），视频/图片各自校验
    fileFilter: mixedFileFilter
  });

  return (req, res, next) => {
    mixedMulter.fields(fields)(req, res, (err) => {
      if (err) return handleMulterError(err, res);
      next();
    });
  };
}

/** mediaUpload 别名指向 mixedUpload，兼容旧调用 */
function mediaUpload(fields) { return mixedUpload(fields); }

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
      message: err.field === 'video' ? '视频文件大小超出限制（最大50MB）' : '文件大小超出限制（图片最大10MB）',
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

/**
 * 语音文件上传中间件
 * @param {string} fieldName - 默认 'audio'
 */
function audioUploadMiddleware(fieldName) {
  return (req, res, next) => {
    audioUpload.single(fieldName || 'audio')(req, res, (err) => {
      if (err) return handleMulterError(err, res);
      next();
    });
  };
}

module.exports = {
  singleUpload,
  multipleUpload,
  mediaUpload,
  mixedUpload,
  videoUploadMiddleware,
  audioUploadMiddleware,
  validateMagicBytes,
  validateAudioMagicBytes,
  // 常量
  VIDEO_MAX_SIZE,
  VIDEO_MIMES,
  AUDIO_MAX_SIZE,
};