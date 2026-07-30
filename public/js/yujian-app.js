/* yujian-app.js - 遇见APP 主应用 */

// ==== 工具函数 ====
var toasts = Vue.reactive([]);
var _tid = 0;
function toast(msg, cls) { var id = ++_tid; toasts.push({id:id, msg:msg, cls:cls}); setTimeout(function(){ var i=toasts.findIndex(function(t){return t.id===id}); if(i>-1)toasts.splice(i,1); }, 3000); }
function token() { return localStorage.getItem("token") || ""; }
function timeAgo(t) { if(!t)return""; var d=Math.floor((Date.now()-new Date(t).getTime())/1000); if(d<60)return"刚刚"; if(d<3600)return Math.floor(d/60)+"分钟前"; if(d<86400)return Math.floor(d/3600)+"小时前"; return Math.floor(d/86400)+"天前"; }
function timeStr(t) { if(!t)return""; var d=new Date(t); return ("0"+d.getHours()).slice(-2)+":"+("0"+d.getMinutes()).slice(-2); }
async function api(url, opts) {
  opts=opts||{};
  var h={"Content-Type":"application/json"};
  var t=token();
  if(t)h["Authorization"]="Bearer "+t;
  if(opts.body instanceof FormData)delete h["Content-Type"];
  var ctrl=new AbortController();
  var timer=setTimeout(function(){ctrl.abort()},15000);
  try{
    var r=await fetch("/api"+url, Object.assign({},opts,{headers:Object.assign({},h,opts.headers||{}),signal:ctrl.signal}));
    clearTimeout(timer);
    var d=await r.json();
    if(r.status===401){localStorage.clear();location.hash="#/login";throw new Error("登录已过期，请重新登录")}
    if(d&&d.code!==undefined&&d.code!==0)throw new Error(d.message||"请求失败");
    return d;
  }catch(e){
    clearTimeout(timer);
    if(e.name==="AbortError")throw new Error("网络请求超时，请检查网络连接");
    throw e;
  }
}

// ==== WebSocket ====
var ws=null,wsTimer=null,wsCount=0,wsHooks={};
function wsOn(type,fn){if(!wsHooks[type])wsHooks[type]=[];wsHooks[type].push(fn)}
function wsOff(type,fn){if(!wsHooks[type])return;var i=wsHooks[type].indexOf(fn);if(i>-1)wsHooks[type].splice(i,1)}
function wsSend(d){return ws&&ws.readyState===1&&!!ws.send(JSON.stringify(d))}
function wsConnect(){var t=token();if(!t)return;if(ws)try{ws.close()}catch(e){}try{ws=new WebSocket((location.protocol==="https:"?"wss:":"ws:")+"//"+location.host+"?token="+t);ws.onopen=function(){wsCount=0;if(wsTimer){clearInterval(wsTimer);clearTimeout(wsTimer);wsTimer=null}wsTimer=setInterval(function(){if(ws&&ws.readyState===1){ws.send(JSON.stringify({type:"ping"}))}},30000)};ws.onmessage=function(e){try{var d=JSON.parse(e.data);if(d.type==="pong")return;if(d.type&&wsHooks[d.type])wsHooks[d.type].forEach(function(fn){fn(d)});if(wsHooks["*"])wsHooks["*"].forEach(function(fn){fn(d)})}catch(_){}};ws.onclose=function(){if(wsTimer){clearInterval(wsTimer);clearTimeout(wsTimer);wsTimer=null}if(wsCount<10){wsCount++;wsTimer=setTimeout(wsConnect,5000)}}}catch(_){}}

// ==== 页面组件 ====
var WelcomePage = {
  methods: { go: function(){ var t=token(); this.$router.replace(t?"/home":"/login"); } },
  mounted: function(){ var s=this; setTimeout(function(){s.go()},2000); },
  template: `<div class="welcome" @click="go"><div style="font-size:72px;animation:hp .6s">💕</div><h1 style="font-size:36px;margin:16px 0">遇见</h1><p style="font-size:16px;opacity:.9">同城交友，遇见心动</p><p style="font-size:13px;opacity:.6;margin-top:32px">点击屏幕进入</p></div>`
};

var LoginPage = {
  data: function(){ return {phone:"",code:"",sent:false,countdown:0,loading:false}; },
  methods: {
    sendCode: async function(){
      if(!/^1[3-9]\d{9}$/.test(this.phone)){toast("请输入正确的手机号","terr");return}
      try{var r=await api("/auth/send-code",{method:"POST",body:JSON.stringify({phone:this.phone})});if(r.code===0){this.sent=true;this.countdown=60;if(r.data&&r.data.code)this.code=r.data.code;var s=this;var iv=setInterval(function(){s.countdown--;if(s.countdown<=0){clearInterval(iv);s.sent=false}},1000);toast("验证码已发送","tok")}else toast(r.message||"发送失败","terr")}catch(e){toast("网络错误","terr")}
    },
    doLogin: async function(){
      if(!this.phone||!this.code){toast("请输入手机号和验证码","terr");return}
      this.loading=true;
      try{var r=await api("/auth/login",{method:"POST",body:JSON.stringify({login:this.phone,code:this.code})});if(r.code===0&&r.data){localStorage.setItem("token",r.data.token);localStorage.setItem("userId",r.data.user.id);if(r.data.user.nickname)localStorage.setItem("uname",r.data.user.nickname);wsConnect();toast("登录成功","tok");this.$router.replace("/home")}else toast(r.message||"登录失败","terr")}catch(e){toast("网络错误","terr")}
      this.loading=false;
    }
  },
  template: `<div style="padding:40px 24px;min-height:100%">
  <div style="text-align:center;margin-bottom:40px"><div style="font-size:56px">💕</div><h2 style="margin-top:8px">欢迎来到遇见</h2><p style="color:var(--tm);font-size:13px;margin-top:4px">手机号登录，即刻开启交友</p></div>
  <div class="inp" style="margin-bottom:12px"><span>📱</span><input v-model="phone" type="tel" maxlength="11" placeholder="请输入手机号" autocomplete="tel"></div>
  <div class="inp" style="margin-bottom:24px"><span>🔐</span><input v-model="code" type="text" maxlength="6" placeholder="验证码" autocomplete="one-time-code"><button class="btn bs" :class="sent&&countdown>0?'bo':'bp'" @click="sendCode" :disabled="sent&&countdown>0">{{sent&&countdown>0?countdown+'s':'获取验证码'}}</button></div>
  <button class="btn bp bw bl" @click="doLogin" :disabled="loading">{{loading?'登录中...':'登录/注册'}}</button>
  <p style="text-align:center;margin-top:24px;font-size:12px;color:var(--tm)">登录即表示同意<span style="color:var(--p)">用户协议</span>和<span style="color:var(--p)">隐私政策</span></p></div>`
};

var HomePage = {
  data: function(){ return {users:[],loading:true,err:false,errMsg:"",tab:"city",currentCity:"",showFilter:false,fAge:[18,35]}; },
  methods: {
    load: async function(){ this.loading=true;this.err=false;try{var r=await api("/match/recommend?scope="+this.tab+"&ageMin="+this.fAge[0]+"&ageMax="+this.fAge[1]+"&limit=20");this.users=r.data||[];if(this.users.length===0)this.errMsg="暂无推荐用户"}catch(e){this.err=true;this.errMsg=e.message||"加载失败，请稍后重试"}this.loading=false; },
    initLocation: function(){
      var self=this;
      if(navigator.geolocation){
        navigator.geolocation.getCurrentPosition(function(pos){
          var lat=pos.coords.latitude,lng=pos.coords.longitude;
          console.log('[定位] 获取到坐标:', lat, lng);
          api("/user/location",{method:"POST",body:JSON.stringify({lat:lat,lng:lng})}).then(function(r){
            console.log('[定位] 上报成功:', r.code, r.data);
            if(r.code===0&&r.data&&r.data.city)self.currentCity=r.data.city;
          }).catch(function(e){console.log('[定位] 上报失败:', e.message)}).then(function(){self.load()});
        },function(err){
          console.log('[定位] GPS获取失败:', err.message);
          self.load();
        },{timeout:10000,enableHighAccuracy:true,maximumAge:0});
      }else{this.load()}
    },
    switchTab: function(t){this.tab=t;this.load()},
    like: function(u){if(!u)return;var s=this;api("/match/like",{method:"POST",body:JSON.stringify({target_user_id:u.id})}).then(function(r){if(r.data&&r.data.matched)toast("💕 匹配成功！","tok")}).catch(function(e){toast(e.message,"terr")});s.users=s.users.filter(function(x){return x.id!==u.id})},
    skip: function(u){if(!u)return;var s=this;api("/match/skip",{method:"POST",body:JSON.stringify({target_user_id:u.id})}).catch(function(){});s.users=s.users.filter(function(x){return x.id!==u.id})},
    parseTags: function(t){if(!t)return[];if(Array.isArray(t))return t;try{return JSON.parse(t)}catch(e){return[]}}
  },
  mounted: function(){this.load();this.initLocation()},
  template: `<div style="padding:12px 16px">
  <div style="display:flex;gap:8px;margin-bottom:12px">
    <button class="btn bs" :class="tab==='city'?'bp':'bo'" @click="switchTab('city')">{{currentCity?'同城·'+currentCity:'同城'}}</button>
    <button class="btn bs" :class="tab==='nearby'?'bp':'bo'" @click="switchTab('nearby')">附近</button>
    <button class="btn bs bo" style="margin-left:auto" @click="showFilter=!showFilter">🔍</button>
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
  <div v-if="loading" style="text-align:center;padding:48px 0"><div class="spin"></div><p style="color:var(--tm);margin-top:12px;font-size:14px">正在推荐...</p></div>
  <div v-else-if="err" class="empty" style="padding:48px 24px"><div style="font-size:48px;margin-bottom:12px">😵</div><div style="color:var(--ts);margin-bottom:16px;font-size:14px">{{errMsg}}</div><button class="btn bp bs" @click="load">重试</button></div>
  <div v-else-if="users.length===0" class="empty"><div class="ei">🔍</div><div class="et">{{tab==='city'?'暂无同城用户':'暂无附近用户'}}</div><div class="ed">换个时间再来或调整筛选条件</div><button class="btn bp bs" @click="load">刷新</button></div>
  <div v-else style="display:flex;flex-direction:column;gap:10px">
    <div v-for="u in users" :key="u.id" class="card" style="display:flex;align-items:center;padding:12px;cursor:pointer" @click="$router.push('/user/'+u.id)">
      <div style="width:58px;height:58px;border-radius:50%;overflow:hidden;flex-shrink:0;background:linear-gradient(135deg,#667eea,#764ba2);display:flex;align-items:center;justify-content:center">
        <img v-if="u.avatar" :src="u.avatar" style="width:100%;height:100%;object-fit:cover">
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
      <div style="display:flex;flex-direction:column;gap:10px;flex-shrink:0">
        <button @click.stop="skip(u)" title="跳过" style="width:40px;height:40px;border-radius:50%;border:1px solid var(--b);background:var(--w);font-size:16px;cursor:pointer;display:flex;align-items:center;justify-content:center;box-shadow:var(--sh)">✕</button>
        <button @click.stop="like(u)" title="喜欢" style="width:40px;height:40px;border-radius:50%;border:none;background:linear-gradient(135deg,#FF5E7D,#FF8E8E);color:#fff;font-size:16px;cursor:pointer;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 12px rgba(255,107,107,.35)">♥</button>
      </div>
    </div>
  </div></div>`
};

var DiscoverPage = {
  data: function(){return {posts:[],loading:true,err:false,tab:"all",showPublish:false,pubText:"",pubImage:null,pubPreview:""}},
  methods: {
    load: async function(){this.loading=true;this.err=false;try{var r=await api("/posts?limit=20");this.posts=r.data||[];if(this.posts.length===0)this.errMsg="暂无动态"}catch(e){this.err=true;this.errMsg=e.message||"加载失败，请稍后重试"}this.loading=false},
    toggleLike: async function(p){try{await api("/posts/"+p.id+"/like",{method:"POST"});p.liked=!p.liked;p.like_count+=p.liked?1:-1;if(p.like_count<0)p.like_count=0}catch(e){toast(e.message,"terr")}},
    switchTab: function(t){this.tab=t;this.load()},
    pubImageChange: function(e){var f=e.target.files[0];if(f){this.pubImage=f;this.pubPreview=URL.createObjectURL(f)}},
    publish: async function(){var t=this.pubText.trim();if(!t&&!this.pubImage){toast("请输入内容或选择图片","tinfo");return}try{var fd=new FormData();if(t)fd.append("content",t);if(this.pubImage)fd.append("images",this.pubImage);var r=await api("/posts",{method:"POST",body:fd});if(r.code===0){toast("发布成功","tok");this.showPublish=false;this.pubText="";this.pubImage=null;this.pubPreview="";this.load()}else toast(r.message,"terr")}catch(e){toast(e.message,"terr")}}
  },
  mounted: function(){this.load()},
  template: `<div style="padding:12px 16px">
  <div style="display:flex;gap:8px;margin-bottom:12px">
    <button class="btn bs" :class="tab==='all'?'bp':'bo'" @click="switchTab('all')">全部</button>
    <button class="btn bs" :class="tab==='nearby'?'bp':'bo'" @click="switchTab('nearby')">附近</button>
    <button class="btn bp bs" style="margin-left:auto" @click="showPublish=true">✏️ 发布</button>
  </div>
  <div v-if="showPublish" class="card" style="padding:16px;margin-bottom:12px">
    <textarea v-model="pubText" placeholder="分享你的生活..." style="width:100%;min-height:80px;border:1px solid var(--b);border-radius:8px;padding:10px;font-size:15px;resize:vertical" maxlength="500"></textarea>
    <div v-if="pubPreview" style="position:relative;display:inline-block;margin-top:8px"><img :src="pubPreview" style="max-width:200px;max-height:200px;border-radius:8px"><button @click="pubImage=null;pubPreview=''" style="position:absolute;top:-8px;right:-8px;width:24px;height:24px;border-radius:50%;background:var(--e);color:#fff;border:none;cursor:pointer;font-size:14px">✕</button></div>
    <div style="display:flex;gap:8px;margin-top:10px;align-items:center">
      <label style="cursor:pointer;font-size:24px">📷<input type="file" accept="image/*" style="display:none" @change="pubImageChange"></label>
      <span style="font-size:12px;color:var(--tm);flex:1">{{pubText.length}}/500</span>
      <button class="btn bp bs" @click="publish">发布</button>
      <button class="btn bo bs" @click="showPublish=false;pubText='';pubImage=null;pubPreview=''">取消</button>
    </div>
  </div>
  <div v-if="loading" style="text-align:center;padding:48px"><div class="spin"></div><p style="color:var(--tm);margin-top:12px">加载中...</p></div>
  <div v-else-if="err" class="empty" style="padding:48px 24px"><div style="font-size:48px">😵</div><p style="color:var(--ts);margin:12px 0">加载失败</p><button class="btn bp bs" @click="load">重试</button></div>
  <div v-else-if="posts.length===0" class="empty"><div class="ei">📝</div><div class="et">暂无动态</div><div class="ed">来发布第一条动态吧</div></div>
  <div v-else><div v-for="p in posts" :key="p.id" class="card" style="padding:16px;margin-bottom:12px;cursor:pointer" @click="$router.push('/post/'+p.id)">
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">
      <div class="avatar av-sm"><img v-if="p.avatar" :src="p.avatar"><span v-else>👤</span></div>
      <div><div style="font-weight:600;font-size:14px">{{p.nickname||'用户'}}</div><div style="font-size:11px;color:var(--tm)">{{timeAgo(p.created_at)}}</div></div>
    </div>
    <p v-if="p.content" style="margin-bottom:10px;line-height:1.6;font-size:15px">{{p.content}}</p>
    <div v-if="p.images&&p.images.length" :style="{display:'grid',gridTemplateColumns:'repeat('+Math.min(p.images.length,3)+',1fr)',gap:'4px',marginBottom:'10px'}"><img v-for="(img,i) in p.images.slice(0,9)" :src="img" style="width:100%;aspect-ratio:1;object-fit:cover;border-radius:6px"></div>
    <div style="display:flex;gap:24px;font-size:13px;color:var(--tm)"><span @click.stop="toggleLike(p)" :style="{color:p.liked?'var(--p)':''}">{{p.liked?'❤️':'🤍'}} {{p.like_count||0}}</span><span>💬 {{p.comment_count||0}}</span></div>
  </div></div></div>`
};

var PostDetailPage = {
  data: function(){return {post:null,comments:[],text:"",loading:true,pid:0}},
  methods: {
    load: async function(){this.pid=parseInt(this.$route.params.id);this.loading=true;try{var r=await api("/posts/"+this.pid);this.post=(r.data&&r.data.post)||r.data;this.comments=(r.data&&r.data.comments)||[]}catch(e){}this.loading=false},
    toggleLike: async function(){try{await api("/posts/"+this.pid+"/like",{method:"POST"});this.post.liked=!this.post.liked;this.post.like_count+=this.post.liked?1:-1;if(this.post.like_count<0)this.post.like_count=0}catch(e){toast(e.message,"terr")}},
    addComment: async function(){var t=this.text.trim();if(!t)return;try{await api("/posts/"+this.pid+"/comment",{method:"POST",body:JSON.stringify({content:t})});this.text="";var uname=localStorage.getItem("uname")||"我";this.comments.push({content:t,nickname:uname,created_at:new Date().toISOString(),_local:true});if(this.post)this.post.comment_count=(this.post.comment_count||0)+1;toast("评论成功","tok")}catch(e){toast(e.message,"terr")}}
  },
  mounted: function(){this.load()},
  template: `<div>
  <div v-if="loading" style="text-align:center;padding:64px"><div class="spin"></div></div>
  <div v-else-if="!post" class="empty"><div class="ei">😕</div><div class="et">动态不存在</div></div>
  <div v-else>
    <div class="card" style="margin:12px 16px;padding:16px">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px"><div class="avatar av-sm"><img v-if="post.avatar" :src="post.avatar"><span v-else>👤</span></div><div><div style="font-weight:600">{{post.nickname}}</div><div style="font-size:12px;color:var(--tm)">{{timeAgo(post.created_at)}}</div></div></div>
      <p style="line-height:1.6;margin-bottom:10px">{{post.content}}</p>
      <div v-if="post.images&&post.images.length" :style="{display:'grid',gridTemplateColumns:'repeat('+Math.min(post.images.length,3)+',1fr)',gap:'4px',marginBottom:'10px'}"><img v-for="(img,i) in post.images" :src="img" style="width:100%;aspect-ratio:1;object-fit:cover;border-radius:6px"></div>
      <div style="display:flex;gap:24px;color:var(--tm);font-size:13px"><span @click="toggleLike" :style="{color:post.liked?'var(--p)':''}">{{post.liked?'❤️':'🤍'}} {{post.like_count||0}}</span><span>💬 {{post.comment_count||0}}</span></div>
    </div>
    <div style="padding:0 16px;margin-bottom:80px">
      <h4 style="margin-bottom:12px;font-size:14px;color:var(--ts)">评论 ({{comments.length}})</h4>
      <div v-if="comments.length===0" class="empty" style="padding:24px"><div style="font-size:32px;opacity:.4">💬</div><p style="color:var(--tm);font-size:13px">还没有评论</p></div>
      <div v-for="c in comments" :key="c.id||Math.random()" style="display:flex;gap:10px;margin-bottom:12px;padding-bottom:12px;border-bottom:1px solid var(--b)"><div class="avatar av-sm"><img v-if="c.avatar" :src="c.avatar"><span v-else>👤</span></div><div style="flex:1"><div style="font-weight:500;font-size:13px;margin-bottom:4px">{{c.nickname}}<span style="font-size:11px;color:var(--tm);margin-left:8px">{{timeAgo(c.created_at)}}</span></div><p style="font-size:14px;line-height:1.5">{{c.content}}</p></div></div>
    </div>
    <div style="position:fixed;bottom:0;left:0;right:0;padding:10px 16px;background:var(--w);border-top:1px solid var(--b);display:flex;gap:10px;z-index:100;padding-bottom:calc(10px + env(safe-area-inset-bottom,0px))"><div class="inp" style="flex:1;border-radius:20px"><input v-model="text" placeholder="写评论..." @keydown.enter="addComment"></div><button class="btn bp bs" @click="addComment" :disabled="!text.trim()">发送</button></div>
  </div></div>`
};

var ChatListPage = {
  data: function(){return {convs:[],loading:true}},
  methods: {
    load:async function(){this.loading=true;try{var r=await api("/chat/conversations");this.convs=r.data||[]}catch(e){}this.loading=false},
    open:function(c){this.$router.push("/chat/"+c.id)},
    fmtTime:function(t){if(!t)return"";var d=new Date(t),now=new Date();var sameDay=d.toDateString()===now.toDateString();if(sameDay)return ("0"+d.getHours()).slice(-2)+":"+("0"+d.getMinutes()).slice(-2);var yes=new Date(now);yes.setDate(yes.getDate()-1);if(d.toDateString()===yes.toDateString())return"昨天";return ("0"+(d.getMonth()+1)).slice(-2)+"/"+("0"+d.getDate()).slice(-2)},
    fmtLastMsg:function(c){if(!c.last_message)return"暂无消息";if(c.last_msg_type===1)return"[图片]";if(c.last_msg_type===2)return"[语音]";if(c.last_msg_type===99)return c.last_message;return c.last_message}
  },
  mounted: function(){this.load()},
  template: `<div><div v-if="loading" style="text-align:center;padding:64px"><div class="spin"></div></div><div v-else-if="convs.length===0" class="empty"><div class="ei">💬</div><div class="et">还没有聊过天</div><div class="ed">在「遇见」中匹配好友，开始聊天吧</div><router-link to="/home" class="btn bp" style="margin-top:16px;text-decoration:none;display:inline-block">去遇见</router-link></div><div v-else><div v-for="c in convs" :key="c.id" @click="open(c)" class="conv-item"><div class="conv-avatar-wrap"><div class="conv-avatar"><img v-if="c.other_avatar" :src="c.other_avatar"><span v-else class="conv-avatar-placeholder">👤</span></div><span v-if="c.other_online" class="conv-online-dot"></span></div><div class="conv-info"><div class="conv-top-row"><span class="conv-name">{{c.other_nickname||'用户'}}</span><span class="conv-time">{{fmtTime(c.last_message_time)}}</span></div><div class="conv-msg-row"><span class="conv-preview">{{fmtLastMsg(c)}}</span><span v-if="c.unread_count>0" class="conv-badge">{{c.unread_count>99?'99+':c.unread_count}}</span></div></div></div></div></div>`
};


var ChatDetailPage = {
  data: function(){return {
    convId:0,msgs:[],text:"",loading:true,err:false,errMsg:"",
    userId:parseInt(localStorage.getItem("userId")),hasMore:true,
    loadingMore:false,uploading:false,sending:false,
    voiceMode:false,showEmojiPanel:false,showPlusPanel:false,
    recording:false,mediaRecorder:null,audioChunks:[],
    showGiftPanel:false,gifts:[],giftLoading:false,
    calling:false,callType:"",callPartnerId:0,callPartnerName:"",
    showCallDialog:false,incomingCall:null,callDuration:0,callTimer:null,
    emojis:["😀","😁","😂","🤣","😃","😄","😅","😆","😉","😊","😋","😎","😍","😘","😗","😙","😚","🙂","🤗","🤩","🤔","🤨","😐","😑","😶","🙄","😏","😣","😥","😮","🤐","😯","😪","😫","😴","😌","😛","😜","😝","😒","😓","😔","😕","🙃","🤑","😲","🙁","😖","😞","😟","😤","😢","😭","😦","😧","😨","😩","🤯","😬","😰","😱","🥵","🥶","😳","🤪","😵","🥴","😠","😡","🤬","😷","🤒","🤕","🤢","🤮","🥳","🥺","🤠","😇","🤡","🤥","🤫","🤭","🧐","🤓","😈","👻","💀","👽","🤖","💩","❤️","🧡","💛","💚","💙","💜","🖤","💔","❣️","💕","💞","💓","💗","💖","💘","💝","💟","👍","👎","👊","✊","🤛","🤜","👏","🙌","👐","🤲","🤝","🙏","✌️","🤞","🤟","🤘","👌","🤌","🤏","👈","👉","👆","👇","☝️","✋","🤚","🖐️","🖖","👋","🤙","💪","🦾","🖕","✍️","🎉","🎊","🎈","🎁","🎀","🌹","💐","🌸","💯","🔥","⭐","🌟","✨","⚡","💥","💫","🎵","🎶","🍺","🍻","🥂","🍷","🍰","🎂","🍜","🍔","🍟","🌙","☀️","🌈","⛄","🏆","🥇","🏅","🎯","🎮","🎲","🎰","🧧","💰","💵","💴","💶","💷","💸","🪙"]
  }},
  methods: {
    load: async function(isMore){
      var self=this;
      try{self.convId=parseInt(self.$route.params.id)}catch(e){self.convId=0};
      if(!self.convId){toast("会话ID无效","terr");self.loading=false;self.err=true;self.errMsg="会话ID无效";return}
      if(isMore){self.loadingMore=true}else{self.loading=true;self.err=false}
      try{
        var url="/chat/messages?conversation_id="+self.convId+"&limit=50";
        if(isMore&&self.msgs.length>0&&self.msgs[0].id)url+="&before="+self.msgs[0].id;
        var r=await api(url);
        var newMsgs=r.data||[];
        // 后端返回按created_at DESC，需要反转为正序显示
        newMsgs=newMsgs.reverse();
        if(isMore){
          if(newMsgs.length===0){self.hasMore=false}
          else{
            var oldH=self.$refs.chat?self.$refs.chat.scrollHeight:0;
            self.msgs=newMsgs.concat(self.msgs);
            Vue.nextTick(function(){if(self.$refs.chat)self.$refs.chat.scrollTop=self.$refs.chat.scrollHeight-oldH});
          }
        }else{
          self.msgs=newMsgs;self.hasMore=newMsgs.length>=50;
          Vue.nextTick(function(){self.scrollBottom()});
        }
        self.addTimeDividers();
      }catch(e){
        self.err=true;self.errMsg=e.message||"加载失败";
        if(!isMore)toast("加载失败","terr");
      }
      if(isMore){self.loadingMore=false}else{self.loading=false}
    },
    scrollBottom: function(){var el=this.$refs.chat;if(el)el.scrollTop=el.scrollHeight},
    onScroll: function(){
      var self=this,el=self.$refs.chat;
      if(!el||self.loadingMore||!self.hasMore)return;
      if(el.scrollTop<50){self.load(true)}
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
      self.msgs.push(msg);self.text="";Vue.nextTick(function(){self.scrollBottom()});
      try{
        var r=await api("/chat/messages",{method:"POST",body:JSON.stringify({conversation_id:self.convId,content:t,type:0})});
        if(r.code===0&&r.data){
          var idx=self.msgs.indexOf(msg);if(idx>-1){self.msgs[idx].id=r.data.id;self.msgs[idx]._sending=false}
        }else{msg._failed=true;msg._sending=false;toast(r.message||"发送失败","terr")}
      }catch(e){msg._failed=true;msg._sending=false;toast("发送失败","terr")}
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
        var fd=new FormData();fd.append("image",file);
        var r=await api("/upload/image",{method:"POST",body:fd});
        if(r.code===0&&r.data){
          var imgUrl=r.data.url;
          var msg={conversation_id:self.convId,sender_id:self.userId,content:imgUrl,type:1,_local:true,_sending:true,created_at:new Date().toISOString()};
          self.msgs.push(msg);Vue.nextTick(function(){self.scrollBottom()});
          if(!wsSend({type:"send_message",conversation_id:self.convId,content:imgUrl,type:1})){
            api("/chat/messages",{method:"POST",body:JSON.stringify({conversation_id:self.convId,content:imgUrl,type:1})}).catch(function(){});
          }
          msg._sending=false;
        }else{toast("上传失败","terr")}
      }catch(e){toast("上传失败","terr")}
      self.uploading=false;
    },
    toggleVoiceMode: function(){this.voiceMode=!this.voiceMode;this.showEmojiPanel=false;this.showPlusPanel=false},
    insertEmoji: function(e){this.text+=e},
    togglePlus: function(){this.showPlusPanel=!this.showPlusPanel;this.showEmojiPanel=false;this.showGiftPanel=false},
    toggleEmoji: function(){this.showEmojiPanel=!this.showEmojiPanel;this.showPlusPanel=false;this.showGiftPanel=false},
    startRecording: async function(){
      var self=this;
      try{
        var stream=await navigator.mediaDevices.getUserMedia({audio:true});
        self.mediaRecorder=new MediaRecorder(stream);self.audioChunks=[];
        self.mediaRecorder.ondataavailable=function(e){if(e.data.size>0)self.audioChunks.push(e.data)};
        self.mediaRecorder.onstop=function(){self.sendVoice()};
        self.mediaRecorder.start();self.recording=true;
      }catch(e){toast("无法访问麦克风","terr")}
    },
    stopRecording: function(){
      var self=this;if(self.mediaRecorder&&self.recording){self.mediaRecorder.stop();self.recording=false;
        self.mediaRecorder.stream.getTracks().forEach(function(t){t.stop()})}
    },
    sendVoice: async function(){
      var self=this;if(self.audioChunks.length===0)return;
      var blob=new Blob(self.audioChunks,{type:"audio/webm"});
      try{
        var fd=new FormData();fd.append("voice",blob,"voice.webm");
        var r=await api("/upload/voice",{method:"POST",body:fd});
        if(r.code===0&&r.data){
          var msg={conversation_id:self.convId,sender_id:self.userId,content:"[语音]",type:2,_local:true,_sending:true,voice_url:r.data.url,voice_duration:Math.round(blob.size/16000),created_at:new Date().toISOString()};
          self.msgs.push(msg);Vue.nextTick(function(){self.scrollBottom()});
          if(!wsSend({type:"send_message",conversation_id:self.convId,content:"[语音]",type:2,voice_url:r.data.url,voice_duration:msg.voice_duration})){
            api("/chat/messages",{method:"POST",body:JSON.stringify({conversation_id:self.convId,content:"[语音]",type:2,voice_url:r.data.url,voice_duration:msg.voice_duration})}).catch(function(){});
          }
          msg._sending=false;
        }else{toast("语音上传失败","terr")}
      }catch(e){toast("语音上传失败","terr")}
    },
    onVoiceCall: function(){
      var self=this;self.callType="voice";self.showPlusPanel=false;
      api("/chat/conversations").then(function(r){
        var convs=r.data||[];
        var c=convs.find(function(x){return x.id===self.convId});
        if(c){self.callPartnerId=c.other_user_id;self.callPartnerName=c.other_nickname||"";self.doCall()}
        else{toast("无法获取对方信息","terr")}
      }).catch(function(){toast("网络错误","terr")});
    },
    onVideoCall: function(){
      var self=this;self.callType="video";self.showPlusPanel=false;
      api("/chat/conversations").then(function(r){
        var convs=r.data||[];
        var c=convs.find(function(x){return x.id===self.convId});
        if(c){self.callPartnerId=c.other_user_id;self.callPartnerName=c.other_nickname||"";self.doCall()}
        else{toast("无法获取对方信息","terr")}
      }).catch(function(){toast("网络错误","terr")});
    },
    doCall: function(){
      var self=this;
      if(!self.callPartnerId){toast("无法获取对方ID","terr");return}
      self.calling=true;
      wsSend({type:"call_request",receiver_id:self.callPartnerId,call_type:self.callType});
      self._callTimeout=setTimeout(function(){self.calling=false;toast("对方无应答","terr")},30000);
    },
    acceptCall: function(){
      var self=this,d=self.incomingCall;
      if(!d)return;
      self.showCallDialog=false;
      wsSend({type:"call_accept",caller_id:d.caller_id,call_id:d.call_id,channel_name:d.channel_name});
      self.calling=true;self.callType=d.call_type;
      self.startCallMedia();
    },
    rejectCall: function(){
      var self=this,d=self.incomingCall;
      if(!d)return;
      self.showCallDialog=false;
      wsSend({type:"call_reject",caller_id:d.caller_id,call_id:d.call_id});
      self.incomingCall=null;
    },
    startCallMedia: function(){
      var self=this;
      var constraints={audio:true,video:self.callType==="video"};
      navigator.mediaDevices.getUserMedia(constraints).then(function(stream){
        self._localStream=stream;
        self.callDuration=0;
        self.callTimer=setInterval(function(){self.callDuration++},1000);
      }).catch(function(){toast("无法访问摄像头/麦克风","terr");self.endCall()});
    },
    endCall: function(){
      var self=this;
      if(self._callTimeout){clearTimeout(self._callTimeout)}
      if(self.callTimer){clearInterval(self.callTimer)}
      if(self._localStream){self._localStream.getTracks().forEach(function(t){t.stop()})}
      wsSend({type:"call_end",peer_id:self.callPartnerId,call_id:self.incomingCall?self.incomingCall.call_id:null,end_reason:"hangup"});
      self.calling=false;self.callType="";self.callPartnerId=0;self.showCallDialog=false;self.incomingCall=null;
    },
    openGiftPanel: function(){
      var self=this;self.showPlusPanel=false;self.showGiftPanel=true;
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
          var msg={conversation_id:self.convId,sender_id:self.userId,content:"[礼物] "+gift.name,type:6,_local:true,gift_data:JSON.stringify(gift),created_at:new Date().toISOString()};
          self.msgs.push(msg);Vue.nextTick(function(){self.scrollBottom()});
          self.showGiftPanel=false;toast("礼物已发送","tok");
        }else{toast(r.message||"发送失败","terr")}
      }catch(e){toast("发送失败","terr")}
    },
    handleWs: function(d){
      var self=this;
      if(d.type==="message"&&d.data&&d.data.conversation_id===self.convId){
        if(!d.data.id&&!d.data._local)return;
        if(self.msgs.some(function(m){return m.id&&m.id===d.data.id}))return;
        self.msgs.push(d.data);Vue.nextTick(function(){self.scrollBottom()});
        api("/chat/mark-read",{method:"POST",body:JSON.stringify({conversation_id:self.convId})}).catch(function(){});
      }
      if(d.type==="call_request"&&d.data){self.incomingCall=d.data;self.showCallDialog=true}
      if(d.type==="call_accepted"&&d.data){
        if(self._callTimeout)clearTimeout(self._callTimeout);
        self.callType=d.data.call_type||self.callType;
        self.startCallMedia();
      }
      if(d.type==="call_rejected"||d.type==="call_user_offline"){
        if(self._callTimeout)clearTimeout(self._callTimeout);
        self.calling=false;self.callType="";toast(d.type==="call_user_offline"?"对方不在线":"对方已拒绝","terr");
      }
      if(d.type==="call_ended"){
        if(self._callTimeout)clearTimeout(self._callTimeout);
        if(self.callTimer)clearInterval(self.callTimer);
        if(self._localStream){self._localStream.getTracks().forEach(function(t){t.stop()})}
        self.calling=false;self.callType="";self.callPartnerId=0;self.showCallDialog=false;self.incomingCall=null;
      }
    }
  },
  mounted: function(){
    var self=this;
    self._scrollFn=function(){self.onScroll()};
    Vue.nextTick(function(){self.load()});
    wsOn("message",function(d){self.handleWs(d)});
    wsOn("call_request",function(d){self.handleWs(d)});
    wsOn("call_accepted",function(d){self.handleWs(d)});
    wsOn("call_rejected",function(d){self.handleWs(d)});
    wsOn("call_user_offline",function(d){self.handleWs(d)});
    wsOn("call_ended",function(d){self.handleWs(d)});
    Vue.nextTick(function(){var el=self.$refs.chat;if(el){el.addEventListener("scroll",self._scrollFn)}});
  },
  beforeUnmount: function(){
    wsOff("message",this.handleWs);
    wsOff("call_request",this.handleWs);
    wsOff("call_accepted",this.handleWs);
    wsOff("call_rejected",this.handleWs);
    wsOff("call_user_offline",this.handleWs);
    wsOff("call_ended",this.handleWs);
    if(this.callTimer)clearInterval(this.callTimer);
    if(this._callTimeout)clearTimeout(this._callTimeout);
    if(this._localStream){this._localStream.getTracks().forEach(function(t){t.stop()})}
    var el=this.$refs.chat;if(el&&this._scrollFn)el.removeEventListener("scroll",this._scrollFn);
  },
  template: `<div style="display:flex;flex-direction:column;height:100%;background:var(--bg-page)">
    <div v-if="calling" style="position:fixed;top:0;left:0;right:0;bottom:0;background:linear-gradient(160deg,#1a1a2e,#16213e);z-index:100;display:flex;flex-direction:column;align-items:center;justify-content:center;color:#fff">
      <div style="width:88px;height:88px;border-radius:50%;background:rgba(255,255,255,.15);display:flex;align-items:center;justify-content:center;font-size:44px;margin-bottom:16px">{{callType==="video"?"📹":"📞"}}</div>
      <div style="font-size:22px;font-weight:600;margin-bottom:6px">{{callPartnerName||"通话中"}}</div>
      <div style="font-size:14px;opacity:.65;margin-bottom:40px">{{Math.floor(callDuration/60)}}:{{("0"+(callDuration%60)).slice(-2)}}</div>
      <button @click="endCall" style="width:64px;height:64px;border-radius:50%;background:#ff4757;border:none;font-size:26px;cursor:pointer;box-shadow:0 4px 16px rgba(255,71,87,.4)">📞</button>
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
    <div ref="chat" style="flex:1;overflow-y:auto;padding:12px 16px;-webkit-overflow-scrolling:touch">
      <div v-if="loadingMore" style="text-align:center;padding:8px"><div class="spin" style="width:20px;height:20px;border-width:2px"></div></div>
      <div v-if="!hasMore&&msgs.length>0" style="text-align:center;padding:8px;font-size:12px;color:var(--tm)">没有更多消息了</div>
      <div v-if="loading" style="text-align:center;padding:48px"><div class="spin"></div></div>
      <div v-else-if="err&&msgs.length===0" class="empty" style="padding:48px 24px"><div style="font-size:48px;margin-bottom:12px">😵</div><div style="color:var(--ts);margin-bottom:16px;font-size:14px">{{errMsg}}</div><button class="btn bp bs" @click="load()">重试</button></div>
      <div v-else-if="msgs.length===0" class="empty" style="padding:64px 24px"><div class="ei">💬</div><div class="et">开始聊天吧</div><div class="ed">发送第一条消息，开启你们的对话</div></div>
      <div v-else>
        <div v-for="m in msgs" :key="m.id?m.id:('k'+Math.random())">
          <div v-if="m._timeGroup" class="time-divider">{{m._timeGroup}}</div>
          <div v-if="m.type===99" class="msg-sy">{{m.content}}</div>
          <div v-else-if="m.type===1" :class="['msg-b',m.sender_id===userId?'msg-my':'msg-ot']">
            <img :src="m.content" class="msg-img" style="max-width:200px;border-radius:8px;display:block">
            <div style="font-size:10px;margin-top:2px;text-align:right;opacity:.6"><span>{{timeStr(m.created_at)}}</span><span v-if="m._sending" style="color:var(--tm);margin-left:4px">⏳</span></div>
          </div>
          <div v-else-if="m.type===2" :class="['msg-b',m.sender_id===userId?'msg-my':'msg-ot']">
            <div style="display:flex;align-items:center;gap:8px;cursor:pointer"><span style="font-size:20px">🔊</span><span style="font-size:13px">{{m.voice_duration||0}}″ 语音</span></div>
            <div style="font-size:10px;margin-top:2px;text-align:right;opacity:.6"><span>{{timeStr(m.created_at)}}</span><span v-if="m._sending" style="color:var(--tm);margin-left:4px">⏳</span></div>
          </div>
          <div v-else-if="m.type===6" class="msg-sy">
            <div style="font-size:14px">🎁 {{m.content}}</div>
            <div style="font-size:10px;opacity:.6">{{timeStr(m.created_at)}}</div>
          </div>
          <div v-else :class="['msg-b',m.sender_id===userId?'msg-my':'msg-ot']">
            <div style="font-size:15px;white-space:pre-wrap;word-break:break-word">{{m.content}}</div>
            <div style="font-size:10px;margin-top:2px;text-align:right;opacity:.6"><span>{{timeStr(m.created_at)}}</span><span v-if="m._sending" style="color:var(--tm);margin-left:4px">⏳</span></div>
          </div>
        </div>
      </div>
    </div>
    <div v-if="showGiftPanel" style="background:#fff;border-top:1px solid var(--b);padding:12px;max-height:220px;overflow-y:auto">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
        <span style="font-size:14px;font-weight:600">送礼物</span>
        <button @click="showGiftPanel=false" style="border:none;background:none;font-size:16px;cursor:pointer;color:var(--tm)">✕</button>
      </div>
      <div v-if="giftLoading" style="text-align:center;padding:16px"><div class="spin" style="width:20px;height:20px;border-width:2px"></div></div>
      <div v-else-if="gifts.length===0" style="text-align:center;padding:16px;color:var(--tm);font-size:13px">暂无礼物</div>
      <div v-else style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px">
        <div v-for="g in gifts" :key="g.id" @click="sendGift(g)" style="display:flex;flex-direction:column;align-items:center;padding:10px 4px;background:var(--bg-page);border-radius:12px;cursor:pointer">
          <span style="font-size:28px">{{g.icon||"🎁"}}</span>
          <span style="font-size:12px;margin-top:4px">{{g.name}}</span>
          <span style="font-size:10px;color:var(--tm)">{{g.price}}币</span>
        </div>
      </div>
    </div>
    <div v-if="showEmojiPanel" style="background:#f7f7f7;border-top:1px solid var(--b);padding:10px 8px;height:220px;overflow-y:auto">
      <div style="display:grid;grid-template-columns:repeat(8,1fr);gap:2px">
        <button v-for="e in emojis" :key="e" @click="insertEmoji(e)" style="border:none;background:none;font-size:22px;padding:6px 0;cursor:pointer;border-radius:6px">{{e}}</button>
      </div>
    </div>
    <div v-if="showPlusPanel" style="background:#f7f7f7;border-top:1px solid var(--b);padding:16px 8px">
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:14px 8px">
        <div @click="onImagePick" style="display:flex;flex-direction:column;align-items:center;gap:6px;cursor:pointer">
          <div style="width:56px;height:56px;border-radius:12px;background:#fff;display:flex;align-items:center;justify-content:center;font-size:26px;box-shadow:0 1px 3px rgba(0,0,0,.08)">🖼️</div>
          <span style="font-size:11px;color:#666">相册</span>
        </div>
        <div @click="onCameraCapture" style="display:flex;flex-direction:column;align-items:center;gap:6px;cursor:pointer">
          <div style="width:56px;height:56px;border-radius:12px;background:#fff;display:flex;align-items:center;justify-content:center;font-size:26px;box-shadow:0 1px 3px rgba(0,0,0,.08)">📸</div>
          <span style="font-size:11px;color:#666">拍摄</span>
        </div>
        <div @click="onVideoCall" style="display:flex;flex-direction:column;align-items:center;gap:6px;cursor:pointer" :style="{opacity:calling?0.4:1,pointerEvents:calling?'none':'auto'}">
          <div style="width:56px;height:56px;border-radius:12px;background:#fff;display:flex;align-items:center;justify-content:center;font-size:26px;box-shadow:0 1px 3px rgba(0,0,0,.08)">📹</div>
          <span style="font-size:11px;color:#666">视频通话</span>
        </div>
        <div @click="onVoiceCall" style="display:flex;flex-direction:column;align-items:center;gap:6px;cursor:pointer" :style="{opacity:calling?0.4:1,pointerEvents:calling?'none':'auto'}">
          <div style="width:56px;height:56px;border-radius:12px;background:#fff;display:flex;align-items:center;justify-content:center;font-size:26px;box-shadow:0 1px 3px rgba(0,0,0,.08)">📞</div>
          <span style="font-size:11px;color:#666">语音通话</span>
        </div>
        <div @click="openGiftPanel" style="display:flex;flex-direction:column;align-items:center;gap:6px;cursor:pointer">
          <div style="width:56px;height:56px;border-radius:12px;background:#fff;display:flex;align-items:center;justify-content:center;font-size:26px;box-shadow:0 1px 3px rgba(0,0,0,.08)">🎁</div>
          <span style="font-size:11px;color:#666">礼物</span>
        </div>
      </div>
    </div>
    <div style="background:#f7f7f7;border-top:1px solid var(--b);padding:8px 10px;display:flex;align-items:center;gap:8px;padding-bottom:calc(8px + env(safe-area-inset-bottom,0px))">
      <button @click="toggleVoiceMode" style="border:none;background:none;font-size:24px;padding:0 2px;flex-shrink:0;cursor:pointer;width:32px">{{voiceMode?"⌨️":"🎙️"}}</button>
      <button v-if="voiceMode" @mousedown="startRecording" @mouseup="stopRecording" @touchstart.prevent="startRecording" @touchend.prevent="stopRecording" :style="{background:recording?'#c8c8c8':'#fff'}" style="flex:1;height:40px;border-radius:6px;border:1px solid #ddd;font-size:15px;cursor:pointer;color:#333;transition:background .15s">{{recording?'松开发送':'按住说话'}}</button>
      <div v-else class="inp" style="flex:1;border-radius:20px;display:flex;align-items:center">
        <input v-model="text" placeholder="输入消息..." @keydown.enter="sendMsg" style="flex:1;border:none;background:none;outline:none;padding:8px 12px;font-size:15px">
      </div>
      <button v-if="!voiceMode&&text.trim()" @click="sendMsg" class="btn bp" style="border-radius:20px;padding:8px 16px;font-size:14px;flex-shrink:0">发送</button>
      <button v-if="!voiceMode&&!text.trim()" @click="toggleEmoji" style="border:none;background:none;font-size:24px;flex-shrink:0;cursor:pointer;width:32px">😊</button>
      <button v-if="!voiceMode&&!text.trim()" @click="togglePlus" style="border:none;background:none;font-size:24px;flex-shrink:0;cursor:pointer;width:32px">➕</button>
    </div>
  </div>`
};

var MyPage = {
  data: function(){return {user:null,wallet:{balance:0},loading:true}},
  methods: {
    load: async function(){this.loading=true;try{var ur=await api("/user/info");this.user=ur.data;if(this.user){localStorage.setItem("uname",this.user.nickname||"");if(this.user.avatar)localStorage.setItem("uavatar",this.user.avatar)}}catch(e){}try{var wr=await api("/wallet/info");if(wr.data)this.wallet.balance=wr.data.balance}catch(e){}this.loading=false},
    logout: function(){localStorage.clear();this.$router.replace("/login");toast("已退出登录","tinfo")}
  },
  mounted: function(){this.load()},
  template: `<div><div style="background:linear-gradient(135deg,#FF5E7D,#FF8E8E);color:#fff;padding:24px 20px"><div style="display:flex;align-items:center;gap:16px"><div class="avatar av-lg" style="border:3px solid rgba(255,255,255,.5)"><img v-if="user&&user.avatar" :src="user.avatar"><span v-else>👤</span></div><div style="flex:1"><div style="font-size:20px;font-weight:600">{{user?user.nickname:'加载中...'}}</div><div style="font-size:13px;opacity:.8;margin-top:4px">{{user&&user.bio?user.bio:'写下个性签名让大家更了解你'}}</div></div><span v-if="user&&user.is_vip" style="background:rgba(255,255,255,.3);color:#fff;padding:4px 12px;border-radius:12px;font-size:12px">👑VIP</span></div><div style="display:flex;gap:16px;margin-top:16px;padding-top:16px;border-top:1px solid rgba(255,255,255,.2)"><div style="flex:1;text-align:center"><div style="font-size:22px;font-weight:700">🪙{{wallet.balance||0}}</div><div style="font-size:11px;opacity:.8">金币</div></div><div style="flex:1;text-align:center"><div style="font-size:22px;font-weight:700">{{user&&user.age?user.age+'岁':'-'}}</div><div style="font-size:11px;opacity:.8">{{user&&user.location?user.location:'设置位置'}}</div></div></div></div><div v-if="loading" style="text-align:center;padding:32px"><div class="spin"></div></div><div v-else style="padding:12px 16px"><div v-for="m in [{ico:'✏️',label:'编辑资料',path:'/edit-profile'},{ico:'👑',label:'会员中心',path:'/vip'},{ico:'💰',label:'金币充值',path:'/recharge'},{ico:'📊',label:'我的收益',path:'/earnings'},{ico:'💝',label:'我的遇见',path:'/meet'},{ico:'👥',label:'粉丝',path:'/fans'},{ico:'❤️',label:'关注',path:'/following'},{ico:'⚙️',label:'设置',path:'/settings'}]" :key="m.path" @click="$router.push(m.path)" style="display:flex;align-items:center;padding:14px 16px;background:var(--w);border-radius:var(--rs);margin-bottom:6px;cursor:pointer;box-shadow:var(--sh)"><span style="font-size:20px;margin-right:12px">{{m.ico}}</span><span style="flex:1;font-size:15px">{{m.label}}</span><span style="color:var(--tm)">›</span></div><button class="btn bo bw" style="margin-top:12px;color:var(--e);border-color:var(--e)" @click="logout">退出登录</button></div></div>`
};

var EditProfilePage = {
  data: function(){return {form:{nickname:"",gender:null,age:null,height:null,occupation:"",location:"",bio:"",tags:[]},avatarFile:null,avatarPreview:"",allTags:[],saving:false}},
  methods: {
    load: async function(){try{var r=await api("/user/info");var u=r.data;if(u){this.form.nickname=u.nickname||"";this.form.gender=u.gender;this.form.age=u.age;this.form.height=u.height;this.form.occupation=u.occupation||"";this.form.location=u.location||"";this.form.bio=u.bio||"";this.form.tags=(typeof u.tags==="string"?JSON.parse(u.tags):(u.tags||[]));this.avatarPreview=u.avatar||""}}catch(e){}try{var tr=await api("/user/tags");if(tr.data&&tr.data.length)this.allTags=tr.data}catch(e){if(this.allTags.length===0)this.allTags=["健身","跑步","瑜伽","篮球","游泳","旅行","美食","摄影","宠物","音乐","电影","游戏","读书","画画","滑雪"]}},
    onAvatar: function(e){var f=e.target.files[0];if(f){this.avatarFile=f;this.avatarPreview=URL.createObjectURL(f)}},
    toggleTag: function(t){var i=this.form.tags.indexOf(t);if(i>-1)this.form.tags.splice(i,1);else if(this.form.tags.length<10)this.form.tags.push(t);else toast("最多10个标签","tinfo")},
    save: async function(){this.saving=true;try{if(this.avatarFile){var fd=new FormData();fd.append("avatar",this.avatarFile);var ar=await api("/user/avatar",{method:"POST",body:fd});if(ar.code===0&&ar.data)this.avatarPreview=ar.data.avatar}var d={nickname:this.form.nickname,gender:this.form.gender,age:this.form.age?parseInt(this.form.age):null,height:this.form.height?parseInt(this.form.height):null,occupation:this.form.occupation,location:this.form.location,bio:this.form.bio,tags:this.form.tags};await api("/user/info",{method:"PUT",body:JSON.stringify(d)});toast("保存成功","tok");this.$router.back()}catch(e){toast(e.message,"terr")}this.saving=false}
  },
  mounted: function(){this.load()},
  template: `<div style="padding:16px"><div style="text-align:center;margin-bottom:20px"><label style="cursor:pointer"><div class="avatar av-lg" style="margin:0 auto;border:3px dashed var(--b)"><img v-if="avatarPreview" :src="avatarPreview"><span v-else style="font-size:32px">📷</span></div><input type="file" accept="image/*" style="display:none" @change="onAvatar"></label><p style="font-size:12px;color:var(--tm);margin-top:8px">点击更换头像</p></div><div style="margin-bottom:12px"><label style="font-size:13px;color:var(--ts);display:block;margin-bottom:6px">昵称</label><div class="inp"><input v-model="form.nickname" placeholder="2-50个字符" maxlength="50"></div></div><div style="margin-bottom:12px"><label style="font-size:13px;color:var(--ts);display:block;margin-bottom:6px">性别</label><div style="display:flex;gap:12px"><button class="btn bs" :class="form.gender===1?'bp':'bo'" @click="form.gender=1">男</button><button class="btn bs" :class="form.gender===0?'bp':'bo'" @click="form.gender=0">女</button><button class="btn bs" :class="form.gender===2?'bp':'bo'" @click="form.gender=2">保密</button></div></div><div style="display:flex;gap:12px;margin-bottom:12px"><div style="flex:1"><label style="font-size:13px;color:var(--ts);display:block;margin-bottom:6px">年龄</label><div class="inp"><input v-model.number="form.age" type="number" min="18" max="80" placeholder="18"></div></div><div style="flex:1"><label style="font-size:13px;color:var(--ts);display:block;margin-bottom:6px">身高(cm)</label><div class="inp"><input v-model.number="form.height" type="number" min="100" max="250" placeholder="170"></div></div></div><div style="margin-bottom:12px"><label style="font-size:13px;color:var(--ts);display:block;margin-bottom:6px">职业</label><div class="inp"><input v-model="form.occupation" placeholder="你的职业"></div></div><div style="margin-bottom:12px"><label style="font-size:13px;color:var(--ts);display:block;margin-bottom:6px">所在地</label><div class="inp"><input v-model="form.location" placeholder="城市名"></div></div><div style="margin-bottom:12px"><label style="font-size:13px;color:var(--ts);display:block;margin-bottom:6px">个性签名</label><div class="inp"><input v-model="form.bio" placeholder="写一句话介绍自己" maxlength="500"></div></div><div style="margin-bottom:20px"><label style="font-size:13px;color:var(--ts);display:block;margin-bottom:8px">兴趣标签(已选{{form.tags.length}}/10)</label><div style="display:flex;gap:8px;flex-wrap:wrap"><span v-for="t in allTags" :key="t" :class=\"['tag',form.tags.includes(t)?'tp':'']\" style="cursor:pointer;border:1px solid var(--b);border-radius:16px;padding:6px 14px;font-size:13px" @click="toggleTag(t)">{{t}}</span></div></div><button class="btn bp bw bl" @click="save" :disabled="saving">{{saving?'保存中...':'保存资料'}}</button></div>`
};

var UserProfilePage = {
  data: function(){return {profile:null,loading:true}},
  methods: {
    load: async function(){this.loading=true;try{var r=await api("/user/profile/"+this.$route.params.id);this.profile=r.data}catch(e){}this.loading=false},
    like: async function(){try{var r=await api("/match/like",{method:"POST",body:JSON.stringify({target_user_id:this.profile.id})});toast(r.data&&r.data.matched?"💕匹配成功！":"已喜欢","tok")}catch(e){toast(e.message,"terr")}},
    chat: async function(){try{var r=await api("/chat/conversations",{method:"POST",body:JSON.stringify({other_user_id:this.profile.id})});if(r.data)this.$router.push("/chat/"+r.data.id)}catch(e){toast(e.message,"terr")}}
  },
  mounted: function(){this.load()},
  template: `<div><div v-if="loading" style="text-align:center;padding:64px"><div class="spin"></div></div><div v-else-if="!profile" class="empty"><div class="ei">😕</div><div class="et">用户不存在</div></div><div v-else><div style="background:linear-gradient(135deg,#667eea,#764ba2);color:#fff;padding:32px 20px 24px;text-align:center"><div class="avatar av-lg" style="margin:0 auto;border:3px solid rgba(255,255,255,.5)"><img v-if="profile.avatar" :src="profile.avatar"><span v-else>👤</span></div><div style="font-size:22px;font-weight:600;margin-top:12px">{{profile.nickname}}</div><div style="font-size:14px;opacity:.8;margin-top:4px">{{profile.age?profile.age+'岁 ':''}}{{profile.occupation||''}} {{profile.location||''}}</div></div><div style="margin:12px 16px;padding:16px;background:var(--w);border-radius:var(--rs);box-shadow:var(--sh)"><h4 style="margin-bottom:8px;color:var(--ts);font-size:14px">个人简介</h4><p style="line-height:1.6">{{profile.bio||'TA还没有写个人简介'}}</p></div><div v-if="profile.tags" style="margin:0 16px;padding:16px;background:var(--w);border-radius:var(--rs);box-shadow:var(--sh)"><div style="display:flex;gap:6px;flex-wrap:wrap"><span v-for="t in (typeof profile.tags==='string'?JSON.parse(profile.tags):profile.tags)" class="tag tp">{{t}}</span></div></div><div style="display:flex;gap:12px;padding:16px"><button class="btn bo" style="flex:1" @click="like">♥ 喜欢</button><button class="btn bp" style="flex:1" @click="chat">💬 发消息</button></div></div></div>`
};

var VipPage = {
  data: function(){return {pkgs:[],loading:false}},
  mounted: async function(){try{var r=await api("/user/vip-info");this.pkgs=(r.data&&r.data.packages)||[]}catch(e){}},
  methods: {buy:async function(p){this.loading=true;try{var r=await api("/orders/vip",{method:"POST",body:JSON.stringify({package_id:p.id})});toast(r.message||"开通成功","tok")}catch(e){toast(e.message,"terr")}this.loading=false}},
  template: `<div style="padding:20px"><div style="text-align:center;margin-bottom:24px"><div style="font-size:48px">👑</div><h2 style="margin-top:8px">遇见VIP</h2><p style="color:var(--tm);font-size:14px">解锁更多特权</p></div><div v-if="pkgs.length===0" style="text-align:center;color:var(--tm);padding:24px">暂无可购买套餐</div><div v-else v-for="p in pkgs" :key="p.id" style="background:var(--w);border-radius:var(--r);padding:20px;margin-bottom:12px;box-shadow:var(--sh);text-align:center"><div style="font-size:28px;font-weight:700;color:var(--p)">¥{{p.price}}</div><div style="font-size:15px;margin:8px 0">{{p.name}}</div><div style="font-size:13px;color:var(--tm);margin-bottom:16px">{{p.duration}}天</div><button class="btn bp bw" @click="buy(p)" :disabled="loading">立即开通</button></div><div style="padding:16px;background:var(--w);border-radius:var(--rs);box-shadow:var(--sh);margin-top:16px"><h4 style="margin-bottom:8px">VIP特权</h4><p style="font-size:13px;color:var(--ts);line-height:2.2">✅ 查看更多推荐<br>✅ 高级筛选<br>✅ 查看谁喜欢了我<br>✅ 专属身份标识<br>✅ 无限制聊天</p></div></div>`
};

var RechargePage = {
  data: function(){return {amounts:[6,18,30,68,128,298],sel:null,loading:false,pay:"wechat"}},
  methods: {go:async function(){if(!this.sel){toast("请选择金额","tinfo");return}this.loading=true;try{var r=await api("/orders/recharge",{method:"POST",body:JSON.stringify({amount:this.sel})});toast("充值成功！获得"+r.data.coins+"金币","tok");this.sel=null}catch(e){toast(e.message,"terr")}this.loading=false}},
  template: `<div style="padding:20px"><div style="text-align:center;margin-bottom:24px"><div style="font-size:48px">💰</div><h2>金币充值</h2><p style="color:var(--tm);font-size:13px">1元=100金币</p></div><div style="display:grid;grid-template-columns:1fr 1fr;gap:12px"><div v-for="a in amounts" :key="a" @click="sel=a" :style="{background:sel===a?'var(--p)':'var(--w)',color:sel===a?'#fff':'var(--t)',padding:'20px',borderRadius:'var(--r)',textAlign:'center',cursor:'pointer',border:'2px solid '+(sel===a?'var(--p)':'var(--b)'),transition:'all .2s'}"><div style="font-size:24px;font-weight:700">¥{{a}}</div><div :style=\"{fontSize:'12px',marginTop:'4px',color:sel===a?'rgba(255,255,255,.8)':'var(--tm)'}\">{{a*100}}金币</div></div></div><div style="display:flex;gap:12px;margin-top:20px"><button class="btn bs" :class=\"pay==='wechat'?'bp':'bo'\" @click=\"pay='wechat'\" style="flex:1">💚微信</button><button class="btn bs" :class=\"pay==='alipay'?'bp':'bo'\" @click=\"pay='alipay'\" style="flex:1">💙支付宝</button></div><button class="btn bp bw bl" style="margin-top:20px" @click="go" :disabled="loading||!sel">{{loading?'处理中...':'确认支付 ¥'+(sel||0)}}</button></div>`
};

var SettingsPage = {
  methods: {clearCache:function(){try{localStorage.clear();if(typeof caches!=="undefined")caches.keys().then(function(k){k.forEach(function(c){caches.delete(c)})});toast("缓存已清除","tok")}catch(e){toast("清除失败","terr")}}},
  template: `<div style="padding:12px 16px"><div v-for="item in [{i:'🔒',l:'账号安全'},{i:'🔔',l:'消息通知'},{i:'🛡️',l:'隐私设置'},{i:'❓',l:'帮助与反馈'},{i:'📄',l:'关于我们',d:'v1.0.0 公测版'}]" :key="item.l" style="display:flex;align-items:center;padding:14px 16px;background:var(--w);border-radius:var(--rs);margin-bottom:6px;box-shadow:var(--sh)"><span style="font-size:20px;margin-right:12px">{{item.i}}</span><div style="flex:1"><div style="font-size:15px">{{item.l}}</div><div v-if="item.d" style="font-size:12px;color:var(--tm)">{{item.d}}</div></div><span style="color:var(--tm)">›</span></div><button class="btn bo bw" style="margin-top:16px" @click="clearCache">清除缓存</button></div>`
};

var MeetPage = {
  data: function(){return {tab:"viewers",list:[],loading:true}},
  methods: {load:async function(t){this.tab=t;this.loading=true;var ep=t==="viewers"?"/user/viewers":"/user/fans";try{var r=await api(ep);this.list=r.data||[]}catch(e){}this.loading=false}},
  mounted: function(){this.load("viewers")},
  template: `<div style="padding:12px 16px"><div style="display:flex;gap:8px;margin-bottom:12px"><button class="btn bs" :class=\"tab==='viewers'?'bp':'bo'\" @click=\"load('viewers')\">看过我的</button><button class="btn bs" :class=\"tab==='fans'?'bp':'bo'\" @click=\"load('fans')\">喜欢我的</button></div><div v-if="loading" style="text-align:center;padding:32px"><div class="spin"></div></div><div v-else-if="list.length===0" class="empty"><div class="ei">🔍</div><div class="et">暂无数据</div></div><div v-else v-for="item in list" :key="item.id" style="display:flex;align-items:center;padding:12px;background:var(--w);border-radius:var(--rs);margin-bottom:6px;gap:12px;box-shadow:var(--sh)"><div class="avatar av-sm"><img v-if="item.avatar" :src="item.avatar"><span v-else>👤</span></div><div style="flex:1"><div style="font-weight:500">{{item.nickname}}</div><div style="font-size:12px;color:var(--tm)">{{item.age?item.age+'岁 ':''}}{{item.location||''}}</div></div></div></div>`
};

var EarningsPage = {
  data: function(){return {wallet:{balance:0,total_earned:0},txs:[],loading:true}},
  mounted: async function(){try{var wr=await api("/wallet/info");var tr=await api("/wallet/transactions?limit=50");if(wr.data)this.wallet=wr.data;if(tr.data)this.txs=tr.data}catch(e){}this.loading=false},
  template: `<div style="padding:16px"><div style="background:linear-gradient(135deg,#FF5E7D,#FF8E8E);color:#fff;padding:24px;border-radius:var(--r);text-align:center;margin-bottom:16px"><div style="font-size:13px;opacity:.8">累计收益</div><div style="font-size:36px;font-weight:700;margin:8px 0">🪙{{wallet.total_earned||0}}</div><div style="font-size:13px;opacity:.8">余额:{{wallet.balance||0}}金币</div></div><div v-if="loading" style="text-align:center;padding:32px"><div class="spin"></div></div><div v-else-if="txs.length===0" class="empty"><div class="ei">📊</div><div class="et">暂无记录</div></div><div v-else v-for="tx in txs" :key="tx.id" style="display:flex;align-items:center;padding:12px;background:var(--w);border-radius:var(--rs);margin-bottom:6px;box-shadow:var(--sh)"><span style="font-size:24px;margin-right:12px">{{tx.type==='gift_receive'?'🎁':tx.type==='recharge'?'💳':'💰'}}</span><div style="flex:1"><div style="font-size:14px">{{tx.description||tx.type}}</div><div style="font-size:11px;color:var(--tm)">{{new Date(tx.created_at).toLocaleString('zh-CN')}}</div></div><span :style=\"{fontWeight:'600',color:tx.amount>0?'var(--s)':'var(--e)'}\">{{tx.amount>0?'+'+tx.amount:tx.amount}}</span></div></div>`
};

var FansPage = {
  data: function(){return {list:[],loading:true}},
  mounted: async function(){try{var r=await api("/user/fans");this.list=r.data||[]}catch(e){}this.loading=false},
  template: `<div style="padding:12px 16px"><div v-if="loading" style="text-align:center;padding:32px"><div class="spin"></div></div><div v-else-if="list.length===0" class="empty"><div class="ei">👥</div><div class="et">暂无粉丝</div></div><div v-else v-for="u in list" :key="u.id" style="display:flex;align-items:center;padding:12px;background:var(--w);border-radius:var(--rs);margin-bottom:6px;gap:12px;box-shadow:var(--sh)"><div class="avatar av-sm"><img v-if="u.avatar" :src="u.avatar"><span v-else>👤</span></div><div><div style="font-weight:500">{{u.nickname}}</div><div style="font-size:12px;color:var(--tm)">{{u.location||""}}</div></div></div></div>`
};

var FollowingPage = {
  data: function(){return {list:[],loading:true}},
  mounted: async function(){try{var r=await api("/user/following");this.list=r.data||[]}catch(e){}this.loading=false},
  template: `<div style="padding:12px 16px"><div v-if="loading" style="text-align:center;padding:32px"><div class="spin"></div></div><div v-else-if="list.length===0" class="empty"><div class="ei">❤️</div><div class="et">暂无关注</div></div><div v-else v-for="u in list" :key="u.id" style="display:flex;align-items:center;padding:12px;background:var(--w);border-radius:var(--rs);margin-bottom:6px;gap:12px;box-shadow:var(--sh)"><div class="avatar av-sm"><img v-if="u.avatar" :src="u.avatar"><span v-else>👤</span></div><div><div style="font-weight:500">{{u.nickname}}</div><div style="font-size:12px;color:var(--tm)">{{u.location||""}}</div></div></div></div>`
};

// ==== Router ====
var routes = [
  {path:"/",component:WelcomePage},{path:"/login",component:LoginPage},
  {path:"/home",component:HomePage},{path:"/discover",component:DiscoverPage},
  {path:"/chat",component:ChatListPage},{path:"/chat/:id",component:ChatDetailPage},
  {path:"/post/:id",component:PostDetailPage},{path:"/user/:id",component:UserProfilePage},
  {path:"/edit-profile",component:EditProfilePage},{path:"/vip",component:VipPage},
  {path:"/settings",component:SettingsPage},{path:"/my",component:MyPage},
  {path:"/meet",component:MeetPage},{path:"/recharge",component:RechargePage},
  {path:"/earnings",component:EarningsPage},{path:"/fans",component:FansPage},
  {path:"/following",component:FollowingPage}
];
var router = VueRouter.createRouter({history:VueRouter.createWebHashHistory(),routes:routes});
router.beforeEach(function(to,from,next){var m={home:"遇见",discover:"动态",chat:"消息",my:"我的",login:"登录"};document.title=(m[to.path.replace("/","")]||"遇见")+" - 遇见";next()});

// ==== App ====
var AppRoot = {
  data: function(){return {toasts:toasts,appVersion:"v20260729-1"}},
  computed: {
    showNav: function(){var p=this.$route.path;return p==="/home"||p==="/discover"||p==="/chat"||p==="/my"},
    pageTitle: function(){var m={home:"遇见",discover:"动态",chat:"消息",my:"我的",login:"登录"};return m[this.$route.path.replace("/","")]||"遇见"},
    showBack: function(){var p=this.$route.path;return p!=="/"&&p!=="/home"&&p!=="/login"}
  },
  methods: {goBack:function(){this.$router.back()}},
  template: `<div class="app"><header class="hdr" v-if="pageTitle"><button class="bk" v-if="showBack" @click="goBack">←</button><span class="tt">{{pageTitle}}</span></header><main :class=\"['pg',showNav?'pg-nav':'pg-nonav']\"><router-view v-slot=\"{Component,route}\"><transition name=\"sl\" mode=\"out-in\"><component :is=\"Component\" :key=\"route.fullPath\"/></transition></router-view></main><nav class=\"nav\" v-if=\"showNav\"><router-link to=\"/home\" active-class=\"on\"><div class=\"ni\">💕</div><div class=\"nl\">遇见</div></router-link><router-link to=\"/discover\" active-class=\"on\"><div class=\"ni\">📱</div><div class=\"nl\">动态</div></router-link><router-link to=\"/chat\" active-class=\"on\"><div class=\"ni\">💬</div><div class=\"nl\">消息</div></router-link><router-link to=\"/my\" active-class=\"on\"><div class=\"ni\">👤</div><div class=\"nl\">我的</div></router-link><span style="position:fixed;bottom:2px;right:4px;font-size:8px;color:var(--tm);opacity:.4">{{appVersion}}</span></nav><div class=\"tc\"><div v-for=\"t in toasts\" :key=\"t.id\" :class=\"['tm',t.cls]\">{{t.msg}}</div></div></div>`
};

var app = Vue.createApp(AppRoot);
app.use(router);
app.mount("#app");
if(localStorage.getItem("token"))wsConnect();
