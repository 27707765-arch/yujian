/* yujian-app.js - 遇见APP 主应用 */

// ==== 工具函数 ====
var toasts = Vue.reactive([]);
var _tid = 0;
function toast(msg, cls) { var id = ++_tid; toasts.push({id:id, msg:msg, cls:cls}); setTimeout(function(){ var i=toasts.findIndex(function(t){return t.id===id}); if(i>-1)toasts.splice(i,1); }, 3000); }
function token() { return localStorage.getItem("token") || ""; }
function timeAgo(t) { if(!t)return""; var d=Math.floor((Date.now()-new Date(t).getTime())/1000); if(d<60)return"刚刚"; if(d<3600)return Math.floor(d/60)+"分钟前"; if(d<86400)return Math.floor(d/3600)+"小时前"; return Math.floor(d/86400)+"天前"; }
function timeStr(t) { if(!t)return""; var d=new Date(t); return ("0"+d.getHours()).slice(-2)+":"+("0"+d.getMinutes()).slice(-2); }
async function api(url, opts) { opts=opts||{}; var h={"Content-Type":"application/json"}; var t=token(); if(t)h["Authorization"]="Bearer "+t; if(opts.body instanceof FormData)delete h["Content-Type"]; var r=await fetch("/api"+url, Object.assign({},opts,{headers:Object.assign({},h,opts.headers||{})})); var d=await r.json(); if(r.status===401){localStorage.clear();location.hash="#/login";throw new Error("login expired")} return d; }

// ==== WebSocket ====
var ws=null,wsTimer=null,wsCount=0,wsHooks={};
function wsOn(type,fn){if(!wsHooks[type])wsHooks[type]=[];wsHooks[type].push(fn)}
function wsOff(type,fn){if(!wsHooks[type])return;var i=wsHooks[type].indexOf(fn);if(i>-1)wsHooks[type].splice(i,1)}
function wsSend(d){return ws&&ws.readyState===1&&!!ws.send(JSON.stringify(d))}
function wsConnect(){var t=token();if(!t)return;if(ws)try{ws.close()}catch(e){}try{ws=new WebSocket((location.protocol==="https:"?"wss:":"ws:")+"//"+location.host+"?token="+t);ws.onopen=function(){wsCount=0};ws.onmessage=function(e){try{var d=JSON.parse(e.data);if(d.type&&wsHooks[d.type])wsHooks[d.type].forEach(function(fn){fn(d)});if(wsHooks["*"])wsHooks["*"].forEach(function(fn){fn(d)})}catch(_){}};ws.onclose=function(){if(wsCount<10){wsCount++;wsTimer=setTimeout(wsConnect,5000)}}}catch(_){}}

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
    load: async function(){ this.loading=true;this.err=false;try{var r=await api("/match/recommend?scope="+this.tab+"&ageMin="+this.fAge[0]+"&ageMax="+this.fAge[1]+"&limit=20");this.users=r.data||[]}catch(e){this.err=true;this.errMsg=e.message}this.loading=false; },
    initLocation: function(){
      var self=this;
      if(navigator.geolocation){
        navigator.geolocation.getCurrentPosition(function(pos){
          var lat=pos.coords.latitude,lng=pos.coords.longitude;
          api("/user/location",{method:"POST",body:JSON.stringify({lat:lat,lng:lng})}).then(function(r){
            if(r.code===0&&r.data&&r.data.city)self.currentCity=r.data.city;
          }).catch(function(){}).then(function(){self.load()});
        },function(){self.load()},{timeout:8000,enableHighAccuracy:true});
      }else{this.load()}
    },
    switchTab: function(t){this.tab=t;this.load()},
    like: function(u){if(!u)return;var s=this;api("/match/like",{method:"POST",body:JSON.stringify({target_user_id:u.id})}).then(function(r){if(r.data&&r.data.matched)toast("💕 匹配成功！","tok")}).catch(function(e){toast(e.message,"terr")});s.users=s.users.filter(function(x){return x.id!==u.id})},
    skip: function(u){if(!u)return;var s=this;api("/match/skip",{method:"POST",body:JSON.stringify({target_user_id:u.id})}).catch(function(){});s.users=s.users.filter(function(x){return x.id!==u.id})},
    parseTags: function(t){if(!t)return[];if(Array.isArray(t))return t;try{return JSON.parse(t)}catch(e){return[]}}
  },
  mounted: function(){this.initLocation()},
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
        <button @click.stop="like(u)" title="喜欢" style="width:40px;height:40px;border-radius:50%;border:none;background:linear-gradient(135deg,#FF6B6B,#FF8E8E);color:#fff;font-size:16px;cursor:pointer;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 12px rgba(255,107,107,.35)">♥</button>
      </div>
    </div>
  </div></div>`
};

var DiscoverPage = {
  data: function(){return {posts:[],loading:true,err:false,tab:"all"}},
  methods: {
    load: async function(){this.loading=true;this.err=false;try{var r=await api("/posts?limit=20");this.posts=r.data||[]}catch(e){this.err=true}this.loading=false},
    toggleLike: async function(p){try{await api("/posts/"+p.id+"/like",{method:"POST"});p.liked=!p.liked;p.like_count+=p.liked?1:-1;if(p.like_count<0)p.like_count=0}catch(e){toast(e.message,"terr")}},
    switchTab: function(t){this.tab=t;this.load()}
  },
  mounted: function(){this.load()},
  template: `<div style="padding:12px 16px">
  <div style="display:flex;gap:8px;margin-bottom:12px">
    <button class="btn bs" :class="tab==='all'?'bp':'bo'" @click="switchTab('all')">全部</button>
    <button class="btn bs" :class="tab==='nearby'?'bp':'bo'" @click="switchTab('nearby')">附近</button>
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
  methods: {load:async function(){this.loading=true;try{var r=await api("/chat/conversations");this.convs=r.data||[]}catch(e){}this.loading=false},open:function(c){this.$router.push("/chat/"+c.id)}},
  mounted: function(){this.load()},
  template: `<div><div v-if="loading" style="text-align:center;padding:64px"><div class="spin"></div></div><div v-else-if="convs.length===0" class="empty"><div class="ei">💬</div><div class="et">还没有聊过天</div><div class="ed">在「遇见」中匹配好友，开始聊天吧</div></div><div v-else><div v-for="c in convs" :key="c.id" @click="open(c)" style="display:flex;align-items:center;padding:14px 16px;gap:12px;cursor:pointer;border-bottom:1px solid var(--b);background:var(--w)"><div class="avatar" style="position:relative"><img v-if="c.other_avatar" :src="c.other_avatar"><span v-else>👤</span><span v-if="c.other_online" style="position:absolute;bottom:2px;right:2px;width:10px;height:10px;background:var(--s);border-radius:50%;border:2px solid var(--w)"></span></div><div style="flex:1;min-width:0"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px"><span style="font-weight:600;font-size:15px">{{c.other_nickname||'用户'}}</span><span style="font-size:11px;color:var(--tm)">{{timeAgo(c.last_message_time)}}</span></div><div style="display:flex;justify-content:space-between;align-items:center"><span style="font-size:13px;color:var(--tm);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:80%">{{c.last_message||'暂无消息'}}</span><span v-if="c.unread_count>0" style="background:var(--e);color:#fff;font-size:11px;min-width:18px;height:18px;border-radius:9px;display:flex;align-items:center;justify-content:center;padding:0 5px">{{c.unread_count>99?'99+':c.unread_count}}</span></div></div></div></div></div>`
};

var ChatDetailPage = {
  data: function(){return {convId:0,msgs:[],text:"",loading:true,userId:parseInt(localStorage.getItem("userId"))}},
  methods: {
    load: async function(){this.convId=parseInt(this.$route.params.id);this.loading=true;try{var r=await api("/chat/messages?conversation_id="+this.convId+"&limit=50");this.msgs=(r.data||[]).reverse()}catch(e){toast("加载失败","terr")}this.loading=false;var s=this;this.$nextTick(function(){s.scrollBottom()})},
    scrollBottom: function(){var el=this.$refs.chat;if(el)el.scrollTop=el.scrollHeight},
    sendMsg: async function(){var t=this.text.trim();if(!t)return;var msg={conversation_id:this.convId,sender_id:this.userId,content:t,type:0,_local:true,created_at:new Date().toISOString()};this.msgs.push(msg);this.text="";var s=this;this.$nextTick(function(){s.scrollBottom()});if(!wsSend({type:"message",data:{conversation_id:this.convId,content:t,type:0}})){try{await api("/chat/messages",{method:"POST",body:JSON.stringify({conversation_id:this.convId,content:t,type:0})})}catch(e){toast("发送失败","terr");this.msgs.pop()}}},
    handleWs: function(d){if(d.type==="message"&&d.data&&d.data.conversation_id===this.convId){this.msgs.push(d.data);var s=this;this.$nextTick(function(){s.scrollBottom()});api("/chat/mark-read",{method:"POST",body:JSON.stringify({conversation_id:this.convId})}).catch(function(){})}}
  },
  mounted: function(){this.load();wsOn("message",this.handleWs)},
  beforeUnmount: function(){wsOff("message",this.handleWs)},
  template: `<div style="display:flex;flex-direction:column;height:100%"><div ref="chat" style="flex:1;overflow-y:auto;padding:12px 16px"><div v-if="loading" style="text-align:center;padding:48px"><div class="spin"></div></div><div v-else-if="msgs.length===0" class="empty" style="padding:64px 24px"><div class="ei">💬</div><div class="et">开始聊天吧</div></div><div v-else><div v-for="m in msgs" :key="m.id||Math.random()"><div v-if="m.type===99" class="msg-sy">{{m.content}}</div><div v-else :class=\"['msg-b', m.sender_id===userId?'msg-my':'msg-ot']\"><div style="font-size:15px">{{m.content}}</div><div :style=\"{fontSize:'10px',marginTop:'4px',textAlign:'right',opacity:.6}\">{{timeStr(m.created_at)}}</div></div></div></div></div><div class="ci"><div class="inp" style="flex:1;border-radius:20px"><input v-model="text" placeholder="说点什么..." @keydown.enter="sendMsg"></div><button class="btn bp" style="border-radius:50%;width:40px;height:40px;padding:0;flex-shrink:0" @click="sendMsg">➤</button></div></div>`
};

var MyPage = {
  data: function(){return {user:null,wallet:{balance:0},loading:true}},
  methods: {
    load: async function(){this.loading=true;try{var ur=await api("/user/info");this.user=ur.data;if(this.user){localStorage.setItem("uname",this.user.nickname||"");if(this.user.avatar)localStorage.setItem("uavatar",this.user.avatar)}}catch(e){}try{var wr=await api("/wallet/info");if(wr.data)this.wallet.balance=wr.data.balance}catch(e){}this.loading=false},
    logout: function(){localStorage.clear();this.$router.replace("/login");toast("已退出登录","tinfo")}
  },
  mounted: function(){this.load()},
  template: `<div><div style="background:linear-gradient(135deg,#FF6B6B,#FF8E8E);color:#fff;padding:24px 20px"><div style="display:flex;align-items:center;gap:16px"><div class="avatar av-lg" style="border:3px solid rgba(255,255,255,.5)"><img v-if="user&&user.avatar" :src="user.avatar"><span v-else>👤</span></div><div style="flex:1"><div style="font-size:20px;font-weight:600">{{user?user.nickname:'加载中...'}}</div><div style="font-size:13px;opacity:.8;margin-top:4px">{{user&&user.bio?user.bio:'写下个性签名让大家更了解你'}}</div></div><span v-if="user&&user.is_vip" style="background:rgba(255,255,255,.3);color:#fff;padding:4px 12px;border-radius:12px;font-size:12px">👑VIP</span></div><div style="display:flex;gap:16px;margin-top:16px;padding-top:16px;border-top:1px solid rgba(255,255,255,.2)"><div style="flex:1;text-align:center"><div style="font-size:22px;font-weight:700">🪙{{wallet.balance||0}}</div><div style="font-size:11px;opacity:.8">金币</div></div><div style="flex:1;text-align:center"><div style="font-size:22px;font-weight:700">{{user&&user.age?user.age+'岁':'-'}}</div><div style="font-size:11px;opacity:.8">{{user&&user.location?user.location:'设置位置'}}</div></div></div></div><div v-if="loading" style="text-align:center;padding:32px"><div class="spin"></div></div><div v-else style="padding:12px 16px"><div v-for="m in [{ico:'✏️',label:'编辑资料',path:'/edit-profile'},{ico:'👑',label:'会员中心',path:'/vip'},{ico:'💰',label:'金币充值',path:'/recharge'},{ico:'📊',label:'我的收益',path:'/earnings'},{ico:'💝',label:'我的遇见',path:'/meet'},{ico:'👥',label:'粉丝',path:'/fans'},{ico:'❤️',label:'关注',path:'/following'},{ico:'⚙️',label:'设置',path:'/settings'}]" :key="m.path" @click="$router.push(m.path)" style="display:flex;align-items:center;padding:14px 16px;background:var(--w);border-radius:var(--rs);margin-bottom:6px;cursor:pointer;box-shadow:var(--sh)"><span style="font-size:20px;margin-right:12px">{{m.ico}}</span><span style="flex:1;font-size:15px">{{m.label}}</span><span style="color:var(--tm)">›</span></div><button class="btn bo bw" style="margin-top:12px;color:var(--e);border-color:var(--e)" @click="logout">退出登录</button></div></div>`
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
  template: `<div style="padding:16px"><div style="background:linear-gradient(135deg,#FF6B6B,#FF8E8E);color:#fff;padding:24px;border-radius:var(--r);text-align:center;margin-bottom:16px"><div style="font-size:13px;opacity:.8">累计收益</div><div style="font-size:36px;font-weight:700;margin:8px 0">🪙{{wallet.total_earned||0}}</div><div style="font-size:13px;opacity:.8">余额:{{wallet.balance||0}}金币</div></div><div v-if="loading" style="text-align:center;padding:32px"><div class="spin"></div></div><div v-else-if="txs.length===0" class="empty"><div class="ei">📊</div><div class="et">暂无记录</div></div><div v-else v-for="tx in txs" :key="tx.id" style="display:flex;align-items:center;padding:12px;background:var(--w);border-radius:var(--rs);margin-bottom:6px;box-shadow:var(--sh)"><span style="font-size:24px;margin-right:12px">{{tx.type==='gift_receive'?'🎁':tx.type==='recharge'?'💳':'💰'}}</span><div style="flex:1"><div style="font-size:14px">{{tx.description||tx.type}}</div><div style="font-size:11px;color:var(--tm)">{{new Date(tx.created_at).toLocaleString('zh-CN')}}</div></div><span :style=\"{fontWeight:'600',color:tx.amount>0?'var(--s)':'var(--e)'}\">{{tx.amount>0?'+'+tx.amount:tx.amount}}</span></div></div>`
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
  data: function(){return {toasts:toasts}},
  computed: {
    showNav: function(){var p=this.$route.path;return p==="/home"||p==="/discover"||p==="/chat"||p==="/my"},
    pageTitle: function(){var m={home:"遇见",discover:"动态",chat:"消息",my:"我的",login:"登录"};return m[this.$route.path.replace("/","")]||"遇见"},
    showBack: function(){var p=this.$route.path;return p!=="/"&&p!=="/home"&&p!=="/login"}
  },
  methods: {goBack:function(){this.$router.back()}},
  template: `<div class="app"><header class="hdr" v-if="pageTitle"><button class="bk" v-if="showBack" @click="goBack">←</button><span class="tt">{{pageTitle}}</span></header><main :class=\"['pg',showNav?'pg-nav':'pg-nonav']\"><router-view v-slot=\"{Component,route}\"><transition name=\"sl\" mode=\"out-in\"><component :is=\"Component\" :key=\"route.fullPath\"/></transition></router-view></main><nav class=\"nav\" v-if=\"showNav\"><router-link to=\"/home\" active-class=\"on\"><div class=\"ni\">💕</div><div class=\"nl\">遇见</div></router-link><router-link to=\"/discover\" active-class=\"on\"><div class=\"ni\">📱</div><div class=\"nl\">动态</div></router-link><router-link to=\"/chat\" active-class=\"on\"><div class=\"ni\">💬</div><div class=\"nl\">消息</div></router-link><router-link to=\"/my\" active-class=\"on\"><div class=\"ni\">👤</div><div class=\"nl\">我的</div></router-link></nav><div class=\"tc\"><div v-for=\"t in toasts\" :key=\"t.id\" :class=\"['tm',t.cls]\">{{t.msg}}</div></div></div>`
};

var app = Vue.createApp(AppRoot);
app.use(router);
app.mount("#app");
if(localStorage.getItem("token"))wsConnect();
