const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const fs = require('fs');
const path = require('path');
let TikTokLiveConnection;
try { ({ WebcastPushConnection: TikTokLiveConnection } = require('tiktok-live-connector')); } catch(e) {}

const app = express();
const server = http.createServer(app);
const io = new Server(server,{cors:{origin:'*'}});
app.use(express.json()); app.use(express.static(path.join(__dirname,'public')));

const DATA=path.join(__dirname,'data'); const CONFIG=path.join(__dirname,'config/gifts_mapping.json');
const readJson=(p,f)=>{try{return JSON.parse(fs.readFileSync(p,'utf8'))}catch{return f}};
const writeJson=(p,v)=>fs.writeFileSync(p,JSON.stringify(v,null,2));
let live=null, liveStatus={state:'Yayın bekleniyor',message:'Bağlantı yok'}, totals={likes:0,gifts:0,viewers:0};

app.get('/api/state',(req,res)=>res.json({status:liveStatus,totals,leaderboard:readJson(path.join(DATA,'leaderboard.json'),[]),mapping:readJson(CONFIG,{})}));
app.post('/api/connect',(req,res)=>{ connect(req.body.username); res.json({ok:true}); });
app.post('/api/disconnect',(req,res)=>{ if(live?.disconnect)live.disconnect(); live=null; setStatus('Yayın bekleniyor','Bağlantı kesildi'); res.json({ok:true}); });
app.post('/api/mapping',(req,res)=>{writeJson(CONFIG,req.body||{}); io.emit('mapping',req.body); res.json({ok:true});});
app.post('/api/settings',(req,res)=>{io.emit('settings',req.body||{}); res.json({ok:true});});
app.post('/api/simulate',(req,res)=>{handleAction(req.body||{},true);res.json({ok:true});});
app.get('/api/gifts',(req,res)=>res.json(readJson(path.join(DATA,'tiktok_gifts_cache.json'),[])));
app.get('/api/avatar',async(req,res)=>{
  try{const u=String(req.query.url||''); if(!/^https:\/\//.test(u))return res.status(400).end();
    const r=await fetch(u); if(!r.ok)return res.sendStatus(404); res.set('Content-Type',r.headers.get('content-type')||'image/jpeg'); res.set('Cache-Control','public,max-age=86400'); r.arrayBuffer().then(b=>res.end(Buffer.from(b))).catch(()=>res.sendStatus(500));
  }catch(e){res.sendStatus(500)}
});
function setStatus(state,message){liveStatus={state,message};io.emit('status',liveStatus);console.log(`[TikTok] ${state}: ${message}`)}
async function connect(username){
  if(!TikTokLiveConnection)return setStatus('Hata','tiktok-live-connector yüklenemedi');
  if(live?.disconnect)live.disconnect(); const clean=String(username||'').replace(/^@/,'').trim(); if(!clean)return setStatus('Hata','Kullanıcı adı gerekli');
  setStatus('Yeniden bağlanıyor',`@${clean} aranıyor`);
  try{live=new TikTokLiveConnection(clean,{processInitialData:true,enableExtendedGiftInfo:true});
    live.connect().then(async state=>{
      setStatus('Bağlandı',`@${clean} canlı yayına bağlandı`);
      try{const gifts=await live.getAvailableGifts();const arr=(gifts||[]).map(g=>({id:g.giftId||g.id,name:g.name||g.giftName,diamonds:g.diamondCount||g.diamond||g.cost||0,image:g.imageUrl||g.icon?.url||g.image?.url||''}));writeJson(path.join(DATA,'tiktok_gifts_cache.json'),arr);io.emit('gifts',arr)}catch(e){console.error(e)}
    }).catch(e=>setStatus('Hata',e.message||'Bağlantı başarısız'));
    live.on('chat',d=>handleAction({type:'chat',uniqueId:d.uniqueId,nickname:d.nickname,profilePictureUrl:d.profilePictureUrl,comment:d.comment},false));
    live.on('like',d=>{totals.likes+=d.likeCount||1;io.emit('stats',totals);if(d.likeCount>0)handleAction({type:'like',uniqueId:d.uniqueId,nickname:d.nickname,profilePictureUrl:d.profilePictureUrl},false)});
    live.on('member',d=>handleAction({type:'member',uniqueId:d.uniqueId,nickname:d.nickname,profilePictureUrl:d.profilePictureUrl},false));
    live.on('roomUser',d=>{totals.viewers=d.viewerCount||0;io.emit('stats',totals)});
    live.on('gift',d=>{
      if(d.giftType===1 && d.repeatEnd===false)return;
      const gems=d.diamondCount||d.gift?.diamondCount||d.repeatCount*1||1; totals.gifts+=gems* (d.repeatCount||1);io.emit('stats',totals);
      handleAction({type:'gift',giftId:String(d.giftId||d.gift?.giftId||''),repeatCount:d.repeatCount||1,uniqueId:d.uniqueId,nickname:d.nickname,profilePictureUrl:d.profilePictureUrl,diamonds:gems*(d.repeatCount||1)},false);
    });
    live.on('disconnected',()=>setStatus('Yayını bekliyor','Yayın kapandı; yeniden bağlanmayı bekliyor'));
  }catch(e){setStatus('Hata',e.message)}
}
function handleAction(d,simulation){
  const mapping=readJson(CONFIG,{}); let action=null,profile=d.profilePictureUrl||'';
  if(d.type==='chat' && /^\s*!katil/i.test(d.comment||''))action='JOIN_MARCH';
  if(d.type==='like')action=mapping.likeAction||'JOIN_MARCH';
  if(d.type==='gift'){action=mapping[d.giftId]; if(!action){const diamonds=d.diamonds||0;action=diamonds>=500?'RANK_VIZIER':diamonds>=300?'EVENT_SEAL':diamonds>=100?'RANK_CAVALRY':diamonds>=50?'EVENT_CATAPULT':diamonds>=30?'EVENT_MEHTER':diamonds>=10?'RANK_SANCAKTAR':diamonds>=1?'RANK_SIPAHI':'JOIN_MARCH'}}
  if(d.type==='member')action='JOIN_MARCH';
  if(d.action)action=d.action;
  if(!action)return;
  const event={...d,action,nickname:d.nickname||d.uniqueId||'Misafir',uniqueId:d.uniqueId||d.nickname||'guest-'+Date.now(),avatar:profile};
  io.emit('gameAction',event); console.log('[Oyun]',event.action,event.nickname);
  if(d.type==='chat'||d.type==='member'||d.type==='gift'||simulation){savePlayer(event)}
}
function savePlayer(e){const p=path.join(DATA,'leaderboard.json');let list=readJson(p,[]);let x=list.find(v=>v.uniqueId===e.uniqueId);if(!x){x={uniqueId:e.uniqueId,nickname:e.nickname,avatar:e.avatar,rank:'Nefer',score:0};list.push(x)}
 if(e.action==='RANK_VIZIER')x.rank='Vezir';else if(e.action==='RANK_CAVALRY')x.rank='Akıncı';else if(e.action==='RANK_SANCAKTAR')x.rank='Sancaktar';else if(e.action==='RANK_SIPAHI')x.rank='Sipahi';if(e.action?.startsWith('EVENT')||e.action?.startsWith('RANK') )x.score+=e.diamonds||100;writeJson(p,list);io.emit('leaderboard',list)}
io.on('connection',socket=>{socket.emit('status',liveStatus);socket.emit('stats',totals);socket.emit('leaderboard',readJson(path.join(DATA,'leaderboard.json'),[]));socket.emit('mapping',readJson(CONFIG,{}));socket.emit('gifts',readJson(path.join(DATA,'tiktok_gifts_cache.json'),[]));});
setStatus('Yayını bekliyor','Hazır');
const PORT=process.env.PORT||3000;server.listen(PORT,'0.0.0.0',()=>console.log(`Ottoman Live running http://localhost:${PORT}`));
