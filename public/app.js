import {Narrator,EventCursor,announcement} from './speech.js';
const app=document.querySelector('#app');
const $=s=>document.querySelector(s);
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const tileName=t=>t<27?`${t%9+1}${['万','筒','条'][Math.floor(t/9)]}`:['东','南','西','北','中','发','白'][t-27];
let socket,game,credential,selected=null,connected=false,retry=0,reconnectTimer,stopped=false;
let busy=false,toastTimer;
const cursor=new EventCursor();
let caption='';
function reportSpeech(){if(connected&&game)socket.send(JSON.stringify({type:'narration',enabled:narrator.enabled&&!document.hidden}));}
const narrator=new Narrator({
 synth:window.speechSynthesis,
 createUtterance:window.SpeechSynthesisUtterance?text=>new SpeechSynthesisUtterance(text):null,
 onDone:eventId=>{if(connected&&game)socket.send(JSON.stringify({type:'spoken',eventId}));},
 onCaption:text=>{caption=text;const el=$('#speech-caption');if(el)el.textContent=text;},
 onError:()=>{toast('语音暂不可用，请再点一次开启语音；出牌节奏仍会放慢');setTimeout(()=>{reportSpeech();render();},0);}
});
try{credential=JSON.parse(localStorage.getItem('tjmj-seat'));}catch{}
const roomParam=new URLSearchParams(location.search).get('room')||'';
let form={name:localStorage.getItem('tjmj-name')||'',code:roomParam};
function toast(s){$('#toast').textContent=s;$('#toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').classList.remove('show'),4000);}
function tile(t,{small=false,button=false,wild=false,drawn=false}={}){
  const suit=Math.floor(t/9);
  const marks=`<img src="/tiles/${t}.svg" alt="" draggable="false"><span class="tile-label">${tileName(t)}</span>`;
  const tag=button?'button':'span';
  return `<${tag} class="tile ${small?'small':''} suit-${suit} ${wild?'wild':''} ${drawn?'drawn':''} ${button&&selected===t?'selected':''}" ${button?`data-tile="${t}" aria-pressed="${selected===t}"`:''} aria-label="${tileName(t)}${wild?'，混儿':''}" title="${tileName(t)}">${marks}${wild?'<b class="wild-mark">混</b>':''}</${tag}>`;
}
function header(){return `<header><a class="brand" href="/" aria-label="津门小桌首页"><span class="brand-mark">津</span><span>津门小桌<small>天 津 麻 将</small></span></a><div class="header-right"><span class="connection ${connected?'good':''}">${connected?'已连接':'正在连接…'}</span><button class="quiet" data-cmd="rules">玩法</button><button class="quiet sound" data-cmd="sound" aria-pressed="${narrator.enabled}">${narrator.enabled?'语音已开':'开启语音'}</button></div></header>`;}
function home(){return `${header()}<main class="welcome"><section class="entry-card"><h2>天津麻将</h2><label for="name">怎么称呼您</label><input id="name" maxlength="12" autocomplete="nickname" placeholder="例如：爸爸、妈妈" value="${escape(form.name)}"><button class="primary" id="create" ${!connected||busy?'disabled':''}>开一桌新牌 <span>→</span></button><div class="divider"><span>家人已经开好了？</span></div><label for="code">输入六位房间号</label><div class="join-row"><input id="code" inputmode="numeric" maxlength="6" placeholder="000000" value="${escape(form.code)}"><button class="secondary" id="join" ${!connected||busy?'disabled':''}>加入</button></div><p class="entry-note">一个人也能开局，空位由电脑牌友补齐。</p></section></main>`;}
function player(seat,position){const p=game.players[seat];return `<section class="opponent ${position} ${game.turn===seat&&game.phase==='playing'?'active-player':''}"><div class="avatar">${p.human?'家':'津'}</div><div><strong>${escape(p.name)}</strong><span class="player-detail">${p.human?(game.online[seat]?'在线':'离线 · 等待回来'):'电脑牌友'}${game.dealer===seat?' · 庄':''} <b>${p.score>0?'+':''}${p.score}分</b></span></div><div class="concealed">${Array.from({length:p.count||0},()=>'<i></i>').join('')}<small>${p.count||0}张</small></div><div class="melds">${p.melds.map(m=>`<span class="meld">${Array(m.kind==='pong'?3:4).fill(m.tile).map(t=>tile(t,{small:true})).join('')}</span>`).join('')}</div></section>`;}
function statusText(){
 if(game.phase==='lobby')return '等家人到齐，就可以开局';
 if(game.phase==='bets')return `${escape(game.players[game.dealer].name)}坐庄选择${game.bets[game.dealer]===1?' · 请闲家选择拉庄':''}`;
 if(game.phase==='ended')return game.result.winner===null?'本局荒牌':'本局结束';
 if(game.pending)return `${escape(game.players[game.pending.from].name)}打出${tileName(game.pending.tile)} · 等待碰杠选择`;
 return game.turn===game.seat?'轮到您了 · 选一张牌，再点「出牌」':`等${escape(game.players[game.turn].name)}出牌`;
}
function center(){
 if(game.phase==='lobby')return `<div class="lobby-card"><h2>邀请家人</h2><p>把房间号告诉家人，或分享邀请链接</p><div class="room-digits">${game.code}</div><button class="secondary" data-cmd="invite">分享这一桌</button><div class="seat-list">${game.players.map((p,i)=>`<span>${p.human?'●':'○'} ${p.human?escape(p.name):i===2?'等家人 / 电脑补位':'电脑牌友'}</span>`).join('')}</div>${game.seat===0?'<button class="primary" data-cmd="start">开始打牌</button>':'<p>等待房主开始</p>'}<small>开局后不能加入新玩家；家人未到，请稍等。</small></div>`;
 if(game.phase==='bets')return `<div class="lobby-card compact"><span class="eyebrow">第 ${game.round+1} 局</span><h2>坐庄 · 拉庄</h2><p>坐庄：庄家与各家结算翻倍<br>拉庄：你与庄家的结算再翻倍</p><p>${statusText()}</p>${game.actions.filter(a=>a.type==='bet').map(a=>`<button class="${a.value?'secondary':'primary'}" data-bet="${a.value}">${a.value?(game.seat===game.dealer?'坐庄':'拉一庄'):'不加倍'}</button>`).join('')}<small>本局选择仅影响积分</small></div>`;
 const rivers=[(game.seat+2)%4,(game.seat+3)%4,(game.seat+1)%4,game.seat];
 return `<div class="table-center"><div class="wall-info"><span>第 ${game.round} 局</span><strong>余 ${game.remaining} 张</strong><span class="wild-info">混儿 ${game.wilds.map(t=>tile(t,{small:true,wild:true})).join('')}</span></div><div class="rivers">${rivers.map((s,i)=>`<div class="river river-${['north','west','east','south'][i]}"><span class="river-label">${escape(game.players[s].name)} · ${game.players[s].river.length}张</span><div>${game.players[s].river.map((t,i)=>`<span class="${game.lastDiscard?.seat===s&&i===game.players[s].river.length-1?'last-discard':''}">${tile(t,{small:true})}</span>`).join('')}</div></div>`).join('')}</div></div>`;
}
function handArea(){const p=game.players[game.seat];let hand=[...p.hand];let drawn;
 if(game.turn===game.seat&&game.drawn!=null&&game.phase==='playing'){const i=hand.indexOf(game.drawn);if(i>=0){drawn=hand.splice(i,1)[0];}}
 const legal=game.actions.filter(a=>a.type==='discard').map(a=>a.tile);
 const buttons=game.actions.filter(a=>!['discard','bet'].includes(a.type));
 return `<section class="my-area"><div class="my-meta"><strong>${escape(p.name)}${game.dealer===game.seat?' · 庄':''}</strong><span>${p.score>0?'+':''}${p.score} 分</span><span class="hand-hint">${p.auto?'正在托管':selected!==null?`已选 ${tileName(selected)}`:'点击选牌，确认后出牌'}</span><button class="quiet" data-cmd="auto">${p.auto?'收回操作':'托管'}</button></div><div class="my-melds">${p.melds.map(m=>`<span class="meld">${Array(m.kind==='pong'?3:4).fill(m.tile).map(t=>tile(t,{small:true})).join('')}<small>${m.kind==='hiddenKong'?'暗杠':m.kind==='pong'?'碰':'杠'}</small></span>`).join('')}</div><div class="hand">${hand.map(t=>tile(t,{button:true,wild:game.wilds?.includes(t)})).join('')}${drawn!==undefined?tile(drawn,{button:true,wild:game.wilds.includes(drawn),drawn:true}):''}</div><div class="action-bar"><span class="turn-message" role="status">${statusText()}</span><div class="action-buttons">${buttons.map(a=>`<button class="${a.type==='win'?'win-button':a.type==='pass'?'quiet':'secondary'}" data-action="${a.type}" ${a.tile!==undefined?`data-value="${a.tile}"`:''} ${!connected||busy||p.auto?'disabled':''}>${{win:'胡牌',pong:'碰',kong:`杠${a.tile!==undefined?' '+tileName(a.tile):''}`,pass:'过'}[a.type]}</button>`).join('')}<button class="primary discard-button" data-cmd="discard" ${selected===null||!legal.includes(selected)||!connected||busy||p.auto?'disabled':''}>出牌</button></div></div></section>`;}
function result(){if(game.phase!=='ended')return '';const r=game.result;return `<div class="result-shade"><section class="result-card"><span class="eyebrow">第 ${game.round} 局 · 结算</span><h2>${r.winner===null?'这一局，荒牌':`${escape(game.players[r.winner].name)}胡了`}</h2><p>${r.labels.join(' × ')||'杠分照常计入总分'} ${r.points?`· 每家基础 ${r.points} 分`:''}</p>${r.winner!==null?`<div class="winning-hand">${game.players[r.winner].hand.map(t=>tile(t,{small:true,wild:game.wilds.includes(t)})).join('')}</div>`:''}<div class="score-list">${game.players.map((p,i)=>`<div><strong>${escape(p.name)}</strong><span>胡牌 ${r.delta[i]>0?'+':''}${r.delta[i]}</span><b>总分 ${p.score}</b></div>`).join('')}</div><p class="muted">杠分已在开杠时结算 · ${game.nextDealer===game.dealer?'庄家连庄':'下一位坐庄'}</p>${game.seat===0?'<button class="primary" data-cmd="start">再来一局</button>':'<p>等待房主开始下一局</p>'}<button class="quiet" data-cmd="home">返回首页</button></section></div>`;}
function board(){return `${header()}<main class="game-shell"><div class="room-toolbar"><span>家庭房 <b>${game.code}</b></span><button class="quiet" data-cmd="invite">邀请家人 ↗</button><span class="network-note">${connected?'':'网络暂断，正在重连'}</span></div><div class="board ${game.phase==='lobby'||game.phase==='bets'?'waiting':''}">${player((game.seat+2)%4,'north')}${player((game.seat+3)%4,'west')}<section class="center">${center()}</section>${player((game.seat+1)%4,'east')}${handArea()}</div><div id="speech-caption" class="speech-caption" aria-live="polite">${escape(caption)}</div></main>${result()}`;}
function render(){app.innerHTML=(game?board():home())+'<div class="rotate-prompt" role="status"><span>↻</span><strong>请横过手机打牌</strong><p>若画面没有转动，请关闭竖排方向锁定。</p></div>';bind();document.querySelectorAll(".river>div").forEach(el=>el.scrollTop=el.scrollHeight);}
function request(msg){if(!connected||busy)return;busy=true;socket.send(JSON.stringify({...msg,revision:game?.revision}));render();}
function action(a){request({type:'action',action:a});}
function readForm(){form={name:$('#name')?.value||'家人',code:$('#code')?.value||''};localStorage.setItem('tjmj-name',form.name);}
function bind(){
 $('#name')?.addEventListener('input',e=>form.name=e.target.value);$('#code')?.addEventListener('input',e=>form.code=e.target.value.replace(/\D/g,''));
 $('#create')?.addEventListener('click',()=>{readForm();request({type:'create',name:form.name});});
 $('#join')?.addEventListener('click',()=>{readForm();if(!/^\d{6}$/.test(form.code)){toast('请输入六位房间号');return;}request({type:'join',name:form.name,code:form.code});});
 document.querySelectorAll('[data-tile]').forEach(el=>el.onclick=()=>{selected=Number(el.dataset.tile);render();});
 document.querySelectorAll('[data-bet]').forEach(el=>el.onclick=()=>action({type:'bet',value:Number(el.dataset.bet)}));
 document.querySelectorAll('[data-action]').forEach(el=>el.onclick=()=>action({type:el.dataset.action,...(el.dataset.value!==undefined?{tile:Number(el.dataset.value)}:{})}));
 document.querySelectorAll('[data-cmd]').forEach(el=>el.onclick=async()=>{
  switch(el.dataset.cmd){
   case 'rules':$('#rules').showModal();break;
   case 'sound':if(narrator.enabled)narrator.stop();else if(!narrator.enable())toast('这个浏览器不支持语音播报，请用 Safari 打开');reportSpeech();render();break;
   case 'start':request({type:'start'});break;
   case 'discard':if(selected!==null){const t=selected;selected=null;action({type:'discard',tile:t});}break;
   case 'auto':action({type:'auto',value:!game.players[game.seat].auto});break;
   case 'invite':{const url=`${location.origin}/?room=${game.code}`;try{if(navigator.share)await navigator.share({title:'来津门小桌打麻将',text:`房间号 ${game.code}`,url});else{await navigator.clipboard.writeText(url);toast('邀请链接已复制，发给家人就好');}}catch(e){if(e.name!=='AbortError')toast(`房间号 ${game.code}，可直接告诉家人`);}break;}
   case 'home':narrator.stop();reportSpeech();cursor.reset();localStorage.removeItem('tjmj-seat');credential=null;game=null;socket.close();render();break;
  }
 });
}
function connect(){
 if(stopped)return;
 socket=new WebSocket(`${location.protocol==='https:'?'wss':'ws'}://${location.host}/ws`);
 socket.onopen=()=>{connected=true;retry=0;busy=false;if(credential)socket.send(JSON.stringify({type:'resume',...credential}));render();};
 socket.onmessage=e=>{const m=JSON.parse(e.data);busy=false;
  if(m.type==='joined'){cursor.reset();credential={code:m.code,token:m.token};localStorage.setItem('tjmj-seat',JSON.stringify(credential));history.replaceState(null,'',`/?room=${m.code}`);}
  else if(m.type==='state'){const first=cursor.room!==m.code;game=m;const fresh=cursor.read(m.code,m.events);if(first)reportSpeech();for(const event of fresh)narrator.add(event,announcement(event,m.players));if(!m.players[m.seat].hand.includes(selected))selected=null;render();}
  else if(m.type==='error'){toast(m.message);if(!game&&credential){credential=null;localStorage.removeItem('tjmj-seat');}render();}
  else if(m.type==='replaced'){narrator.stop();stopped=true;connected=false;toast('此座位已在另一个窗口打开');render();}
 };
 socket.onclose=()=>{connected=false;narrator.stop();cursor.reset();busy=false;render();if(!stopped){clearTimeout(reconnectTimer);reconnectTimer=setTimeout(connect,Math.min(1000*2**retry++,10000));}};
 socket.onerror=()=>{};
}
$('#close-rules').onclick=()=>$('#rules').close();
window.addEventListener('online',()=>{if(socket.readyState!==WebSocket.OPEN){clearTimeout(reconnectTimer);socket.close();}});
let hiddenAt=0;
document.addEventListener('visibilitychange',()=>{if(document.hidden){hiddenAt=Date.now();narrator.stop();reportSpeech();}else if(Date.now()-hiddenAt>20000){socket.close();}else if(socket.readyState===WebSocket.OPEN&&game)socket.send(JSON.stringify({type:'sync'}));});
render();connect();
