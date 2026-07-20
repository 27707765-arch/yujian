/**
 * 统一API请求封装
 * 处理token注入、错误统一拦截、超时控制
 */

const API_BASE = '/api';

// 从localStorage获取token
function getToken() {
  return localStorage.getItem('token') || '';
}

// 存储token
function setToken(token) {
  localStorage.setItem('token', token);
}

// 清除token
function clearToken() {
  localStorage.removeItem('token');
  localStorage.removeItem('userId');
}

// 获取userId
function getUserId() {
  return parseInt(localStorage.getItem('userId')) || null;
}

/**
 * 统一API请求
 * @param {string} url - API路径（不含/api前缀）
 * @param {Object} options - fetch选项
 * @returns {Promise<Object>} - { code, message, data }
 */
async function request(url, options = {}) {
  const token = getToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    ...options.headers
  };

  // 如果是FormData，删除Content-Type让浏览器自动设置
  if (options.body instanceof FormData) {
    delete headers['Content-Type'];
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000); // 15秒超时

  try {
    const res = await fetch(`${API_BASE}${url}`, {
      ...options,
      headers,
      signal: controller.signal
    });
    clearTimeout(timeout);

    const data = await res.json().catch(() => ({}));

    // 401 自动跳转登录
    if (res.status === 401 && data.code !== 0) {
      clearToken();
      // 触发全局登录事件
      window.dispatchEvent(new CustomEvent('auth:expired'));
      throw new Error(data.message || '登录已过期');
    }

    if (!res.ok) {
      throw new Error(data.message || `请求失败 (${res.status})`);
    }

    return data;
  } catch (err) {
    clearTimeout(timeout);
    if (err.name === 'AbortError') {
      throw new Error('请求超时，请检查网络');
    }
    throw err;
  }
}

/**
 * GET请求自动重试（非401/403/429错误时延迟1秒重试1次）
 */
async function requestWithRetry(url, options) {
  try {
    return await request(url, options);
  } catch (err) {
    // 401/403/429 不重试
    if (err.message && (err.message.includes('401') || err.message.includes('403') || err.message.includes('429'))) {
      throw err;
    }
    if (err.message && err.message.includes('超时')) {
      throw err;
    }
    // 延迟1秒重试1次
    await new Promise(r => setTimeout(r, 1000));
    return await request(url, options);
  }
}

/**
 * Canvas 图片压缩
 * @param {File} file - 原始文件
 * @param {number} maxWidth - 最大宽度
 * @param {number} quality - 压缩质量
 * @returns {Promise<File>}
 */
function compressImage(file, maxWidth = 800, quality = 0.8) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      if (width > maxWidth) { height = Math.round(height * maxWidth / width); width = maxWidth; }
      const canvas = document.createElement('canvas');
      canvas.width = width; canvas.height = height;
      canvas.getContext('2d').drawImage(img, 0, 0, width, height);
      canvas.toBlob(blob => {
        if (blob) resolve(new File([blob], file.name, { type: 'image/jpeg' }));
        else resolve(file);
      }, 'image/jpeg', quality);
    };
    img.onerror = () => resolve(file);
    img.src = URL.createObjectURL(file);
  });
}
const api = {
  get: (url, params = {}) => {
    const query = new URLSearchParams(params).toString();
    const fullUrl = `${url}${query ? '?' + query : ''}`;
    return requestWithRetry(fullUrl, { method: 'GET' });
  },
  post: (url, data) => request(url, {
    method: 'POST',
    body: JSON.stringify(data)
  }),
  put: (url, data) => request(url, {
    method: 'PUT',
    body: JSON.stringify(data)
  }),
  delete: (url, data) => request(url, {
    method: 'DELETE',
    body: data ? JSON.stringify(data) : undefined
  }),
  upload: (url, formData) => {
    // 自动压缩 FormData 中的图片
    return compressFormDataImages(formData).then(compressed => request(url, {
      method: 'POST',
      body: compressed
    }));
  }
};

/**
 * 自动压缩 FormData 中的图片文件
 */
async function compressFormDataImages(formData) {
  const newFd = new FormData();
  for (const [key, value] of formData.entries()) {
    if (value instanceof File && value.type.startsWith('image/') && key !== 'avatar') {
      const compressed = await compressImage(value).catch(() => value);
      newFd.append(key, compressed, value.name);
    } else {
      newFd.append(key, value);
    }
  }
  return newFd;
}

export { api, getToken, setToken, clearToken, getUserId, compressImage };
