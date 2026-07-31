/**
 * 通知工具模块
 * 提供消息提示音、提示动画、桌面通知等功能
 */

// 音频上下文（懒加载）
var _audioCtx = null;

/**
 * 获取音频上下文
 * @returns {AudioContext}
 */
function _getAudioCtx() {
  if (!_audioCtx) {
    _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  return _audioCtx;
}

/**
 * 播放提示音
 * @param {string} type - 音效类型: 'message', 'like', 'match', 'notification', 'error'
 */
function playSound(type) {
  try {
    var ctx = _getAudioCtx();
    // 如果上下文被暂停，需要恢复（iOS/Chrome 自动播放策略）
    if (ctx.state === 'suspended') {
      ctx.resume();
    }

    var now = ctx.currentTime;
    var osc = ctx.createOscillator();
    var gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    // 根据类型设置不同的音效
    switch (type) {
      case 'message':
        // 温柔的双音提示（类似微信）
        osc.frequency.setValueAtTime(800, now);
        osc.frequency.setValueAtTime(1000, now + 0.1);
        osc.type = 'sine';
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
        osc.start(now);
        osc.stop(now + 0.3);
        break;

      case 'like':
        // 可爱的心跳音效
        osc.frequency.setValueAtTime(600, now);
        osc.frequency.setValueAtTime(800, now + 0.1);
        osc.frequency.setValueAtTime(600, now + 0.2);
        osc.type = 'sine';
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.4);
        osc.start(now);
        osc.stop(now + 0.4);
        break;

      case 'match':
        // 欢快的匹配成功音效（三音上升）
        osc.frequency.setValueAtTime(500, now);
        osc.frequency.setValueAtTime(700, now + 0.15);
        osc.frequency.setValueAtTime(1000, now + 0.3);
        osc.type = 'sine';
        gain.gain.setValueAtTime(0.25, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.5);
        osc.start(now);
        osc.stop(now + 0.5);
        break;

      case 'notification':
        // 清脆的通知音
        osc.frequency.setValueAtTime(1200, now);
        osc.frequency.setValueAtTime(800, now + 0.1);
        osc.type = 'sine';
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
        osc.start(now);
        osc.stop(now + 0.2);
        break;

      case 'error':
        // 低沉的错误音
        osc.frequency.setValueAtTime(300, now);
        osc.frequency.setValueAtTime(200, now + 0.15);
        osc.type = 'square';
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
        osc.start(now);
        osc.stop(now + 0.3);
        break;

      default:
        // 默认提示音
        osc.frequency.setValueAtTime(800, now);
        osc.type = 'sine';
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
        osc.start(now);
        osc.stop(now + 0.2);
    }
  } catch (e) {
    // 静默失败，不影响用户体验
    console.warn('播放提示音失败:', e);
  }
}

/**
 * 显示桌面通知
 * @param {string} title - 通知标题
 * @param {string} body - 通知内容
 * @param {string} icon - 图标URL
 * @param {Function} onClick - 点击回调
 */
function showDesktopNotification(title, body, icon, onClick) {
  try {
    // 检查浏览器支持
    if (!window.Notification) return;

    // 请求权限
    if (Notification.permission === 'default') {
      Notification.requestPermission().then(function(permission) {
        if (permission === 'granted') {
          _createNotification(title, body, icon, onClick);
        }
      });
    } else if (Notification.permission === 'granted') {
      _createNotification(title, body, icon, onClick);
    }
  } catch (e) {
    console.warn('桌面通知失败:', e);
  }
}

/**
 * 创建桌面通知
 * @private
 */
function _createNotification(title, body, icon, onClick) {
  var notification = new Notification(title, {
    body: body,
    icon: icon || '/icon.png',
    badge: '/icon.png',
    tag: 'yujian-notification',
    renotify: true,
    silent: true // 使用自定义音效，不使用系统音
  });

  // 点击通知时的处理
  notification.onclick = function() {
    window.focus();
    if (onClick) onClick();
    notification.close();
  };

  // 自动关闭（5秒后）
  setTimeout(function() {
    notification.close();
  }, 5000);
}

/**
 * 显示应用内Toast通知
 * @param {string} message - 消息内容
 * @param {string} type - 类型: 'success', 'error', 'warning', 'info', 'message'
 * @param {number} duration - 显示时长（毫秒）
 */
function showToast(message, type, duration) {
  type = type || 'info';
  duration = duration || 3000;

  // 获取或创建toast容器
  var container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }

  // 创建toast元素
  var toast = document.createElement('div');
  toast.className = 'toast-item toast-' + type + ' toast-enter';

  // 根据类型添加图标
  var icon = '';
  switch (type) {
    case 'success': icon = '✓ '; break;
    case 'error': icon = '✕ '; break;
    case 'warning': icon = '⚠ '; break;
    case 'message': icon = '💬 '; break;
    case 'like': icon = '❤️ '; break;
    case 'match': icon = '💕 '; break;
    default: icon = '';
  }

  toast.innerHTML = '<span class="toast-icon">' + icon + '</span><span class="toast-text">' + message + '</span>';

  // 添加到容器
  container.appendChild(toast);

  // 触发动画
  requestAnimationFrame(function() {
    toast.classList.remove('toast-enter');
    toast.classList.add('toast-visible');
  });

  // 自动移除
  setTimeout(function() {
    toast.classList.remove('toast-visible');
    toast.classList.add('toast-exit');
    setTimeout(function() {
      if (toast.parentNode) {
        toast.parentNode.removeChild(toast);
      }
    }, 300);
  }, duration);
}

/**
 * 显示消息通知（综合处理）
 * @param {Object} options - 通知选项
 * @param {string} options.title - 标题
 * @param {string} options.body - 内容
 * @param {string} options.type - 类型: 'message', 'like', 'match', 'notification'
 * @param {string} options.icon - 图标URL
 * @param {Function} options.onClick - 点击回调
 * @param {boolean} options.sound - 是否播放音效（默认true）
 * @param {boolean} options.desktop - 是否显示桌面通知（默认true）
 * @param {boolean} options.toast - 是否显示Toast（默认true）
 */
function showNotification(options) {
  var opts = Object.assign({
    title: '遇见',
    body: '',
    type: 'notification',
    icon: null,
    onClick: null,
    sound: true,
    desktop: true,
    toast: true
  }, options);

  // 播放音效
  if (opts.sound) {
    playSound(opts.type);
  }

  // 显示Toast
  if (opts.toast) {
    var toastType = 'info';
    switch (opts.type) {
      case 'message': toastType = 'message'; break;
      case 'like': toastType = 'like'; break;
      case 'match': toastType = 'match'; break;
      case 'error': toastType = 'error'; break;
      default: toastType = 'info';
    }
    showToast(opts.body, toastType);
  }

  // 显示桌面通知
  if (opts.desktop) {
    showDesktopNotification(opts.title, opts.body, opts.icon, opts.onClick);
  }
}

/**
 * 请求通知权限
 * @returns {Promise<string>} 权限状态
 */
function requestNotificationPermission() {
  if (!window.Notification) {
    return Promise.resolve('denied');
  }

  if (Notification.permission === 'granted') {
    return Promise.resolve('granted');
  }

  if (Notification.permission === 'denied') {
    return Promise.resolve('denied');
  }

  return Notification.requestPermission();
}

// 导出函数
window.NotificationUtils = {
  playSound: playSound,
  showDesktopNotification: showDesktopNotification,
  showToast: showToast,
  showNotification: showNotification,
  requestNotificationPermission: requestNotificationPermission
};
