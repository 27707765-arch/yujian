/* yujian-app.js - 遇见APP 主应用 */

// ==== 版本号单源（S20） ====
// index.html 缓存参数 `?v=APP_VERSION`、AppRoot 底部小字、Settings 关于我们 共用此常量
var APP_VERSION = "v20260809b";

// ==== 工具函数 ====
var toasts = Vue.reactive([]);
var uiState = Vue.reactive({hideHdr:false}); // 全局UI状态（聊天详情页隐藏顶部导航头）
var _tid = 0;

// 增强版toast函数（使用新的通知工具）
// 旧类型映射：tok→success, terr→error, tinfo→info
function toast(msg, cls, type) {
  // 如果有新的通知工具，优先使用
  if(window.NotificationUtils){
    var nt;
    switch(cls){
      case "tok": nt="success"; break;
      case "terr": nt="error"; break;
      case "tinfo": nt="info"; break;
      default: nt = (type==="success"||type==="error"||type==="info"||type==="warning"||type==="message"||type==="like"||type==="match") ? type : "info";
    }
    window.NotificationUtils.showToast(msg, nt);
    return;
  }
  // 降级到旧版toast（NotificationUtils 未加载时）
  var id = ++_tid;
  toasts.push({id:id, msg:msg, cls:cls});
  setTimeout(function(){
    var i=toasts.findIndex(function(t){return t.id===id});
    if(i>-1)toasts.splice(i,1);
  }, 3000);
}
function token() { return localStorage.getItem("token") || ""; }
function timeAgo(t) { if(!t)return""; var d=Math.floor((Date.now()-new Date(t).getTime())/1000); if(d<60)return"刚刚"; if(d<3600)return Math.floor(d/60)+"分钟前"; if(d<86400)return Math.floor(d/3600)+"小时前"; return Math.floor(d/86400)+"天前"; }
function timeStr(t) { if(!t)return""; var d=new Date(t); return ("0"+d.getHours()).slice(-2)+":"+("0"+d.getMinutes()).slice(-2); }
async function api(url, opts) {
  opts=opts||{};
  var t=token();
  var h={"Content-Type":"application/json"};
  if(t)h["Authorization"]="Bearer "+t;
  if(opts.body instanceof FormData)delete h["Content-Type"];
  var lastErr;
  // 网络层失败（fetch 抛错/超时）自动重试1次：此时请求未达服务器或未得到响应，重试安全
  // 服务器已响应（4xx/5xx）不重试，避免重复业务副作用
  for(var attempt=0;attempt<2;attempt++){
    var ctrl=new AbortController();
    var timer=setTimeout(function(){ctrl.abort()},15000);
    try{
      var r=await fetch("/api"+url, Object.assign({},opts,{headers:Object.assign({},h,opts.headers||{}),signal:ctrl.signal}));
      clearTimeout(timer);
      var d=await r.json();
      if(r.status===401){
        var here=location.hash.replace(/^#/,'');
        localStorage.clear();try{ws&&ws.close()}catch(e){}
        // 先清空再写入回跳地址，避免 clear 覆盖
        if(here&&here!=="/login"&&here!=="/")localStorage.setItem("postLoginRedirect",here);
        location.hash="#/login";throw new Error("登录已过期，请重新登录");
      }
      if(d&&d.code!==undefined&&d.code!==0)throw new Error(d.message||"请求失败");
      return d;
    }catch(e){
      clearTimeout(timer);
      if(e.name==="AbortError"){lastErr=new Error("网络请求超时，请检查网络连接");continue}
      // fetch 网络层异常（TypeError: Failed to fetch 等）才重试
      if(e instanceof TypeError&&attempt===0){lastErr=e;continue}
      throw e;
    }
  }
  throw lastErr;
}

// ==== WebSocket ====
var ws=null,wsTimer=null,wsCount=0,wsHooks={};
function wsOn(type,fn){if(!wsHooks[type])wsHooks[type]=[];wsHooks[type].push(fn)}
function wsOff(type,fn){if(!wsHooks[type])return;var i=wsHooks[type].indexOf(fn);if(i>-1)wsHooks[type].splice(i,1)}
function wsSend(d){return ws&&ws.readyState===1&&!!ws.send(JSON.stringify(d))}
function wsConnect(){var t=token();if(!t)return;if(ws)try{ws.close()}catch(e){}try{ws=new WebSocket((location.protocol==="https:"?"wss:":"ws:")+"//"+location.host+"/api/ws?token="+t);ws.onopen=function(){wsCount=0;if(wsTimer){clearInterval(wsTimer);clearTimeout(wsTimer);wsTimer=null}wsTimer=setInterval(function(){if(ws&&ws.readyState===1){ws.send(JSON.stringify({type:"pong"}))}},30000)};ws.onmessage=function(e){try{var d=JSON.parse(e.data);if(d.type==="pong")return;if(d.type&&wsHooks[d.type])wsHooks[d.type].forEach(function(fn){fn(d)});if(wsHooks["*"])wsHooks["*"].forEach(function(fn){fn(d)})}catch(_){}};ws.onclose=function(){if(wsTimer){clearInterval(wsTimer);clearTimeout(wsTimer);wsTimer=null}if(wsCount<10){wsCount++;wsTimer=setTimeout(wsConnect,5000)}}}catch(_){}}

// ==== 图片 URL 兼容（历史裸路径 /xxx → /uploads/xxx） ====
function fmtImg(u){
  if(!u)return u;
  if(u.indexOf("http://")===0||u.indexOf("https://")===0||u.indexOf("data:")===0)return u;
  if(u.indexOf("/uploads/")===0)return u;
  if(u.charAt(0)==="/")return "/uploads/"+u.slice(1);
  return u;
}
// 图片加载失败占位：置渐变底 + 去 src + 显 👤（避免列表留白）
// 兼容两种调用：@error="imgFallback($event)"（模板）或全局 error 捕获（传 event）
function imgFallback(e){
  var el=e&&e.target?e.target:e;
  if(!el||!el.dataset||el.tagName!=="IMG")return;
  if(el.dataset.fallbackDone)return;
  el.dataset.fallbackDone="1";
  el.style.background="linear-gradient(135deg,#f2f2f2,#e6e6e6)";
  el.style.color="#bbb";
  el.style.fontSize="28px";
  el.style.display="inline-flex";
  el.style.alignItems="center";
  el.style.justifyContent="center";
  el.removeAttribute("src");
  el.setAttribute("alt","👤");
}
// 上传前客户端压缩：canvas 缩放到 maxW + 转 WebP（质量0.85），失败回退原图
function compressImage(file,maxW,q){
  maxW=maxW||1080;q=(q===undefined?0.85:q);
  return new Promise(function(resolve){
    if(!file||!(file.type||"").indexOf("image/")===0||!window.FileReader||!window.Image){resolve(file);return}
    if(typeof file.size==="number"&&file.size<=800*1024){resolve(file);return} // 小图直接传
    var reader=new FileReader();
    reader.onload=function(ev){
      var img=new Image();
      img.onload=function(){
        try{
          var w=img.width,h=img.height,scale=Math.min(1,maxW/Math.max(w,h));
          var canvas=document.createElement("canvas");
          canvas.width=Math.max(1,Math.round(w*scale));canvas.height=Math.max(1,Math.round(h*scale));
          var ctx=canvas.getContext("2d");
          ctx.drawImage(img,0,0,canvas.width,canvas.height);
          canvas.toBlob(function(blob){
            resolve(blob?new File([blob],file.name||"img.webp",{type:"image/webp"}):file);
          },file.type==="image/png"?"image/png":"image/webp",q);
        }catch(err){resolve(file)}
      };
      img.onerror=function(){resolve(file)};
      img.src=ev.target.result;
    };
    reader.onerror=function(){resolve(file)};
    reader.readAsDataURL(file);
  });
}

// ==== 全局图片预览（点击放大 + 左右滑动 + 关闭） ====
// 复用 index.html 已预留的 .image-preview-* CSS 类，用 Vue.reactive 保证模板响应
var pv = Vue.reactive({ show:false, idx:0, list:[], scaled:false, _tx:0 });
function previewOpen(list, idx){
  pv.list=(list||[]).filter(Boolean);
  pv.idx=Math.min(Math.max(idx||0,0),Math.max(pv.list.length-1,0));
  pv.show=pv.list.length>0;
  pv.scaled=false;
  if(pv.show)document.body.style.overflow="hidden";
}
function previewClose(){ pv.show=false; document.body.style.overflow=""; pv.scaled=false; }
function previewPrev(){ if(pv.list.length)pv.idx=(pv.idx-1+pv.list.length)%pv.list.length; }
function previewNext(){ if(pv.list.length)pv.idx=(pv.idx+1)%pv.list.length; }
function previewToggleScale(){ pv.scaled=!pv.scaled; }
// 预览横向滑动翻页（>60px），已放大时不翻页（保留双击放大状态）
function onPvTouchStart(e){ if(e.touches&&e.touches.length)pv._tx=e.touches[0].clientX; }
function onPvTouchEnd(e){
  if(pv.scaled)return;
  var t=e.changedTouches&&e.changedTouches[0];
  if(!t)return;
  var dx=t.clientX-pv._tx;
  if(Math.abs(dx)>60){ if(dx<0)previewNext(); else previewPrev(); }
  pv._tx=0;
}

// ==== 页面组件 ====
var WelcomePage = {
  methods: { go: function(){ var t=token(); this.$router.replace(t?"/home":"/login"); } },
  mounted: function(){ var s=this; setTimeout(function(){s.go()},500); },
  template: `<div class="welcome" @click="go"><div style="font-size:72px;animation:hp .6s">💕</div><h1 style="font-size:36px;margin:16px 0">遇见</h1><p style="font-size:16px;opacity:.9">同城交友，遇见心动</p><p style="font-size:13px;opacity:.6;margin-top:32px">点击屏幕进入</p></div>`
};

var LoginPage = {
  data: function(){ return {phone:"",code:"",sent:false,countdown:0,loading:false,adult:false}; },
  methods: {
    sendCode: async function(){
      if(!/^1[3-9]\d{9}$/.test(this.phone)){toast("请输入正确的手机号","terr");return}
      try{var r=await api("/auth/send-code",{method:"POST",body:JSON.stringify({phone:this.phone})});if(r.code===0){this.sent=true;this.countdown=60;if(r.data&&r.data.code){this.code=r.data.code;toast("验证码已填入输入框，可直接登录","tinfo")}else toast("验证码已发送，请查看手机短信","tok");var s=this;var iv=setInterval(function(){s.countdown--;if(s.countdown<=0){clearInterval(iv);s.sent=false}},1000)}else toast(r.message||"发送失败","terr")}catch(e){toast(e.message||"网络错误，请稍后重试","terr")}
    },
    doLogin: async function(){
      if(!this.phone||!this.code){toast("请输入手机号和验证码","terr");return}
      if(!this.adult){toast("请先勾选「我已年满18周岁」","terr");return}
      this.loading=true;
      try{var r=await api("/auth/login",{method:"POST",body:JSON.stringify({login:this.phone,code:this.code})});if(r.code===0&&r.data){localStorage.setItem("token",r.data.token);localStorage.setItem("userId",r.data.user.id);if(r.data.user.nickname)localStorage.setItem("uname",r.data.user.nickname);if(r.data.user.avatar)localStorage.setItem("uavatar",r.data.user.avatar);wsConnect();toast("登录成功","tok");var back=localStorage.getItem("postLoginRedirect");localStorage.removeItem("postLoginRedirect");this.$router.replace(back||"/home")}else toast(r.message||"登录失败","terr")}catch(e){toast(e.message||"网络错误，请检查网络后重试","terr")}
      this.loading=false;
    }
  },
  template: `<div style="padding:40px 24px;min-height:100%">
  <div style="text-align:center;margin-bottom:40px"><div style="font-size:56px">💕</div><h2 style="margin-top:8px">欢迎来到遇见</h2><p style="color:var(--tm);font-size:13px;margin-top:4px">手机号登录，即刻开启交友</p></div>
  <div class="inp" style="margin-bottom:12px"><span>📱</span><input v-model="phone" type="tel" maxlength="11" placeholder="请输入手机号" autocomplete="tel"></div>
  <div class="inp" style="margin-bottom:24px"><span>🔐</span><input v-model="code" type="text" maxlength="6" placeholder="验证码" autocomplete="one-time-code"><button class="btn bs" :class="sent&&countdown>0?'bo':'bp'" @click="sendCode" :disabled="sent&&countdown>0">{{sent&&countdown>0?countdown+'s':'获取验证码'}}</button></div>
  <button class="btn bp bw bl" @click="doLogin" :disabled="loading||!adult">{{loading?'登录中...':'登录/注册'}}</button>
  <label style="display:flex;align-items:center;gap:6px;justify-content:center;margin-top:16px;font-size:12px;color:var(--ts);cursor:pointer"><input type="checkbox" v-model="adult" style="width:16px;height:16px;accent-color:#FF5E7D">我已年满18周岁，并同意<span style="color:var(--p)">《用户协议》</span>和<span style="color:var(--p)">《隐私政策》</span></label>
  <p style="text-align:center;margin-top:12px;font-size:12px;color:var(--tm)">登录即表示同意用户协议和隐私政策</p></div>`
};

var HomePage = {
  name:"HomePage",
  data: function(){ return {users:[],loading:true,err:false,errMsg:"",tab:"city",currentCity:"",showFilter:false,fAge:[18,35],matchModal:null,hasLoaded:false,quota:{likes:20,supers:5},locating:false,locDenied:false}; },
  methods: {
    load: async function(){ this.loading=true;this.err=false;try{var r=await api("/match/recommend?scope="+this.tab+"&ageMin="+this.fAge[0]+"&ageMax="+this.fAge[1]+"&limit=20");this.users=r.data||[];if(this.users.length===0)this.errMsg="暂无推荐用户"}catch(e){this.err=true;this.errMsg=e.message||"加载失败，请稍后重试"}this.loading=false;this.hasLoaded=true; },
    // 定位上报（显式授权）：仅用户点「附近」或定位按钮时触发，不再挂载自动请求
    // 成功后不重复 load（首次 load 已并行发出），只更新城市显示；
    // 若推荐结果为空（首次 load 在定位前返回），定位成功后补一次刷新
    initLocation: function(){
      var self=this;
      if(!navigator.geolocation){toast("当前浏览器不支持定位","terr");return}
      self.locating=true;
      navigator.geolocation.getCurrentPosition(function(pos){
        self.locating=false;
        var lat=pos.coords.latitude,lng=pos.coords.longitude;
        api("/user/location",{method:"POST",body:JSON.stringify({lat:lat,lng:lng})}).then(function(r){
          if(r.code===0&&r.data&&r.data.city){self.currentCity=r.data.city;toast("已定位到 "+r.data.city,"tok")}
          if(self.users.length===0)self.load();
        }).catch(function(){});
      },function(err){
        self.locating=false;
        var msg="定位失败，请重试";
        if(err.code===1){msg="已拒绝定位权限，可在浏览器设置中开启";self.locDenied=true;}       // PERMISSION_DENIED
        else if(err.code===3){msg="定位超时，请检查GPS或网络";}          // TIMEOUT
        else if(err.code===2){msg="无法获取位置，请稍后重试";}           // POSITION_UNAVAILABLE
        toast(msg,"terr");
      },{timeout:12000,enableHighAccuracy:true,maximumAge:10000});
    },
    switchTab: function(t){
      this.tab=t;
      // 首次点「附近」触发显式定位授权
      if(t==="nearby"&&!this._located){this._located=true;this.initLocation();}
      this.load();
    },
    removeUser: function(u){
      var self=this;
      self.users=self.users.filter(function(x){return x.id!==u.id});
      if(self.users.length===0)self.load();
    },
    // 加载今日 like/super-like 配额（VIP 为 -1 表示无限）
    loadQuota: function(){
      var self=this;
      api("/match/daily-quota").then(function(r){
        if(r.code===0&&r.data){
          var q=r.data;
          self.quota.likes=(q.like_limit===-1?999:q.like_limit)-(q.like_used||0);
          self.quota.supers=(q.super_like_limit===-1?999:q.super_like_limit)-(q.super_like_used||0);
          if(self.quota.likes<0)self.quota.likes=0;
          if(self.quota.supers<0)self.quota.supers=0;
        }
      }).catch(function(){});
    },
    like: async function(u){
      if(!u)return;
      if(this.quota.likes<=0){toast("今日喜欢次数已用完","tinfo");return}
      var s=this;
      try{
        var r=await api("/match/like",{method:"POST",body:JSON.stringify({target_user_id:u.id})});
        if(r.code===0){
          this.quota.likes--;
          if(r.data&&r.data.matched){
            this.matchModal={partner:r.data.partner||u,conversation_id:r.data.conversation_id,common_tags:r.data.common_tags||[],icebreakers:r.data.icebreakers||[]};
          }else{toast(r.message||"已喜欢","tok")}
        }else{toast(r.message||"操作失败","terr")}
      }catch(e){toast(e.message||"操作失败","terr")}
      s.users=s.users.filter(function(x){return x.id!==u.id});
      if(s.users.length===0)s.load();
    },
    skip: function(u){
      if(!u)return;
      var s=this;
      api("/match/skip",{method:"POST",body:JSON.stringify({target_user_id:u.id})}).then(function(r){
        if(r.code!==0&&r.message)toast(r.message,"terr");
      }).catch(function(e){toast(e.message||"跳过失败","terr")});
      s.users=s.users.filter(function(x){return x.id!==u.id});
      if(s.users.length===0)s.load();
    },
    superLike: async function(u){
      if(!u)return;
      if(this.quota.supers<=0){toast("今日超级喜欢次数已用完","tinfo");return}
      var s=this;
      try{
        var r=await api("/match/super-like",{method:"POST",body:JSON.stringify({target_user_id:u.id})});
        if(r.code===0){this.quota.supers--;toast("⭐ 超级喜欢已发送","tok")}
        else{toast(r.message||"操作失败","terr")}
      }catch(e){toast(e.message||"操作失败","terr")}
      s.users=s.users.filter(function(x){return x.id!==u.id});
      if(s.users.length===0)s.load();
    },
    closeMatchModal: function(){this.matchModal=null},
    goChat: function(convId){
      var self=this;
      self.matchModal=null;
      if(convId)self.$router.push("/chat/"+convId);
    },
    chatUp: async function(u){
      if(!u)return;
      var s=this;
      // 已有会话：直接跳转聊天
      if(u._has_conversation){
        try{
          var cr = await api("/chat/conversations",{method:"POST",body:JSON.stringify({other_user_id:u.id})});
          if(cr.data)this.$router.push("/chat/"+cr.data.id);
        }catch(e){toast(e.message||"打开会话失败","terr")}
        return;
      }
      // 没有会话：打招呼
      try{
        var convR = await api("/chat/conversations",{method:"POST",body:JSON.stringify({other_user_id:u.id})});
        if(convR.code!==0||!convR.data){toast("发起会话失败","terr");return;}
        var convId = convR.data.id;
        var greetText = "Hi~ 很高兴认识你！";
        await api("/chat/messages",{method:"POST",body:JSON.stringify({conversation_id:convId,content:greetText,type:0})});
        // 打招呼成功：保留在列表中，并标记已有会话（按钮切换为「发消息」）
        u._has_conversation = true;
        if(window.NotificationUtils){
          window.NotificationUtils.showToast('已向'+(u.nickname||'TA')+'发送打招呼消息','like');
        } else {
          toast("💬 已发送打招呼消息","tok");
        }
      }catch(e){
        if(window.NotificationUtils){
          window.NotificationUtils.showToast(e.message||'打招呼失败','error');
        } else {
          toast(e.message||"打招呼失败","terr");
        }
      }
    },
    parseTags: function(t){if(!t)return[];if(Array.isArray(t))return t;try{return JSON.parse(t)}catch(e){return[]}}
  },
  mounted: function(){this.load();this.loadQuota()},
  // keep-alive 缓存恢复时静默刷新（仅刷新用户列表，避免重复定位）
  activated: function(){if(this.hasLoaded)this.load()},
  template: `<div style="padding:12px 16px">
  <div style="display:flex;gap:8px;margin-bottom:12px">
    <button class="btn bs" :class="tab==='city'?'bp':'bo'" @click="switchTab('city')">{{currentCity?'同城·'+currentCity:'同城'}}</button>
    <button class="btn bs" :class="tab==='nearby'?'bp':'bo'" @click="switchTab('nearby')">{{locDenied?'附近（未开启定位）':'附近'}}</button>
    <button class="btn bs bo" style="margin-left:auto" @click="$router.push('/search')">🔍</button>
    <button class="btn bs bo" @click="showFilter=!showFilter">⛭</button>
  </div>
  <div v-if="showFilter" style="background:var(--w);padding:14px;border-radius:var(--r);margin-bottom:12px;box-shadow:var(--sh)">
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;font-size:13px">
      <span style="color:var(--ts)">年龄:</span>
      <input v-model.number="fAge[0]" type="number" min="18" max="80" style="width:50px;padding:4px;border:1px solid var(--b);border-radius:4px;text-align:center">
      <span>-</span>
      <input v-model.number="fAge[1]" type="number" min="18" max="80" style="width:50px;padding:4px;border:1px solid var(--b);border-radius:4px;text-align:center">
    </div>
    <button class="btn bp bs bw" @click="load();showFilter=false">应用</button>
  </div>
  <div v-if="loading" style="padding:4px 0">
    <div v-for="n in 4" :key="n" class="skeleton-card"><div style="display:flex;align-items:center;gap:12px"><div class="skeleton skeleton-avatar"></div><div class="flex1"><div class="skeleton skeleton-text"></div><div class="skeleton skeleton-text-short"></div></div></div></div>
  </div>
  <div v-else-if="err" class="empty" style="padding:48px 24px"><div style="font-size:48px;margin-bottom:12px">😵</div><div style="color:var(--ts);margin-bottom:16px;font-size:14px">{{errMsg}}</div><button class="btn bp bs" @click="load">重试</button></div>
  <div v-else-if="users.length===0" class="empty"><div class="ei">🔍</div><div class="et">{{tab==='city'?'暂无同城用户':'暂无附近用户'}}</div><div class="ed">换个时间再来或调整筛选条件</div><button class="btn bp bs" @click="load">刷新</button></div>
  <div v-else style="display:flex;flex-direction:column;gap:10px">
    <div v-for="u in users" :key="u.id" class="card" style="padding:12px;cursor:pointer" @click="$router.push('/user/'+u.id)">
      <div style="display:flex;align-items:center">
        <div style="width:58px;height:58px;border-radius:50%;overflow:hidden;flex-shrink:0;background:linear-gradient(135deg,var(--gradient-a),var(--gradient-b));display:flex;align-items:center;justify-content:center">
          <img loading="lazy" v-if="u.avatar" :src="u.avatar" style="width:100%;height:100%;object-fit:cover">
          <span v-else style="font-size:26px">👤</span>
        </div>
        <div style="flex:1;min-width:0;margin:0 12px" @click.stop="$router.push('/user/'+u.id)">
          <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">
            <span style="font-size:16px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{{u.nickname||'TA'}}</span>
            <span style="font-size:13px;color:var(--ts)">{{u.age||'?'}}岁</span>
            <span v-if="u.is_vip" class="tag tp" style="font-size:11px">VIP</span>
          </div>
          <div style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--tm);margin-bottom:5px">
            <span v-if="!u._distance_hidden&&u.distance">{{u.distance.toFixed(1)}}km</span>
            <span v-else-if="tab==='city'">同城</span>
            <span v-else>附近</span>
            <span v-if="u.occupation">· {{u.occupation}}</span>
          </div>
          <div v-if="parseTags(u.tags).length" style="display:flex;gap:6px;flex-wrap:wrap"><span v-for="t in parseTags(u.tags).slice(0,3)" class="tag tp">{{t}}</span></div>
        </div>
        <div style="flex-shrink:0;display:flex;align-items:center">
          <button @click.stop="chatUp(u)" style="padding:4px 8px;border:1px solid #FF6B9D;border-radius:8px;background:transparent;color:#FF6B9D;font-size:10px;font-weight:600;cursor:pointer;transition:opacity .2s">{{u._has_conversation?'发消息':'打个招呼'}}</button>
        </div>
      </div>
    </div>
  </div>
  <div v-if="matchModal" style="position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,.75);z-index:200;display:flex;align-items:center;justify-content:center">
    <div style="background:#fff;border-radius:20px;padding:28px 24px;width:300px;text-align:center;position:relative">
      <button @click="closeMatchModal" style="position:absolute;top:10px;right:14px;border:none;background:none;font-size:18px;cursor:pointer;color:var(--tm)">✕</button>
      <div style="position:relative;height:60px"><div class="heart-anim" style="font-size:40px;position:absolute;left:50%;top:0;transform:translateX(-50%)">💕</div><span v-for="n in 6" :key="'mh'+n" class="match-particle" :style="{left:(16+n*12)+'%',animationDelay:(n*0.15)+'s'}">❤️</span></div>
      <h2 style="margin:10px 0 4px">匹配成功！</h2>
      <p style="color:var(--tm);font-size:13px;margin-bottom:14px">你和{{matchModal.partner.nickname||'TA'}}互相喜欢</p>
      <div class="avatar av-lg" style="margin:0 auto 14px"><img loading="lazy" v-if="matchModal.partner.avatar" :src="matchModal.partner.avatar"><span v-else>👤</span></div>
      <div v-if="matchModal.common_tags&&matchModal.common_tags.length" style="display:flex;gap:6px;flex-wrap:wrap;justify-content:center;margin-bottom:14px"><span v-for="t in matchModal.common_tags" class="tag tp">{{t}}</span></div>
      <div v-if="matchModal.icebreakers&&matchModal.icebreakers.length" style="text-align:left;background:var(--bg-page);border-radius:12px;padding:12px;margin-bottom:16px">
        <div style="font-size:13px;font-weight:600;margin-bottom:6px">💬 破冰话题</div>
        <div v-for="ib in matchModal.icebreakers" style="font-size:13px;color:var(--ts);margin-bottom:4px">{{ib.content}}</div>
      </div>
      <button class="btn bp bw bl" @click="goChat(matchModal.conversation_id)">💬 打个招呼</button>
    </div>
  </div></div>`
};

var DiscoverPage = {
  name:"DiscoverPage",
  data: function(){return {posts:[],loading:true,err:false,tab:"all",showPublish:false,pubText:"",pubImages:[],pubPreviews:[],offset:0,hasMore:true,loadingMore:false,hasLoaded:false}},
  methods: {
    load: async function(){this.offset=0;this.hasMore=true;try{var r=await api("/posts?limit=20&offset=0");this.posts=r.data||[];if(this.posts.length===0)this.errMsg="暂无动态";if((r.data||[]).length<20)this.hasMore=false}catch(e){this.err=true;this.errMsg=e.message||"加载失败，请稍后重试"}this.loading=false;this.hasLoaded=true},
    loadMore: async function(){
      if(this.loading||this.loadingMore||!this.hasMore)return;
      this.loadingMore=true;
      var next=this.offset+20;
      try{
        var r=await api("/posts?limit=20&offset="+next);
        var more=r.data||[];
        if(more.length>0){
          this.posts=this.posts.concat(more);
          this.offset=next;
        }
        if(more.length<20)this.hasMore=false;
      }catch(e){ /* 触底加载失败静默，可再次触发 */ }
      this.loadingMore=false;
    },
    onScroll: function(){
      var el=document.querySelector(".pg")||this.$el;
      if(!el)return;
      if((el.scrollTop+el.clientHeight)>=el.scrollHeight-60)this.loadMore();
    },
    toggleLike: async function(p){
      try{
        await api("/posts/"+p.id+"/like",{method:"POST"});
        p.liked=!p.liked;
        p.like_count+=p.liked?1:-1;
        if(p.like_count<0)p.like_count=0;
        // 点赞通知
        if(p.liked && window.NotificationUtils){
          window.NotificationUtils.playSound('like');
        }
      }catch(e){
        if(window.NotificationUtils){
          window.NotificationUtils.showToast(e.message,'error');
        } else {
          toast(e.message,"terr");
        }
      }
    },
    switchTab: function(t){this.tab=t;this.load()},
    // 多图选择（最多9张）
    pubImageChange: async function(e){
      var self=this,files=Array.prototype.slice.call(e.target.files||[]);
      if(files.length===0)return;
      var room=9-self.pubImages.length;
      if(files.length>room){toast("最多选择9张图片","tinfo");files=files.slice(0,room)}
      for(var i=0;i<files.length;i++){
        try{files[i]=await compressImage(files[i])}catch(_){}
      }
      files.forEach(function(f){self.pubImages.push(f);self.pubPreviews.push(URL.createObjectURL(f))});
      e.target.value=""; // 允许连续选择同一文件
    },
    removePubImage: function(i){this.pubImages.splice(i,1);this.pubPreviews.splice(i,1)},
    publish: async function(){
      var t=this.pubText.trim();
      if(!t&&this.pubImages.length===0){
        if(window.NotificationUtils){
          window.NotificationUtils.showToast("请输入内容或选择图片",'warning');
        } else {
          toast("请输入内容或选择图片","tinfo");
        }
        return;
      }
      try{
        var fd=new FormData();
        if(t)fd.append("content",t);
        this.pubImages.forEach(function(f){fd.append("images",f)});
        var r=await api("/posts",{method:"POST",body:fd});
        if(r.code===0){
          if(window.NotificationUtils){
            window.NotificationUtils.showToast("发布成功",'success');
          } else {
            toast("发布成功","tok");
          }
          this.showPublish=false;
          this.pubText="";
          this.pubImages=[];
          this.pubPreviews=[];
          this.load();
        } else {
          if(window.NotificationUtils){
            window.NotificationUtils.showToast(r.message,'error');
          } else {
            toast(r.message,"terr");
          }
        }
      }catch(e){
        if(window.NotificationUtils){
          window.NotificationUtils.showToast(e.message,'error');
        } else {
          toast(e.message,"terr");
        }
      }
    }
  },
  mounted: function(){this.load();this._scrollFn=this.onScroll.bind(this);this.$nextTick(function(){var el=document.querySelector(".pg")||this.$el;if(el)el.addEventListener("scroll",this._scrollFn,{passive:true})})},
  // keep-alive 缓存恢复时静默刷新（不闪骨架屏，后台拉取新动态）
  activated: function(){if(this.hasLoaded)this.load()},
  unmounted: function(){var el=document.querySelector(".pg")||this.$el;if(this._scrollFn&&el)el.removeEventListener("scroll",this._scrollFn)},
  template: `<div style="padding:12px 16px">
  <div style="display:flex;gap:8px;margin-bottom:12px">
    <button class="btn bs" :class="tab==='all'?'bp':'bo'" @click="switchTab('all')">全部</button>
    <button class="btn bs" :class="tab==='nearby'?'bp':'bo'" @click="switchTab('nearby')">附近</button>
    <button class="btn bp bs" style="margin-left:auto" @click="showPublish=true">✏️ 发布</button>
  </div>
  <div v-if="showPublish" class="card" style="padding:16px;margin-bottom:12px">
    <textarea v-model="pubText" placeholder="分享你的生活..." style="width:100%;min-height:80px;border:1px solid var(--b);border-radius:8px;padding:10px;font-size:15px;resize:vertical" maxlength="500"></textarea>
    <div v-if="pubPreviews.length" style="display:grid;grid-template-columns:repeat(3,1fr);gap:4px;margin-top:8px">
      <div v-for="(pv,i) in pubPreviews" :key="i" style="position:relative">
        <img loading="lazy" :src="pv" style="width:100%;aspect-ratio:1;object-fit:cover;border-radius:6px">
        <button @click="removePubImage(i)" style="position:absolute;top:-8px;right:-8px;width:22px;height:22px;border-radius:50%;background:var(--e);color:#fff;border:none;cursor:pointer;font-size:12px;line-height:22px">✕</button>
      </div>
    </div>
    <div style="display:flex;gap:8px;margin-top:10px;align-items:center">
      <label style="cursor:pointer;font-size:24px">📷<input type="file" accept="image/*" multiple style="display:none" @change="pubImageChange"></label>
      <span style="font-size:12px;color:var(--tm);flex:1">{{pubImages.length}}/9 · {{pubText.length}}/500</span>
      <button class="btn bp bs" @click="publish">发布</button>
      <button class="btn bo bs" @click="showPublish=false;pubText='';pubImages=[];pubPreviews=[]">取消</button>
    </div>
  </div>
  <div v-if="loading" style="padding:4px 0">
    <div v-for="n in 3" :key="n" class="skeleton-card"><div class="skeleton skeleton-avatar" style="margin-bottom:10px"></div><div class="skeleton skeleton-text"></div><div class="skeleton skeleton-text"></div><div class="skeleton skeleton-text-short"></div></div>
  </div>
  <div v-else-if="err" class="empty" style="padding:48px 24px"><div style="font-size:48px">😵</div><p style="color:var(--ts);margin:12px 0">加载失败</p><button class="btn bp bs" @click="load">重试</button></div>
  <div v-else-if="posts.length===0" class="empty"><div class="ei">📝</div><div class="et">暂无动态</div><div class="ed">来发布第一条动态吧</div></div>
  <div v-else><div v-for="p in posts" :key="p.id" class="card" style="padding:16px;margin-bottom:12px;cursor:pointer" @click="$router.push('/post/'+p.id)">
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">
      <div class="avatar av-sm"><img loading="lazy" v-if="p.avatar" :src="p.avatar"><span v-else>👤</span></div>
      <div><div style="font-weight:600;font-size:14px">{{p.nickname||'用户'}}</div><div style="font-size:11px;color:var(--tm)">{{timeAgo(p.created_at)}}</div></div>
    </div>
    <p v-if="p.content" style="margin-bottom:10px;line-height:1.6;font-size:15px">{{p.content}}</p>
    <div v-if="p.images&&p.images.length" :style="{display:'grid',gridTemplateColumns:'repeat('+Math.min(p.images.length,3)+',1fr)',gap:'4px',marginBottom:'10px'}"><img loading="lazy" v-for="(img,i) in p.images.slice(0,9)" :src="img" style="width:100%;aspect-ratio:1;object-fit:cover;border-radius:6px" @click.stop="preview.open(p.images,i)"></div>
    <div style="display:flex;gap:24px;font-size:13px;color:var(--tm)"><span @click.stop="toggleLike(p)" :style="{color:p.liked?'var(--p)':''}">{{p.liked?'❤️':'🤍'}} {{p.like_count||0}}</span><span>💬 {{p.comment_count||0}}</span></div>
  </div>
  <div v-if="loadingMore" style="text-align:center;padding:16px;color:var(--tm);font-size:13px"><div class="spin" style="width:20px;height:20px;margin:0 auto 6px"></div>加载更多...</div>
  <div v-else-if="!hasMore&&posts.length>0" style="text-align:center;padding:12px;color:var(--tm);font-size:12px">— 没有更多了 —</div>
  </div></div>`
};

var PostDetailPage = {
  data: function(){return {post:null,comments:[],text:"",loading:true,pid:0}},
  methods: {
    timeAgo: function(t){if(!t)return"";var d=Math.floor((Date.now()-new Date(t).getTime())/1000);if(d<60)return"刚刚";if(d<3600)return Math.floor(d/60)+"分钟前";if(d<86400)return Math.floor(d/3600)+"小时前";return Math.floor(d/86400)+"天前"},
    load: async function(){this.pid=parseInt(this.$route.params.id);this.loading=true;try{var r=await api("/posts/"+this.pid);this.post=(r.data&&r.data.post)||r.data;this.comments=(r.data&&r.data.comments)||[]}catch(e){}this.loading=false},
    toggleLike: async function(){
      try{
        await api("/posts/"+this.pid+"/like",{method:"POST"});
        this.post.liked=!this.post.liked;
        this.post.like_count+=this.post.liked?1:-1;
        if(this.post.like_count<0)this.post.like_count=0;
        // 点赞通知
        if(this.post.liked && window.NotificationUtils){
          window.NotificationUtils.playSound('like');
        }
      }catch(e){
        if(window.NotificationUtils){
          window.NotificationUtils.showToast(e.message,'error');
        } else {
          toast(e.message,"terr");
        }
      }
    },
    addComment: async function(){
      var t=this.text.trim();
      if(!t)return;
      try{
        await api("/posts/"+this.pid+"/comment",{method:"POST",body:JSON.stringify({content:t})});
        this.text="";
        var uname=localStorage.getItem("uname")||"我";
        this.comments.push({content:t,nickname:uname,created_at:new Date().toISOString(),_local:true});
        if(this.post)this.post.comment_count=(this.post.comment_count||0)+1;
        // 评论成功通知
        if(window.NotificationUtils){
          window.NotificationUtils.showToast('评论成功','success');
        } else {
          toast("评论成功","tok");
        }
      }catch(e){
        if(window.NotificationUtils){
          window.NotificationUtils.showToast(e.message,'error');
        } else {
          toast(e.message,"terr");
        }
      }
    }
  },
  mounted: function(){this.load()},
  template: `<div>
  <div v-if="loading" style="text-align:center;padding:64px"><div class="spin"></div></div>
  <div v-else-if="!post" class="empty"><div class="ei">😕</div><div class="et">动态不存在</div></div>
  <div v-else>
    <div class="card" style="margin:12px 16px;padding:16px">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px"><div class="avatar av-sm"><img loading="lazy" v-if="post.avatar" :src="post.avatar"><span v-else>👤</span></div><div><div style="font-weight:600">{{post.nickname}}</div><div style="font-size:12px;color:var(--tm)">{{timeAgo(post.created_at)}}</div></div></div>
      <p style="line-height:1.6;margin-bottom:10px">{{post.content}}</p>
      <div v-if="post.images&&post.images.length" :style="{display:'grid',gridTemplateColumns:'repeat('+Math.min(post.images.length,3)+',1fr)',gap:'4px',marginBottom:'10px'}"><img loading="lazy" v-for="(img,i) in post.images" :src="img" style="width:100%;aspect-ratio:1;object-fit:cover;border-radius:6px" @click="preview.open(post.images,i)"></div>
      <div style="display:flex;gap:24px;color:var(--tm);font-size:13px"><span @click="toggleLike" :style="{color:post.liked?'var(--p)':''}">{{post.liked?'❤️':'🤍'}} {{post.like_count||0}}</span><span>💬 {{post.comment_count||0}}</span></div>
    </div>
    <div style="padding:0 16px;margin-bottom:80px">
      <h4 style="margin-bottom:12px;font-size:14px;color:var(--ts)">评论 ({{comments.length}})</h4>
      <div v-if="comments.length===0" class="empty" style="padding:24px"><div style="font-size:32px;opacity:.4">💬</div><p style="color:var(--tm);font-size:13px">还没有评论</p></div>
      <div v-for="c in comments" :key="c.id||Math.random()" style="display:flex;gap:10px;margin-bottom:12px;padding-bottom:12px;border-bottom:1px solid var(--b)"><div class="avatar av-sm"><img loading="lazy" v-if="c.avatar" :src="c.avatar"><span v-else>👤</span></div><div class="flex1"><div style="font-weight:500;font-size:13px;margin-bottom:4px">{{c.nickname}}<span style="font-size:11px;color:var(--tm);margin-left:8px">{{timeAgo(c.created_at)}}</span></div><p style="font-size:14px;line-height:1.5">{{c.content}}</p></div></div>
    </div>
    <div style="position:fixed;bottom:0;left:0;right:0;padding:10px 16px;background:var(--w);border-top:1px solid var(--b);display:flex;gap:10px;z-index:100;padding-bottom:calc(10px + env(safe-area-inset-bottom,0px))"><div class="inp" style="flex:1;border-radius:20px"><input v-model="text" placeholder="写评论..." @keydown.enter="addComment"></div><button class="btn bp bs" @click="addComment" :disabled="!text.trim()">发送</button></div>
  </div></div>`
};

var ChatListPage = {
  name:"ChatListPage",
  data: function(){return {convs:[],loading:true,hasLoaded:false,sheet:null,touchX:0,touchY:0,swipeId:null,swipeOffset:0}},
  methods: {
    load:async function(){this.loading=true;try{var r=await api("/chat/conversations");this.convs=r.data||[];this.syncGlobal()}catch(e){}this.loading=false;this.hasLoaded=true},
    // 将各会话未读数求和，同步到底部「消息」标签红点
    syncGlobal:function(){if(this.$root)this.$root.unreadCount=this.convs.reduce(function(a,c){return a+(c.unread_count||0)},0)},
    open:function(c){this.$router.push("/chat/"+c.id)},
    // 点击进入聊天框：长按弹 Sheet / 左滑删除等场景由 onTouchEnd 置 _suppressClick 拦截
    // （touchend 不再 preventDefault 后合成 click 会正常派发，须在此兜底拦截非「点击」场景）
    maybeOpen:function(c){var s=this;if(s._suppressClick){s._suppressClick=false;return}s.open(c)},
    // ===== 会话长按 / 滑动操作（统一 touch 处理链）=====
    // 注意：所有事件都【不加 .prevent】——iOS Safari 上 touchstart/touchend 的
    // preventDefault 会同时阻止合成 click 和页面滚动，导致无法点击/滑动。
    // 仅在 onTouchMove 判断为横向左滑时按需 e.preventDefault（避免横滑时浏览器回弹）。
    onTouchStart:function(e,c){
      var t=e.touches?e.touches[0]:e.changedTouches[0];
      if(!t)return;
      var s=this;
      s._suppressClick=false; // 每次触摸开始重置点击拦截
      s.touchX=t.clientX;s.touchY=t.clientY;
      s._touchCid=c.id;
      s._longPressed=false;
      if(s._pressTimer){clearTimeout(s._pressTimer)}
      s._pressTimer=setTimeout(function(){
        s._longPressed=true;
        s.sheet={conv:c};
      },750);
    },
    // touchmove：位移>10 取消长按；横向滑动更新偏移并 preventDefault，纵向滚动不干扰
    onTouchMove:function(e,c){
      var t=e.touches?e.touches[0]:e.changedTouches[0];
      if(!t)return;
      var s=this;
      var dx=t.clientX-s.touchX,dy=t.clientY-s.touchY;
      // 纵向滚动占优：取消长按并回正，完全交给页面滚动（不 preventDefault）
      if(Math.abs(dy)>Math.abs(dx)&&Math.abs(dy)>8){
        if(s._pressTimer){clearTimeout(s._pressTimer);s._pressTimer=null}
        c._swipeOffset=0;return;
      }
      // 横向位移：取消长按
      if(Math.abs(dx)>10&&s._pressTimer){clearTimeout(s._pressTimer);s._pressTimer=null}
      // 已长按弹出 Sheet 后不再滑动
      if(s._longPressed)return;
      // 只允许左滑露出右侧删除（单方向，避免与返回手势冲突）
      if(dx<0){c._swipeOffset=Math.max(-140,dx);if(e.cancelable)e.preventDefault()}
      else{c._swipeOffset=0;}
    },
    // touchend：取消长按；位移超点击阈值视为滑动/滚动（拦截合成 click，避免误入聊天框）。
    // 左滑>80px 触发删除，否则回正。长按/删除/滑动均为非「点击」场景。
    onTouchEnd:function(e,c){
      var s=this;
      if(s._pressTimer){clearTimeout(s._pressTimer);s._pressTimer=null}
      if(s._longPressed){s._longPressed=false;s._suppressClick=true;return}
      var t=e.changedTouches?e.changedTouches[0]:null;
      var dx=t?t.clientX-s.touchX:0;
      var dy=t?t.clientY-s.touchY:0;
      if(Math.abs(dx)>10||Math.abs(dy)>10){
        if(dx<-80){c._swipeOffset=-140;s.delConv(c);}
        else{c._swipeOffset=0;}
        s._suppressClick=true;
      }else{
        c._swipeOffset=0;
      }
      s._touchCid=null;
    },
    // 删除会话
    delConv:function(c){
      var s=this;
      s.sheet=null;
      api("/chat/conversations/"+c.id,{method:"DELETE"}).then(function(r){
        if(r.code===0){s.convs=s.convs.filter(function(x){return x.id!==c.id});s.syncGlobal();toast("会话已删除","tok")}
        else toast(r.message||"删除失败","terr");
      }).catch(function(e){toast(e.message||"删除失败","terr")});
    },
    // 标已读
    markRead:function(c){
      var s=this;s.sheet=null;
      api("/chat/mark-read",{method:"POST",body:JSON.stringify({conversation_id:c.id})}).then(function(r){
        if(r.code===0){c.unread_count=0;s.syncGlobal();toast("已标为已读","tok")}
      }).catch(function(){});
    },
    // 置顶/取消置顶（调后端 togglePin，切换语义）
    pinConv:function(c){
      var s=this;s.sheet=null;
      api("/chat/conversations/"+c.id+"/pin",{method:"PUT"}).then(function(r){
        if(r.code===0){c.is_pinned=!c.is_pinned;toast(c.is_pinned?"已置顶":"已取消置顶","tok");
          // 置顶会话排到最前
          var i=s.convs.indexOf(c);if(c.is_pinned&&i>0){s.convs.splice(i,1);s.convs.unshift(c);}
        }
        else toast(r.message||"操作失败","terr");
      }).catch(function(e){toast(e.message||"操作失败","terr")});
    },
    // 拉黑
    blockConv:function(c){
      var s=this;s.sheet=null;
      if(!window.confirm("拉黑 "+(c.other_nickname||"TA")+" 后，将不再收到TA的消息，确定拉黑？"))return;
      api("/block/add",{method:"POST",body:JSON.stringify({blocked_user_id:c.other_user_id})}).then(function(r){
        if(r.code===0){s.convs=s.convs.filter(function(x){return x.id!==c.id});s.syncGlobal();toast("已拉黑","tok")}
        else toast(r.message||"拉黑失败","terr");
      }).catch(function(e){toast(e.message||"拉黑失败","terr")});
    },
    fmtTime:function(t){if(!t)return"";var d=new Date(t),now=new Date();var sameDay=d.toDateString()===now.toDateString();if(sameDay)return ("0"+d.getHours()).slice(-2)+":"+("0"+d.getMinutes()).slice(-2);var yes=new Date(now);yes.setDate(yes.getDate()-1);if(d.toDateString()===yes.toDateString())return"昨天";return ("0"+(d.getMonth()+1)).slice(-2)+"/"+("0"+d.getDate()).slice(-2)},
    fmtLastMsg:function(c){if(!c.last_message)return"暂无消息";if(c.last_msg_type===1)return"[图片]";if(c.last_msg_type===2)return"[语音]";if(c.last_msg_type===4)return"[贴纸]";if(c.last_msg_type===99)return c.last_message;return c.last_message},
    onWsMsg:function(d){
      // 只处理收到的消息（message_sent 是自己发出的确认，不产生未读）
      if(d.type!=="message"||!d.data)return;
      var cid=d.data.conversation_id;if(!cid)return;
      var s=this;
      // 忽略自己发送的消息（可能是多设备同步）
      var myId=parseInt(localStorage.getItem("userId"));
      if(d.data.sender_id===myId)return;
      // 找会话是否在列表中
      for(var i=0;i<s.convs.length;i++){
        if(s.convs[i].id===cid){
          var c=s.convs[i];
          c.last_message=d.data.content||"";
          c.last_message_time=d.data.created_at;
          c.last_msg_type=d.data.type||0;
          // 不在当前聊天详情时 +1 未读（并同步底部全局红点）
          if(!s.$route.path.startsWith("/chat/"+cid)){
            c.unread_count=(c.unread_count||0)+1;
            s.syncGlobal();
          }
          // 移到列表最前
          s.convs.splice(i,1);s.convs.unshift(c);return;
        }
      }
      // 新会话：重新拉列表
      s.load();
    },
    // 对方在线/离线状态实时更新
    onWsOnlineStatus:function(d){
      if(!d.data)return;
      var s=this,uid=d.data.user_id,online=!!d.data.online;
      for(var i=0;i<s.convs.length;i++){
        if(s.convs[i].other_user_id===uid){
          s.convs[i].other_online=online;
          return;
        }
      }
    }
  },
  mounted: function(){
    var s=this;
    s.load();
    s._clWsFn=function(d){s.onWsMsg(d)};
    wsOn("message",s._clWsFn);
    s._clOnlineFn=function(d){s.onWsOnlineStatus(d)};
    wsOn("online_status",s._clOnlineFn);
  },
  // keep-alive 缓存恢复时静默刷新会话列表
  activated: function(){if(this.hasLoaded)this.load()},
  beforeUnmount: function(){
    wsOff("message",this._clWsFn);
    wsOff("online_status",this._clOnlineFn);
  },
  template: `<div><div v-if="loading" style="padding:4px 0"><div v-for="n in 4" :key="n" class="skeleton-card"><div style="display:flex;align-items:center;gap:12px"><div class="skeleton skeleton-avatar"></div><div class="flex1"><div class="skeleton skeleton-text"></div><div class="skeleton skeleton-text-short"></div></div></div></div></div><div v-else><div v-if="convs.length===0" class="empty" style="margin-top:8px"><div class="ei">💬</div><div class="et">还没有聊过天</div><div class="ed">在「遇见」中匹配好友，开始聊天吧</div><router-link to="/home" class="btn bp" style="margin-top:16px;text-decoration:none;display:inline-block">去遇见</router-link></div><div v-else><div v-for="c in convs" :key="c.id" class="conv-swipe" style="position:relative;overflow:hidden"><div class="conv-actions" style="position:absolute;top:0;right:0;bottom:0;display:flex;z-index:1"><button style="border:none;background:#F6D365;color:#5b4a00;font-size:12px;padding:0 18px;cursor:pointer" @click.stop="delConv(c)">删除</button></div><div class="conv-item" :style="{transform:'translateX('+((c._swipeOffset||0)+'px')+')',transition:c._swipeOffset&&c._swipeOffset!==0?'transform .2s':'transform .2s'}" @touchstart="onTouchStart($event,c)" @touchmove="onTouchMove($event,c)" @touchend="onTouchEnd($event,c)" @touchcancel="onTouchEnd($event,c)" @click="maybeOpen(c)"><div class="conv-avatar-wrap"><div class="conv-avatar"><img loading="lazy" v-if="c.other_avatar" :src="c.other_avatar"><span v-else class="conv-avatar-placeholder">👤</span></div><span v-if="c.other_online" class="conv-online-dot"></span></div><div class="conv-info"><div class="conv-top-row"><div class="conv-name-line"><span class="conv-name">{{c.other_nickname||'用户'}}</span><span v-if="c.is_pinned" class="tag tp" style="font-size:10px;padding:0 4px;margin-left:4px">📌</span></div><div style="display:flex;align-items:center;gap:8px;flex-shrink:0"><span class="conv-time">{{fmtTime(c.last_message_time)}}</span><span v-if="c.unread_count>0" class="conv-badge">{{c.unread_count>99?'99+':c.unread_count}}</span></div></div><div class="conv-msg-row"><span class="conv-preview">{{fmtLastMsg(c)}}</span></div></div></div></div></div><div v-if="sheet" style="position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,.45);z-index:300" @click="sheet=null"><div style="position:absolute;bottom:0;left:0;right:0;background:#fff;border-radius:16px 16px 0 0;padding:12px 16px calc(16px + var(--safe-b))" @click.stop><div style="display:flex;align-items:center;padding:14px 8px;border-bottom:1px solid #f2f2f2;margin-bottom:8px"><div class="conv-avatar-wrap"><div class="conv-avatar"><img loading="lazy" v-if="sheet.conv.other_avatar" :src="sheet.conv.other_avatar"><span v-else class="conv-avatar-placeholder">👤</span></div></div><span style="font-size:16px;font-weight:600;margin-left:12px">{{sheet.conv.other_nickname||'用户'}}</span></div><div v-for="op in [{i:'✔️',l:'标为已读',f:function(){markRead(sheet.conv)}},{i:'📌',l:sheet.conv.is_pinned?'取消置顶':'置顶会话',f:function(){pinConv(sheet.conv)}},{i:'🗑️',l:'删除会话',f:function(){delConv(sheet.conv)}},{i:'🚫',l:'拉黑',f:function(){blockConv(sheet.conv)}}]" :key="op.l" style="display:flex;align-items:center;padding:14px 8px;border-radius:10px;cursor:pointer" @click="op.f"><span style="font-size:18px;margin-right:12px">{{op.i}}</span><span style="font-size:15px">{{op.l}}</span></div><button style="width:100%;margin-top:12px;padding:12px;border:none;background:#f5f5f5;border-radius:12px;font-size:15px;cursor:pointer;color:var(--tm)" @click="sheet=null">取消</button></div></div></div></div></div>`
};


var ChatDetailPage = {
  data: function(){return {
    convId:0,msgs:[],text:"",loading:true,err:false,errMsg:"",
    userId:parseInt(localStorage.getItem("userId")),hasMore:true,
    loadingMore:false,uploading:false,sending:false,
    voiceMode:false,showEmojiPanel:false,showPlusPanel:false,
    recording:false,mediaRecorder:null,audioChunks:[],recordingCancel:false,voiceRate:1,
    playingMsgId:null,voiceProgress:0,voicePlayTime:0,
    showGiftPanel:false,gifts:[],giftLoading:false,
    showStickerPanel:false,stickers:[],stickerLoading:false,stickersById:{},stickerCat:"",stickerVipOnly:false,
    calling:false,callType:"",callPartnerId:0,callPartnerName:"",callStatus:"",micMuted:false,speakerOn:false,
    showCallDialog:false,incomingCall:null,callDuration:0,callTimer:null,
    partner:{nickname:"",avatar:null,online:false},partnerId:0,myAvatar:"",
    partnerTyping:false,_typingTimer:null,partnerReadTs:null,kbH:0,giftBanner:null,
    emojis:["😀","😁","😂","🤣","😃","😄","😅","😆","😉","😊","😋","😎","😍","😘","😗","😙","😚","🙂","🤗","🤩","🤔","🤨","😐","😑","😶","🙄","😏","😣","😥","😮","🤐","😯","😪","😫","😴","😌","😛","😜","😝","😒","😓","😔","😕","🙃","🤑","😲","🙁","😖","😞","😟","😤","😢","😭","😦","😧","😨","😩","🤯","😬","😰","😱","🥵","🥶","😳","🤪","😵","🥴","😠","😡","🤬","😷","🤒","🤕","🤢","🤮","🥳","🥺","🤠","😇","🤡","🤥","🤫","🤭","🧐","🤓","😈","👻","💀","👽","🤖","💩","❤️","🧡","💛","💚","💙","💜","🖤","💔","❣️","💕","💞","💓","💗","💖","💘","💝","💟","👍","👎","👊","✊","🤛","🤜","👏","🙌","👐","🤲","🤝","🙏","✌️","🤞","🤟","🤘","👌","🤌","🤏","👈","👉","👆","👇","☝️","✋","🤚","🖐️","🖖","👋","🤙","💪","🦾","🖕","✍️","🎉","🎊","🎈","🎁","🎀","🌹","💐","🌸","💯","🔥","⭐","🌟","✨","⚡","💥","💫","🎵","🎶","🍺","🍻","🥂","🍷","🍰","🎂","🍜","🍔","🍟","🌙","☀️","🌈","⛄","🏆","🥇","🏅","🎯","🎮","🎲","🎰","🧧","💰","💵","💴","💶","💷","💸","🪙"]
  }},
  methods: {
    timeStr: function(t){if(!t)return"";var d=new Date(t);return ("0"+d.getHours()).slice(-2)+":"+("0"+d.getMinutes()).slice(-2)},
    avatarOf: function(m){
      if(m.sender_id===this.userId)return this.myAvatar||null;
      return m.sender_avatar||this.partner.avatar||null;
    },
    loadPartner: async function(){
      var s=this;
      try{
        var r=await api("/chat/conversations");
        var list=r.data||[];
        for(var i=0;i<list.length;i++){
          if(list[i].id===s.convId){
            var c=list[i];
            s.partner={nickname:c.other_nickname||"用户",avatar:c.other_avatar||null,online:!!c.other_user_online};
            s.partnerId=c.other_user_id||0;
            break;
          }
        }
      }catch(e){}
    },
    load: async function(isMore){
      var s=this;
      try{s.convId=parseInt(s.$route.params.id)}catch(e){s.convId=0}
      if(!s.convId){s.loading=false;s.err=true;s.errMsg="会话ID无效";return}
      if(isMore){s.loadingMore=true}else{s.loading=true;s.err=false}
      try{
        var url="/chat/messages?conversation_id="+s.convId+"&limit=50";
        if(isMore&&s.msgs.length>0&&s.msgs[0].id)url+="&before="+s.msgs[0].id;
        var r=await api(url);
        var arr=r.data||[];
        if(isMore){
          if(arr.length===0){s.hasMore=false}
          else{var oh=s.$refs.chat?s.$refs.chat.scrollHeight:0;s.msgs=arr.concat(s.msgs);s.$nextTick(function(){if(s.$refs.chat)s.$refs.chat.scrollTop=s.$refs.chat.scrollHeight-oh})}
        }else{
          s.msgs=arr;s.hasMore=arr.length>=50;s.$nextTick(function(){s.scrollBottom()})
        }
        s.addTimeDividers();
      }catch(e){s.err=true;s.errMsg=e.message||"加载失败";if(!isMore)toast("加载失败","terr")}
      if(isMore){s.loadingMore=false}else{s.loading=false}
    },
    scrollBottom: function(){
      var self=this,el=self.$refs.chat;
      if(el){el.scrollTop=el.scrollHeight}
      // 图片懒加载后 scrollHeight 会变化：延迟二次定位到底部
      // 仅当用户没有手动上滑历史时执行（避免打扰用户浏览旧消息）
      var self2=self;      if(!self._userScrolled){
        clearTimeout(self._scrollBottomTimer);
        self._scrollBottomTimer=setTimeout(function(){
          if(!self2._userScrolled&&self2.$refs.chat)self2.$refs.chat.scrollTop=self2.$refs.chat.scrollHeight;
        },200);
      }
    },
    // 点击礼物banner滚动定位到对应礼物气泡
    scrollToGift: function(){
      var self=this,el=self.$refs.chat;
      if(!el)return;
      var target=null;
      for(var i=self.msgs.length-1;i>=0;i--){
        if(self.msgs[i].type===6){target=self.msgs[i];break}
      }
      if(target){
        var els=el.querySelectorAll(".msg-sy");
        for(var j=0;j<els.length;j++){
          if(els[j].textContent.indexOf(target.content)>-1){els[j].scrollIntoView({behavior:"smooth",block:"center"});break}
        }
      }
    },
    onScroll: function(){
      var self=this,el=self.$refs.chat;
      if(!el)return;
      // 用户手动上滑（不在底部）：记录标记，之后不再强制拉回底部
      // 回到底部附近时恢复自动滚动（微信行为）
      if(el.scrollTop+el.clientHeight < el.scrollHeight-10){
        self._userScrolled=true;
      }else{
        self._userScrolled=false;
      }
      if(self.loadingMore||!self.hasMore)return;
      if(el.scrollTop<50){self.load(true)}
    },
    // 软键盘弹出/收起时，页面底部随键盘同步上下调整（visualViewport 兜底）
    // kbH=键盘遮挡高度。面板在输入栏下方随根容器上移，无需叠加面板高度。
    // 依赖布局视口不被 interactive-widget 参与 resize，避免双重补偿错位。
    _onViewportResize: function(){
      var self=this;
      if(!window.visualViewport)return;
      var vv=window.visualViewport;
      var h=Math.max(0, window.innerHeight - vv.height);
      var prev=self.kbH;
      if(Math.abs(h-prev)>8){
        self.kbH=h;
        Vue.nextTick(function(){self._resizeBottom(true)});
      }
    },
    // 校正当前键盘高度（进入页面 / 聚焦输入框时调用，避免从键盘未收起状态切入时输入框被遮挡）
    _syncKbH: function(){
      var self=this;
      if(!window.visualViewport)return;
      var vv=window.visualViewport;
      self.kbH=Math.max(0, window.innerHeight - vv.height);
    },
    // 底部输入区/面板高度变化时，聊天记录随底部操作变动，保持最后一条消息在最下方。
    // 仅在用户之前未手动上滑历史时才强制钉底；面板开合引发的浏览器滚动不视为用户手动上滑。
    _resizeBottom: function(force){
      var self=this;
      var el=self.$refs.chat;
      if(!el)return;
      // 仅在用户确实没在浏览旧消息时才钉底；force=true（面板/键盘刚变化）视为底部操作，强制钉底
      if(force){
        self._userScrolled=false;
        self.scrollBottom();
        // 面板是延迟渲染的，等 nextTick 渲染完成后再次钉底，确保绝对底部
        clearTimeout(self._resizeBottomTimer);
        self._resizeBottomTimer=setTimeout(function(){self._resizeBottom(false)},120);
      }else if(!self._userScrolled){
        self.scrollBottom();
      }
    },
    addTimeDividers: function(){
      var ms=this.msgs;
      for(var i=ms.length-1;i>=0;i--){
        if(i===0){ms[i]._timeGroup=this.fmtTimeDiv(ms[i].created_at);continue}
        var prev=new Date(ms[i-1].created_at).getTime();
        var cur=new Date(ms[i].created_at).getTime();
        ms[i]._timeGroup=(cur-prev>300000||new Date(prev).toDateString()!==new Date(cur).toDateString())?this.fmtTimeDiv(ms[i].created_at):null;
      }
    },
    fmtTimeDiv: function(t){
      if(!t)return"";var d=new Date(t),n=new Date();
      var tm=("0"+d.getHours()).slice(-2)+":"+("0"+d.getMinutes()).slice(-2);
      if(d.toDateString()===n.toDateString())return tm;
      var y=new Date(n);y.setDate(y.getDate()-1);
      if(d.toDateString()===y.toDateString())return"昨天 "+tm;
      return("0"+(d.getMonth()+1)).slice(-2)+"-"+("0"+d.getDate()).slice(-2)+" "+tm;
    },
    sendMsg: async function(){
      var self=this,t=self.text.trim();if(!t)return;
      var msg={conversation_id:self.convId,sender_id:self.userId,content:t,type:0,_local:true,_sending:true,created_at:new Date().toISOString()};
      self.msgs.push(msg);self.text="";self.addTimeDividers();Vue.nextTick(function(){self.scrollBottom()});
      try{
        var r=await api("/chat/messages",{method:"POST",body:JSON.stringify({conversation_id:self.convId,content:t,type:0})});
        if(r.code===0&&r.data){
          var idx=self.msgs.indexOf(msg);if(idx>-1){self.msgs[idx].id=r.data.id;self.msgs[idx]._sending=false}
        }else{msg._failed=true;msg._sending=false;toast(r.message||"发送失败","terr")}
      }catch(e){msg._failed=true;msg._sending=false;toast("发送失败","terr")}
    },
    // 发送"正在输入"状态（节流：5秒内不重复发）
    sendTyping: function(){
      var self=this;
      if(!self.partnerId||!wsSend)return;
      var now=Date.now();
      if(self._lastTypingTs&&now-self._lastTypingTs<5000)return;
      self._lastTypingTs=now;
      wsSend({type:"typing",receiver_id:self.partnerId});
    },
    // 发送"停止输入"状态
    sendStopTyping: function(){
      var self=this;
      if(!self.partnerId)return;
      wsSend({type:"stop_typing",receiver_id:self.partnerId});
    },
    // 发送已读回执
    sendReadReceipt: function(){
      var self=this;
      if(!self.partnerId)return;
      wsSend({type:"read_receipt",conversation_id:self.convId,receiver_id:self.partnerId});
    },
    onImagePick: function(){
      var self=this,inp=document.createElement("input");inp.type="file";inp.accept="image/*";
      inp.onchange=function(e){var f=e.target.files[0];if(!f)return;self.uploadImage(f)};inp.click();
      self.showPlusPanel=false;
    },
    onCameraCapture: function(){
      var self=this,inp=document.createElement("input");
      inp.type="file";inp.accept="image/*";inp.capture="environment";
      inp.onchange=function(e){var f=e.target.files[0];if(!f)return;self.uploadImage(f)};inp.click();
      self.showPlusPanel=false;
    },
    uploadImage: async function(file){
      var self=this;self.uploading=true;
      try{
        file=await compressImage(file);
        var fd=new FormData();fd.append("image",file);
        var r=await api("/upload/image",{method:"POST",body:fd});
        if(r.code===0&&r.data){
          var imgUrl=r.data.url;
          var msg={conversation_id:self.convId,sender_id:self.userId,content:imgUrl,type:1,_local:true,_sending:true,created_at:new Date().toISOString()};
          self.msgs.push(msg);self.addTimeDividers();Vue.nextTick(function(){self.scrollBottom()});
          var sr=await api("/chat/messages",{method:"POST",body:JSON.stringify({conversation_id:self.convId,content:imgUrl,type:1})});
          if(sr.code===0&&sr.data){
            var idx=self.msgs.indexOf(msg);if(idx>-1){self.msgs[idx].id=sr.data.id;self.msgs[idx]._sending=false}
          }else{msg._failed=true;msg._sending=false;toast(sr.message||"发送失败","terr")}
        }else{toast("上传失败","terr")}
      }catch(e){toast("上传失败","terr")}
      self.uploading=false;
    },
    toggleVoiceMode: function(){this.voiceMode=!this.voiceMode;this.showEmojiPanel=false;this.showPlusPanel=false;this.showGiftPanel=false;this.showStickerPanel=false;if(this.voiceMode)this.blurInput();var self=this;Vue.nextTick(function(){self._resizeBottom(true)})},
    insertEmoji: function(e){this.text+=e},
    // 表情键盘退格：删除最后一个完整字符（用 code point 切割，正确删除多字节 emoji）
    deleteEmoji: function(){
      var s=this.text;
      if(!s)return;
      var chars=Array.from(s);
      chars.pop();
      this.text=chars.join('');
    },
    // 收起软键盘（切面板时调用，避免键盘顶起面板）
    blurInput: function(){
      var self=this;
      // 标记即将打开面板，防止 blur 触发的 focus 事件误关面板
      self._openingPanel=true;
      var el=self.$refs.chatInput;
      if(el&&el.blur)el.blur();
      var self2=self;
      setTimeout(function(){self2._openingPanel=false},200);
    },
    // 输入框获得焦点：关闭已展开的面板，露出键盘；并校正键盘高度、强制钉底
    onInputFocus: function(){
      if(this._openingPanel)return;
      this.showEmojiPanel=false;this.showPlusPanel=false;this.showGiftPanel=false;this.showStickerPanel=false;
      var self=this;
      self._syncKbH();
      Vue.nextTick(function(){self._resizeBottom(true)});
    },
    togglePlus: function(){this.showPlusPanel=!this.showPlusPanel;this.showEmojiPanel=false;this.showGiftPanel=false;this.showStickerPanel=false;if(this.showPlusPanel)this.blurInput();var self=this;Vue.nextTick(function(){self._resizeBottom(true)})},
    toggleEmoji: function(){this.showEmojiPanel=!this.showEmojiPanel;this.showPlusPanel=false;this.showGiftPanel=false;this.showStickerPanel=false;if(this.showEmojiPanel)this.blurInput();var self=this;Vue.nextTick(function(){self._resizeBottom(true)})},
    startRecording: async function(e){
      var self=this;
      self.recordingCancel=false;self.recStartY=e&&e.changedTouches?e.changedTouches[0].clientY:null;
      try{
        var stream=await navigator.mediaDevices.getUserMedia({audio:true});
        self.mediaRecorder=new MediaRecorder(stream);self.audioChunks=[];
        self.mediaRecorder.ondataavailable=function(e){if(e.data.size>0)self.audioChunks.push(e.data)};
        self.mediaRecorder.onstop=function(){if(!self.recordingCancel)self.sendVoice()};
        self.mediaRecorder.start();self.recording=true;
        // 录音超过60秒自动停止（防止无限录音）
        self._recTimer=setTimeout(function(){if(self.recording){toast("录音已达60秒上限","tinfo");self.stopRecording()}},60000);
      }catch(e){toast("无法访问麦克风","terr")}
    },
    // 录音中移动：上滑>120px 标记取消（松手不发送）
    onRecMove: function(e){
      var self=this;
      if(!self.recording||self.recStartY===null)return;
      var y=e.changedTouches&&e.changedTouches[0]?e.changedTouches[0].clientY:self.recStartY;
      var dy=self.recStartY-y;
      self.recordingCancel=dy>120;
    },
    stopRecording: function(e){
      var self=this;if(self.mediaRecorder&&self.recording){self.mediaRecorder.stop();self.recording=false;
        self.mediaRecorder.stream.getTracks().forEach(function(t){t.stop()})}
      if(self._recTimer){clearTimeout(self._recTimer);self._recTimer=null}
      if(self.recordingCancel){toast("已取消发送","tinfo");self.audioChunks=[]}
    },
    sendVoice: async function(){
      var self=this;if(self.audioChunks.length===0)return;
      var blob=new Blob(self.audioChunks,{type:"audio/webm"});var dur=Math.round(blob.size/16000);
      try{
        var fd=new FormData();fd.append("voice",blob,"voice.webm");
        var r=await api("/upload/voice",{method:"POST",body:fd});
        if(r.code===0&&r.data){
          var msg={conversation_id:self.convId,sender_id:self.userId,content:"[语音]",type:2,_local:true,_sending:true,voice_url:r.data.url,voice_duration:dur,created_at:new Date().toISOString()};
          self.msgs.push(msg);self.addTimeDividers();Vue.nextTick(function(){self.scrollBottom()});
          var sr=await api("/chat/messages",{method:"POST",body:JSON.stringify({conversation_id:self.convId,content:"[语音]",type:2,voice_url:r.data.url,voice_duration:dur})});
          if(sr.code===0&&sr.data){
            var idx=self.msgs.indexOf(msg);if(idx>-1){self.msgs[idx].id=sr.data.id;self.msgs[idx]._sending=false}
          }else{msg._failed=true;msg._sending=false;toast(sr.message||"发送失败","terr")}
        }else{toast("语音上传失败","terr")}
      }catch(e){toast("语音上传失败","terr")}
    },
    onVoiceCall: function(){
      var self=this;self.showPlusPanel=false;
      if(self.calling){toast("你正在通话中","terr");return}
      if(!self.partnerId){toast("无法获取对方ID","terr");return}
      self.callType="voice";self.callPartnerId=self.partnerId;
      self.callPartnerName=self.partner.nickname||"对方";
      self.doCall();
    },
    doCall: function(){
      var self=this;
      if(!self.callPartnerId){toast("无法获取对方ID","terr");return}
      self.calling=true;self.callStatus="ringing";self.callDuration=0;
      self._callTimeout=setTimeout(function(){self.endCall("timeout")},30000);
      self._createPeer().then(function(pc){
        return pc.createOffer().then(function(offer){
          return pc.setLocalDescription(offer);
        }).then(function(){
          wsSend({type:"call_request",receiver_id:self.callPartnerId,call_type:self.callType,offer:pc.localDescription.sdp});
        });
      }).catch(function(){self.endCall();toast("无法建立通话","terr")});
    },
    acceptCall: function(){
      var self=this,d=self.incomingCall;
      if(!d)return;
      if(self._ringTimer){clearTimeout(self._ringTimer);self._ringTimer=null}
      self.callPartnerId=d.caller_id;self.callPartnerName=self.partner.nickname||"对方";
      self.callType=d.call_type||"voice";self._callId=d.call_id;
      self.showCallDialog=false;self.calling=true;self.callStatus="ringing";
      self._createPeer().then(function(pc){
        return pc.setRemoteDescription({type:"offer",sdp:d.offer})
          .then(function(){return pc.createAnswer()})
          .then(function(ans){return pc.setLocalDescription(ans).then(function(){return ans.sdp})});
      }).then(function(sdp){
        wsSend({type:"call_accept",caller_id:d.caller_id,call_id:d.call_id,channel_name:d.channel_name,sdp:sdp});
      }).catch(function(){self.endCall()});
    },
    rejectCall: function(reason){
      var self=this,d=self.incomingCall;
      if(!d)return;
      if(self._ringTimer){clearTimeout(self._ringTimer);self._ringTimer=null}
      self.showCallDialog=false;self.incomingCall=null;
      wsSend({type:"call_reject",caller_id:d.caller_id,call_id:d.call_id,reason:reason||""});
      self._resetCall();
    },
    _createPeer: function(){
      var self=this;
      var pc=new RTCPeerConnection({iceServers:[
        {urls:"stun:stun.l.google.com:19302"},
        {urls:"stun:stun1.l.google.com:19302"}
      ]});
      self._pc=pc;
      pc.onicecandidate=function(e){
        if(e.candidate)wsSend({type:"call_ice_candidate",peer_id:self.callPartnerId,candidate:e.candidate});
      };
      pc.ontrack=function(e){
        if(!self._remoteAudio){self._remoteAudio=new Audio();self._remoteAudio.autoplay=true}
        self._remoteAudio.srcObject=e.streams[0];
        self._remoteAudio.play().catch(function(){});
        self.callStatus="connected";self._startCallTimer();
      };
      return navigator.mediaDevices.getUserMedia({audio:true}).then(function(stream){
        self._localStream=stream;
        stream.getTracks().forEach(function(t){pc.addTrack(t,stream)});
        return pc;
      }).catch(function(){toast("无法访问麦克风","terr");throw new Error("no-mic")});
    },
    endCall: function(reason){
      var self=this;
      if(self._callTimeout){clearTimeout(self._callTimeout);self._callTimeout=null}
      wsSend({type:"call_end",peer_id:self.callPartnerId,call_id:self._callId||null,end_reason:reason||"hangup"});
      self._resetCall();
    },
    // 静音/取消静音（本地音轨）
    toggleMic: function(){
      var self=this;
      self.micMuted=!self.micMuted;
      if(self._localStream){
        var t=self._localStream.getAudioTracks();
        for(var i=0;i<t.length;i++)t[i].enabled=!self.micMuted;
      }
      toast(self.micMuted?"已静音":"已取消静音","tinfo");
    },
    // 扬声器/听筒切换（浏览器无系统级切换，用 remoteAudio.muted 做听筒近似）
    toggleSpeaker: function(){
      var self=this;
      self.speakerOn=!self.speakerOn;
      if(self._remoteAudio)self._remoteAudio.muted=!self.speakerOn;
      toast(self.speakerOn?"已切换扬声器":"已切换听筒","tinfo");
    },
    _resetCall: function(){
      var self=this;
      if(self.callTimer){clearInterval(self.callTimer);self.callTimer=null}
      if(self._ringTimer){clearTimeout(self._ringTimer);self._ringTimer=null}
      if(self._localStream){self._localStream.getTracks().forEach(function(t){t.stop()});self._localStream=null}
      if(self._pc){try{self._pc.close()}catch(e){}self._pc=null}
      if(self._remoteAudio){try{self._remoteAudio.srcObject=null}catch(e){}self._remoteAudio=null}
      self.calling=false;self.callStatus="";self.callType="";self.callPartnerId=0;
      self.callPartnerName="";self.showCallDialog=false;self.incomingCall=null;
      self._callId=null;self.callDuration=0;
    },
    _startCallTimer: function(){
      var self=this;
      if(self.callTimer)return;
      self.callDuration=0;
      self.callTimer=setInterval(function(){self.callDuration++},1000);
    },
    voiceSrc: function(url){
      if(!url)return url;
      if(url.indexOf("http://")===0||url.indexOf("https://")===0||url.indexOf("data:")===0)return url;
      if(url.charAt(0)==="/")return location.origin+url;
      return url;
    },
    playVoice: function(m){
      var self=this;
      if(!m||!m.voice_url){toast("语音文件不存在","terr");return}
      // 再次点击正在播放的语音：停止
      if(self.playingMsgId===m.id&&self._audio&&!self._audio.paused){self.stopVoice();return}
      self.stopVoice(); // 同一时间只播一条，先停旧的
      var a=new Audio(self.voiceSrc(m.voice_url));
      a.preload="metadata";
      a.playbackRate=self.voiceRate;
      self._audio=a;
      self.playingMsgId=m.id;self.voiceProgress=0;self.voicePlayTime=0;
      a.addEventListener("timeupdate",function(){
        if(a.duration&&isFinite(a.duration)){
          self.voiceProgress=Math.min(100,Math.round(a.currentTime/a.duration*100));
          self.voicePlayTime=Math.floor(a.currentTime);
        }
      });
      var done=function(){if(self.playingMsgId===m.id){self.playingMsgId=null;self.voiceProgress=0}}
      a.addEventListener("ended",done);
      a.addEventListener("error",function(){done();toast("语音播放失败，可能格式不受支持","terr")});
      a.play().catch(function(){done();toast("语音播放失败，请在点击后播放","terr")});
    },
    stopVoice: function(){
      var self=this;
      if(self._audio){try{self._audio.pause()}catch(e){}self._audio=null}
      self.playingMsgId=null;self.voiceProgress=0;self.voicePlayTime=0;
    },
    // 语音气泡长按：弹倍速选择
    onVoiceRateMenu: function(m){
      var self=this;
      var rates=[0.75,1,1.5,2];
      // 用当前消息的倍速快捷切换（循环：长按依次切 0.75→1→1.5→2）
      var idx=rates.indexOf(self.voiceRate);
      var next=rates[(idx+1)%rates.length];
      self.voiceRate=next;
      if(self._audio&&!self._audio.paused&&self.playingMsgId===m.id){self._audio.playbackRate=next}
      toast("倍速 "+next+"×","tinfo");
    },
    openGiftPanel: function(){
      var self=this;self.showPlusPanel=false;self.showGiftPanel=true;self.blurInput();
      Vue.nextTick(function(){self._resizeBottom(true)});
      if(self.gifts.length===0){
        self.giftLoading=true;
        api("/gifts/list").then(function(r){self.gifts=r.data||[]}).catch(function(){}).finally(function(){self.giftLoading=false});
      }
    },
    sendGift: async function(gift){
      var self=this;
      try{
        if(!self.callPartnerId){
          var cr=await api("/chat/conversations");
          var convs=cr.data||[];
          var c=convs.find(function(x){return x.id===self.convId});
          if(c)self.callPartnerId=c.other_user_id;
        }
        var r=await api("/gifts/send",{method:"POST",body:JSON.stringify({to_user_id:self.callPartnerId,gift_id:gift.id,conversation_id:self.convId})});
        if(r.code===0){
          // 落库为 type=6 礼物消息，接收方实时可见（经 /chat/messages + WS 推送）
          var sendMsg;
          try{
            sendMsg=await api("/chat/messages",{method:"POST",body:JSON.stringify({conversation_id:self.convId,content:"[礼物] "+gift.name,type:6,gift_data:JSON.stringify({gift_id:gift.id,name:gift.name,image:gift.image,price:gift.price})})});
          }catch(msgErr){}
          if(sendMsg&&sendMsg.data&&sendMsg.data.id){
            // 服务端已落库，直接展示返回消息
            self.msgs.push(sendMsg.data);self.addTimeDividers();Vue.nextTick(function(){self.scrollBottom()});
          }else{
            // 落库失败：降级为本地假消息（_local 标记，与旧行为一致）
            var msg={conversation_id:self.convId,sender_id:self.userId,content:"[礼物] "+gift.name,type:6,_local:true,gift_data:JSON.stringify(gift),created_at:new Date().toISOString()};
            self.msgs.push(msg);Vue.nextTick(function(){self.scrollBottom()});
          }
          self.showGiftPanel=false;toast("礼物已发送","tok");
        }else{toast(r.message||"发送失败","terr")}
      }catch(e){toast("发送失败","terr")}
    },
    // 贴纸面板（S21-C5）
    openStickerPanel: function(){
      var s=this;s.showPlusPanel=false;s.showEmojiPanel=false;s.showGiftPanel=false;s.showStickerPanel=true;s.blurInput();
      Vue.nextTick(function(){s._resizeBottom(true)});
      if(s.stickers.length===0){
        s.stickerLoading=true;
        var q="/stickers?category="+encodeURIComponent(s.stickerCat)+(s.stickerVipOnly?"&vip_only=1":"");
        api(q).then(function(r){s.stickers=r.data||[];s.stickersById={};s.stickers.forEach(function(x){s.stickersById[x.id]=x})}).catch(function(){}).finally(function(){s.stickerLoading=false});
      }
    },
    switchStickerCat: function(c){
      var s=this;s.stickerCat=c;s.stickers=[];s.openStickerPanel();
    },
    toggleStickerVip: function(){
      var s=this;s.stickerVipOnly=!s.stickerVipOnly;s.stickers=[];s.openStickerPanel();
    },
    stickerById: function(id){return this.stickersById[id]},
    sendSticker: async function(st){
      var s=this;
      var msg={conversation_id:s.convId,sender_id:s.userId,content:"[贴纸]",type:4,sticker_id:st.id,_local:true,_sending:true,created_at:new Date().toISOString()};
      s.msgs.push(msg);s.addTimeDividers();Vue.nextTick(function(){s.scrollBottom()});
      try{
        var r=await api("/chat/messages",{method:"POST",body:JSON.stringify({conversation_id:s.convId,content:"[贴纸]",type:4,sticker_id:st.id})});
        if(r.code===0&&r.data){
          var i=s.msgs.indexOf(msg);
          if(i>-1){s.msgs[i].id=r.data.id;s.msgs[i]._sending=false}
          s.showStickerPanel=false;
        }else{msg._failed=true;msg._sending=false;toast(r.message||"发送失败","terr")}
      }catch(e){msg._failed=true;msg._sending=false;toast("发送失败","terr")}
    },
    // 根据对方已读时间戳，将我方已读前的消息标记为已读（展示"已读"）
    _applyReadState: function(){
      var self=this;
      if(!self.partnerReadTs)return;
      var ts=new Date(self.partnerReadTs).getTime();
      self.msgs.forEach(function(m){
        if(m.sender_id===self.userId&&m.id&&!m._local){
          var mt=new Date(m.created_at).getTime();
          if(mt<=ts&&!m._read){m._read=true;m.delivered=true}
        }
      });
    },
    handleWs: function(d){
      var self=this;      if(d.type==="message"&&d.data&&d.data.conversation_id===self.convId){        if(!d.data.id&&!d.data._local)return;
        if(self.msgs.some(function(m){return m.id&&m.id===d.data.id}))return;
        self.msgs.push(d.data);self.addTimeDividers();Vue.nextTick(function(){self.scrollBottom()});
        // 对方送的礼物：顶部挂5s banner，点击定位该气泡
        if(d.data.type===6&&d.data.sender_id!==self.userId&&d.data.content){
          self.giftBanner=d.data.content;
          if(self._giftTimer)clearTimeout(self._giftTimer);
          self._giftTimer=setTimeout(function(){self.giftBanner=null},5000);
        }
        // 收到对方消息时播放提示音（不打扰自己发送的消息确认）
        if(d.data.sender_id!==self.userId&&window.NotificationUtils){
          window.NotificationUtils.playSound("message");
        }
        api("/chat/mark-read",{method:"POST",body:JSON.stringify({conversation_id:self.convId})}).catch(function(){});
        // 发送已读回执给对方
        self.sendReadReceipt();
      }
      // 对方正在输入
      if(d.type==="typing"&&d.data&&d.data.user_id===self.partnerId){
        self.partnerTyping=true;
        if(self._typingTimer)clearTimeout(self._typingTimer);
        self._typingTimer=setTimeout(function(){self.partnerTyping=false},3000);
      }
      if(d.type==="stop_typing"&&d.data&&d.data.user_id===self.partnerId){
        self.partnerTyping=false;
      }
      // 对方在线状态实时更新
      if(d.type==="online_status"&&d.data&&d.data.user_id===self.partnerId){
        self.partner.online=!!d.data.online;
      }
      // 对方已读回执：将对方已读前的我方消息标记为已读
      if(d.type==="read_receipt"&&d.data&&d.data.conversation_id===self.convId){
        self.partnerReadTs=d.data.timestamp||new Date().toISOString();
        self._applyReadState();
      }
      if(d.type==="message_sent"&&d.data){
        var idx=-1;for(var i=self.msgs.length-1;i>=0;i--){if(self.msgs[i]._local&&self.msgs[i]._sending&&self.msgs[i].content===d.data.content){idx=i;break}}
        if(idx>-1){var m=self.msgs[idx];m.id=d.data.id;m._sending=false;m.delivered=!!d.data.delivered}
      }
      if(d.type==="message_recalled"&&d.data){
        var recalled=self.msgs.find(function(m){return m.id===d.data.message_id});
        if(recalled){recalled.content="对方撤回了一条消息";recalled._recalled=true;recalled.type=99}
      }
      if(d.type==="message_blocked"&&d.data){
        var bm=self.msgs.find(function(m){return m._sending&&m._local&&!m.id});
        if(bm){bm._failed=true;bm._sending=false}
        toast(d.data.reason||"消息发送被拦截","terr");
      }
      if(d.type==="call_request"&&d.data){
        // 忙线：已在通话中收到新来电，自动拒绝并带原因，对方会看到"对方正在通话中"
        if(self.calling){
          wsSend({type:"call_reject",caller_id:d.data.caller_id,call_id:d.data.call_id,reason:"对方正在通话中"});
          return;
        }
        self.incomingCall=d.data;self.showCallDialog=true;
        self._callId=d.data.call_id;
        // 30s 未接自动取消接听框（不主动发信令，避免双方重复挂断）
        self._ringTimer=setTimeout(function(){self.rejectCall("no_answer")},30000);
      }
      if(d.type==="call_initiated"&&d.data){self._callId=d.data.call_id}
      if(d.type==="call_accepted"&&d.data){
        if(self._callTimeout)clearTimeout(self._callTimeout);
        self.callType=d.data.call_type||self.callType;
        // 接听方应答 SDP 通过 WS 回传，设置远端描述后连接建立（计时交给 ontrack）
        if(self._pc&&d.data.sdp){
          self._pc.setRemoteDescription({type:"answer",sdp:d.data.sdp}).catch(function(){});
        }
      }
      if(d.type==="ice_candidate"&&d.data&&self._pc){
        self._pc.addIceCandidate(d.data.candidate).catch(function(){});
      }
      if(d.type==="call_error"&&d.data){
        if(self._callTimeout){clearTimeout(self._callTimeout);self._callTimeout=null}
        toast(d.data.message||"通话失败","terr");self._resetCall();
      }
      if(d.type==="call_rejected"||d.type==="call_user_offline"){
        if(self._callTimeout){clearTimeout(self._callTimeout);self._callTimeout=null}
        var _reason=d.type==="call_user_offline"?"对方不在线":(d.data&&d.data.reason||"对方已拒绝");
        self._resetCall();toast(_reason,"terr");
      }
      if(d.type==="call_blocked"&&d.data){
        if(self._callTimeout){clearTimeout(self._callTimeout);self._callTimeout=null}
        self._resetCall();toast(d.data.reason||"无法发起通话","terr");
      }
      if(d.type==="call_ended"){
        var _dur=d.data&&d.data.duration?d.data.duration:null;
        self._resetCall();
        if(_dur>0){var _m=Math.floor(_dur/60),_s=_dur%60;toast("通话时长 "+_m+":"+("0"+_s).slice(-2),"tinfo")}
      }
    }
  },
  mounted: function(){
    var self=this;
    self._scrollFn=function(){self.onScroll()};
    self._wsHandler=function(d){self.handleWs(d)};
    uiState.hideHdr=true;
    self.myAvatar=localStorage.getItem("uavatar")||"";
    if(!self.myAvatar){api("/user/info").then(function(r){if(r.data&&r.data.avatar){self.myAvatar=r.data.avatar;localStorage.setItem("uavatar",r.data.avatar)}}).catch(function(){})}
    self.loadPartner();
    Vue.nextTick(function(){self.load()});
    wsOn("message",self._wsHandler);
    wsOn("message_sent",self._wsHandler);
    wsOn("message_recalled",self._wsHandler);
    wsOn("message_blocked",self._wsHandler);
    wsOn("call_request",self._wsHandler);
    wsOn("call_accepted",self._wsHandler);
    wsOn("call_rejected",self._wsHandler);
    wsOn("call_user_offline",self._wsHandler);
    wsOn("call_blocked",self._wsHandler);
    wsOn("call_ended",self._wsHandler);
    wsOn("call_initiated",self._wsHandler);
    wsOn("ice_candidate",self._wsHandler);
    wsOn("call_error",self._wsHandler);
    wsOn("typing",self._wsHandler);
    wsOn("stop_typing",self._wsHandler);
    wsOn("online_status",self._wsHandler);
    wsOn("read_receipt",self._wsHandler);
    Vue.nextTick(function(){var el=self.$refs.chat;if(el){el.addEventListener("scroll",self._scrollFn)}});
    // 键盘弹出/收起时跟随调整（visualViewport 兜底）
    if(window.visualViewport){
      self._vvFn=function(){self._onViewportResize()};
      window.visualViewport.addEventListener("resize",self._vvFn);
      window.visualViewport.addEventListener("scroll",self._vvFn);
    }
    // 转场动画结束后校正键盘高度并钉底，避免进入页面时输入框偶发被键盘遮挡/不显示
    self._enterFixTimer=setTimeout(function(){self._syncKbH();self._resizeBottom(true)},350);
  },
  beforeUnmount: function(){
    uiState.hideHdr=false;
    wsOff("message",this._wsHandler);
    wsOff("message_sent",this._wsHandler);
    wsOff("message_recalled",this._wsHandler);
    wsOff("message_blocked",this._wsHandler);
    wsOff("call_request",this._wsHandler);
    wsOff("call_accepted",this._wsHandler);
    wsOff("call_rejected",this._wsHandler);
    wsOff("call_user_offline",this._wsHandler);
    wsOff("call_blocked",this._wsHandler);
    wsOff("call_ended",this._wsHandler);
    wsOff("call_initiated",this._wsHandler);
    wsOff("ice_candidate",this._wsHandler);
    wsOff("call_error",this._wsHandler);
    wsOff("typing",this._wsHandler);
    wsOff("stop_typing",this._wsHandler);
    wsOff("online_status",this._wsHandler);
    wsOff("read_receipt",this._wsHandler);
    // 离开页面时若还在通话中，通知对方挂断；停止语音播放
    if(this.calling){this.endCall()}
    this.stopVoice();
    if(this.callTimer)clearInterval(this.callTimer);
    if(this._callTimeout)clearTimeout(this._callTimeout);
    if(this._ringTimer)clearTimeout(this._ringTimer);
    if(this._scrollBottomTimer)clearTimeout(this._scrollBottomTimer);
    if(this._resizeBottomTimer)clearTimeout(this._resizeBottomTimer);
    if(this._enterFixTimer)clearTimeout(this._enterFixTimer);
    if(this._localStream){this._localStream.getTracks().forEach(function(t){t.stop()})}
    var el=this.$refs.chat;if(el&&this._scrollFn)el.removeEventListener("scroll",this._scrollFn);
    if(window.visualViewport&&this._vvFn){
      window.visualViewport.removeEventListener("resize",this._vvFn);
      window.visualViewport.removeEventListener("scroll",this._vvFn);
    }
  },
  // keep-alive 恢复时（实际未缓存聊天详情，兜底）刷新未读数
  activated: function(){try{if(this.$root&&this.$root.loadUnreadCount)this.$root.loadUnreadCount()}catch(e){}},
  template: `<div :style="{display:'flex',flexDirection:'column',height:'100%',background:'#EDEDED',paddingBottom:kbH+'px',overflow:'hidden'}">
    <div class="chat-hdr">
      <button class="bk" @click="$router.back()">‹</button>
      <div style="flex:1;min-width:0;cursor:pointer" @click="partnerId&&$router.push('/user/'+partnerId)">
        <div class="nm">{{partner.nickname||"加载中..."}}</div>
        <div class="st" :class="{on:partner.online}">{{partnerTyping?"对方正在输入...":(partner.online?"● 在线":"离线")}}</div>
      </div>
    </div>
    <div v-if="giftBanner" style="background:linear-gradient(135deg,#FFD700,#FF8E53);color:#fff;padding:10px 16px;font-size:14px;font-weight:600;text-align:center;cursor:pointer;flex-shrink:0;z-index:99" @click="scrollToGift">🎁 TA 送了你 {{giftBanner}}</div>
    <div v-if="calling" style="position:fixed;top:0;left:0;right:0;bottom:0;background:linear-gradient(160deg,#1a1a2e,#16213e);z-index:100;display:flex;flex-direction:column;align-items:center;justify-content:center;color:#fff">
      <div style="width:88px;height:88px;border-radius:50%;background:rgba(255,255,255,.15);display:flex;align-items:center;justify-content:center;font-size:44px;margin-bottom:16px">{{callType==="video"?"📹":"📞"}}</div>
      <div style="font-size:22px;font-weight:600;margin-bottom:6px">{{callPartnerName||"通话中"}}</div>
      <div style="font-size:14px;opacity:.65;margin-bottom:8px">{{callStatus==="connected"?"通话中":"正在呼叫..."}}</div>
      <div v-if="callStatus==='connected'" style="font-size:14px;opacity:.65;margin-bottom:40px">{{Math.floor(callDuration/60)}}:{{("0"+(callDuration%60)).slice(-2)}}</div>
      <div v-else style="font-size:14px;opacity:.65;margin-bottom:40px">{{callPartnerName||"对方"}} 响铃中...</div>
      <div style="display:flex;gap:24px;align-items:center">
        <button @click="toggleMic" :style="{width:'52px',height:'52px',borderRadius:'50%',border:'none',fontSize:'22px',cursor:'pointer',background:micMuted?'#fff':'rgba(255,255,255,.15)',boxShadow:'0 4px 12px rgba(0,0,0,.3)'}">🎙️</button>
        <button @click="endCall" style="width:64px;height:64px;border-radius:50%;background:#ff4757;border:none;font-size:26px;cursor:pointer;box-shadow:0 4px 16px rgba(255,71,87,.4)">📞</button>
        <button @click="toggleSpeaker" :style="{width:'52px',height:'52px',borderRadius:'50%',border:'none',fontSize:'22px',cursor:'pointer',background:speakerOn?'#fff':'rgba(255,255,255,.15)',boxShadow:'0 4px 12px rgba(0,0,0,.3)'}">🔊</button>
      </div>
    </div>
    <div v-if="showCallDialog" style="position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,.75);z-index:100;display:flex;align-items:center;justify-content:center">
      <div style="background:#fff;border-radius:20px;padding:32px 28px;width:280px;text-align:center">
        <div style="font-size:56px;margin-bottom:12px">{{incomingCall&&incomingCall.call_type==="video"?"📹":"📞"}}</div>
        <div style="font-size:18px;font-weight:600;margin-bottom:4px">{{incomingCall&&incomingCall.call_type==="video"?"视频通话":"语音通话"}}</div>
        <div style="font-size:13px;color:var(--tm);margin-bottom:28px">对方邀请你通话</div>
        <div style="display:flex;gap:24px;justify-content:center">
          <button @click="rejectCall" style="width:60px;height:60px;border-radius:50%;background:#ff4757;border:none;font-size:24px;cursor:pointer">📞</button>
          <button @click="acceptCall" style="width:60px;height:60px;border-radius:50%;background:#2ed573;border:none;font-size:24px;cursor:pointer">📞</button>
        </div>
      </div>
    </div>
    <div ref="chat" style="flex:1;min-height:0;overflow-y:auto;padding:12px 12px;-webkit-overflow-scrolling:touch;background:#EDEDED">
      <div v-if="loadingMore" style="text-align:center;padding:8px"><div class="spin" style="width:20px;height:20px;border-width:2px"></div></div>
      <div v-if="!hasMore&&msgs.length>0" style="text-align:center;padding:8px;font-size:12px;color:var(--tm)">没有更多消息了</div>
      <div v-if="loading" style="text-align:center;padding:48px"><div class="spin"></div></div>
      <div v-else-if="err&&msgs.length===0" class="empty" style="padding:48px 24px"><div style="font-size:48px;margin-bottom:12px">😵</div><div style="color:var(--ts);margin-bottom:16px;font-size:14px">{{errMsg}}</div><button class="btn bp bs" @click="load()">重试</button></div>
      <div v-else-if="msgs.length===0" class="empty" style="padding:64px 24px"><div class="ei">💬</div><div class="et">开始聊天吧</div><div class="ed">发送第一条消息，开启你们的对话</div></div>
      <div v-else>
        <div v-for="m in msgs" :key="m.id?m.id:('k'+Math.random())">
          <div v-if="m._timeGroup" class="time-divider">{{m._timeGroup}}</div>
          <div v-if="m.type===99" class="msg-sy">{{m.content}}</div>
          <div v-else-if="m.type===6" class="msg-sy">
            <div style="font-size:16px">🎁 {{m.content}}</div>
          </div>
          <div v-else-if="m.type===4" class="msg-row" :style="{flexDirection:m.sender_id===userId?'row-reverse':'row'}">
            <div class="avatar"><img loading="lazy" v-if="avatarOf(m)" :src="avatarOf(m)"><span v-else>👤</span></div>
            <div :class="['msg-b',m.sender_id===userId?'msg-my':'msg-ot']">
              <img loading="lazy" v-if="stickerById(m.sticker_id)&&stickerById(m.sticker_id).url" :src="stickerById(m.sticker_id).url" style="width:100px;height:100px;object-fit:contain">
              <div v-else style="font-size:52px;text-align:center">🎨</div>
              <div v-if="m._sending" class="mstate"><span style="color:var(--tm)">⏳</span></div>
              <div v-else-if="m._failed" class="mstate err">发送失败</div>
            </div>
          </div>
          <div v-else class="msg-row" :style="{flexDirection:m.sender_id===userId?'row-reverse':'row'}">
            <div class="avatar"><img loading="lazy" v-if="avatarOf(m)" :src="avatarOf(m)"><span v-else>👤</span></div>
            <div v-if="m.type===1" :class="['msg-b',m.sender_id===userId?'msg-my':'msg-ot']">
              <img loading="lazy" :src="m.content" class="msg-img" style="max-width:200px;border-radius:6px;display:block" @load="scrollBottom" @click="preview.open([m.content],0)">
              <div v-if="m._sending" class="mstate"><span style="color:var(--tm)">⏳</span></div>
            </div>
            <div v-else-if="m.type===2" :class="['msg-b',m.sender_id===userId?'msg-my':'msg-ot']" @click="playVoice(m)" @contextmenu.prevent="onVoiceRateMenu(m)" style="cursor:pointer;position:relative">
              <div style="display:flex;align-items:center;gap:8px">
                <svg v-if="playingMsgId===m.id" viewBox="0 0 24 24" style="width:22px;height:22px;flex-shrink:0" :style="{fill:'none',stroke:m.sender_id===userId?'#fff':'#4a4a4a',strokeWidth:1.8,strokeLinecap:'round',strokeLinejoin:'round'}"><line x1="4" y1="9" x2="4" y2="15"></line><line x1="9" y1="4" x2="9" y2="20"></line><line x1="14" y1="9" x2="14" y2="15"></line><line x1="19" y1="4" x2="19" y2="20"></line></svg>
                <svg v-else viewBox="0 0 24 24" style="width:22px;height:22px;flex-shrink:0" :style="{fill:'none',stroke:m.sender_id===userId?'#fff':'#4a4a4a',strokeWidth:1.8,strokeLinecap:'round',strokeLinejoin:'round'}"><path d="M11 5L6 9H3v6h3l5 4V5z"></path><path d="M15.5 8.5a5 5 0 0 1 0 7"></path></svg>
                <span style="font-size:16px">{{playingMsgId===m.id?voicePlayTime:(m.voice_duration||0)}}″</span>
              </div>
              <div v-if="playingMsgId===m.id" style="position:absolute;left:8px;right:8px;bottom:3px;height:3px;border-radius:2px;background:rgba(255,255,255,.25)">
                <div :style="{width:voiceProgress+'%',height:'100%',background:m.sender_id===userId?'#fff':'#2ed573',borderRadius:'2px'}"></div>
              </div>
              <div v-if="m._sending" class="mstate"><span style="color:var(--tm)">⏳</span></div>
              <div v-else-if="m._failed" class="mstate err">发送失败</div>
            </div>
            <div v-else :class="['msg-b',m.sender_id===userId?'msg-my':'msg-ot']">
              <div style="font-size:15px;white-space:pre-wrap;word-break:break-word">{{m.content}}</div>
              <div v-if="m._sending" class="mstate"><span style="color:var(--tm)">⏳</span></div>
              <div v-else-if="m.sender_id===userId&&m.id&&!m._local" class="mstate read"><span>{{m._read?"已读":(m.delivered?"已送达":"")}}</span></div>
            </div>
          </div>
        </div>
      </div>
    </div>
    <div style="background:#F7F7F7;border-top:1px solid #E2E2E2;padding:8px 10px;display:flex;align-items:center;gap:8px;padding-bottom:calc(8px + env(safe-area-inset-bottom,0px));flex-shrink:0">
      <button @pointerdown.prevent="toggleVoiceMode" style="border:none;background:none;padding:0 2px;flex-shrink:0;cursor:pointer;width:40px;height:40px;display:flex;align-items:center;justify-content:center">
        <svg v-if="!voiceMode" viewBox="0 0 24 24" style="width:28px;height:28px;fill:none;stroke:#1a1a1a;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round"><rect x="9" y="2" width="6" height="12" rx="3"></rect><path d="M5 10v1a7 7 0 0 0 14 0v-1"></path><line x1="12" y1="18" x2="12" y2="22"></line><line x1="8" y1="22" x2="16" y2="22"></line></svg>
        <svg v-else viewBox="0 0 24 24" style="width:28px;height:28px;fill:none;stroke:#1a1a1a;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round"><rect x="6" y="4" width="12" height="16" rx="2"></rect><path d="M8 11h8"></path></svg>
      </button>
      <button v-if="voiceMode" @touchstart.prevent="startRecording($event)" @touchmove.prevent="onRecMove($event)" @touchend.prevent="stopRecording" @touchcancel.prevent="stopRecording" @pointerdown.prevent="startRecording($event)" @pointermove.prevent="onRecMove($event)" @pointerup.prevent="stopRecording" @pointerleave="stopRecording" style="flex:1;height:40px;border-radius:6px;border:1px solid #ddd;font-size:17px;cursor:pointer;color:#1a1a1a;transition:background .15s" :style="{background:recordingCancel?'#ffd1d1':(recording?'#e0e0e0':'#fff'),color:recordingCancel?'#ff4757':'#1a1a1a'}">{{recordingCancel?'松手取消发送':(recording?'上滑取消·松开发送':'按住说话')}}</button>
      <div v-else style="flex:1;border-radius:6px;display:flex;align-items:center;background:#fff;border:1px solid #E5E5E5">
        <input ref="chatInput" v-model="text" placeholder="输入消息..." @keydown.enter="sendMsg" @input="sendTyping" @blur="sendStopTyping" @focus="onInputFocus" style="flex:1;border:none;background:none;outline:none;padding:9px 12px;font-size:17px">
      </div>
      <button v-if="!voiceMode&&text.trim()" @pointerdown.prevent="sendMsg" style="border:none;background:var(--primary);color:#fff;border-radius:5px;padding:9px 15px;font-size:16px;flex-shrink:0;cursor:pointer;font-weight:500">发送</button>
      <button v-if="!voiceMode&&!text.trim()" @pointerdown.prevent="toggleEmoji" style="border:none;background:none;padding:0 2px;flex-shrink:0;cursor:pointer;width:40px;height:40px;display:flex;align-items:center;justify-content:center">
        <svg viewBox="0 0 24 24" style="width:28px;height:28px;fill:none;stroke:#1a1a1a;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round"><circle cx="12" cy="12" r="9.2"></circle><path d="M8.5 14.5c1 1.3 2.1 2 3.5 2s2.5-.7 3.5-2"></path><line x1="9" y1="9" x2="9.01" y2="9"></line><line x1="15" y1="9" x2="15.01" y2="9"></line></svg>
      </button>
      <button v-if="!voiceMode&&!text.trim()" @pointerdown.prevent="togglePlus" style="border:none;background:none;padding:0 2px;flex-shrink:0;cursor:pointer;width:40px;height:40px;display:flex;align-items:center;justify-content:center">
        <svg viewBox="0 0 24 24" style="width:28px;height:28px;fill:none;stroke:#1a1a1a;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round"><circle cx="12" cy="12" r="9.2"></circle><line x1="12" y1="8.4" x2="12" y2="15.6"></line><line x1="8.4" y1="12" x2="15.6" y2="12"></line></svg>
      </button>
    </div>
    <div v-if="showGiftPanel" style="background:#fff;border-top:1px solid #E2E2E2;padding:12px;max-height:220px;overflow-y:auto;flex-shrink:0">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
        <span style="font-size:14px;font-weight:600">送礼物</span>
        <button @click="showGiftPanel=false" style="border:none;background:none;font-size:16px;cursor:pointer;color:var(--tm)">✕</button>
      </div>
      <div v-if="giftLoading" style="text-align:center;padding:16px"><div class="spin" style="width:20px;height:20px;border-width:2px"></div></div>
      <div v-else-if="gifts.length===0" style="text-align:center;padding:16px;color:var(--tm);font-size:13px">暂无礼物</div>
      <div v-else style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px">
        <div v-for="g in gifts" :key="g.id" @click="sendGift(g)" style="display:flex;flex-direction:column;align-items:center;padding:10px 4px;background:var(--bg-page);border-radius:12px;cursor:pointer">
          <span style="font-size:28px">{{g.image||"🎁"}}</span>
          <span style="font-size:12px;margin-top:4px">{{g.name}}</span>
          <span style="font-size:10px;color:var(--tm)">{{g.price}}币</span>
        </div>
      </div>
    </div>
    <div v-if="showStickerPanel" style="background:#fff;border-top:1px solid #E2E2E2;padding:12px;max-height:220px;overflow-y:auto;flex-shrink:0">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
        <span style="font-size:14px;font-weight:600">🎨 贴纸</span>
        <button @click="showStickerPanel=false" style="border:none;background:none;font-size:16px;cursor:pointer;color:var(--tm)">✕</button>
      </div>
      <div style="display:flex;gap:8px;margin-bottom:10px">
        <button class="btn bs" :class=\"stickerCat===''?'bp':'bo'\" style="font-size:12px;padding:4px 12px" @click="switchStickerCat('')">全部</button>
        <button class="btn bs" :class=\"stickerCat==='表情'?'bp':'bo'\" style="font-size:12px;padding:4px 12px" @click="switchStickerCat('表情')">表情</button>
        <button class="btn bs" :class=\"stickerCat==='动作'?'bp':'bo'\" style="font-size:12px;padding:4px 12px" @click="switchStickerCat('动作')">动作</button>
        <button class="btn bs" :class=\"stickerCat==='礼物'?'bp':'bo'\" style="font-size:12px;padding:4px 12px" @click="switchStickerCat('礼物')">礼物</button>
        <button class="btn bs" :class=\"stickerCat==='VIP专属'?'bp':'bo'\" style="font-size:12px;padding:4px 12px" @click="switchStickerCat('VIP专属')">VIP专属</button>
      </div>
      <div v-if="stickerLoading" style="text-align:center;padding:16px"><div class="spin" style="width:20px;height:20px;border-width:2px"></div></div>
      <div v-else-if="stickers.length===0" style="text-align:center;padding:16px;color:var(--tm);font-size:13px">暂无贴纸</div>
      <div v-else style="display:grid;grid-template-columns:repeat(5,1fr);gap:8px">
        <div v-for="s in stickers" :key="s.id" @click="sendSticker(s)" style="display:flex;align-items:center;justify-content:center;padding:8px 4px;background:var(--bg-page);border-radius:12px;cursor:pointer">
          <img loading="lazy" :src="s.url" :alt="s.name" style="width:50px;height:50px;object-fit:contain">
        </div>
      </div>
    </div>
    <div v-if="showEmojiPanel" style="position:relative;height:220px;flex-shrink:0">
      <div style="position:absolute;top:0;left:0;right:0;bottom:0;overflow-y:auto;background:#f7f7f7;border-top:1px solid #E2E2E2;padding:10px 8px;padding-right:64px">
        <div style="display:grid;grid-template-columns:repeat(8,1fr);gap:2px">
          <button v-for="e in emojis" :key="e" @click="insertEmoji(e)" style="border:none;background:none;font-size:26px;padding:6px 0;cursor:pointer;border-radius:6px">{{e}}</button>
        </div>
      </div>
      <button @pointerdown.prevent="deleteEmoji" style="position:absolute;right:12px;bottom:12px;width:52px;height:52px;border:none;background:#fff;border-radius:12px;cursor:pointer;box-shadow:0 2px 10px rgba(0,0,0,.14);display:flex;align-items:center;justify-content:center" aria-label="删除">
        <svg viewBox="0 0 24 24" style="width:28px;height:28px;fill:#666"><path d="M22 3H7c-.69 0-1.23.35-1.59.88L0 12l5.41 8.11c.36.53.9.89 1.59.89h15a2 2 0 002-2V5a2 2 0 00-2-2zm-3 12.59L17.59 17 14 13.41 10.41 17 9 15.59 12.59 12 9 8.41 10.41 7 14 10.59 17.59 7 19 8.41 15.41 12z"/></svg>
      </button>
    </div>
    <div v-if="showPlusPanel" style="background:#f7f7f7;border-top:1px solid #E2E2E2;padding:16px 8px;flex-shrink:0">
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:14px 8px">
        <div @click="onImagePick" style="display:flex;flex-direction:column;align-items:center;gap:6px;cursor:pointer">
          <div style="width:62px;height:62px;border-radius:12px;background:#fff;display:flex;align-items:center;justify-content:center;font-size:30px;box-shadow:0 1px 3px rgba(0,0,0,.08)">🖼️</div>
          <span style="font-size:12px;color:#666">相册</span>
        </div>
        <div @click="onCameraCapture" style="display:flex;flex-direction:column;align-items:center;gap:6px;cursor:pointer">
          <div style="width:62px;height:62px;border-radius:12px;background:#fff;display:flex;align-items:center;justify-content:center;font-size:30px;box-shadow:0 1px 3px rgba(0,0,0,.08)">📸</div>
          <span style="font-size:12px;color:#666">拍摄</span>
        </div>
        <div @click="onVoiceCall" style="display:flex;flex-direction:column;align-items:center;gap:6px;cursor:pointer">
          <div style="width:62px;height:62px;border-radius:12px;background:#fff;display:flex;align-items:center;justify-content:center;font-size:30px;box-shadow:0 1px 3px rgba(0,0,0,.08)">📞</div>
          <span style="font-size:12px;color:#666">语音通话</span>
        </div>
        <div @click="openGiftPanel" style="display:flex;flex-direction:column;align-items:center;gap:6px;cursor:pointer">
          <div style="width:62px;height:62px;border-radius:12px;background:#fff;display:flex;align-items:center;justify-content:center;font-size:30px;box-shadow:0 1px 3px rgba(0,0,0,.08)">🎁</div>
          <span style="font-size:12px;color:#666">礼物</span>
        </div>
        <div @click="openStickerPanel" style="display:flex;flex-direction:column;align-items:center;gap:6px;cursor:pointer">
          <div style="width:62px;height:62px;border-radius:12px;background:#fff;display:flex;align-items:center;justify-content:center;font-size:30px;box-shadow:0 1px 3px rgba(0,0,0,.08)">🎨</div>
          <span style="font-size:12px;color:#666">贴纸</span>
        </div>
      </div>
    </div>
  </div>`
};

var CheckinPage = {
  data: function(){return {status:null,tasks:[],checking:false,loading:true,weekNames:["日","一","二","三","四","五","六"]}},
  methods: {
    load: async function(){
      this.loading=true;
      try{var r=await api("/checkin/status");this.status=r.data||{}}catch(e){}
      try{var t=await api("/checkin/tasks");this.tasks=t.data||[]}catch(e){}
      this.loading=false;
    },
    doCheckin: async function(){
      var self=this;
      if(self.checking)return;
      self.checking=true;
      try{
        var r=await api("/checkin",{method:"POST",body:"{}"});
        if(r.code===0){
          if(window.NotificationUtils){
            window.NotificationUtils.showToast(r.message||'签到成功！获得'+r.data.reward+'金币','success');
          } else { toast(r.message||("签到成功！+"+r.data.reward+"金币"),"tok"); }
          self.load();
        }else{
          if(window.NotificationUtils){
            window.NotificationUtils.showToast(r.message||'签到失败','error');
          } else { toast(r.message||"签到失败","terr"); }
        }
      }catch(e){
        if(window.NotificationUtils){
          window.NotificationUtils.showToast(e.message||'签到失败','error');
        } else { toast(e.message||"签到失败","terr"); }
      }
      self.checking=false;
    },
    // 生成最近7天日期列表（含今日）
    last7Days: function(){
      var arr=[];
      var now=new Date();
      for(var i=6;i>=0;i--){
        var d=new Date(now);d.setDate(d.getDate()-i);
        arr.push({date:("0"+(d.getMonth()+1)).slice(-2)+"-"+("0"+d.getDate()).slice(-2),week:d.getDay()});
      }
      return arr;
    },
    // 某天是否已签到
    checkedOn: function(dayStr){
      var s=this.status;
      if(!s||!s.history||!s.history.length)return false;
      return s.history.some(function(h){
        if(!h.checkin_date)return false;
        var d=String(h.checkin_date).slice(5,10);
        return d===dayStr;
      });
    },
    taskDone: function(t){return t.completed}
  },
  mounted: function(){this.load()},
  template: `<div style="padding:16px">
    <div style="background:linear-gradient(135deg,#FF5E7D,#FF8E8E);color:#fff;border-radius:var(--r);padding:24px;text-align:center;margin-bottom:16px">
      <div style="font-size:40px">📅</div>
      <div style="font-size:18px;font-weight:600;margin:8px 0">每日签到</div>
      <div v-if="status" style="font-size:14px;opacity:.9;margin-bottom:16px">已连续签到 <b style="font-size:22px">{{status.streak||0}}</b> 天</div>
      <button class="btn bw" :style="{background:status&&status.today_checked_in?'rgba(255,255,255,.35)':'#fff',color:'#ff5e7d',border:'none',padding:'10px 36px',borderRadius:'24px',fontSize:'15px',fontWeight:'600',cursor:'pointer'}" @click="doCheckin" :disabled="checking||(status&&status.today_checked_in)">{{status&&status.today_checked_in?'今日已签到':'立即签到'}}</button>
      <div style="font-size:12px;opacity:.8;margin-top:10px">连续签到第7天最高可得 5+14=19金币</div>
    </div>
    <div v-if="loading" style="text-align:center;padding:24px"><div class="spin"></div></div>
    <div v-else>
      <div style="background:var(--w);border-radius:var(--rs);box-shadow:var(--sh);padding:16px;margin-bottom:16px">
        <div style="font-size:15px;font-weight:600;margin-bottom:12px">最近7天</div>
        <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:6px">
          <div v-for="day in last7Days()" :key="day.date" style="text-align:center">
            <div style="font-size:11px;color:var(--tm)">{{day.week==0||day.week==6?'周末':weekNames[day.week]}}</div>
            <div :style="{width:'34px',height:'34px',lineHeight:'34px',borderRadius:'50%',margin:'4px auto 0',fontSize:'13px',background:checkedOn(day.date)?'linear-gradient(135deg,#FF6B9D,#FF8E53)':'var(--bg-page)',color:checkedOn(day.date)?'#fff':'var(--tm)'}">{{checkedOn(day.date)?'✓':day.date.slice(3)}}</div>
          </div>
        </div>
      </div>
      <div style="background:var(--w);border-radius:var(--rs);box-shadow:var(--sh);padding:16px">
        <div style="font-size:15px;font-weight:600;margin-bottom:12px">每日任务</div>
        <div v-if="tasks.length===0" style="text-align:center;color:var(--tm);font-size:13px;padding:16px">暂无任务</div>
        <div v-for="t in tasks" :key="t.key" style="display:flex;align-items:center;gap:12px;padding:12px 0;border-bottom:1px solid var(--b)">
          <div :style="{width:'40px',height:'40px',borderRadius:'12px',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'20px',background:t.completed?'linear-gradient(135deg,#FF6B9D,#FF8E53)':'var(--bg-page)'}">{{t.completed?'✅':'🎯'}}</div>
          <div class="flex1">
            <div style="font-size:14px;font-weight:500">{{t.name}}</div>
            <div style="font-size:12px;color:var(--tm);margin-top:2px">{{t.progress||0}}/{{t.max}}</div>
          </div>
          <span :style="{fontSize:'12px',fontWeight:'600',color:t.completed?'var(--s)':'var(--p)'}">+{{t.reward}}金币</span>
        </div>
      </div>
    </div>
  </div>`
};

var MyPage = {
  name:"MyPage",
  data: function(){return {user:null,social:{guarding:0,following:0,fans:0,viewers:0},loading:true,hasLoaded:false}},
  methods: {
    load: async function(){this.loading=true;try{var ur=await api("/user/info");this.user=ur.data;if(this.user){localStorage.setItem("uname",this.user.nickname||"");if(this.user.avatar)localStorage.setItem("uavatar",this.user.avatar)}}catch(e){}try{var sr=await api("/user/social-counts");if(sr.data)this.social=sr.data}catch(e){}this.loading=false;this.hasLoaded=true},
    logout: function(){if(!window.confirm("确定退出登录？登录态与本地缓存将一并清除"))return;localStorage.clear();try{ws&&ws.close()}catch(e){}this.$router.replace("/login");toast("已退出登录","tinfo")}
  },
  mounted: function(){this.load()},
  // keep-alive 缓存恢复时静默刷新用户信息/钱包余额/社交计数
  activated: function(){if(this.hasLoaded)this.load()},
  template: `<div><div style="background:linear-gradient(135deg,#FF5E7D,#FF8E8E);color:#fff;padding:16px 20px 24px;position:relative"><div style="position:absolute;top:12px;right:16px;background:rgba(0,0,0,.25);color:#fff;padding:4px 12px;border-radius:14px;font-size:13px;font-weight:600;cursor:pointer" @click="$router.push('/edit-profile')">✏️ 编辑资料</div><div style="display:flex;align-items:center;gap:16px"><div class="avatar av-lg" style="border:3px solid rgba(255,255,255,.5);cursor:pointer" @click="user&&user.avatar&&preview.open([fmtImg(user.avatar)],0)"><img loading="lazy" v-if="user&&user.avatar" :src="fmtImg(user.avatar)"><span v-else>👤</span></div><div style="flex:1;cursor:pointer" @click="$router.push('/edit-profile')"><div style="font-size:20px;font-weight:600">{{user?user.nickname:'加载中...'}}</div><div style="font-size:13px;opacity:.8;margin-top:4px">{{user&&user.bio?user.bio:'写下个性签名让大家更了解你'}}</div></div><span v-if="user&&user.is_vip" style="background:rgba(255,255,255,.3);color:#fff;padding:4px 12px;border-radius:12px;font-size:12px">👑VIP</span></div><div style="display:flex;gap:16px;margin-top:16px;padding-top:16px;border-top:1px solid rgba(255,255,255,.2)"><div style="flex:1;text-align:center" @click.stop="$router.push('/recharge')"><div style="font-size:22px;font-weight:700">💰</div><div style="font-size:11px;opacity:.8">充值</div></div><div style="flex:1;text-align:center"><div style="font-size:22px;font-weight:700">{{user&&user.age?user.age+'岁':'-'}}</div><div style="font-size:11px;opacity:.8">{{user&&user.location?user.location:'设置位置'}}</div></div></div><div style="display:flex;gap:8px;margin-top:14px"><div style="flex:1;text-align:center;background:rgba(255,255,255,.16);border-radius:12px;padding:10px 2px;cursor:pointer" @click.stop="$router.push('/guarding')"><div style="font-size:18px;font-weight:700">{{social.guarding||0}}</div><div style="font-size:11px;opacity:.85">守护</div></div><div style="flex:1;text-align:center;background:rgba(255,255,255,.16);border-radius:12px;padding:10px 2px;cursor:pointer" @click.stop="$router.push('/following')"><div style="font-size:18px;font-weight:700">{{social.following||0}}</div><div style="font-size:11px;opacity:.85">关注</div></div><div style="flex:1;text-align:center;background:rgba(255,255,255,.16);border-radius:12px;padding:10px 2px;cursor:pointer" @click.stop="$router.push('/fans')"><div style="font-size:18px;font-weight:700">{{social.fans||0}}</div><div style="font-size:11px;opacity:.85">粉丝</div></div><div style="flex:1;text-align:center;background:rgba(255,255,255,.16);border-radius:12px;padding:10px 2px;cursor:pointer" @click.stop="$router.push('/viewers')"><div style="font-size:18px;font-weight:700">{{social.viewers||0}}</div><div style="font-size:11px;opacity:.85">访客</div></div></div></div><div v-if="loading" style="text-align:center;padding:32px"><div class="spin"></div></div><div v-else style="padding:12px 16px"><div v-for="m in [{ico:'💰',label:'我的钱包',path:'/wallet'},{ico:'📅',label:'签到领金币',path:'/checkin'},{ico:'👑',label:'会员中心',path:'/vip'},{ico:'💎',label:'贵族装扮',path:'/noble'},{ico:'🌐',label:'圈子',path:'/community'},{ico:'🎮',label:'互动游戏',path:'/game'},{ico:'💝',label:'我的遇见',path:'/meet'},{ico:'⚙️',label:'设置',path:'/settings'}]" :key="m.path" @click="$router.push(m.path)" style="display:flex;align-items:center;padding:14px 16px;background:var(--w);border-radius:var(--rs);margin-bottom:6px;cursor:pointer;box-shadow:var(--sh)"><span style="font-size:20px;margin-right:12px">{{m.ico}}</span><span style="flex:1;font-size:15px">{{m.label}}</span><span style="color:var(--tm)">›</span></div><button class="btn bo bw" style="margin-top:12px;color:var(--e);border-color:var(--e)" @click="logout">退出登录</button></div></div>`
};

var EditProfilePage = {
  data: function(){return {form:{nickname:"",gender:null,age:null,height:null,occupation:"",location:"",birth_date:"",province:"",city:"",education:"",bio:"",tags:[]},avatarFile:null,avatarPreview:"",allTags:[],tagGroups:{},tagPanelVisible:false,draftTags:[],expandedCat:"",saving:false,photos:[],photoUploading:false,showOccOther:false,customOcc:"",pickerVisible:false,pickerTitle:"",pickerMode:"",pickerCols:[],pickerOnConfirm:null,errors:{}}},
  methods: {
    load: async function(){try{var r=await api("/user/info");var u=r.data;if(u){this.form.nickname=u.nickname||"";this.form.gender=u.gender;this.form.age=u.age;this.form.height=u.height;this.form.occupation=u.occupation||"";this.form.location=u.location||"";this.form.birth_date=fmtBirthDate(u.birth_date)||"";this.form.province=u.province||"";this.form.city=u.city||"";this.form.education=u.education||"";this.form.bio=u.bio||"";this.form.tags=(typeof u.tags==="string"?JSON.parse(u.tags):(u.tags||[]));this.avatarPreview=u.avatar||""}}catch(e){}try{var tr=await api("/user/tags");if(tr.data&&tr.data.length){this.allTags=tr.data;this.tagGroups={};tr.data.forEach(function(t){if(!t||!t.name)return;var c=t.category||"其他";if(!this.tagGroups[c])this.tagGroups[c]=[];this.tagGroups[c].push(t.name)}.bind(this))}}catch(e){this.allTags=["健身","跑步","瑜伽","篮球","游泳","旅行","美食","摄影","宠物","音乐","电影","游戏","读书","画画","滑雪","和平精英","王者荣耀","减肥超过20斤","大叔控","颜控"];this.tagGroups={"运动":["健身","跑步","瑜伽","篮球","游泳"],"生活":["旅行","美食","摄影","宠物","减肥超过20斤"],"娱乐":["音乐","电影","游戏","读书","画画","和平精英","王者荣耀"],"社交":["大叔控","颜控","萌妹","御姐","职场女","职场男"]}}try{var pr=await api("/user/photos");if(pr.data&&Array.isArray(pr.data))this.photos=pr.data}catch(e){}},
    onAvatar: function(e){var f=e.target.files[0];if(f){this.avatarFile=f;this.avatarPreview=URL.createObjectURL(f)}},
    openAvatarPreview: function(){if(this.avatarPreview)preview.open([fmtImg(this.avatarPreview)],0)},
    // ===== 兴趣标签弹层 =====
    // 打开弹层：以当前已选标签为草稿，默认展开第一个分类
    openTagPanel: function(){this.draftTags=(this.form.tags||[]).slice();var cats=Object.keys(this.tagGroups);this.expandedCat=(cats.length?cats[0]:"");this.tagPanelVisible=true;document.body.style.overflow="hidden"},
    // 弹层内点选：实时更新草稿（最多10个），确认时统一写回
    toggleTag: function(t){var i=this.draftTags.indexOf(t);if(i>-1)this.draftTags.splice(i,1);else if(this.draftTags.length<10)this.draftTags.push(t);else toast("最多选10个标签","tinfo")},
    // 分类横排切换：点击某分类仅展示该组点选（单选，不收起）
    toggleCat: function(cat){this.expandedCat=cat},
    // 统计某分类下已选标签数（弹层草稿维度）
    catSelected: function(cat){var n=0,tags=this.tagGroups[cat]||[];for(var i=0;i<tags.length;i++)if(this.draftTags.indexOf(tags[i])>-1)n++;return n?("已选"+n):""},
    // 确认：草稿写回 form.tags 并关闭
    confirmTags: function(){this.form.tags=this.draftTags.slice();this.closeTagPanel()},
    // 关闭弹层（取消不写回）
    closeTagPanel: function(){this.tagPanelVisible=false;this.expandedCat="";document.body.style.overflow=""},
    // ===== 相册管理 =====
    onPhotoPick: async function(e){
      var self=this,f=e.target.files[0];if(!f)return;
      self.photoUploading=true;
      try{
        f=await compressImage(f);
        var fd=new FormData();fd.append("photo",f);
        var r=await api("/user/photos",{method:"POST",body:fd});
        if(r.code===0){toast("上传成功","tok");var pr=await api("/user/photos");self.photos=pr.data||[]}
        else{toast(r.message||"上传失败","terr")}
      }catch(err){toast(err.message||"上传失败","terr")}
      self.photoUploading=false;e.target.value="";
    },
    deletePhoto: async function(p){
      if(!confirm("删除这张照片？"))return;
      try{var r=await api("/user/photos/"+p.id,{method:"DELETE"});if(r.code===0){this.photos=this.photos.filter(function(x){return x.id!==p.id});toast("已删除","tok")}}catch(e){toast(e.message,"terr")}
    },
    setCover: async function(p){
      try{var r=await api("/user/photos/"+p.id+"/cover",{method:"PUT",body:"{}"});if(r.code===0){this.photos.forEach(function(x){x.is_cover=(x.id===p.id)?1:0});toast("已设为封面","tok")}}catch(e){toast(e.message,"terr")}
    },
    saveOcc: function(){var v=this.customOcc.trim();if(v){this.form.occupation=v}this.showOccOther=false},
    // ===== 滚轮选择器 =====
    pickerOpen: function(mode,title,opts,onConfirm){
      // 兼容：若第3参是函数（date/province 无 opts），视为确认回调
      if(typeof opts==="function"){onConfirm=opts;opts=null}
      var self=this,curY=null,curM=null;
      if(mode==="date"){
        var now=new Date(),yr=now.getFullYear(),y,m,d;
        if(this.form.birth_date){var parts=this.form.birth_date.split("-");y=parseInt(parts[0]);m=parseInt(parts[1]);d=parseInt(parts[2])}else{y=yr-20;m=1;d=1}
        curY=y;curM=m;
        var yOpts=[];for(var yy=1940;yy<=yr;yy++)yOpts.push({v:String(yy),l:yy+"年"});
        var mOpts=[];for(var mm=1;mm<=12;mm++)mOpts.push({v:String(mm),l:mm+"月"});
        var dm=daysInMonth(y,m),dOpts=[];for(var dd=1;dd<=dm;dd++)dOpts.push({v:String(dd),l:dd+"日"});
        if(d>dm)d=dm;
        opts={year:{options:yOpts,value:String(y)},month:{options:mOpts,value:String(m)},day:{options:dOpts,value:String(d)}};
      }else if(mode==="province"){
        var provs=Object.keys(PROVINCE_CITY),prov=this.form.province||"北京",city=this.form.city||"";
        if(provs.indexOf(prov)<0)prov="北京";
        var cities=PROVINCE_CITY[prov]||[];if(cities.indexOf(city)<0)city=cities[0]||prov;
        opts={province:{options:provs.map(function(p){return {v:p,l:p}}),value:prov},city:{options:cities.map(function(c){return {v:c,l:c}}),value:city}};
      }else if(mode==="single"){
        var list=opts&&opts.list||[],cur=opts&&opts.value||"";
        opts={v:{options:list.map(function(x){return {v:x,l:x}}),value:cur}};
      }
      this.pickerMode=mode;this.pickerTitle=title;this.pickerOnConfirm=onConfirm;
      this.pickerCols=Object.keys(opts).map(function(k){return {key:k,options:opts[k].options,value:opts[k].value}});
      this._pickerVals={};var self2=this;this.pickerCols.forEach(function(c){self2._pickerVals[c.key]=c.value});
      this.pickerVisible=true;document.body.style.overflow="hidden";
      this.$nextTick(function(){self2.pickerCols.forEach(function(c){self2.snapCol(c.key)})});
    },
    pickerCancel: function(){this.pickerClose()},
    pickerConfirm: function(){var cb=this.pickerOnConfirm,vals={};var self=this;this.pickerCols.forEach(function(c){vals[c.key]=c.value});if(this._pickerVals){for(var k in this._pickerVals)vals[k]=this._pickerVals[k]}this.pickerClose();if(cb)cb(vals)},
    pickerClose: function(){this.pickerVisible=false;this.pickerMode="";this.pickerCols=[];this.pickerOnConfirm=null;this._pickerVals=null;document.body.style.overflow=""},
    snapCol: function(key){var el=this.$el.querySelector('[data-col="'+key+'"]');if(!el)return;var col=this._colOf(key);if(!col)return;var idx=Math.max(0,Math.min(col.options.length-1,this._idxOf(key)));el.scrollTop=idx*WHEEL_H},
    _colOf: function(key){var out=null;this.pickerCols.forEach(function(c){if(c.key===key)out=c});return out},
    _idxOf: function(key){var col=this._colOf(key),v=col?col.value:null;if(!col)return 0;for(var i=0;i<col.options.length;i++)if(String(col.options[i].v)===String(v))return i;return 0},
    onWheelTouchEnd: function(colKey,e){
      var el=e.currentTarget,self=this,col=this._colOf(colKey);if(!el||!col)return;
      var idx=Math.max(0,Math.min(col.options.length-1,Math.round((el.scrollTop+WHEEL_H/2)/WHEEL_H)));
      el.scrollTo({top:idx*WHEEL_H,behavior:"smooth"});
      col.value=col.options[idx].v;if(this._pickerVals)this._pickerVals[colKey]=col.value;
      this.onWheelChange(colKey);
    },
    wheelTap: function(colKey,opt){var self=this,col=this._colOf(colKey);if(!col)return;col.value=opt.v;if(this._pickerVals)this._pickerVals[colKey]=opt.v;this.snapCol(colKey);this.onWheelChange(colKey)},
    onWheelChange: function(colKey){
      var self=this,col=this._colOf(colKey);if(!col)return;
      if(this.pickerMode==="date"&&(colKey==="year"||colKey==="month")){
        var yCol=this._colOf("year"),mCol=this._colOf("month");
        var y=parseInt((this._pickerVals&&this._pickerVals.year)||(yCol&&yCol.value)||new Date().getFullYear());
        var m=parseInt((this._pickerVals&&this._pickerVals.month)||(mCol&&mCol.value)||1);
        var dayCol=this._colOf("day");if(!dayCol)return;
        var dm=daysInMonth(y,m),d=parseInt(dayCol.value||1);if(d>dm)d=dm;
        var dOpts=[];for(var dd=1;dd<=dm;dd++)dOpts.push({v:String(dd),l:dd+"日"});
        dayCol.options=dOpts;dayCol.value=String(d);if(this._pickerVals)this._pickerVals.day=String(d);
        this.$nextTick(function(){self.snapCol("day")});
      }else if(this.pickerMode==="province"&&colKey==="province"){
        var pCol=this._colOf("province");
        var prov=(this._pickerVals&&this._pickerVals.province)||(pCol&&pCol.value)||"北京";
        var cities=PROVINCE_CITY[prov]||[];var cityCol=this._colOf("city");if(!cityCol)return;
        var c=cityCol.value||"";if(cities.indexOf(c)<0)c=cities[0]||prov;
        cityCol.options=cities.map(function(x){return {v:x,l:x}});cityCol.value=c;if(this._pickerVals)this._pickerVals.city=c;
        this.$nextTick(function(){self.snapCol("city")});
      }
    },
    // 各字段确认回调
    pickBirth: function(vals){if(vals.year&&vals.month&&vals.day){var d=vals.year+"-"+pad2(parseInt(vals.month))+"-"+pad2(parseInt(vals.day));this.form.birth_date=d;this.form.age=calcAge(d)}},
    pickHeight: function(vals){if(vals.v)this.form.height=parseInt(vals.v)},
    pickHome: function(vals){if(vals.province){this.form.province=vals.province;this.form.city=vals.city;this.form.location=vals.city}},
    pickOcc: function(vals){if(vals.v){if(vals.v==="自定义"){this.showOccOther=true;this.$nextTick(function(){var el=document.querySelector("input[placeholder='输入你的职业']");if(el)el.focus()})}else{this.form.occupation=vals.v;this.showOccOther=false}}},
    pickEdu: function(vals){if(vals.v)this.form.education=vals.v},
    pickGender: function(vals){if(vals.v){this.form.gender=(vals.v==="男"?1:0);}},
    openGenderPicker: function(){var self=this;this.pickerOpen("single","性别",{list:["男","女"],value:this.form.gender===1?"男":(this.form.gender===0?"女":"男")},function(vals){self.pickGender(vals)})},
    openDatePicker: function(){var self=this;this.pickerOpen("date","出生日期",null,function(vals){self.pickBirth(vals)})},
    openHeightPicker: function(){var self=this;this.pickerOpen("single","身高",{list:function(){var a=[];for(var h=140;h<=220;h++)a.push(h+"cm");return a}(),value:this.form.height?this.form.height+"cm":""},function(vals){self.pickHeight(vals)})},
    openHomePicker: function(){var self=this;this.pickerOpen("province","家乡",null,function(vals){self.pickHome(vals)})},
    openOccPicker: function(){var self=this;this.pickerOpen("single","职业",{list:OCCUPATION_OPTS,value:this.form.occupation||""},function(vals){self.pickOcc(vals)})},
    openEduPicker: function(){var self=this;this.pickerOpen("single","学历",{list:EDU_OPTS,value:this.form.education||"本科"},function(vals){self.pickEdu(vals)})},
    save: async function(){
      // 字段级校验：昵称必填、身高范围
      var errs={};
      var nick=(this.form.nickname||"").trim();
      if(!nick)errs.nickname="昵称不能为空";
      else if(nick.length<2)errs.nickname="昵称至少2个字符";
      else if(nick.length>50)errs.nickname="昵称最多50个字符";
      if(this.form.height!==null&&this.form.height!==undefined&&this.form.height!==""&&(Number(this.form.height)<140||Number(this.form.height)>230))errs.height="身高需在140-230cm之间";
      this.errors=errs;
      if(Object.keys(errs).length>0){toast(Object.values(errs)[0],"terr");return}
      this.saving=true;try{if(this.avatarFile){var fd=new FormData();fd.append("avatar",this.avatarFile);var ar=await api("/user/avatar",{method:"POST",body:fd});if(ar.code===0&&ar.data)this.avatarPreview=ar.data.avatar}var derivedAge=this.form.birth_date?calcAge(this.form.birth_date):null;if(derivedAge!==null&&derivedAge<0)derivedAge=null;var d={nickname:nick,gender:this.form.gender,age:derivedAge!==null?derivedAge:(this.form.age?parseInt(this.form.age):null),birth_date:this.form.birth_date||null,height:this.form.height?parseInt(this.form.height):null,occupation:this.form.occupation,location:this.form.city||this.form.location,province:this.form.province||null,city:this.form.city||null,education:this.form.education||null,bio:this.form.bio,tags:this.form.tags};await api("/user/info",{method:"PUT",body:JSON.stringify(d)});toast("保存成功","tok");this.$router.back()}catch(e){toast(e.message,"terr")}this.saving=false}
  },
  mounted: function(){this.load()},
  template: `<div style="padding:16px">
  <!-- ===== 1. 头像 ===== -->
  <div style="text-align:center;margin-bottom:24px"><label style="cursor:pointer;display:inline-block"><div class="avatar av-lg" style="margin:0 auto;border:3px dashed var(--b)"><img loading="lazy" v-if="avatarPreview" :src="fmtImg(avatarPreview)"><span v-else style="font-size:36px">📷</span></div><input type="file" accept="image/*" style="display:none" @change="onAvatar"></label><p style="font-size:12px;color:var(--tm);margin-top:8px">点击更换头像<span v-if="avatarPreview" style="margin-left:8px;cursor:pointer;color:var(--p)" @click.stop.prevent="openAvatarPreview">👁 放大查看</span></p></div>
  <!-- ===== 2. 个人相册 ===== -->
  <div style="margin-bottom:20px"><div style="font-size:14px;font-weight:600;color:var(--ts);margin-bottom:8px">个人相册 ({{photos.length}}/9)</div><div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px"><div v-for="p in photos" :key="p.id" style="position:relative"><img loading="lazy" :src="p.url" style="width:100%;aspect-ratio:1;object-fit:cover;border-radius:8px" @click="preview.open(photos.map(function(x){return x.url}),photos.indexOf(p))"><span v-if="p.is_cover" style="position:absolute;left:4px;top:4px;background:rgba(255,94,125,.9);color:#fff;font-size:10px;padding:1px 6px;border-radius:8px">封面</span><div style="position:absolute;right:4px;bottom:4px;display:flex;gap:4px"><button v-if="!p.is_cover" @click="setCover(p)" style="background:rgba(0,0,0,.55);color:#fff;border:none;border-radius:6px;font-size:10px;padding:2px 6px;cursor:pointer">设封面</button><button @click="deletePhoto(p)" style="background:var(--e);color:#fff;border:none;border-radius:6px;font-size:10px;padding:2px 6px;cursor:pointer">删</button></div></div><label v-if="photos.length<9" style="width:100%;aspect-ratio:1;border:1px dashed var(--b);border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:28px;color:var(--tm);cursor:pointer"><span v-if="photoUploading" class="spin" style="width:20px;height:20px;margin:0"></span><span v-else>＋</span><input type="file" accept="image/*" style="display:none" @change="onPhotoPick"></label></div><p style="font-size:11px;color:var(--tm);margin-top:6px">最多9张照片，封面仅用于相册展示，与头像相互独立</p></div>
  <!-- ===== 3. 基本信息 ===== -->
  <div style="margin-bottom:20px"><div style="font-size:14px;font-weight:600;color:var(--ts);margin-bottom:8px">基本信息</div>
  <div style="margin-bottom:12px"><label style="font-size:13px;color:var(--ts);display:block;margin-bottom:6px">昵称</label><div class="inp" :style="errors.nickname?'border-color:var(--e)':''"><input v-model="form.nickname" placeholder="2-50个字符" maxlength="50"></div><p v-if="errors.nickname" style="font-size:11px;color:var(--e);margin-top:4px">{{errors.nickname}}</p></div>
  <div style="margin-bottom:12px"><div style="display:flex;align-items:center;gap:8px;cursor:pointer" @click="openGenderPicker"><label style="font-size:13px;color:var(--ts);flex:1;margin-bottom:0">性别</label><span style="font-size:14px" :style="{color:form.gender===0||form.gender===1?'var(--p)':'var(--tm)'}">{{form.gender===1?'男':(form.gender===0?'女':'请选择')}}</span><span style="font-size:11px;color:var(--tm)">›</span></div></div>
  <div style="margin-bottom:12px"><div style="display:flex;align-items:center;gap:8px;cursor:pointer" @click="openDatePicker"><label style="font-size:13px;color:var(--ts);flex:1;margin-bottom:0">出生日期</label><span style="font-size:14px" :style="{color:form.birth_date?'var(--p)':'var(--tm)'}">{{form.birth_date||'请选择'}}</span><span style="font-size:11px;color:var(--tm)">›</span></div></div>
  <div style="margin-bottom:12px"><div style="display:flex;align-items:center;gap:8px;cursor:pointer" @click="openHeightPicker"><label style="font-size:13px;color:var(--ts);flex:1;margin-bottom:0">身高</label><span style="font-size:14px" :style="{color:form.height?'var(--p)':'var(--tm)'}">{{form.height?form.height+'cm':'请选择'}}</span><span style="font-size:11px;color:var(--tm)">›</span></div><p v-if="errors.height" style="font-size:11px;color:var(--e);margin-top:4px">{{errors.height}}</p></div>
  <div style="margin-bottom:12px"><div style="display:flex;align-items:center;gap:8px;cursor:pointer" @click="openHomePicker"><label style="font-size:13px;color:var(--ts);flex:1;margin-bottom:0">家乡</label><span style="font-size:14px" :style="{color:form.city||form.location?'var(--p)':'var(--tm)'}">{{form.city||form.location||'请选择'}}</span><span style="font-size:11px;color:var(--tm)">›</span></div></div>
  <div style="margin-bottom:12px"><div style="display:flex;align-items:center;gap:8px;cursor:pointer" @click="openOccPicker"><label style="font-size:13px;color:var(--ts);flex:1;margin-bottom:0">职业</label><span style="font-size:14px" :style="{color:form.occupation?'var(--p)':'var(--tm)'}">{{form.occupation||'请选择'}}</span><span style="font-size:11px;color:var(--tm)">›</span></div><div v-if="showOccOther" style="display:flex;gap:8px;margin-top:8px"><div class="inp" class="flex1"><input v-model="customOcc" placeholder="输入你的职业"></div><button class="btn bp bs" @click="saveOcc">确定</button></div></div>
  <div style="margin-bottom:12px"><div style="display:flex;align-items:center;gap:8px;cursor:pointer" @click="openEduPicker"><label style="font-size:13px;color:var(--ts);flex:1;margin-bottom:0">学历</label><span style="font-size:14px" :style="{color:form.education?'var(--p)':'var(--tm)'}">{{form.education||'请选择'}}</span><span style="font-size:11px;color:var(--tm)">›</span></div></div>
  <div style="margin-bottom:12px"><label style="font-size:13px;color:var(--ts);display:block;margin-bottom:6px">个性签名</label><div class="inp"><input v-model="form.bio" placeholder="写一句话介绍自己" maxlength="500"></div></div></div>
  <!-- ===== 4. 兴趣标签（点击进入全屏弹层选择） ===== -->
  <div style="margin-bottom:24px"><div style="display:flex;align-items:center;gap:8px;cursor:pointer" @click="openTagPanel"><label style="font-size:13px;color:var(--ts);flex:1;margin-bottom:0">兴趣标签</label><span style="font-size:11px;color:var(--tm);margin-right:4px">已选{{form.tags.length}}/10</span><span style="font-size:11px;color:var(--tm)">›</span></div><div v-if="form.tags.length" style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px"><span v-for="t in form.tags" :key="t" class="tag tp">{{t}}</span></div></div>
  <button class="btn bp bw bl" @click="save" :disabled="saving">{{saving?'保存中...':'保存资料'}}</button>
  <!-- ===== 滚轮选择弹层 ===== -->
  <transition name="slide-up"><div v-if="pickerVisible" style="position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,.75);z-index:300;display:flex;flex-direction:column;justify-content:flex-end"><div class="flex1" @click.self="pickerCancel"></div><div style="background:#fff;border-radius:16px 16px 0 0;overflow:hidden;padding-bottom:env(safe-area-inset-bottom,0px)"><div style="display:flex;align-items:center;padding:12px 16px;border-bottom:1px solid var(--b)"><span style="font-size:14px;color:var(--tm);cursor:pointer" @click="pickerCancel">取消</span><span style="flex:1;text-align:center;font-size:16px;font-weight:600;color:var(--ts)">{{pickerTitle}}</span><span style="font-size:14px;color:var(--p);font-weight:600;cursor:pointer" @click="pickerConfirm">确定</span></div><div style="display:flex;height:220px;position:relative"><div style="position:absolute;left:0;right:0;top:50%;height:36px;transform:translateY(-50%);border-top:1px solid var(--b);border-bottom:1px solid var(--b);pointer-events:none"></div><div style="position:absolute;left:0;right:0;top:0;bottom:0;background:linear-gradient(180deg,#fff 0%,rgba(255,255,255,0) 38%,rgba(255,255,255,0) 62%,#fff 100%);pointer-events:none"></div><div v-for="col in pickerCols" :key="col.key" :data-col="col.key" style="flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch;scroll-behavior:smooth" @touchend.self="onWheelTouchEnd(col.key,$event)"><div style="height:92px"></div><div v-for="opt in col.options" :key="opt.v" @click="wheelTap(col.key,opt)" style="height:36px;line-height:36px;text-align:center;font-size:15px;font-weight:500" :style="{color:opt.v===col.value?'#000':'#B0B0B6'}">{{opt.l}}</div><div style="height:92px"></div></div></div></div></div></transition>
  <!-- ===== 兴趣标签全屏弹层 ===== -->
  <div v-if="tagPanelVisible" style="position:fixed;top:0;left:0;right:0;bottom:0;z-index:350;display:flex;flex-direction:column;background:var(--bg-page)"><div style="display:flex;align-items:center;padding:14px 16px;background:var(--w);border-bottom:1px solid var(--b);flex-shrink:0"><span style="font-size:14px;color:var(--tm);cursor:pointer" @click="closeTagPanel">取消</span><span style="flex:1;text-align:center;font-size:17px;font-weight:700;color:var(--ts)">选择兴趣标签</span><span style="width:28px"></span></div><div style="height:25vh;min-height:140px;overflow-y:auto;background:var(--w);border-bottom:1px solid var(--b);flex-shrink:0;padding:12px 16px;box-sizing:border-box"><div v-if="draftTags.length===0" style="height:100%;display:flex;align-items:center;justify-content:center;color:var(--tm);font-size:13px">点击下方标签选择你的兴趣，最多选10个</div><div v-else style="display:flex;gap:6px;flex-wrap:wrap;align-content:flex-start"><span v-for="t in draftTags" :key="t" class="tag tp">{{t}}</span></div></div><div style="display:flex;gap:8px;flex-shrink:0;overflow-x:auto;-webkit-overflow-scrolling:touch;padding:12px 16px;background:var(--w);border-bottom:1px solid var(--b)"><span v-for="cat in Object.keys(tagGroups)" :key="cat" @click="toggleCat(cat)" :style="{background:expandedCat===cat?'var(--p)':'var(--bg-page)',color:expandedCat===cat?'#fff':'var(--ts)',borderRadius:'18px',padding:'6px 16px',fontSize:'13px',fontWeight:'600',flexShrink:0,cursor:'pointer'}">{{cat}}<span v-if="catSelected(cat)" style="margin-left:4px;opacity:.85">({{catSelected(cat).replace('已选','')}})</span></span></div><div style="flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch;padding:16px;display:flex;gap:8px;flex-wrap:wrap;align-content:flex-start"><span v-for="t in (tagGroups[expandedCat]||[])" :key="t" :class=\"['tag',draftTags.includes(t)?'tp':'']\" style="cursor:pointer;border:1px solid var(--b);border-radius:16px;padding:8px 16px;font-size:14px" @click="toggleTag(t)">{{t}}</span></div><div style="flex-shrink:0;padding:12px 16px calc(12px + env(safe-area-inset-bottom,0px));background:var(--w);border-top:1px solid var(--b)"><button class="btn bp bw bl" @click="confirmTags">确认</button></div></div></div>`
};

var UserProfilePage = {
  data: function(){return {profile:null,loading:true,liking:false,matchModal:null,showReport:false,reportReason:"",posts:[],loadingPosts:false,guardBusy:false}},
  methods: {
    load: async function(){this.loading=true;try{var r=await api("/user/profile/"+this.$route.params.id);this.profile=r.data}catch(e){}this.loading=false;this.loadPosts()},
    loadPosts: async function(){var uid=this.$route.params.id;this.loadingPosts=true;try{var r=await api("/posts?user_id="+uid+"&limit=9");this.posts=(r.data||[]).map(function(p){p.images=p.images||[];return p})}catch(e){this.posts=[]}this.loadingPosts=false},
    genderText: function(g){return g===1?'男':(g===0?'女':(g===2?'保密':''))},
    toggleGuard: async function(){
      var u=this.profile;if(!u||this.guardBusy)return;
      this.guardBusy=true;
      try{
        var ep=u.is_guarded?"/user/unguard":"/user/guard";
        var r=await api(ep,{method:"POST",body:JSON.stringify({target_user_id:u.id})});
        if(r.code===0){u.is_guarded=!u.is_guarded;u.guarders_count=(u.guarders_count||0)+(u.is_guarded?1:-1);toast(u.is_guarded?"🛡️ 守护成功":"已取消守护","tok")}
        else toast(r.message||"操作失败","terr")
      }catch(e){toast(e.message||"操作失败","terr")}
      this.guardBusy=false;
    },
    greetOrChat: async function(){
      var u=this.profile;if(!u)return;
      // 检测是否已有会话
      var hasConv = u._has_conversation;
      if(!hasConv){
        try{
          var cr = await api("/chat/conversations",{method:"POST",body:JSON.stringify({other_user_id:u.id})});
          hasConv = cr.data && cr.data.id;
        }catch(e){}
      }
      if(hasConv){
        // 已有会话：直接跳转聊天
        try{var r=await api("/chat/conversations",{method:"POST",body:JSON.stringify({other_user_id:u.id})});if(r.data)this.$router.push("/chat/"+r.data.id)}catch(e){toast(e.message,"terr")}
      } else {
        // 没有会话：打招呼
        try{
          var convR=await api("/chat/conversations",{method:"POST",body:JSON.stringify({other_user_id:u.id})});
          if(!convR.data){toast("发起会话失败","terr");return}
          await api("/chat/messages",{method:"POST",body:JSON.stringify({conversation_id:convR.data.id,content:"Hi~ 很高兴认识你！",type:0})});
          toast("💬 已发送打招呼消息","tok");
        }catch(e){toast(e.message,"terr")}
      }
    },
    likeUser: async function(){
      var u=this.profile;if(!u||this.liking)return;
      this.liking=true;
      try{
        var r=await api("/match/like",{method:"POST",body:JSON.stringify({target_user_id:u.id})});
        if(r.code===0){
          if(r.data&&r.data.matched){
            this.matchModal={partner:r.data.partner||u,conversation_id:r.data.conversation_id,common_tags:r.data.common_tags||[],icebreakers:r.data.icebreakers||[]};
            if(window.NotificationUtils){
              window.NotificationUtils.showToast('💕 匹配成功！','match');
            } else { toast("💕 匹配成功！","tok"); }
          }else{toast(r.message||"已喜欢","tok")}
        }else{toast(r.message||"操作失败","terr")}
      }catch(e){toast(e.message||"操作失败","terr")}
      this.liking=false;
    },
    superLikeUser: async function(){
      var u=this.profile;if(!u||this.liking)return;
      this.liking=true;
      try{
        var r=await api("/match/super-like",{method:"POST",body:JSON.stringify({target_user_id:u.id})});
        if(r.code===0){toast("⭐ 超级喜欢成功","tok")}else{toast(r.message||"操作失败","terr")}
      }catch(e){toast(e.message||"操作失败","terr")}
      this.liking=false;
    },
    blockUser: async function(){
      var u=this.profile;if(!u)return;
      if(!window.confirm("确定要拉黑 "+(u.nickname||"TA")+" 吗？拉黑后将无法再收到TA的消息"))return;
      try{
        var r=await api("/block/add",{method:"POST",body:JSON.stringify({blocked_user_id:u.id})});
        if(r.code===0){toast("已拉黑","tok");this.$router.back()}else{toast(r.message||"拉黑失败","terr")}
      }catch(e){toast(e.message||"拉黑失败","terr")}
    },
    submitReport: async function(){
      var u=this.profile;if(!u)return;
      var reason=this.reportReason.trim();
      if(!reason){toast("请选择举报原因","tinfo");return}
      try{
        var r=await api("/report/submit",{method:"POST",body:JSON.stringify({reported_user_id:u.id,reason:reason})});
        if(r.code===0){toast("举报成功，我们会尽快处理","tok");this.showReport=false;this.reportReason=""}else{toast(r.message||"举报失败","terr")}
      }catch(e){toast(e.message||"举报失败","terr")}
    },
    closeMatchModal: function(){this.matchModal=null},
    goChat: function(convId){
      var self=this;
      self.matchModal=null;
      if(convId)self.$router.push("/chat/"+convId);
    }
  },
  mounted: function(){this.load()},
  template: `<div><div v-if="loading" style="text-align:center;padding:64px"><div class="spin"></div></div><div v-else-if="!profile" class="empty"><div class="ei">😕</div><div class="et">用户不存在</div></div><div v-else><div style="background:linear-gradient(135deg,var(--gradient-a),var(--gradient-b));color:#fff;padding:32px 20px 24px;text-align:center;position:relative"><button class="btn bs" :class=\"profile.is_guarded?'guard-on':'guard-off'\" style="position:absolute;top:14px;right:14px;padding:6px 16px;font-size:13px;border-radius:18px" @click="toggleGuard" :disabled="guardBusy">{{profile.is_guarded?'🛡️ 已守护':'🛡️ 守护'}}</button><div class="avatar av-lg" style="margin:0 auto;border:3px solid rgba(255,255,255,.5);cursor:pointer" @click="profile.avatar&&preview.open([fmtImg(profile.avatar)],0)"><img loading="lazy" v-if="profile.avatar" :src="fmtImg(profile.avatar)"><span v-else>👤</span></div><div style="font-size:22px;font-weight:600;margin-top:12px">{{profile.nickname}}</div><div style="font-size:13px;opacity:.85;margin-top:4px">{{profile.bio||'TA还没有写个性签名'}}</div></div><div style="margin:12px 16px;padding:16px;background:var(--w);border-radius:var(--rs);box-shadow:var(--sh)"><div style="font-size:14px;font-weight:600;color:var(--ts);margin-bottom:10px">基本信息</div><div style="display:flex;flex-wrap:wrap;gap:8px;font-size:14px"><span style="background:var(--bg-page);padding:6px 14px;border-radius:16px" v-if="profile.gender!==undefined&&profile.gender!==null">{{genderText(profile.gender)}}</span><span style="background:var(--bg-page);padding:6px 14px;border-radius:16px" v-if="profile.age">{{profile.age}}岁</span><span style="background:var(--bg-page);padding:6px 14px;border-radius:16px" v-if="profile.height">{{profile.height}}cm</span><span style="background:var(--bg-page);padding:6px 14px;border-radius:16px" v-if="profile.occupation">{{profile.occupation}}</span><span style="background:var(--bg-page);padding:6px 14px;border-radius:16px" v-if="profile.location">📍 {{profile.location}}</span></div></div><div style="margin:0 16px 12px;padding:14px 16px;background:var(--w);border-radius:var(--rs);box-shadow:var(--sh);cursor:pointer" @click="$router.push('/intimacy/'+profile.id)"><div style="display:flex;align-items:center"><span style="font-size:20px;margin-right:10px">💗</span><div class="flex1"><div style="font-size:14px;font-weight:600">亲密关系</div><div style="font-size:11px;color:var(--tm);margin-top:2px">查看你们的心动值、徽章与纪念日</div></div><span style="color:var(--tm)">›</span></div></div><div v-if="profile.tags&&profile.tags.length" style="margin:0 16px 12px;padding:16px;background:var(--w);border-radius:var(--rs);box-shadow:var(--sh)"><div style="font-size:14px;color:var(--ts);margin-bottom:8px">兴趣标签</div><div style="display:flex;gap:6px;flex-wrap:wrap"><span v-for="t in (typeof profile.tags==='string'?JSON.parse(profile.tags):profile.tags)" class="tag tp">{{t}}</span></div></div><div v-if="profile.photos&&profile.photos.length" style="margin:0 16px 12px;padding:16px;background:var(--w);border-radius:var(--rs);box-shadow:var(--sh)"><div style="font-size:14px;color:var(--ts);margin-bottom:8px">相册 ({{profile.photos.length}})</div><div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px"><img loading="lazy" v-for="(p,i) in profile.photos" :key="p.id||i" :src="p.url" style="width:100%;aspect-ratio:1;object-fit:cover;border-radius:8px" @click="preview.open(profile.photos.map(function(x){return x.url}),i)"></div></div><div style="margin:0 16px 12px;padding:16px;background:var(--w);border-radius:var(--rs);box-shadow:var(--sh)"><div style="font-size:14px;color:var(--ts);margin-bottom:8px">动态 ({{profile.posts_count||posts.length}})</div><div v-if="loadingPosts" style="text-align:center;padding:12px"><div class="spin" style="width:20px;height:20px;margin:0 auto 4px"></div></div><div v-else-if="posts.length===0" style="text-align:center;color:var(--tm);font-size:13px;padding:12px">TA还没有发布动态</div><div v-else v-for="p in posts" :key="p.id" class="card" style="padding:14px;margin-bottom:10px;cursor:pointer" @click="$router.push('/post/'+p.id)"><p v-if="p.content" style="font-size:14px;line-height:1.6;margin-bottom:8px">{{p.content}}</p><div v-if="p.images&&p.images.length" :style="{display:'grid',gridTemplateColumns:'repeat('+Math.min(p.images.length,3)+',1fr)',gap:4+'px',marginBottom:'8px'}"><img loading="lazy" v-for="(img,i) in p.images.slice(0,9)" :key="i" :src="img" style="width:100%;aspect-ratio:1;object-fit:cover;border-radius:6px" @click.stop="preview.open(p.images,i)"></div><div style="display:flex;gap:16px;font-size:12px;color:var(--tm)"><span>{{timeAgo(p.created_at)}}</span><span>❤️ {{p.like_count||0}}</span><span>💬 {{p.comment_count||0}}</span></div></div></div><div v-if="showReport" style="margin:0 16px 16px;padding:14px;background:var(--w);border-radius:var(--rs);box-shadow:var(--sh)">
    <div style="font-size:14px;font-weight:600;margin-bottom:10px">举报该用户</div>
    <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px"><span v-for="rr in ['骚扰','虚假资料','广告营销','违法违规','其他']" :key="rr" @click="reportReason=rr" :class=\"['tag',reportReason===rr?'tp':'']\" style="cursor:pointer;border:1px solid var(--b);border-radius:16px;padding:6px 12px;font-size:13px">{{rr}}</span></div>
    <button class="btn bp bs" style="width:100%" @click="submitReport" :disabled="!reportReason">提交举报</button>
  </div>
  <div v-if="matchModal" style="position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,.75);z-index:200;display:flex;align-items:center;justify-content:center">
    <div style="background:#fff;border-radius:20px;padding:28px 24px;width:300px;text-align:center;position:relative">
      <button @click="closeMatchModal" style="position:absolute;top:10px;right:14px;border:none;background:none;font-size:18px;cursor:pointer;color:var(--tm)">✕</button>
      <div style="position:relative;height:60px"><div class="heart-anim" style="font-size:40px;position:absolute;left:50%;top:0;transform:translateX(-50%)">💕</div><span v-for="n in 6" :key="'mh'+n" class="match-particle" :style="{left:(16+n*12)+'%',animationDelay:(n*0.15)+'s'}">❤️</span></div>
      <h2 style="margin:10px 0 4px">匹配成功！</h2>
      <p style="color:var(--tm);font-size:13px;margin-bottom:14px">你和{{matchModal.partner.nickname||'TA'}}互相喜欢</p>
      <div class="avatar av-lg" style="margin:0 auto 14px"><img loading="lazy" v-if="matchModal.partner.avatar" :src="matchModal.partner.avatar"><span v-else>👤</span></div>
      <div v-if="matchModal.common_tags&&matchModal.common_tags.length" style="display:flex;gap:6px;flex-wrap:wrap;justify-content:center;margin-bottom:14px"><span v-for="t in matchModal.common_tags" class="tag tp">{{t}}</span></div>
      <div v-if="matchModal.icebreakers&&matchModal.icebreakers.length" style="text-align:left;background:var(--bg-page);border-radius:12px;padding:12px;margin-bottom:16px">
        <div style="font-size:13px;font-weight:600;margin-bottom:6px">💬 破冰话题</div>
        <div v-for="ib in matchModal.icebreakers" style="font-size:13px;color:var(--ts);margin-bottom:4px">{{ib.content}}</div>
      </div>
      <button class="btn bp bw bl" @click="goChat(matchModal.conversation_id)">💬 打个招呼</button>
    </div>
  </div></div></div>`
};

// ==== 编辑资料页 滚轮选择器 常量 ====
var WHEEL_H=36; // 滚轮行高 px，与弹层模板 36px 行高强一致
var PROVINCE_CITY={北京:['北京'],上海:['上海'],天津:['天津'],重庆:['重庆'],广东:['广州','深圳','珠海','汕头','佛山','韶关','湛江','肇庆','江门','茂名','惠州','梅州','汕尾','河源','阳江','清远','东莞','中山','潮州','揭阳','云浮'],浙江:['杭州','宁波','温州','嘉兴','湖州','绍兴','金华','衢州','舟山','台州','丽水'],江苏:['南京','无锡','徐州','常州','苏州','南通','连云港','淮安','盐城','扬州','镇江','泰州','宿迁'],四川:['成都','自贡','攀枝花','泸州','德阳','绵阳','广元','遂宁','内江','乐山','南充','眉山','宜宾','广安','达州','雅安','巴中','资阳','阿坝','甘孜','凉山'],湖北:['武汉','黄石','十堰','宜昌','襄阳','鄂州','荆门','孝感','荆州','黄冈','咸宁','随州','恩施','仙桃','潜江','天门','神农架'],湖南:['长沙','株洲','湘潭','衡阳','邵阳','岳阳','常德','张家界','益阳','郴州','永州','怀化','娄底','湘西'],河南:['郑州','开封','洛阳','平顶山','安阳','鹤壁','新乡','焦作','濮阳','许昌','漯河','三门峡','南阳','商丘','信阳','周口','驻马店','济源'],陕西:['西安','铜川','宝鸡','咸阳','渭南','延安','汉中','榆林','安康','商洛'],福建:['福州','厦门','莆田','三明','泉州','漳州','南平','龙岩','宁德'],山东:['济南','青岛','淄博','枣庄','东营','烟台','潍坊','济宁','泰安','威海','日照','临沂','德州','聊城','滨州','菏泽'],辽宁:['沈阳','大连','鞍山','抚顺','本溪','丹东','锦州','营口','阜新','辽阳','盘锦','铁岭','朝阳','葫芦岛'],河北:['石家庄','唐山','秦皇岛','邯郸','邢台','保定','张家口','承德','沧州','廊坊','衡水'],安徽:['合肥','芜湖','蚌埠','淮南','马鞍山','淮北','铜陵','安庆','黄山','滁州','阜阳','宿州','六安','亳州','池州','宣城'],江西:['南昌','景德镇','萍乡','九江','新余','鹰潭','赣州','吉安','宜春','抚州','上饶'],山西:['太原','大同','阳泉','长治','晋城','朔州','晋中','运城','忻州','临汾','吕梁'],吉林:['长春','吉林','四平','辽源','通化','白山','松原','白城','延边'],黑龙江:['哈尔滨','齐齐哈尔','鸡西','鹤岗','双鸭山','大庆','伊春','佳木斯','七台河','牡丹江','黑河','绥化','大兴安岭'],贵州:['贵阳','六盘水','遵义','安顺','毕节','铜仁','黔西南','黔东南','黔南'],云南:['昆明','曲靖','玉溪','保山','昭通','丽江','普洱','临沧','楚雄','红河','文山','西双版纳','大理','德宏','怒江','迪庆'],甘肃:['兰州','嘉峪关','金昌','白银','天水','武威','张掖','平凉','酒泉','庆阳','定西','陇南','临夏','甘南'],青海:['西宁','海东','海北','黄南','海南','果洛','玉树','海西'],内蒙古:['呼和浩特','包头','乌海','赤峰','通辽','鄂尔多斯','呼伦贝尔','巴彦淖尔','乌兰察布','兴安','锡林郭勒','阿拉善'],广西:['南宁','柳州','桂林','梧州','北海','防城港','钦州','贵港','玉林','百色','贺州','河池','来宾','崇左'],宁夏:['银川','石嘴山','吴忠','固原','中卫'],新疆:['乌鲁木齐','克拉玛依','吐鲁番','哈密','昌吉','博尔塔拉','巴音郭楞','阿克苏','克孜勒苏','喀什','和田','伊犁','塔城','阿勒泰'],西藏:['拉萨','日喀则','昌都','林芝','山南','那曲','阿里'],海南:['海口','三亚','三沙','儋州','五指山','琼海','文昌','万宁','东方','定安','屯昌','澄迈','临高','白沙','昌江','乐东','陵水','保亭','琼中'],香港:['香港'],澳门:['澳门'],台湾:['台北','新北','桃园','台中','台南','高雄','基隆','新竹','嘉义','宜兰','花莲','台东','彰化','南投','云林','屏东','苗栗','澎湖']};
var OCCUPATION_OPTS=['程序员','产品经理','设计师','教师','医生','护士','工程师','销售','运营','公务员','学生','自由职业','自媒体','创业者','其他','自定义'];
var EDU_OPTS=['高中及以下','大专','本科','硕士','博士'];
function calcAge(bd){var t=new Date(bd+'T00:00:00'),n=new Date();if(isNaN(t.getTime()))return null;var a=n.getFullYear()-t.getFullYear(),m=n.getMonth()-t.getMonth();if(m<0||(m===0&&n.getDate()<t.getDate()))a--;return a}
function daysInMonth(y,m){return new Date(y,m,0).getDate()}
function pad2(n){return n<10?'0'+n:''+n}
// 防御性格式化出生日期：后端已保证返回 'YYYY-MM-DD'，此处兜底处理旧缓存可能的 UTC ISO 串
// （"1987-02-27T16:00:00.000Z"）或 DATETIME 串，取本地日历字段还原，避免回显乱码与回传校验失败
function fmtBirthDate(v){if(!v)return'';if(typeof v==='string'){var m=v.match(/^(\d{4})-(\d{2})-(\d{2})$/);if(m)return m[1]+'-'+m[2]+'-'+m[3];var d=new Date(v);if(!isNaN(d.getTime()))return d.getFullYear()+'-'+pad2(d.getMonth()+1)+'-'+pad2(d.getDate())}if(v instanceof Date&&!isNaN(v.getTime()))return v.getFullYear()+'-'+pad2(v.getMonth()+1)+'-'+pad2(v.getDate());return''}

var VipPage = {
  data: function(){return {pkgs:[],loading:false}},
  mounted: async function(){try{var r=await api("/vip/packages");this.pkgs=r.data||[]}catch(e){}},
  methods: {buy:async function(p){this.loading=true;try{var r=await api("/orders/vip",{method:"POST",body:JSON.stringify({package_id:p.id})});toast(r.message||"开通成功","tok");this.$router.push("/orders")}catch(e){toast(e.message,"terr")}this.loading=false}},
  template: `<div style="padding:20px"><div style="text-align:center;margin-bottom:24px"><div style="font-size:48px">👑</div><h2 style="margin-top:8px">遇见VIP</h2><p style="color:var(--tm);font-size:14px">解锁更多特权</p></div><div v-if="pkgs.length===0" style="text-align:center;color:var(--tm);padding:24px">暂无可购买套餐</div><div v-else v-for="p in pkgs" :key="p.id" style="background:var(--w);border-radius:var(--r);padding:20px;margin-bottom:12px;box-shadow:var(--sh);text-align:center"><div style="font-size:28px;font-weight:700;color:var(--p)">¥{{p.price}}</div><div style="font-size:15px;margin:8px 0">{{p.name}}</div><div style="font-size:13px;color:var(--tm);margin-bottom:16px">{{p.duration}}天</div><button class="btn bp bw" @click="buy(p)" :disabled="loading">立即开通（模拟支付）</button></div><div style="padding:16px;background:var(--w);border-radius:var(--rs);box-shadow:var(--sh);margin-top:16px"><h4 style="margin-bottom:8px">VIP特权</h4><p style="font-size:13px;color:var(--ts);line-height:2.2">✅ 查看更多推荐<br>✅ 高级筛选<br>✅ 查看谁喜欢了我<br>✅ 专属身份标识<br>✅ 无限制聊天</p></div></div>`
};

var RechargePage = {
  data: function(){return {amounts:[6,18,30,68,128,298],sel:null,loading:false,pay:"wechat"}},
  methods: {go:async function(){if(!this.sel){toast("请选择金额","tinfo");return}this.loading=true;try{var r=await api("/orders/recharge",{method:"POST",body:JSON.stringify({amount:this.sel})});toast("充值成功！获得"+r.data.coins+"金币","tok");this.sel=null}catch(e){toast(e.message,"terr")}this.loading=false}},
  template: `<div style="padding:20px"><div style="text-align:center;margin-bottom:24px"><div style="font-size:48px">💰</div><h2>金币充值</h2><p style="color:var(--tm);font-size:13px">1元=100金币</p></div><div style="display:grid;grid-template-columns:1fr 1fr;gap:12px"><div v-for="a in amounts" :key="a" @click="sel=a" :style="{background:sel===a?'var(--p)':'var(--w)',color:sel===a?'#fff':'var(--t)',padding:'20px',borderRadius:'var(--r)',textAlign:'center',cursor:'pointer',border:'2px solid '+(sel===a?'var(--p)':'var(--b)'),transition:'all .2s'}"><div style="font-size:24px;font-weight:700">¥{{a}}</div><div :style=\"{fontSize:'12px',marginTop:'4px',color:sel===a?'rgba(255,255,255,.8)':'var(--tm)'}\">{{a*100}}金币</div></div></div><div style="display:flex;gap:12px;margin-top:20px"><button class="btn bs" :class=\"pay==='wechat'?'bp':'bo'\" @click=\"pay='wechat'\" class="flex1">💚微信</button><button class="btn bs" :class=\"pay==='alipay'?'bp':'bo'\" @click=\"pay='alipay'\" class="flex1">💙支付宝</button></div><button class="btn bp bw bl" style="margin-top:20px" @click="go" :disabled="loading||!sel">{{loading?'处理中...':'确认支付 ¥'+(sel||0)}}</button><p style="text-align:center;color:var(--tm);font-size:11px;margin-top:12px">当前为模拟支付，公测期间不会真实扣款</p></div>`
};

// ==== 我的订单（S23 预留，展示历史订单） ====
var OrdersPage = {
  data: function(){return {orders:[],loading:true,err:false}},
  methods: {
    load: async function(){
      var s=this;s.loading=true;s.err=false;
      try{var r=await api("/orders/list?limit=50");s.orders=r.data||[]}catch(e){s.err=true}
      s.loading=false;
    },
    statusText: function(st){return st===1?"已支付":st===2?"已取消":"待支付"},
    statusColor: function(st){return st===1?"var(--s)":st===2?"var(--tm)":"#F6D365"},
    fmtTime: function(t){if(!t)return"";try{return new Date(t).toLocaleString("zh-CN")}catch(e){return t}}
  },
  mounted: function(){this.load()},
  template: `<div style="padding:16px">
    <div style="text-align:center;margin-bottom:16px"><div style="font-size:44px">🧾</div><h2 style="margin:6px 0">我的订单</h2><p style="color:var(--tm);font-size:13px">VIP开通与金币充值的记录</p></div>
    <div v-if="loading" style="text-align:center;padding:32px"><div class="spin"></div></div>
    <div v-else-if="err" class="empty"><div class="ei">😵</div><div class="et">加载失败</div><button class="btn bp bs" @click="load">重试</button></div>
    <div v-else-if="orders.length===0" class="empty"><div class="ei">📭</div><div class="et">暂无订单</div><div class="ed">开通VIP或充值后记录会显示在这里</div></div>
    <div v-else v-for="o in orders" :key="o.id" style="background:var(--w);border-radius:var(--rs);padding:14px;margin-bottom:8px;box-shadow:var(--sh)">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <div style="font-weight:600">¥{{o.amount}}</div>
        <span :style="{fontSize:'12px',fontWeight:'600',color:statusColor(o.status)}">{{statusText(o.status)}}</span>
      </div>
      <div style="font-size:12px;color:var(--tm);margin-top:6px">单号：{{o.order_no}}</div>
      <div style="font-size:12px;color:var(--tm);margin-top:2px">{{fmtTime(o.created_at)}}</div>
    </div>
  </div>`
};

var SettingsPage = {
  methods: {clearCache:function(){try{localStorage.clear();if(typeof caches!=="undefined")caches.keys().then(function(k){k.forEach(function(c){caches.delete(c)})});toast("缓存已清除","tok")}catch(e){toast("清除失败","terr")}}},
  template: `<div style="padding:12px 16px"><div v-for="item in [{i:'🛡️',l:'认证中心',p:'/verification'},{i:'🚫',l:'黑名单',p:'/blocklist'},{i:'🔒',l:'账号安全',p:'/account-security'},{i:'🔔',l:'消息通知',p:'/notifications'},{i:'❓',l:'帮助与反馈',p:'/help'},{i:'📄',l:'关于我们',d:APP_VERSION+' 公测版'},{i:'🗑️',l:'注销账号',p:'/deactivate'}]" :key="item.l" @click="item.p&&$router.push(item.p)" style="display:flex;align-items:center;padding:14px 16px;background:var(--w);border-radius:var(--rs);margin-bottom:6px;box-shadow:var(--sh);cursor:pointer"><span style="font-size:20px;margin-right:12px">{{item.i}}</span><div class="flex1"><div style="font-size:15px">{{item.l}}</div><div v-if="item.d" style="font-size:12px;color:var(--tm)">{{item.d}}</div></div><span style="color:var(--tm)">{{item.p?'›':''}}</span></div><button class="btn bo bw" style="margin-top:16px" @click="clearCache">清除缓存</button></div>`
};

var VerificationPage = {
  data: function(){return {status:null,loading:true,realName:{real_name:"",id_card_number:"",id_card_front_url:"",id_card_back_url:""},education:{school_name:"",education_level:"本科",graduation_year:2020,education_cert_url:""},vehicle:{car_brand:"",car_model:"",driving_license_url:""},submitting:""}},
  methods: {
    load: async function(){
      this.loading=true;
      try{var r=await api("/verification/status");this.status=r.data||{}}catch(e){}
      this.loading=false;
    },
    typeStatus: function(type){
      var s=this.status;
      if(!s||!s.verifications||!s.verifications[type])return "none";
      return s.verifications[type].status;
    },
    statusText: function(st){
      return st==="approved"?"已认证":st==="pending"?"审核中":st==="rejected"?"未通过":"未认证";
    },
    statusColor: function(st){
      return st==="approved"?"var(--s)":st==="pending"?"#F6D365":st==="rejected"?"var(--e)":"var(--tm)";
    },
    // 通用图片上传：先 POST /api/upload/image 拿 URL，供认证提交 body 使用
    uploadImage: async function(file){
      var fd=new FormData();fd.append("image",file);
      var r=await api("/upload/image",{method:"POST",body:fd});
      if(r.code===0&&r.data)return r.data.url;
      throw new Error(r.message||"上传失败");
    },
    onIdCardFront: async function(e){var f=e.target.files[0];if(!f)return;try{this.realName.id_card_front_url=await this.uploadImage(f);toast("身份证正面已上传","tok")}catch(err){toast(err.message,"terr")}e.target.value="";},
    onIdCardBack: async function(e){var f=e.target.files[0];if(!f)return;try{this.realName.id_card_back_url=await this.uploadImage(f);toast("身份证背面已上传","tok")}catch(err){toast(err.message,"terr")}e.target.value="";},
    onEducationCert: async function(e){var f=e.target.files[0];if(!f)return;try{this.education.education_cert_url=await this.uploadImage(f);toast("证明材料已上传","tok")}catch(err){toast(err.message,"terr")}e.target.value="";},
    onDrivingLicense: async function(e){var f=e.target.files[0];if(!f)return;try{this.vehicle.driving_license_url=await this.uploadImage(f);toast("行驶证已上传","tok")}catch(err){toast(err.message,"terr")}e.target.value="";},
    submitRealName: async function(){
      var self=this;
      if(!self.realName.real_name||!self.realName.id_card_number){toast("请填写姓名和身份证号","tinfo");return}
      if(!self.realName.id_card_front_url||!self.realName.id_card_back_url){toast("请上传身份证正反面照片","tinfo");return}
      self.submitting="real_name";
      try{
        var r=await api("/verification/real-name",{method:"POST",body:JSON.stringify(self.realName)});
        if(r.code===0){toast(r.message||"实名认证已提交","tok");self.load()}else{toast(r.message||"提交失败","terr")}
      }catch(e){toast(e.message||"提交失败","terr")}
      self.submitting="";
    },
    submitEducation: async function(){
      var self=this;
      if(!self.education.school_name){toast("请填写学校名称","tinfo");return}
      if(!self.education.education_cert_url){toast("请上传学历证明材料","tinfo");return}
      self.submitting="education";
      try{
        var r=await api("/verification/education",{method:"POST",body:JSON.stringify(self.education)});
        if(r.code===0){toast(r.message||"学历认证已提交","tok");self.load()}else{toast(r.message||"提交失败","terr")}
      }catch(e){toast(e.message||"提交失败","terr")}
      self.submitting="";
    },
    submitVehicle: async function(){
      var self=this;
      if(!self.vehicle.car_brand){toast("请填写车辆品牌","tinfo");return}
      if(!self.vehicle.driving_license_url){toast("请上传行驶证照片","tinfo");return}
      self.submitting="vehicle";
      try{
        var r=await api("/verification/vehicle",{method:"POST",body:JSON.stringify(self.vehicle)});
        if(r.code===0){toast(r.message||"车辆认证已提交","tok");self.load()}else{toast(r.message||"提交失败","terr")}
      }catch(e){toast(e.message||"提交失败","terr")}
      self.submitting="";
    }
  },
  mounted: function(){this.load()},
  template: `<div style="padding:16px">
    <div style="background:linear-gradient(135deg,var(--gradient-a),var(--gradient-b));color:#fff;border-radius:var(--r);padding:20px;text-align:center;margin-bottom:16px">
      <div style="font-size:36px">🛡️</div>
      <div style="font-size:18px;font-weight:600;margin:8px 0">认证中心</div>
      <div style="font-size:13px;opacity:.85">当前认证等级：<b>{{status?status.level||0:0}}</b> / 4</div>
    </div>
    <div v-if="loading" style="text-align:center;padding:32px"><div class="spin"></div></div>
    <div v-else>
      <div style="background:var(--w);border-radius:var(--rs);box-shadow:var(--sh);padding:16px;margin-bottom:12px">
        <div style="display:flex;align-items:center;margin-bottom:14px"><span style="font-size:22px;margin-right:10px">🪪</span><div class="flex1"><div style="font-size:15px;font-weight:600">实名认证</div><div style="font-size:12px;color:var(--tm)">提升可信度，解锁更多特权</div></div><span :style="{fontSize:'13px',fontWeight:'600',color:statusColor(typeStatus('real_name'))}">{{statusText(typeStatus('real_name'))}}</span></div>
        <template v-if="typeStatus('real_name')==='none'">
          <input v-model="realName.real_name" placeholder="真实姓名" style="width:100%;padding:10px;border:1px solid var(--b);border-radius:8px;margin-bottom:8px;font-size:14px">
          <input v-model="realName.id_card_number" placeholder="身份证号" maxlength="18" style="width:100%;padding:10px;border:1px solid var(--b);border-radius:8px;margin-bottom:8px;font-size:14px">
          <div style="display:flex;gap:8px;margin-bottom:8px"><label style="flex:1;cursor:pointer;border:1px dashed var(--b);border-radius:8px;padding:10px;text-align:center;font-size:13px;color:var(--ts)">📇 身份证正面<input type="file" accept="image/*" style="display:none" @change="onIdCardFront"></label><label style="flex:1;cursor:pointer;border:1px dashed var(--b);border-radius:8px;padding:10px;text-align:center;font-size:13px;color:var(--ts)">📇 身份证背面<input type="file" accept="image/*" style="display:none" @change="onIdCardBack"></label></div>
          <div style="display:flex;gap:8px;margin-bottom:8px"><span style="flex:1;font-size:12px" :style="{color:realName.id_card_front_url?'var(--s)':'var(--tm)'}">{{realName.id_card_front_url?'✅ 正面已上传':'未上传正面'}}</span><span style="flex:1;font-size:12px" :style="{color:realName.id_card_back_url?'var(--s)':'var(--tm)'}">{{realName.id_card_back_url?'✅ 背面已上传':'未上传背面'}}</span></div>
          <button class="btn bp bs" style="width:100%" @click="submitRealName" :disabled="submitting==='real_name'">{{submitting==='real_name'?'提交中...':'提交认证'}}</button>
        </template>
      </div>
      <div style="background:var(--w);border-radius:var(--rs);box-shadow:var(--sh);padding:16px;margin-bottom:12px">
        <div style="display:flex;align-items:center;margin-bottom:14px"><span style="font-size:22px;margin-right:10px">🎓</span><div class="flex1"><div style="font-size:15px;font-weight:600">学历认证</div><div style="font-size:12px;color:var(--tm)">验证教育背景</div></div><span :style="{fontSize:'13px',fontWeight:'600',color:statusColor(typeStatus('education'))}">{{statusText(typeStatus('education'))}}</span></div>
        <template v-if="typeStatus('education')==='none'">
          <input v-model="education.school_name" placeholder="学校名称" style="width:100%;padding:10px;border:1px solid var(--b);border-radius:8px;margin-bottom:8px;font-size:14px">
          <div style="display:flex;gap:8px;margin-bottom:8px"><select v-model="education.education_level" style="flex:1;padding:10px;border:1px solid var(--b);border-radius:8px;font-size:14px"><option>大专</option><option>本科</option><option>硕士</option><option>博士</option></select><input v-model.number="education.graduation_year" type="number" min="1950" :max="new Date().getFullYear()" style="flex:1;padding:10px;border:1px solid var(--b);border-radius:8px;font-size:14px" placeholder="毕业年份"></div>
          <label style="display:block;cursor:pointer;border:1px dashed var(--b);border-radius:8px;padding:10px;text-align:center;font-size:13px;color:var(--ts);margin-bottom:8px">🎓 上传学历证明材料<input type="file" accept="image/*" style="display:none" @change="onEducationCert"></label>
          <div style="font-size:12px;margin-bottom:8px" :style="{color:education.education_cert_url?'var(--s)':'var(--tm)'}">{{education.education_cert_url?'✅ 已上传证明材料':'未上传证明材料'}}</div>
          <button class="btn bp bs" style="width:100%" @click="submitEducation" :disabled="submitting==='education'">{{submitting==='education'?'提交中...':'提交认证'}}</button>
        </template>
      </div>
      <div style="background:var(--w);border-radius:var(--rs);box-shadow:var(--sh);padding:16px;margin-bottom:12px">
        <div style="display:flex;align-items:center;margin-bottom:14px"><span style="font-size:22px;margin-right:10px">🚗</span><div class="flex1"><div style="font-size:15px;font-weight:600">车辆认证</div><div style="font-size:12px;color:var(--tm)">验证车辆信息</div></div><span :style="{fontSize:'13px',fontWeight:'600',color:statusColor(typeStatus('vehicle'))}">{{statusText(typeStatus('vehicle'))}}</span></div>
        <template v-if="typeStatus('vehicle')==='none'">
          <input v-model="vehicle.car_brand" placeholder="车辆品牌" style="width:100%;padding:10px;border:1px solid var(--b);border-radius:8px;margin-bottom:8px;font-size:14px">
          <input v-model="vehicle.car_model" placeholder="车辆型号(选填)" style="width:100%;padding:10px;border:1px solid var(--b);border-radius:8px;margin-bottom:8px;font-size:14px">
          <label style="display:block;cursor:pointer;border:1px dashed var(--b);border-radius:8px;padding:10px;text-align:center;font-size:13px;color:var(--ts);margin-bottom:8px">🚗 上传行驶证照片<input type="file" accept="image/*" style="display:none" @change="onDrivingLicense"></label>
          <div style="font-size:12px;margin-bottom:8px" :style="{color:vehicle.driving_license_url?'var(--s)':'var(--tm)'}">{{vehicle.driving_license_url?'✅ 已上传行驶证':'未上传行驶证'}}</div>
          <button class="btn bp bs" style="width:100%" @click="submitVehicle" :disabled="submitting==='vehicle'">{{submitting==='vehicle'?'提交中...':'提交认证'}}</button>
        </template>
      </div>
    </div>
  </div>`
};

var BlockListPage = {
  data: function(){return {list:[],loading:true}},
  methods: {
    load: async function(){
      this.loading=true;
      try{var r=await api("/block/list");this.list=r.data||[]}catch(e){}
      this.loading=false;
    },
    unblock: async function(u){
      try{
        var r=await api("/block/remove",{method:"POST",body:JSON.stringify({blocked_user_id:u.blocked_user_id||u.id})});
        if(r.code===0){toast("已解除拉黑","tok");this.load()}else{toast(r.message||"操作失败","terr")}
      }catch(e){toast(e.message||"操作失败","terr")}
    }
  },
  mounted: function(){this.load()},
  template: `<div style="padding:12px 16px"><div v-if="loading" style="text-align:center;padding:32px"><div class="spin"></div></div><div v-else-if="list.length===0" class="empty"><div class="ei">🚫</div><div class="et">黑名单为空</div><div class="ed">拉黑的用户会出现在这里</div></div><div v-else v-for="u in list" :key="u.id" style="display:flex;align-items:center;padding:12px;background:var(--w);border-radius:var(--rs);margin-bottom:6px;gap:12px;box-shadow:var(--sh)"><div class="avatar av-sm"><img loading="lazy" v-if="u.avatar" :src="u.avatar"><span v-else>👤</span></div><div class="flex1"><div style="font-weight:500">{{u.nickname}}</div><div style="font-size:12px;color:var(--tm)">{{u.location||""}}</div></div><button class="btn bs" style="font-size:13px;border:1px solid var(--b)" @click="unblock(u)">解除</button></div></div>`
};

// ==== 圈子（S21-C2） ====
// ==== 贵族装扮（S21-C3） ====
// ==== 亲密关系（S21-C4） ====
// ==== 破冰（S21-C6） ====
var IcebreakerPage = {
  data: function(){return {q:null,flip:false,loading:true,topics:[],matchId:null}},
  methods: {
    load: async function(){
      var s=this;s.loading=true;
      try{var r=await api("/icebreaker/question/random");s.q=r.data||null}catch(e){s.q=null}
      try{s.matchId=s.$route.query.match||null;if(s.matchId){var t=await api("/icebreaker/topics/"+s.matchId);s.topics=t.data||[]}}catch(e){s.topics=[]}
      s.loading=false;
    },
    next: async function(){
      var s=this;s.flip=false;s.loading=true;
      try{var r=await api("/icebreaker/question/random");s.q=r.data||null}catch(e){s.q=null}
      s.loading=false;
    },
    toggle: function(){this.flip=!this.flip}
  },
  mounted: function(){this.load()},
  template: `<div style="padding:16px">
    <div style="text-align:center;margin-bottom:16px"><div style="font-size:44px">💬</div><h2 style="margin:6px 0">破冰话题</h2><p style="color:var(--tm);font-size:13px">打破尴尬，开启话题</p></div>
    <div v-if="loading" style="text-align:center;padding:32px"><div class="spin"></div></div>
    <div v-else-if="!q" class="empty"><div class="ei">🎴</div><div class="et">暂时没有话题</div></div>
    <div v-else>
      <div @click="toggle" style="background:linear-gradient(135deg,var(--gradient-a),var(--gradient-b));color:#fff;border-radius:var(--r);padding:32px 24px;text-align:center;cursor:pointer;min-height:180px;display:flex;flex-direction:column;align-items:center;justify-content:center;box-shadow:0 8px 24px rgba(255,94,125,.25)">
        <div v-if="!flip">
          <div style="font-size:13px;opacity:.85;margin-bottom:12px">点击翻面看选项</div>
          <div style="font-size:20px;font-weight:600;line-height:1.6">{{q.question}}</div>
        </div>
        <div v-else>
          <div style="font-size:15px;font-weight:600;margin-bottom:8px">你的选择？</div>
          <div style="display:flex;gap:12px;margin-top:12px">
            <div style="flex:1;background:rgba(255,255,255,.18);border-radius:14px;padding:16px 12px"><div style="font-size:22px">A</div><div style="font-size:14px;margin-top:6px">{{q.option_a}}</div></div>
            <div style="flex:1;background:rgba(255,255,255,.18);border-radius:14px;padding:16px 12px"><div style="font-size:22px">B</div><div style="font-size:14px;margin-top:6px">{{q.option_b}}</div></div>
          </div>
        </div>
        <div v-if="q.category" style="font-size:11px;opacity:.75;margin-top:14px"># {{q.category}}</div>
      </div>
      <button class="btn bp bw bl" style="margin-top:16px" @click="next">换一题</button>
    </div>
    <div v-if="topics.length" style="margin-top:20px">
      <div style="font-size:14px;font-weight:600;margin-bottom:10px">💡 你们的话题</div>
      <div v-for="(tp,i) in topics" :key="i" style="background:var(--w);border-radius:var(--rs);padding:12px 14px;margin-bottom:8px;box-shadow:var(--sh)">
        <div style="font-size:13px;color:var(--ts)">{{tp.content}}</div>
        <div v-if="tp.category" style="font-size:11px;color:var(--tm);margin-top:4px"># {{tp.category}}</div>
      </div>
    </div>
  </div>`
};

// ==== 游戏（S21-C6） ====
var GamePage = {
  data: function(){return {tab:"guess",word:null,input:"",result:null,showHint:false,loading:true,leaderboard:[],gameType:"guess_word",recording:false}},
  methods: {
    loadWord: async function(){
      var s=this;s.loading=true;s.result=null;s.showHint=false;s.input="";
      try{var r=await api("/game/random-word");s.word=r.data||null}catch(e){s.word=null}
      s.loading=false;
    },
    check: async function(){
      var s=this;
      if(!s.word||!s.word.word){toast("题目还没准备好","tinfo");return}
      if(!s.input.trim()){toast("请输入你的答案","tinfo");return}
      var correct=s.input.trim()===s.word.word;
      s.result={correct:correct,reveal:correct?null:s.word.word};
      s.recording=true;
      try{await api("/game/record",{method:"POST",body:JSON.stringify({game_type:"guess_word",result:correct?"win":"lose",score:correct?10:0,opponent_id:null})})}catch(e){}
      s.recording=false;
      if(window.NotificationUtils){window.NotificationUtils.showToast(correct?'🎉 猜对了！':('答案是 '+s.word.word),correct?'success':'info')}else{toast(correct?"猜对了！":"答案是 "+s.word.word,correct?"tok":"tinfo")}
    },
    nextWord: function(){this.loadWord()},
    loadBoard: async function(){
      var s=this;
      try{var r=await api("/game/leaderboard?game_type="+s.gameType);s.leaderboard=r.data||[]}catch(e){s.leaderboard=[]}
    }
  },
  mounted: function(){this.loadWord();this.loadBoard()},
  template: `<div style="padding:16px">
    <div style="text-align:center;margin-bottom:16px"><div style="font-size:44px">🎮</div><h2 style="margin:6px 0">互动游戏</h2><p style="color:var(--tm);font-size:13px">猜词挑战，增进默契</p></div>
    <div style="display:flex;gap:8px;margin-bottom:14px">
      <button class="btn bs" :class=\"tab==='guess'?'bp':'bo'\" class="flex1" @click="tab='guess'">猜词</button>
      <button class="btn bs" :class=\"tab==='board'?'bp':'bo'\" class="flex1" @click="tab='board';loadBoard()">排行榜</button>
    </div>
    <div v-if="tab==='guess'">
      <div v-if="loading" style="text-align:center;padding:32px"><div class="spin"></div></div>
      <div v-else-if="!word" class="empty"><div class="ei">🎲</div><div class="et">题目加载失败</div><button class="btn bp bs" @click="loadWord">重试</button></div>
      <div v-else style="background:var(--w);border-radius:var(--r);padding:24px;text-align:center;box-shadow:var(--sh)">
        <div style="font-size:13px;color:var(--tm)">猜猜这是哪个词？（{{word.category||'分类未知'}} · {{word.difficulty==1?'简单':word.difficulty==2?'中等':'困难'}}）</div>
        <div style="font-size:28px;font-weight:700;margin:20px 0;letter-spacing:4px">{{word.word.replace(/./g,'＿')}}</div>
        <div v-if="showHint" style="font-size:14px;color:var(--ts);margin-bottom:12px">💡 提示：{{word.hint}}</div>
        <div v-else style="font-size:12px;color:var(--tm);margin-bottom:12px">猜不出来？<span style="color:var(--p);cursor:pointer" @click="showHint=true">查看提示</span></div>
        <div class="inp" style="margin-bottom:14px"><span>📝</span><input v-model="input" maxlength="20" placeholder="输入你的答案" @keydown.enter="check"></div>
        <div v-if="result" style="font-size:14px;margin-bottom:12px" :style="{color:result.correct?'var(--s)':'var(--e)'}">{{result.correct?'🎉 答对了！':'很遗憾，答案是 '+result.reveal}}</div>
        <div style="display:flex;gap:10px">
          <button class="btn bp" class="flex1" @click="check" :disabled="recording">{{recording?'记录中...':'提交答案'}}</button>
          <button class="btn bo" class="flex1" @click="nextWord">下一题</button>
        </div>
      </div>
    </div>
    <div v-else>
      <div v-if="leaderboard.length===0" class="empty"><div class="ei">🏆</div><div class="et">暂无排行榜</div><div class="ed">玩一局猜词来上榜吧</div></div>
      <div v-else v-for="(row,i) in leaderboard" :key="row.user_id" style="display:flex;align-items:center;gap:12px;background:var(--w);border-radius:var(--rs);padding:12px 14px;margin-bottom:8px;box-shadow:var(--sh)">
        <div style="width:28px;text-align:center;font-size:18px;font-weight:700" :style="{color:i===0?'#F6D365':i===1?'#C0C0C0':i===2?'#CD7F32':'var(--tm)'}">{{i+1}}</div>
        <div class="flex1"><div style="font-size:14px;font-weight:500">用户 #{{row.user_id}}</div><div style="font-size:11px;color:var(--tm)">共 {{row.games||0}} 局</div></div>
        <div style="font-size:15px;font-weight:600;color:var(--s)">🏆 {{row.wins||0}}胜</div>
      </div>
    </div>
  </div>`
};

var IntimacyPage = {
  data: function(){return {userId:0,rel:null,anniversaries:[],badges:[],loading:true,err:false}},
  methods: {
    load: async function(){
      var s=this;s.loading=true;s.err=false;
      s.userId=parseInt(this.$route.params.userId);
      try{var r=await api("/intimacy/"+s.userId);s.rel=r.data||{score:0,level:0,level_name:"初识",progress_percent:0}}catch(e){s.err=true}
      try{var a=await api("/intimacy/"+s.userId+"/anniversaries");s.anniversaries=a.data||[]}catch(e){s.anniversaries=[]}
      try{var b=await api("/intimacy/badges");s.badges=b.data||[]}catch(e){s.badges=[]}
      s.loading=false;
    },
    levelIcon: function(lv){return ["💗","💘","💞","💕","❤️"][lv]||"💗"},
    annText: function(ev){var m={match:"初遇",level_up_1:"心动时刻",level_up_2:"暧昧升温",level_up_3:"恋爱纪念",level_up_4:"挚爱之约"};return m[ev.event_type]||ev.event_type},
    fmtDate: function(d){if(!d)return"";try{var t=new Date(d);return t.getFullYear()+"-"+("0"+(t.getMonth()+1)).slice(-2)+"-"+("0"+t.getDate()).slice(-2)}catch(e){return d}},
    fmtDur: function(sec){sec=sec||0;var m=Math.floor(sec/60);return m>=60?Math.floor(m/60)+"小时"+m%60+"分":m+"分钟"}
  },
  mounted: function(){this.load()},
  template: `<div style="padding:16px">
    <div v-if="loading" style="text-align:center;padding:48px"><div class="spin"></div></div>
    <div v-else-if="err" class="empty"><div class="ei">😵</div><div class="et">加载失败</div><button class="btn bp bs" @click="load">重试</button></div>
    <div v-else-if="!rel" class="empty"><div class="ei">💔</div><div class="et">暂无亲密关系</div><div class="ed">多聊天、打电话、送礼物可以提升亲密度</div></div>
    <div v-else>
      <div style="background:linear-gradient(135deg,var(--gradient-a),var(--gradient-b));color:#fff;border-radius:var(--r);padding:24px;text-align:center;margin-bottom:16px">
        <div style="font-size:44px">{{levelIcon(rel.level)}}</div>
        <div style="font-size:22px;font-weight:700;margin-top:8px">{{rel.level_name}}</div>
        <div style="font-size:13px;opacity:.85;margin-top:4px">亲密值 {{rel.score||0}} 分</div>
        <div style="height:8px;background:rgba(255,255,255,.3);border-radius:4px;margin-top:14px;overflow:hidden">
          <div style="height:100%;background:#fff;border-radius:4px;transition:width .5s" :style="{width:(rel.progress_percent||0)+'%'}"></div>
        </div>
        <div style="font-size:12px;opacity:.8;margin-top:6px" v-if="rel.level<4">距离{{rel.next_level_score}}分升级下一等级（{{rel.progress_percent||0}}%）</div>
        <div style="font-size:12px;opacity:.8;margin-top:6px" v-else>已满级，你们是最亲密的伴侣！</div>
      </div>
      <div style="display:flex;gap:10px;margin-bottom:16px">
        <div style="flex:1;background:var(--w);border-radius:var(--rs);padding:12px;text-align:center;box-shadow:var(--sh)"><div style="font-size:20px">💬</div><div style="font-size:16px;font-weight:600;margin-top:4px">{{rel.total_chat_count||0}}</div><div style="font-size:11px;color:var(--tm)">聊天消息</div></div>
        <div style="flex:1;background:var(--w);border-radius:var(--rs);padding:12px;text-align:center;box-shadow:var(--sh)"><div style="font-size:20px">📞</div><div style="font-size:16px;font-weight:600;margin-top:4px">{{fmtDur(rel.total_call_duration)}}</div><div style="font-size:11px;color:var(--tm)">通话时长</div></div>
        <div style="flex:1;background:var(--w);border-radius:var(--rs);padding:12px;text-align:center;box-shadow:var(--sh)"><div style="font-size:20px">🎁</div><div style="font-size:16px;font-weight:600;margin-top:4px">{{rel.total_gift_value||0}}</div><div style="font-size:11px;color:var(--tm)">礼物价值</div></div>
      </div>
      <div style="font-size:14px;font-weight:600;margin:0 0 10px">🏅 成就徽章</div>
      <div v-if="badges.length===0" style="color:var(--tm);font-size:13px;margin-bottom:14px">暂无徽章</div>
      <div v-else style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:16px">
        <div v-for="b in badges" :key="b.id" style="background:var(--w);border-radius:var(--rs);padding:12px;text-align:center;box-shadow:var(--sh)">
          <div style="font-size:28px">{{b.icon_url||'🏅'}}</div>
          <div style="font-size:12px;font-weight:600;margin-top:4px">{{b.name}}</div>
          <div style="font-size:10px;color:var(--tm)">{{b.unlocked_at?"解锁于"+fmtDate(b.unlocked_at):"未解锁"}}</div>
        </div>
      </div>
      <div style="font-size:14px;font-weight:600;margin:0 0 10px">📅 纪念日</div>
      <div v-if="anniversaries.length===0" style="color:var(--tm);font-size:13px">还没有纪念日，一起创造第一个吧</div>
      <div v-else v-for="a in anniversaries" :key="a.id" style="display:flex;align-items:center;gap:12px;background:var(--w);border-radius:var(--rs);padding:12px;margin-bottom:8px;box-shadow:var(--sh)">
        <div style="width:38px;height:38px;border-radius:50%;background:linear-gradient(135deg,var(--gradient-a),var(--gradient-b));color:#fff;display:flex;align-items:center;justify-content:center;font-size:16px">📌</div>
        <div class="flex1"><div style="font-size:14px;font-weight:500">{{annText(a)}}</div><div style="font-size:12px;color:var(--tm);margin-top:2px">{{fmtDate(a.event_date)}}</div></div>
      </div>
    </div>
  </div>`
};

var NoblePage = {
  data: function(){return {levels:[],items:[],myItems:[],tab:"avatar_frame",loading:true,vipInfo:null,acting:false}},
  computed: { tabs: function(){return [{k:"avatar_frame",l:"头像框"},{k:"chat_bubble",l:"聊天气泡"},{k:"name_tag",l:"名字铭牌"}]} },
  methods: {
    load: async function(){
      var s=this;s.loading=true;
      try{var l=await api("/vip/noble-levels");s.levels=l.data||[]}catch(e){s.levels=[]}
      try{var i=await api("/vip/dress-up/shop?type="+s.tab);s.items=i.data||[]}catch(e){s.items=[]}
      try{var m=await api("/vip/dress-up/my");s.myItems=m.data||[]}catch(e){s.myItems=[]}
      try{var v=await api("/user/vip-info");s.vipInfo=v.data||null}catch(e){}
      s.loading=false;
    },
    switchTab: function(t){this.tab=t;this.load()},
    owned: function(it){return this.myItems.some(function(x){return x.id===it.id})},
    using: function(it){return this.myItems.some(function(x){return x.id===it.id&&(x.is_using===1||x.is_using==="1")})},
    buy: async function(it){
      var s=this;s.acting=true;
      try{var r=await api("/vip/dress-up/purchase/"+it.id,{method:"POST",body:"{}"});if(r.code===0){toast("购买成功","tok");s.load()}}catch(e){toast(e.message||"购买失败","terr")}
      s.acting=false;
    },
    use: async function(it){
      var s=this;s.acting=true;
      try{var r=await api("/vip/dress-up/use/"+it.id,{method:"POST",body:"{}"});if(r.code===0){toast("已启用","tok");s.load()}}catch(e){toast(e.message||"操作失败","terr")}
      s.acting=false;
    }
  },
  mounted: function(){this.load()},
  template: `<div style="padding:16px">
    <div style="text-align:center;margin-bottom:16px"><div style="font-size:44px">👑</div><h2 style="margin:6px 0">贵族装扮</h2><p style="color:var(--tm);font-size:13px">解锁身份等级，专属装扮彰显与众不同</p></div>
    <div v-if="loading" style="text-align:center;padding:32px"><div class="spin"></div></div>
    <div v-else>
      <div style="display:flex;gap:8px;overflow-x:auto;padding-bottom:10px;margin-bottom:12px">
        <div v-for="lv in levels" :key="lv.level" style="flex-shrink:0;background:var(--w);border-radius:var(--rs);padding:10px 14px;text-align:center;box-shadow:var(--sh)">
          <div style="font-size:20px">{{lv.icon_url||'🏅'}}</div><div style="font-size:13px;font-weight:600;margin-top:2px">Lv{{lv.level}} {{lv.name}}</div><div style="font-size:11px;color:var(--tm)">¥{{lv.price_monthly}}/月</div>
        </div>
      </div>
      <div style="display:flex;gap:8px;margin-bottom:12px">
        <button v-for="tb in tabs" :key="tb.k" class="btn bs" :class=\"tab===tb.k?'bp':'bo'\" @click="switchTab(tb.k)" class="flex1">{{tb.l}}</button>
      </div>
      <div v-if="items.length===0" class="empty"><div class="ei">🎨</div><div class="et">暂无装扮</div><div class="ed">该分类还没有可购买的装扮</div></div>
      <div v-else style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
        <div v-for="it in items" :key="it.id" style="background:var(--w);border-radius:var(--r);padding:16px;box-shadow:var(--sh);text-align:center">
          <div style="width:72px;height:72px;margin:0 auto 10px;border-radius:16px;overflow:hidden;background:linear-gradient(135deg,var(--gradient-a),var(--gradient-b));display:flex;align-items:center;justify-content:center">
            <img loading="lazy" v-if="it.preview_url" :src="it.preview_url" style="width:100%;height:100%;object-fit:cover"><span v-else style="font-size:30px">🎨</span>
          </div>
          <div style="font-size:15px;font-weight:600">{{it.name}}</div>
          <div v-if="it.noble_level_required>0" style="font-size:11px;color:#d99000;margin-top:2px">需要 Lv{{it.noble_level_required}}+</div>
          <div v-else style="font-size:11px;color:var(--tm);margin-top:2px">普通装扮</div>
          <div style="font-size:13px;color:var(--p);margin:6px 0">{{it.price>0?'🪙'+it.price:'免费'}}</div>
          <button v-if="owned(it)&&using(it)" class="btn bs" style="border:1px solid var(--s);color:var(--s);width:100%">✓ 使用中</button>
          <button v-else-if="owned(it)" class="btn bp bs" style="width:100%" @click="use(it)" :disabled="acting">使用</button>
          <button v-else class="btn bp bs" style="width:100%" @click="buy(it)" :disabled="acting">{{it.price>0?'购买':'领取'}}</button>
        </div>
      </div>
      <div style="margin-top:16px;padding:14px;background:var(--w);border-radius:var(--rs);box-shadow:var(--sh);font-size:13px;color:var(--ts)">
        <div style="font-weight:600;margin-bottom:6px">✨ 我的装扮</div>
        <div v-if="myItems.length===0" style="color:var(--tm)">还没有拥有装扮，去购买心仪的一款吧</div>
        <div v-else v-for="m in myItems" :key="m.id" style="display:flex;align-items:center;gap:8px;padding:6px 0">
          <span>{{m.preview_url?'': '🎨'}}</span><span class="flex1">{{m.name}}</span>
          <span style="font-size:11px;color:var(--s)" v-if="m.is_using===1||m.is_using==='1'">使用中</span>
        </div>
      </div>
    </div>
  </div>`
};

var CommunityPage = {
  data: function(){return {
    communities:[],loading:true,err:false,tab:"hot",
    showCreate:false,form:{name:"",description:"",tags:"",cover:null,coverPreview:""},
    current:null,posts:[],events:[],postText:"",member:false,
    postImages:[],postPreviews:[],
    eventForm:{title:"",description:"",location:"",start_time:""},
    hasMore:true,pageOffset:0,loadingMore:false
  }},
  methods: {
    load: async function(){
      this.loading=true;this.err=false;
      try{var r=await api("/community/list?sort="+(this.tab==="hot"?"hot":"new")+"&limit=20&offset="+this.pageOffset);this.communities=r.data||[];this.hasMore=(r.data||[]).length>=20}catch(e){this.err=true}
      this.loading=false;
    },
    switchTab: function(t){this.tab=t;this.pageOffset=0;this.load()},
    openCreate: function(){this.showCreate=!this.showCreate},
    coverChange: function(e){var f=e.target.files[0];if(f){this.form.cover=f;this.form.coverPreview=URL.createObjectURL(f)}},
    create: async function(){
      var s=this;
      if(!s.form.name||s.form.name.trim().length<2){toast("圈子名称至少2个字","terr");return}
      try{
        var fd=new FormData();
        fd.append("name",s.form.name.trim());
        fd.append("description",s.form.description||"");
        if(s.form.tags&&s.form.tags.trim())fd.append("tags",JSON.stringify(s.form.tags.split(/[,，\s]+/).filter(Boolean)));
        if(s.form.cover)fd.append("cover",s.form.cover);
        var r=await api("/community/create",{method:"POST",body:fd});
        if(r.code===0){toast("圈子创建成功","tok");s.showCreate=false;s.form={name:"",description:"",tags:"",cover:null,coverPreview:""};s.load()}
      }catch(e){toast(e.message||"创建失败","terr")}
    },
    open: async function(c){
      var s=this;
      s.current=c;s.member=false;
      try{
        var ps=await api("/community/"+c.id+"/posts?limit=20");
        s.posts=ps.data||[];
      }catch(e){s.posts=[]}
      try{var ev=await api("/community/"+c.id+"/events");s.events=ev.data||[]}catch(e){s.events=[]}
      try{var m=await api("/community/"+c.id+"/members");var uid=parseInt(localStorage.getItem("userId"));s.member=(m.data||[]).some(function(x){return x.user_id===uid})}catch(e){}
    },
    back: function(){this.current=null;this.load()},
    join: async function(){
      var s=this;
      try{var r=await api("/community/"+s.current.id+"/join",{method:"POST",body:"{}"});if(r.code===0){toast("已加入","tok");s.member=true;s.current.member_count=(s.current.member_count||0)+1}}catch(e){toast(e.message||"加入失败","terr")}
    },
    leave: async function(){
      var s=this;
      try{var r=await api("/community/"+s.current.id+"/leave",{method:"POST",body:"{}"});if(r.code===0){toast("已退出","tinfo");s.member=false;s.current.member_count=Math.max(0,(s.current.member_count||0)-1)}}catch(e){toast(e.message||"操作失败","terr")}
    },
    postImageChange: function(e){
      var self=this,files=Array.prototype.slice.call(e.target.files||[]);
      if(files.length===0)return;
      var room=9-self.postImages.length;
      if(files.length>room){toast("最多9张图片","tinfo");files=files.slice(0,room)}
      files.forEach(function(f){self.postImages.push(f);self.postPreviews.push(URL.createObjectURL(f))});
      e.target.value="";
    },
    removePostImage: function(i){this.postImages.splice(i,1);this.postPreviews.splice(i,1)},
    publishPost: async function(){
      var s=this;
      if(!s.postText.trim()&&s.postImages.length===0){toast("说点什么或选张图片吧","tinfo");return}
      try{
        var fd=new FormData();
        fd.append("content",s.postText.trim());
        s.postImages.forEach(function(f){fd.append("images",f)});
        var r=await api("/community/"+s.current.id+"/posts",{method:"POST",body:fd});
        if(r.code===0){toast("发布成功","tok");s.postText="";s.postImages=[];s.postPreviews=[];s.current.post_count=(s.current.post_count||0)+1;var ps=await api("/community/"+s.current.id+"/posts?limit=20");s.posts=ps.data||[]}
      }catch(e){toast(e.message||"发布失败","terr")}
    },
    likePost: async function(p){
      try{await api("/community/posts/"+p.id+"/like",{method:"POST",body:"{}"});p.like_count=(p.like_count||0)+1}catch(e){}
    },
    createEvent: async function(){
      var s=this;
      if(!s.eventForm.title.trim()){toast("请填写事件标题","tinfo");return}
      if(!s.eventForm.start_time){toast("请选择开始时间","tinfo");return}
      try{
        var r=await api("/community/"+s.current.id+"/events",{method:"POST",body:JSON.stringify(s.eventForm)});
        if(r.code===0){toast("事件创建成功","tok");s.eventForm={title:"",description:"",location:"",start_time:""};var ev=await api("/community/"+s.current.id+"/events");s.events=ev.data||[]}
      }catch(e){toast(e.message||"创建失败","terr")}
    },
    joinEvent: async function(e){
      var s=this;
      try{var r=await api("/community/events/"+e.id+"/join",{method:"POST",body:"{}"});if(r.code===0){toast("报名成功","tok");e.participant_count=(e.participant_count||0)+1;e._joined=true}}catch(err){toast(err.message||"报名失败","terr")}
    },
    fmtTime: function(t){if(!t)return"";try{return new Date(t).toLocaleString("zh-CN",{month:"numeric",day:"numeric",hour:"2-digit",minute:"2-digit"})}catch(e){return t}},
    parseTags: function(t){if(!t)return[];if(Array.isArray(t))return t;try{return JSON.parse(t)}catch(e){return[]}},
    highlightTags: function(text){return (text||"").replace(/#([^#\s]+)/g,'<span class="tag tp" style="font-size:12px;margin-right:4px">#$1</span>')}
  },
  mounted: function(){this.load()},
  template: `<div>
    <div v-if="!current">
      <div style="padding:16px 16px 4px;display:flex;justify-content:space-between;align-items:center">
        <div style="display:flex;gap:8px"><button class="btn bs" :class=\"tab==='hot'?'bp':'bo'\" @click="switchTab('hot')">热门</button><button class="btn bs" :class=\"tab==='new'?'bp':'bo'\" @click="switchTab('new')">最新</button></div>
        <button class="btn bp bs" @click="openCreate">{{showCreate?'取消':'＋ 创建圈子'}}</button>
      </div>
      <div v-if="showCreate" style="margin:12px 16px;padding:16px;background:var(--w);border-radius:var(--rs);box-shadow:var(--sh)">
        <div class="inp" style="margin-bottom:10px"><span>🏷️</span><input v-model="form.name" maxlength="50" placeholder="圈子名称（至少2个字）"></div>
        <div class="inp" style="margin-bottom:10px"><span>📝</span><input v-model="form.description" maxlength="200" placeholder="圈子简介"></div>
        <div class="inp" style="margin-bottom:10px"><span>#</span><input v-model="form.tags" maxlength="100" placeholder="标签（逗号分隔，选填）"></div>
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;border:1px dashed var(--b);border-radius:8px;padding:10px;margin-bottom:10px;font-size:13px;color:var(--ts)">📷 选择封面<span v-if="form.coverPreview" style="font-size:12px;color:var(--s)">✅ 已选</span><input type="file" accept="image/*" style="display:none" @change="coverChange"></label>
        <button class="btn bp bw bs" @click="create">创建圈子</button>
      </div>
      <div v-if="loading" style="text-align:center;padding:48px"><div class="spin"></div></div>
      <div v-else-if="err" class="empty"><div class="ei">😵</div><div class="et">加载失败</div><button class="btn bp bs" @click="load">重试</button></div>
      <div v-else-if="communities.length===0" class="empty"><div class="ei">🌐</div><div class="et">还没有圈子</div><div class="ed">创建第一个圈子吧</div></div>
      <div v-else style="padding:12px 16px">
        <div v-for="c in communities" :key="c.id" @click="open(c)" style="display:flex;align-items:center;padding:14px;background:var(--w);border-radius:var(--rs);margin-bottom:10px;cursor:pointer;box-shadow:var(--sh)">
          <div style="width:52px;height:52px;border-radius:14px;flex-shrink:0;overflow:hidden;background:linear-gradient(135deg,var(--gradient-a),var(--gradient-b));display:flex;align-items:center;justify-content:center">
            <img loading="lazy" v-if="c.cover_url" :src="c.cover_url" style="width:100%;height:100%;object-fit:cover"><span v-else style="font-size:24px">🌐</span>
          </div>
          <div style="flex:1;min-width:0;margin:0 12px">
            <div style="font-size:16px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{{c.name}}</div>
            <div style="font-size:12px;color:var(--tm);margin-top:3px">{{c.member_count||0}}人 · {{c.post_count||0}}帖{{c.description?' · '+c.description:''}}</div>
            <div v-if="parseTags(c.tags).length" style="display:flex;gap:4px;flex-wrap:wrap;margin-top:4px"><span v-for="t in parseTags(c.tags).slice(0,3)" class="tag tp" style="font-size:11px">{{t}}</span></div>
          </div>
          <span style="color:var(--tm)">›</span>
        </div>
      </div>
    </div>
    <div v-else>
      <div style="background:linear-gradient(135deg,var(--gradient-a),var(--gradient-b));color:#fff;padding:24px 20px">
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px"><button @click="back" style="border:none;background:none;color:#fff;font-size:40px;line-height:1;cursor:pointer">‹</button><div class="flex1"><div style="font-size:20px;font-weight:600">{{current.name}}</div><div style="font-size:13px;opacity:.85;margin-top:2px">{{current.member_count||0}}人 · {{current.post_count||0}}帖</div></div></div>
        <button class="btn" style="background:rgba(255,255,255,.2);color:#fff;border-radius:18px;padding:6px 18px;font-size:13px;cursor:pointer" @click="member?leave():join()">{{member?'退出圈子':'加入圈子'}}</button>
      </div>
      <div style="padding:16px">
        <div v-if="member" style="margin-bottom:14px;padding:14px;background:var(--w);border-radius:var(--rs);box-shadow:var(--sh)">
          <div style="font-size:14px;font-weight:600;margin-bottom:8px">📝 发布动态</div>
          <textarea v-model="postText" rows="2" placeholder="分享你的想法，用 #话题 打标签" style="width:100%;border:1px solid var(--b);border-radius:10px;padding:10px;font-size:14px;resize:none;box-sizing:border-box"></textarea>
          <div v-if="postPreviews.length" style="display:grid;grid-template-columns:repeat(3,1fr);gap:4px;margin-top:8px">
            <div v-for="(pv,i) in postPreviews" :key="i" style="position:relative">
              <img :src="pv" style="width:100%;aspect-ratio:1;object-fit:cover;border-radius:6px">
              <button @click="removePostImage(i)" style="position:absolute;top:-8px;right:-8px;width:22px;height:22px;border-radius:50%;background:var(--e);color:#fff;border:none;cursor:pointer;font-size:12px;line-height:22px">✕</button>
            </div>
          </div>
          <div style="display:flex;align-items:center;gap:8px;margin-top:8px">
            <label style="cursor:pointer;font-size:22px">📷<input type="file" accept="image/*" multiple style="display:none" @change="postImageChange"></label>
            <span style="font-size:11px;color:var(--tm);flex:1">{{postImages.length}}/9</span>
            <button class="btn bp bs" @click="publishPost">发布</button>
          </div>
        </div>
        <div style="font-size:14px;font-weight:600;margin:6px 0 10px">📢 圈子活动</div>
        <div v-if="events.length===0" style="color:var(--tm);font-size:13px;padding:8px 0 4px">暂无活动{{member?'，点击下方创建':''}}</div>
        <div v-for="e in events" :key="e.id" style="background:var(--w);border-radius:var(--rs);padding:12px;margin-bottom:8px;box-shadow:var(--sh)">
          <div style="font-weight:600">{{e.title}}</div>
          <div style="font-size:12px;color:var(--tm);margin-top:4px">🗓 {{fmtTime(e.start_time)}}{{e.location?' · 📍'+e.location:''}}</div>
          <div v-if="e.description" style="font-size:13px;color:var(--ts);margin-top:4px">{{e.description}}</div>
          <div style="display:flex;justify-content:space-between;align-items:center;margin-top:8px">
            <span style="font-size:12px;color:var(--tm)">{{e.participant_count||0}}/{{e.max_participants||'∞'}}人报名</span>
            <button class="btn bs" :class=\"e._joined?'bo':'bp'\" style="font-size:12px" @click="e._joined?null:joinEvent(e)">{{e._joined?'已报名':'报名'}}</button>
          </div>
        </div>
        <template v-if="member">
          <div style="font-size:14px;font-weight:600;margin:14px 0 10px">🎉 发起活动</div>
          <div style="background:var(--w);border-radius:var(--rs);padding:14px;box-shadow:var(--sh)">
            <div class="inp" style="margin-bottom:8px"><span>📋</span><input v-model="eventForm.title" placeholder="活动标题" maxlength="100"></div>
            <div class="inp" style="margin-bottom:8px"><span>📍</span><input v-model="eventForm.location" placeholder="活动地点（选填）"></div>
            <div class="inp" style="margin-bottom:8px"><span>⏰</span><input v-model="eventForm.start_time" type="datetime-local" style="flex:1;border:none;outline:none;font-size:14px;background:transparent"></div>
            <div class="inp" style="margin-bottom:8px"><span>📝</span><input v-model="eventForm.description" placeholder="活动说明（选填）"></div>
            <button class="btn bp bw bs" @click="createEvent">创建活动</button>
          </div>
        </template>
        <div style="font-size:14px;font-weight:600;margin:16px 0 10px">💬 圈子动态</div>
        <div v-if="posts.length===0" style="color:var(--tm);font-size:13px;padding:8px 0 4px">还没有动态，来发第一帖吧</div>
        <div v-for="p in posts" :key="p.id" style="background:var(--w);border-radius:var(--rs);padding:14px;margin-bottom:10px;box-shadow:var(--sh)">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
            <div class="avatar av-sm"><img loading="lazy" v-if="p.avatar" :src="p.avatar"><span v-else>👤</span></div>
            <div class="flex1"><div style="font-size:14px;font-weight:500">{{p.nickname||'用户'}}</div><div style="font-size:11px;color:var(--tm)">{{timeAgo(p.created_at)}}</div></div>
            <button class="btn bs" style="font-size:12px;border:1px solid var(--b)" @click="likePost(p)">❤️ {{p.like_count||0}}</button>
          </div>
          <div style="font-size:14px;line-height:1.6;word-break:break-word" v-html="highlightTags(p.content)"></div>
          <div v-if="p.images&&p.images.length" style="display:grid;grid-template-columns:repeat(3,1fr);gap:4px;margin-top:8px"><img loading="lazy" v-for="(img,i) in p.images.slice(0,9)" :key="i" :src="img" style="width:100%;aspect-ratio:1;object-fit:cover;border-radius:6px" @click="preview.open(p.images,i)"></div>
        </div>
      </div>
    </div>
  </div>`
};

var MeetPage = {
  data: function(){return {tab:"viewers",list:[],loading:true}},
  methods: {load:async function(t){this.tab=t;this.loading=true;var ep=t==="viewers"?"/user/viewers":"/user/fans";try{var r=await api(ep);this.list=r.data||[]}catch(e){}this.loading=false}},
  mounted: function(){this.load("viewers")},
  template: `<div style="padding:12px 16px"><div style="display:flex;gap:8px;margin-bottom:12px"><button class="btn bs" :class=\"tab==='viewers'?'bp':'bo'\" @click=\"load('viewers')\">看过我的</button><button class="btn bs" :class=\"tab==='fans'?'bp':'bo'\" @click=\"load('fans')\">喜欢我的</button></div><div v-if="loading" style="text-align:center;padding:32px"><div class="spin"></div></div><div v-else-if="list.length===0" class="empty"><div class="ei">🔍</div><div class="et">暂无数据</div></div><div v-else v-for="item in list" :key="item.id" style="display:flex;align-items:center;padding:12px;background:var(--w);border-radius:var(--rs);margin-bottom:6px;gap:12px;box-shadow:var(--sh)"><div class="avatar av-sm"><img loading="lazy" v-if="item.avatar" :src="item.avatar"><span v-else>👤</span></div><div class="flex1"><div style="font-weight:500">{{item.nickname}}</div><div style="font-size:12px;color:var(--tm)">{{item.age?item.age+'岁 ':''}}{{item.location||''}}</div></div><span v-if="tab==='viewers'&&item.visit_count>1" style="font-size:11px;color:var(--p);background:var(--bg-page);padding:3px 8px;border-radius:10px">访问×{{item.visit_count}}</span></div></div>`
};

var EarningsPage = {
  data: function(){return {wallet:{balance:0,total_earned:0},txs:[],loading:true}},
  mounted: async function(){try{var wr=await api("/wallet/info");var tr=await api("/wallet/transactions?limit=50");if(wr.data)this.wallet=wr.data;if(tr.data)this.txs=tr.data}catch(e){}this.loading=false},
  template: `<div style="padding:16px"><div style="background:linear-gradient(135deg,#FF5E7D,#FF8E8E);color:#fff;padding:24px;border-radius:var(--r);text-align:center;margin-bottom:16px"><div style="font-size:13px;opacity:.8">累计收益</div><div style="font-size:36px;font-weight:700;margin:8px 0">🪙{{wallet.total_earned||0}}</div><div style="font-size:13px;opacity:.8">余额:{{wallet.balance||0}}金币</div></div><div v-if="loading" style="text-align:center;padding:32px"><div class="spin"></div></div><div v-else-if="txs.length===0" class="empty"><div class="ei">📊</div><div class="et">暂无记录</div></div><div v-else v-for="tx in txs" :key="tx.id" style="display:flex;align-items:center;padding:12px;background:var(--w);border-radius:var(--rs);margin-bottom:6px;box-shadow:var(--sh)"><span style="font-size:24px;margin-right:12px">{{tx.type==='gift_receive'?'🎁':tx.type==='recharge'?'💳':'💰'}}</span><div class="flex1"><div style="font-size:14px">{{tx.description||tx.type}}</div><div style="font-size:11px;color:var(--tm)">{{new Date(tx.created_at).toLocaleString('zh-CN')}}</div></div><span :style=\"{fontWeight:'600',color:tx.amount>0?'var(--s)':'var(--e)'}\">{{tx.amount>0?'+'+tx.amount:tx.amount}}</span></div></div>`
};

var WalletPage = {
  data: function(){return {wallet:{balance:0,total_recharge:0,total_spent:0,total_earned:0},txs:[],withdraws:[],orders:[],loading:true,tab:"txs",showWithdraw:false,wdAmount:"",wdBusy:false}},
  methods: {
    load: async function(){
      this.loading=true;
      try{var wr=await api("/wallet/info");if(wr.data)this.wallet=wr.data}catch(e){}
      try{var tr=await api("/wallet/transactions?limit=50");if(tr.data)this.txs=tr.data}catch(e){this.txs=[]}
      try{var wr2=await api("/wallet/withdraws?limit=50");if(wr2.data)this.withdraws=wr2.data}catch(e){this.withdraws=[]}
      try{var or=await api("/orders/list?limit=50");if(or.data)this.orders=or.data}catch(e){this.orders=[]}
      this.loading=false;
    },
    openWithdraw: function(){this.wdAmount="";this.showWithdraw=true},
    closeWithdraw: function(){this.showWithdraw=false;this.wdBusy=false},
    doWithdraw: async function(){
      var v=parseInt(this.wdAmount);if(!v||v<=0){toast("请输入提现金额","tinfo");return}
      if(v<100){toast("最低提现100金币","tinfo");return}
      if(v>this.wallet.balance){toast("余额不足","terr");return}
      this.wdBusy=true;
      try{var r=await api("/wallet/withdraw",{method:"POST",body:JSON.stringify({amount:v})});if(r.code===0){toast("提现成功","tok");this.showWithdraw=false;this.load()}else{toast(r.message||"提现失败","terr")}}catch(e){toast(e.message||"提现失败","terr")}
      this.wdBusy=false;
    },
    txIcon: function(t){return t.type==="recharge"?"💳":t.type==="gift_receive"?"🎁":t.type==="withdraw"?"🏦":t.type==="checkin"?"📅":t.type==="task_reward"?"🎯":"💰"},
    txText: function(t){return t.description||({recharge:"金币充值",gift_send:"赠送礼物",gift_receive:"收到礼物",withdraw:"提现",checkin:"签到奖励",task_reward:"任务奖励"}[t.type]||t.type)},
    fmtTime: function(t){if(!t)return"";try{return new Date(t).toLocaleString("zh-CN")}catch(e){return t}},
    statusText: function(st){return st===1?"已支付":st===2?"已取消":"待支付"},
    statusColor: function(st){return st===1?"var(--s)":st===2?"var(--tm)":"#F6D365"},
    wdStatus: function(st){return st===1?"已提现":st===2?"已驳回":"处理中"},
    go: function(p){this.$router.push(p)}
  },
  mounted: function(){this.load()},
  template: `<div style="padding:16px">
    <div style="background:linear-gradient(135deg,#FF5E7D,#FF8E8E);color:#fff;padding:24px;border-radius:var(--r);margin-bottom:16px;position:relative;overflow:hidden">
      <div style="font-size:13px;opacity:.85">我的余额</div>
      <div style="font-size:38px;font-weight:700;margin:6px 0">🪙{{wallet.balance||0}}</div>
      <div style="display:flex;gap:0;margin-top:10px;padding-top:12px;border-top:1px solid rgba(255,255,255,.2)">
        <div style="flex:1;text-align:center"><div style="font-size:16px;font-weight:600">{{wallet.total_recharge||0}}</div><div style="font-size:11px;opacity:.8">累计充值</div></div>
        <div style="flex:1;text-align:center"><div style="font-size:16px;font-weight:600">{{wallet.total_spent||0}}</div><div style="font-size:11px;opacity:.8">累计消费</div></div>
        <div style="flex:1;text-align:center"><div style="font-size:16px;font-weight:600">{{wallet.total_earned||0}}</div><div style="font-size:11px;opacity:.8">累计收益</div></div>
      </div>
    </div>
    <div style="display:flex;gap:10px;margin-bottom:14px">
      <button class="btn bp bs" class="flex1" @click="go('/recharge')">💰 充值</button>
      <button class="btn bo bs" class="flex1" @click="openWithdraw">🏦 提现</button>
    </div>
    <div style="display:flex;gap:10px;margin-bottom:14px">
      <div style="flex:1;background:var(--w);border-radius:var(--rs);padding:14px 12px;text-align:center;cursor:pointer;box-shadow:var(--sh)" @click="go('/orders')"><div style="font-size:22px">🧾</div><div style="font-size:12px;margin-top:4px">我的订单</div><div style="font-size:11px;color:var(--tm);margin-top:2px">{{orders.length}}笔</div></div>
      <div style="flex:1;background:var(--w);border-radius:var(--rs);padding:14px 12px;text-align:center;cursor:pointer;box-shadow:var(--sh)" @click="go('/earnings')"><div style="font-size:22px">📊</div><div style="font-size:12px;margin-top:4px">我的收益</div><div style="font-size:11px;color:var(--tm);margin-top:2px">累计{{wallet.total_earned||0}}</div></div>
    </div>
    <div style="display:flex;background:var(--w);border-radius:var(--rs);overflow:hidden;box-shadow:var(--sh);margin-bottom:8px">
      <div style="flex:1;text-align:center;padding:11px 0;font-size:14px;font-weight:600;cursor:pointer" :style="{background:tab==='txs'?'var(--p)':'transparent',color:tab==='txs'?'#fff':'var(--ts)'}" @click="tab='txs'">交易明细</div>
      <div style="flex:1;text-align:center;padding:11px 0;font-size:14px;font-weight:600;cursor:pointer" :style="{background:tab==='withdraws'?'var(--p)':'transparent',color:tab==='withdraws'?'#fff':'var(--ts)'}" @click="tab='withdraws'">提现记录</div>
    </div>
    <div v-if="loading" style="text-align:center;padding:32px"><div class="spin"></div></div>
    <template v-else-if="tab==='txs'">
      <div v-if="txs.length===0" class="empty"><div class="ei">📭</div><div class="et">暂无交易记录</div></div>
      <div v-else v-for="tx in txs" :key="tx.id" style="display:flex;align-items:center;padding:12px;background:var(--w);border-radius:var(--rs);margin-bottom:6px;box-shadow:var(--sh)">
        <span style="font-size:24px;margin-right:12px">{{txIcon(tx)}}</span>
        <div class="flex1"><div style="font-size:14px">{{txText(tx)}}</div><div style="font-size:11px;color:var(--tm)">{{fmtTime(tx.created_at)}}</div></div>
        <span :style="{fontWeight:'600',color:tx.amount>0?'var(--s)':'var(--e)'}">{{tx.amount>0?'+'+tx.amount:tx.amount}}</span>
      </div>
    </template>
    <template v-else>
      <div v-if="withdraws.length===0" class="empty"><div class="ei">🏦</div><div class="et">暂无提现记录</div></div>
      <div v-else v-for="w in withdraws" :key="w.id" style="display:flex;align-items:center;padding:12px;background:var(--w);border-radius:var(--rs);margin-bottom:6px;box-shadow:var(--sh)">
        <span style="font-size:24px;margin-right:12px">🏦</span>
        <div class="flex1"><div style="font-size:14px">提现 {{w.amount}} 金币</div><div style="font-size:11px;color:var(--tm)">{{fmtTime(w.created_at)}}</div></div>
        <span style="font-size:12px;font-weight:600;color:var(--s)">{{wdStatus(w.status)}}</span>
      </div>
    </template>
    <transition name="slide-up"><div v-if="showWithdraw" style="position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,.75);z-index:300;display:flex;flex-direction:column;justify-content:flex-end"><div class="flex1" @click="closeWithdraw"></div><div style="background:#fff;border-radius:16px 16px 0 0;overflow:hidden;padding:20px 16px calc(20px + env(safe-area-inset-bottom,0px))"><div style="display:flex;align-items:center;margin-bottom:16px"><span style="font-size:14px;color:var(--tm);cursor:pointer" @click="closeWithdraw">取消</span><span style="flex:1;text-align:center;font-size:16px;font-weight:600">提现</span><span style="width:28px"></span></div><div style="text-align:center;font-size:13px;color:var(--tm);margin-bottom:16px">当前余额：🪙{{wallet.balance||0}} 金币，最低提现100金币</div><div class="inp" style="margin-bottom:16px"><input v-model="wdAmount" type="number" inputmode="numeric" placeholder="请输入提现金额（金币）"></div><button class="btn bp bw bl" @click="doWithdraw" :disabled="wdBusy">{{wdBusy?'处理中...':'确认提现'}}</button><p style="text-align:center;color:var(--tm);font-size:11px;margin-top:12px">公测期间为模拟提现，不涉及真实转账</p></div></div></transition>
  </div>`
};

var FansPage = {
  data: function(){return {list:[],loading:true}},
  mounted: async function(){try{var r=await api("/user/fans");this.list=r.data||[]}catch(e){}this.loading=false},
  template: `<div style="padding:12px 16px"><div v-if="loading" style="text-align:center;padding:32px"><div class="spin"></div></div><div v-else-if="list.length===0" class="empty"><div class="ei">👥</div><div class="et">暂无粉丝</div></div><div v-else v-for="u in list" :key="u.id" style="display:flex;align-items:center;padding:12px;background:var(--w);border-radius:var(--rs);margin-bottom:6px;gap:12px;box-shadow:var(--sh)"><div class="avatar av-sm"><img loading="lazy" v-if="u.avatar" :src="u.avatar"><span v-else>👤</span></div><div><div style="font-weight:500">{{u.nickname}}</div><div style="font-size:12px;color:var(--tm)">{{u.location||""}}</div></div></div></div>`
};

var FollowingPage = {
  data: function(){return {list:[],loading:true}},
  mounted: async function(){try{var r=await api("/user/following");this.list=r.data||[]}catch(e){}this.loading=false},
  template: `<div style="padding:12px 16px"><div v-if="loading" style="text-align:center;padding:32px"><div class="spin"></div></div><div v-else-if="list.length===0" class="empty"><div class="ei">❤️</div><div class="et">暂无关注</div></div><div v-else v-for="u in list" :key="u.id" style="display:flex;align-items:center;padding:12px;background:var(--w);border-radius:var(--rs);margin-bottom:6px;gap:12px;box-shadow:var(--sh)"><div class="avatar av-sm"><img loading="lazy" v-if="u.avatar" :src="u.avatar"><span v-else>👤</span></div><div><div style="font-weight:500">{{u.nickname}}</div><div style="font-size:12px;color:var(--tm)">{{u.location||""}}</div></div></div></div>`
};

var GuardPage = {
  data: function(){return {tab:"guarding",list:[],loading:true}},
  methods: {
    load:async function(t){this.tab=t;this.loading=true;var ep=t==="guarding"?"/user/guarding":"/user/guarders";try{var r=await api(ep);this.list=r.data||[]}catch(e){this.list=[]}this.loading=false},
    openUser:function(item){if(item&&item.target_user_id)this.$router.push("/user/"+item.target_user_id)}
  },
  mounted: function(){this.load("guarding")},
  template: `<div style="padding:12px 16px"><div style="display:flex;gap:8px;margin-bottom:12px"><button class="btn bs" :class=\"tab==='guarding'?'bp':'bo'\" @click="load('guarding')">我守护的</button><button class="btn bs" :class=\"tab==='guarders'?'bp':'bo'\" @click="load('guarders')">守护我的</button></div><div v-if="loading" style="text-align:center;padding:32px"><div class="spin"></div></div><div v-else-if="list.length===0" class="empty"><div class="ei">🛡️</div><div class="et">暂无数据</div></div><div v-else v-for="item in list" :key="item.id" @click="openUser(item)" style="display:flex;align-items:center;padding:12px;background:var(--w);border-radius:var(--rs);margin-bottom:6px;gap:12px;box-shadow:var(--sh);cursor:pointer"><div class="avatar av-sm"><img loading="lazy" v-if="item.avatar" :src="item.avatar"><span v-else>👤</span></div><div class="flex1"><div style="font-weight:500">{{item.nickname}}</div><div style="font-size:12px;color:var(--tm)">{{item.age?item.age+'岁 ':''}}{{item.location||''}}</div></div><span style="color:var(--tm)">›</span></div></div>`
};

var ViewersPage = {
  data: function(){return {list:[],loading:true}},
  methods: {
    fmtVisitCount:function(n){return n>10?'10+':(n||0)},
    fmtViewTime:function(t){
      if(!t)return"";
      var d=new Date(t),now=new Date();
      var sameDay=d.toDateString()===now.toDateString();
      if(sameDay)return"今天 "+("0"+d.getHours()).slice(-2)+":"+("0"+d.getMinutes()).slice(-2);
      var yes=new Date(now);yes.setDate(yes.getDate()-1);
      if(d.toDateString()===yes.toDateString())return"昨天";
      var diffDays=Math.floor((now-d)/86400000);
      if(diffDays<30)return diffDays+"天前";
      return ("0"+(d.getMonth()+1)).slice(-2)+"/"+("0"+d.getDate()).slice(-2);
    },
    fmtDistance:function(v){
      if(v&&typeof v.distance==="number"){if(v.distance<1)return Math.round(v.distance*1000)+"m";return Math.round(v.distance)+"km"}
      return v&&v.location?("📍"+v.location):"";
    },
    openUser:function(v){if(v&&v.user_id)this.$router.push("/user/"+v.user_id)}
  },
  mounted: async function(){try{var r=await api("/user/viewers");this.list=r.data||[]}catch(e){this.list=[]}this.loading=false},
  template: `<div style="padding:12px 16px"><div v-if="loading" style="text-align:center;padding:32px"><div class="spin"></div></div><div v-else-if="list.length===0" class="empty"><div class="ei">👀</div><div class="et">暂无访客</div><div class="ed">有人看过你的主页后会显示在这里</div></div><div v-else v-for="v in list" :key="v.user_id" @click="openUser(v)" style="display:flex;align-items:center;padding:12px;background:var(--w);border-radius:var(--rs);margin-bottom:6px;gap:12px;box-shadow:var(--sh);cursor:pointer"><div class="avatar av-sm"><img loading="lazy" v-if="v.avatar" :src="fmtImg(v.avatar)"><span v-else>👤</span></div><div style="flex:1;min-width:0"><div style="display:flex;align-items:center;gap:8px"><span style="font-weight:600;font-size:15px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">{{v.nickname}}</span><span v-if="v.visit_count>1" style="font-size:11px;color:var(--p);background:var(--bg-page);padding:2px 8px;border-radius:10px;flex-shrink:0">访问{{fmtVisitCount(v.visit_count)}}</span></div><div style="font-size:12px;color:var(--tm);margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">{{fmtDistance(v)}}<span v-if="v.age" style="margin-left:6px">{{v.age}}岁</span></div></div><span style="color:var(--tm)">{{fmtViewTime(v.created_at)}}</span><span style="color:var(--tm)">›</span></div></div>`
};

// ==== Router ====
// ==== 通用占位页（S20：Settings 未建功能项的明确占位） ====
var PlaceholderPage = {
  props: { title: { type: String, default: "功能建设中" }, icon: { type: String, default: "🚧" } },
  data: function(){return {appVersion:APP_VERSION}},
  template: `<div style="padding:48px 24px;text-align:center"><div style="font-size:56px;margin-bottom:16px">{{icon}}</div><div style="font-size:20px;font-weight:600;color:var(--t);margin-bottom:8px">{{title}}</div><div style="font-size:14px;color:var(--tm);margin-bottom:24px">该功能正在建设中，敬请期待{{appVersion}}</div><button class="btn bp bs" @click="$router.back()">返回</button></div>`
};

var DeactivatePage = {
  data: function(){return {submitting:false}},
  methods: {
    submit: async function(){
      var s=this;
      if(!window.confirm("确认注销账号？注销后进入14天冷静期，期间可联系客服恢复。此操作不可逆转，请谨慎操作。"))return;
      s.submitting=true;
      try{
        var r=await api("/user/deactivate",{method:"POST",body:JSON.stringify({})});
        if(r.code===0){toast(r.message||"已提交注销申请","tok");localStorage.clear();try{ws&&ws.close()}catch(e){}this.$router.replace("/login");}
        else toast(r.message||"注销申请提交失败","terr");
      }catch(e){toast(e.message||"注销申请提交失败，请稍后重试","terr")}
      s.submitting=false;
    }
  },
  template: `<div style="padding:24px 16px"><div class="card" style="padding:24px"><div style="font-size:40px;text-align:center;margin-bottom:12px">🗑️</div><div style="font-size:18px;font-weight:600;text-align:center;margin-bottom:12px">注销账号</div><div style="font-size:13px;color:var(--tm);line-height:1.7;margin-bottom:20px">注销后账号资料将被冻结，进入 <b>14 天冷静期</b>，期间可联系客服恢复。冷静期满后账号及所有数据将被永久删除，不可恢复。请谨慎操作。</div><button class="btn bp bs bw" style="width:100%" @click="submit" :disabled="submitting">{{submitting?'提交中...':'申请注销'}}</button></div></div>`
};

var SearchPage = {
  name:"SearchPage",
  data: function(){return {q:"",tab:"user",results:[],loading:false,err:"",hasMore:false,offset:0}},
  methods: {
    onSearch: function(){
      this.results=[];this.offset=0;this.hasMore=false;this.doSearch();
    },
    doSearch: async function(){
      var s=this;
      if(!s.q.trim()){toast("请输入搜索关键词","tinfo");return}
      s.loading=true;s.err="";
      try{
        var url="/user/search?q="+encodeURIComponent(s.q.trim())+"&limit=20&offset="+s.offset;
        var r=await api(url);
        var list=r.data||[];
        s.results=s.results.concat(list);
        s.offset+=list.length;
        s.hasMore=list.length===20;
      }catch(e){s.err=e.message||"搜索失败"}
      s.loading=false;
    },
    loadMore: function(){this.doSearch()},
    timeAgo:function(t){if(!t)return"";var s=(Date.now()-new Date(t).getTime())/1000;if(s<60)return"刚刚";if(s<3600)return Math.floor(s/60)+"分钟前";if(s<86400)return Math.floor(s/3600)+"小时前";return Math.floor(s/86400)+"天前"}
  },
  template: `<div style="padding:12px 16px"><div style="display:flex;gap:8px;margin-bottom:14px"><div style="flex:1;display:flex;align-items:center;background:var(--w);border-radius:20px;padding:0 14px;box-shadow:var(--sh)"><span style="color:var(--tm)">🔍</span><input v-model="q" @keyup.enter="onSearch" placeholder="搜索昵称或签名" style="flex:1;border:none;background:none;padding:10px 8px;font-size:15px;outline:none"></div><button class="btn bp bs" @click="onSearch">搜索</button></div><div v-if="loading&&results.length===0" style="text-align:center;padding:32px"><div class="spin"></div></div><div v-else-if="err&&results.length===0" style="text-align:center;padding:32px;color:var(--tm)">{{err}}</div><div v-else-if="results.length===0&&q" style="text-align:center;padding:32px"><div style="font-size:40px;margin-bottom:10px">🔍</div><div style="color:var(--tm)">没有找到相关用户</div></div><div v-else><div v-for="u in results" :key="u.id" class="card" style="display:flex;align-items:center;padding:12px;cursor:pointer" @click="$router.push('/user/'+u.id)"><div style="width:48px;height:48px;border-radius:50%;overflow:hidden;flex-shrink:0;background:linear-gradient(135deg,var(--gradient-a),var(--gradient-b));display:flex;align-items:center;justify-content:center"><img loading="lazy" v-if="u.avatar" :src="u.avatar" style="width:100%;height:100%;object-fit:cover"><span v-else style="font-size:22px">👤</span></div><div style="flex:1;min-width:0;margin-left:12px"><div style="display:flex;align-items:center;gap:6px"><span style="font-size:15px;font-weight:600">{{u.nickname||'TA'}}</span><span style="font-size:12px;color:var(--ts)">{{u.age||'?'}}岁</span><span v-if="u.is_vip" class="tag tp" style="font-size:10px">VIP</span></div><div style="font-size:12px;color:var(--tm);margin-top:3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{{u.bio||u.location||'未填写资料'}}</div></div><span style="color:var(--tm)">›</span></div><div v-if="hasMore" style="text-align:center;padding:14px"><button class="btn bo bs" @click="loadMore" :disabled="loading">{{loading?'加载中...':'加载更多'}}</button></div></div></div>`
};

var NotFoundPage = {
  template: `<div style="padding:48px 24px;text-align:center"><div style="font-size:56px;margin-bottom:16px">🚧</div><div style="font-size:20px;font-weight:600;color:var(--t);margin-bottom:8px">页面不存在</div><div style="font-size:14px;color:var(--tm);margin-bottom:24px">你访问的页面找不到了</div><button class="btn bp bs" @click="$router.replace('/home')">返回首页</button></div>`
};

var routes = [
  {path:"/",component:WelcomePage},{path:"/login",component:LoginPage},
  {path:"/home",component:HomePage},{path:"/discover",component:DiscoverPage},
  {path:"/search",component:SearchPage},
  {path:"/chat",component:ChatListPage},{path:"/chat/:id",component:ChatDetailPage},
  {path:"/post/:id",component:PostDetailPage},{path:"/user/:id",component:UserProfilePage},
  {path:"/edit-profile",component:EditProfilePage},{path:"/vip",component:VipPage},
  {path:"/settings",component:SettingsPage},{path:"/my",component:MyPage},
  {path:"/deactivate",component:DeactivatePage},
  {path:"/checkin",component:CheckinPage},
  {path:"/verification",component:VerificationPage},
  {path:"/blocklist",component:BlockListPage},
  {path:"/account-security",component:PlaceholderPage,props:{title:"账号安全",icon:"🔒"}},
  {path:"/notifications",component:PlaceholderPage,props:{title:"消息通知",icon:"🔔"}},
  {path:"/help",component:PlaceholderPage,props:{title:"帮助与反馈",icon:"❓"}},
  {path:"/meet",component:MeetPage},{path:"/recharge",component:RechargePage},
  {path:"/wallet",component:WalletPage},
  {path:"/earnings",component:EarningsPage},{path:"/fans",component:FansPage},
  {path:"/following",component:FollowingPage},{path:"/guarding",component:GuardPage},
  {path:"/viewers",component:ViewersPage},
  {path:"/community",component:CommunityPage},
  {path:"/noble",component:NoblePage},
  {path:"/orders",component:OrdersPage},
  {path:"/intimacy/:userId",component:IntimacyPage},
  {path:"/icebreaker",component:IcebreakerPage},
  {path:"/game",component:GamePage},
  {path:'/:pathMatch(.*)*',component:NotFoundPage}
];
var router = VueRouter.createRouter({history:VueRouter.createWebHashHistory(),routes:routes});
router.beforeEach(function(to,from,next){var m={home:"遇见",discover:"动态",chat:"消息",my:"我的",login:"登录",community:"圈子",noble:"贵族装扮",orders:"我的订单",wallet:"我的钱包",icebreaker:"破冰",game:"游戏",guarding:"我的守护",viewers:"最近访客",fans:"我的粉丝",following:"我的关注"};document.title=(m[to.path.replace("/","")]||"遇见")+" - 遇见";previewClose();if(to.path!=="/"&&from.path==="/"){next(true);return}next()});
// 换页后重置共享滚动容器 .pg 的滚动位置，避免新页面停在旧滚动位置
router.afterEach(function(){var el=document.querySelector(".pg");if(el)el.scrollTop=0});

// ==== App ====
// 简短提示音（Web Audio API，无需外部文件）
function _playBeep(){try{var ctx=new(window.AudioContext||window.webkitAudioContext)();var o=ctx.createOscillator();var g=ctx.createGain();o.connect(g);g.connect(ctx.destination);o.frequency.value=800;o.type="sine";g.gain.setValueAtTime(0.25,ctx.currentTime);g.gain.exponentialRampToValueAtTime(0.01,ctx.currentTime+0.3);o.start(ctx.currentTime);o.stop(ctx.currentTime+0.3);}catch(e){}}
var AppRoot = {
  data: function(){return {toasts:toasts,uiState:uiState,appVersion:APP_VERSION,unreadCount:0,pv:pv,online:navigator.onLine,showInstall:false}},
  computed: {
    showNav: function(){var p=this.$route.path;return p==="/home"||p==="/discover"||p==="/chat"||p==="/my"},
    pageTitle: function(){var m={home:"遇见",discover:"动态",chat:"消息",my:"我的",login:"登录"};return m[this.$route.path.replace("/","")]||"遇见"},
    // 一级菜单（底部导航 4 个 tab）不显示返回键，二级以下页面保留
    showBack: function(){var p=this.$route.path;return p!=="/"&&p!=="/home"&&p!=="/discover"&&p!=="/chat"&&p!=="/my"&&p!=="/login"}
  },
  methods: {
    goBack:function(){this.$router.back()},
    loadUnreadCount: async function(){
      try{
        var r=await api("/chat/unread-count");
        if(r.code===0&&r.data){
          this.unreadCount=r.data.count||0;
        }
      }catch(e){}
    },
    // 多 tab 通知去重：仅「活跃 tab」弹提示，后台 tab 静默更新未读数
    onGlobalMsg: function(d){
      // 只处理收到的消息，忽略自己发出的消息确认
      if(d.type!=="message"||!d.data)return;
      var self=this;
      var myId=parseInt(localStorage.getItem("userId"));
      if(d.data.sender_id===myId)return;
      // 更新未读计数（聊天列表页由 ChatListPage 按会话求和同步，此处避免双重计数）
      if(self.$route.path!=="/chat"&&!self.$route.path.startsWith("/chat/")){
        self.unreadCount=(self.unreadCount||0)+1;
      }
      // 仅活跃 tab 弹提示（后台 tab 不打扰），避免多 tab 重复通知
      if(self._activeTabId!==self._myTabId)return;
      // 不在聊天详情页时提示
      if(!self.$route.path.startsWith("/chat/")){
        var nick=d.data.sender_nickname||"用户";
        var content=(d.data.content||"").slice(0,30);
        // 使用新的通知工具
        if(window.NotificationUtils){
          window.NotificationUtils.showNotification({
            title:'遇见 - 新消息',
            body:nick+": "+content,
            type:'message',
            icon:'/icon.png',
            onClick:function(){
              self.$router.push('/chat/'+d.data.conversation_id);
            }
          });
        } else {
          // 降级到旧版通知
          _playBeep();
          toast("💬 "+nick+": "+content,"tok");
        }
      }
    },
    onMatchSuccess: function(d){
      if(d.type!=="match_success"||!d.data)return;
      var self=this;
      var partner=d.data.partner||{};
      // 匹配成功通知
      if(window.NotificationUtils){
        window.NotificationUtils.showNotification({
          title:'💕 匹配成功！',
          body:'你和'+(partner.nickname||'TA')+'互相喜欢，快去聊天吧！',
          type:'match',
          icon:partner.avatar||'/icon.png',
          onClick:function(){
            self.$router.push('/chat/'+d.data.conversation_id);
          }
        });
      } else {
        toast("💕 匹配成功！","tok");
      }
    },
    onSuperLike: function(d){
      if(d.type!=="super_like_received"||!d.data)return;
      // 超级喜欢通知
      if(window.NotificationUtils){
        window.NotificationUtils.showNotification({
          title:'⭐ 超级喜欢',
          body:'有人超级喜欢了你！',
          type:'like',
          icon:'/icon.png'
        });
      } else {
        toast("⭐ 有人超级喜欢了你！","tok");
      }
    },
    // S13：App启动注册推送Token（离线推送链路）
    registerPushToken: function(){
      var self=this;
      var cached=localStorage.getItem("pushToken");
      if(cached)return; // 已注册过
      var devId="web_"+Date.now()+"_"+Math.random().toString(36).slice(2,10);
      api("/push/register",{method:"POST",body:JSON.stringify({platform:"web",device_token:devId})}).then(function(r){
        if(r.code===0){localStorage.setItem("pushToken",devId)}
      }).catch(function(){});
    },
    // U34 A2HS：显示安装提示
    dismissInstall: function(){this.showInstall=false;localStorage.setItem("a2hsDismissed","1")},
    installApp: function(){
      var self=this;
      if(self._deferredPrompt){
        self._deferredPrompt.prompt();
        self._deferredPrompt.userChoice.then(function(){
          self.showInstall=false;localStorage.setItem("a2hsDismissed","1");
          self._deferredPrompt=null;
        }).catch(function(){});
      } else {
        toast("请在浏览器菜单中选择「添加到主屏幕」","tinfo");
      }
    }
  },
  mounted: function(){
    var self=this;
    // 全局图片加载失败兜底（捕获阶段拦截所有 IMG error）
    self._imgErrFn=function(e){if(e&&e.target&&e.target.tagName==="IMG")imgFallback(e)};
    document.addEventListener("error",self._imgErrFn,true);
    // 离线状态监听
    self._onlineFn=function(){self.online=true};
    self._offlineFn=function(){self.online=false};
    window.addEventListener("online",self._onlineFn);
    window.addEventListener("offline",self._offlineFn);
    // 消息通知
    self._gMsgFn=function(d){self.onGlobalMsg(d)};
    wsOn("message",self._gMsgFn);
    // 匹配成功通知
    self._matchFn=function(d){self.onMatchSuccess(d)};
    wsOn("match_success",self._matchFn);
    // 超级喜欢通知
    self._superLikeFn=function(d){self.onSuperLike(d)};
    wsOn("super_like_received",self._superLikeFn);
    // 多 tab 去重：BroadcastChannel 同步「活跃 tab」，仅活跃 tab 弹通知
    if(typeof BroadcastChannel!=="undefined"){
      try{
        self._myTabId="t"+Date.now()+"_"+Math.random().toString(36).slice(2,8);
        self._activeTabId=self._myTabId; // 默认自己是活跃 tab
        self._bc=new BroadcastChannel("yujian_tab");
        self._bc.onmessage=function(ev){
          if(ev&&ev.data&&ev.data.active)self._activeTabId=ev.data.active;
        };
        // 页面获得焦点时声明自己是活跃 tab
        self._focusFn=function(){
          self._activeTabId=self._myTabId;
          if(self._bc)self._bc.postMessage({active:self._myTabId});
        };
        window.addEventListener("focus",self._focusFn);
        self._focusFn();
      }catch(e){self._bc=null}
    }
    // 请求桌面通知权限
    if(window.NotificationUtils){
      window.NotificationUtils.requestNotificationPermission();
    } else {
      try{window.Notification&&window.Notification.requestPermission()}catch(e){}
    }
    // 加载未读消息数
    self.loadUnreadCount();
    // 定时刷新未读数（每30秒）
    self._unreadTimer=setInterval(function(){self.loadUnreadCount()},30000);
    // App启动注册推送Token（S13：离线推送链路）
    self.registerPushToken();
    // U34 A2HS：捕获安装提示事件，未拒绝过则显示横幅
    self._installFn=function(e){
      e.preventDefault();
      self._deferredPrompt=e;
      if(!localStorage.getItem("a2hsDismissed"))self.showInstall=true;
    };
    window.addEventListener("beforeinstallprompt",self._installFn);
    // U28 PWA 已安装后不再提示
    window.addEventListener("appinstalled",function(){self.showInstall=false;localStorage.setItem("a2hsDismissed","1")});
  },
  beforeUnmount: function(){
    if(this._imgErrFn)document.removeEventListener("error",this._imgErrFn,true);
    if(this._onlineFn)window.removeEventListener("online",this._onlineFn);
    if(this._offlineFn)window.removeEventListener("offline",this._offlineFn);
    wsOff("message",this._gMsgFn);
    wsOff("match_success",this._matchFn);
    wsOff("super_like_received",this._superLikeFn);
    if(this._focusFn)window.removeEventListener("focus",this._focusFn);
    if(this._bc)try{this._bc.close()}catch(e){}
    if(this._installFn)window.removeEventListener("beforeinstallprompt",this._installFn);
    if(this._unreadTimer)clearInterval(this._unreadTimer);
  },
  template: `<div class="app"><header class="hdr" v-if="pageTitle&&!uiState.hideHdr"><button class="bk" v-if="showBack" @click="goBack">‹</button><span class="tt">{{pageTitle}}</span></header><div v-if="!online" class="offline-banner">📡 当前离线，部分功能暂不可用</div><div v-if="showInstall" style="display:flex;align-items:center;gap:10px;background:#fff;padding:10px 14px;border-bottom:1px solid var(--border-light);flex-shrink:0;z-index:110"><span style="font-size:22px">📲</span><div style="flex:1;font-size:13px;color:var(--ts)">安装「遇见」到桌面，聊天更方便</div><button @click="dismissInstall" style="border:none;background:none;color:var(--tm);font-size:13px;cursor:pointer">暂不</button><button @click="installApp" style="border:none;background:var(--primary);color:#fff;border-radius:16px;padding:6px 16px;font-size:13px;cursor:pointer">安装</button></div><main :class=\"['pg',showNav?'pg-nav':'pg-nonav']\"><router-view v-slot=\"{Component,route}\"><transition name=\"sl\" mode=\"out-in\"><keep-alive include=\"HomePage,DiscoverPage,ChatListPage,MyPage\"><component :is=\"Component\" :key=\"route.fullPath\"/></keep-alive></transition></router-view></main><nav class=\"nav\" v-if=\"showNav\"><router-link to=\"/home\" active-class=\"on\"><div class=\"ni\"><svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z\"/></svg></div><div class=\"nl\">遇见</div></router-link><router-link to=\"/discover\" active-class=\"on\"><div class=\"ni\"><svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M2 3l6.4 18.5 3.4-8 8-3.4z\"/></svg></div><div class=\"nl\">动态</div></router-link><router-link to=\"/chat\" active-class=\"on\" style=\"position:relative\"><div class=\"ni\"><svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z\"/></svg><span v-if=\"unreadCount>0\" class=\"badge\">{{unreadCount>99?'99+':unreadCount}}</span></div><div class=\"nl\">消息</div></router-link><router-link to=\"/my\" active-class=\"on\"><div class=\"ni\"><svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2\"/><circle cx=\"12\" cy=\"7\" r=\"4\"/></svg></div><div class=\"nl\">我的</div></router-link><span style="position:fixed;bottom:2px;right:4px;font-size:8px;color:var(--tm);opacity:.4">{{appVersion}}</span></nav><div v-if="pv.show" class="image-preview-overlay" @click="preview.close()" @touchstart="onPvTouchStart($event)" @touchend="onPvTouchEnd($event)"><img class="image-preview-img" :class="pv.scaled?'scale-2x':''" :src="pv.list[pv.idx]" @click.stop @dblclick="preview.toggleScale()"><button class="image-preview-close" @click="preview.close()">✕</button><span v-if="pv.list.length>1" style="position:fixed;top:50%;left:10px;transform:translateY(-50%);z-index:10001;color:#fff;font-size:30px;background:rgba(255,255,255,.15);width:44px;height:44px;border-radius:50%;border:none;cursor:pointer;line-height:44px;text-align:center" @click.stop="preview.prev()">‹</span><span v-if="pv.list.length>1" style="position:fixed;top:50%;right:10px;transform:translateY(-50%);z-index:10001;color:#fff;font-size:30px;background:rgba(255,255,255,.15);width:44px;height:44px;border-radius:50%;border:none;cursor:pointer;line-height:44px;text-align:center" @click.stop="preview.next()">›</span><span class="image-preview-counter">{{pv.idx+1}}/{{pv.list.length}}</span></div></div>`
};

var app = Vue.createApp(AppRoot);
app.use(router);
// 注册全局工具函数，供模板直接调用（Vue3 不会自动暴露 window 上的全局函数）
app.config.globalProperties.timeStr = function(t) { if(!t)return""; var d=new Date(t); return ("0"+d.getHours()).slice(-2)+":"+("0"+d.getMinutes()).slice(-2); };
app.config.globalProperties.timeAgo = function(t) { if(!t)return""; var d=Math.floor((Date.now()-new Date(t).getTime())/1000); if(d<60)return"刚刚"; if(d<3600)return Math.floor(d/60)+"分钟前"; if(d<86400)return Math.floor(d/3600)+"小时前"; return Math.floor(d/86400)+"天前"; };
app.config.globalProperties.fmtImg = fmtImg;
app.config.globalProperties.preview = { open: previewOpen, close: previewClose, next: previewNext, prev: previewPrev, toggleScale: previewToggleScale };
app.mount("#app");
if(localStorage.getItem("token"))wsConnect();
