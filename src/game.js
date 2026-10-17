import {randomInt} from 'node:crypto';
import {nextTile,scoreHand,chooseDiscard,tileName} from './rules.js';

const sort = h => h.sort((a,b)=>a-b);
export function newGame() {
  return {phase:'lobby',players:Array.from({length:4},(_,i)=>({name:['津门','小津','家人','海河'][i],human:false,auto:false,hand:[],melds:[],river:[],score:0})),dealer:0,round:0,revision:0,log:[],bets:[null,null,null,null]};
}
const note = (g,s) => { g.log.push(s); g.log = g.log.slice(-30); };
const announce = (g,type,seat,tile) => {
  g.eventId=(g.eventId||0)+1;
  g.events=[...(g.events||[]),{id:g.eventId,type,seat,...(tile===undefined?{}:{tile})}].slice(-24);
};
export function begin(g) {
  if (!['lobby','ended'].includes(g.phase)) throw Error('这一局还没有结束');
  if (g.round) g.dealer = g.nextDealer;
  else g.dealer = randomInt(4);
  g.phase='bets';g.bets=[null,null,null,null];g.result=null;g.pending=null;g.log=[];
  for (const p of g.players) {p.hand=[];p.melds=[];p.river=[];}
  note(g,`请${g.players[g.dealer].name}选择是否坐庄`);
  autoBets(g);
}
function autoBets(g) {
  if (!g.players[g.dealer].human || g.players[g.dealer].auto) g.bets[g.dealer]=0;
  if (g.bets[g.dealer]===0) { g.bets=[0,0,0,0]; deal(g); }
  else if (g.bets[g.dealer]===1) {
    g.players.forEach((p,i)=>{if(!p.human || p.auto) g.bets[i] ??= 0;});
    if(g.bets.every(x=>x!==null)) deal(g);
  }
}
function deal(g) {
  const wall = Array.from({length:136},(_,i)=>Math.floor(i/4));
  for(let i=wall.length-1;i>0;i--){const j=randomInt(i+1);[wall[i],wall[j]]=[wall[j],wall[i]];}
  // Shuffle makes the cut distribution uniform; retain actual dice/cut data.
  const dice=()=>[randomInt(1,7),randomInt(1,7)];
  g.dice=[dice(),dice(),dice()];
  const first=g.dice[0].reduce((a,b)=>a+b), second=g.dice[1].reduce((a,b)=>a+b);
  const cut=(((g.dealer+first-1)%4)*34+(first+second)*2)%136;
  const rotated=[...wall.slice(cut),...wall.slice(0,cut)];
  g.wall=rotated;
  for(const p of g.players){p.hand=[];p.melds=[];p.river=[];p.drawCount=0;}
  for(let r=0;r<3;r++)for(let s=0;s<4;s++)for(let t=0;t<4;t++)g.players[(g.dealer+s)%4].hand.push(g.wall.shift());
  for(let s=0;s<4;s++)g.players[(g.dealer+s)%4].hand.push(g.wall.shift());
  const bonus=g.wall.shift();g.players[g.dealer].hand.push(bonus);
  // Indicator is counted backwards from the opening, upper tile of the dice-th pair.
  const reserve = g.dice[2].reduce((a,b)=>a+b)*2-1;
  const index=g.wall.length-reserve-1;
  g.indicator=g.wall[index];g.supplement=g.wall.slice(index+1);g.wall=g.wall.slice(0,index);
  g.wilds=[g.indicator,nextTile(g.indicator)];
  g.players.forEach(p=>sort(p.hand));
  g.phase='playing';g.turn=g.dealer;g.drawn=bonus;g.kongDraw=false;g.discardCount=0;g.claimed=false;g.round++;
  note(g,`第 ${g.round} 局开始，${g.players[g.dealer].name}坐东，混儿：${g.wilds.map(tileName).join('、')}`);
}
function multiplier(g,a,b) {
  if(a!==g.dealer && b!==g.dealer)return 1;
  const other=a===g.dealer?b:a;
  return g.bets[g.dealer] ? 2*(g.bets[other]?2:1) : 1;
}
function pay(g,winner,base) {
  const delta=[0,0,0,0];
  g.players.forEach((p,i)=>{if(i!==winner){const v=base*multiplier(g,winner,i);p.score-=v;g.players[winner].score+=v;delta[i]-=v;delta[winner]+=v;}});
  return delta;
}
function finish(g,result) {
  g.result=result;g.phase='ended';g.pending=null;
  const keep=result.winner===g.dealer || (result.winner===null && (g.players[g.dealer].melds.some(m=>m.kind!=='pong') || !g.players.some(p=>p.melds.some(m=>m.kind!=='pong'))));
  g.nextDealer=keep?g.dealer:(g.dealer+1)%4;
  note(g,result.winner===null?'荒牌，本局结束':`${g.players[result.winner].name}胡了：${result.labels.join(' · ')}，${result.points} 分`);
  announce(g,result.winner===null?'drawGame':'win',result.winner);
}
function draw(g,seat,kong=false) {
  const pile=kong?g.supplement:g.wall;
  if(!pile.length){finish(g,{winner:null,labels:[],points:0,delta:[0,0,0,0]});return;}
  const t=kong?pile.pop():pile.shift();
  g.turn=seat;g.drawn=t;g.kongDraw=kong;g.players[seat].drawCount++;g.players[seat].hand.push(t);sort(g.players[seat].hand);
}
export function winFor(g,seat) {
  if(g.phase!=='playing'||g.pending||g.turn!==seat||g.drawn===null)return null;
  return scoreHand({hand:g.players[seat].hand,wilds:g.wilds,melds:g.players[seat].melds,drawn:g.drawn,kongDraw:g.kongDraw,
    heavenly:seat===g.dealer && g.discardCount===0 && !g.claimed,
    earthly:seat!==g.dealer && g.players[seat].drawCount===1 && !g.claimed});
}
export function actionsFor(g,seat) {
  const p=g.players[seat], out=[];
  if(g.phase==='bets' && g.bets[seat]===null && (seat===g.dealer || g.bets[g.dealer]===1))return [{type:'bet',value:0},{type:'bet',value:1}];
  if(g.phase!=='playing')return out;
  if(g.pending){
    if(g.pending.eligible.includes(seat)&&!Object.hasOwn(g.pending.answers,seat)) {
      const n=p.hand.filter(t=>t===g.pending.tile).length;
      out.push({type:'pass'},{type:'pong'});if(n>=3)out.push({type:'kong',tile:g.pending.tile});
    }return out;
  }
  if(g.turn!==seat)return out;
  if(winFor(g,seat))out.push({type:'win'});
  for(const tile of new Set(p.hand))if(!g.wilds.includes(tile)) {
    out.push({type:'discard',tile});
    if(p.hand.filter(t=>t===tile).length===4)out.push({type:'kong',tile});
    if(g.drawn!==null && p.melds.some(m=>m.kind==='pong'&&m.tile===tile))out.push({type:'kong',tile});
  }
  return out;
}
function remove(p,t,n){for(let i=0;i<n;i++){const at=p.hand.indexOf(t);if(at<0)throw Error('缺少牌');p.hand.splice(at,1);}}
function kongPay(g,seat,hidden){pay(g,seat,hidden?2:1);note(g,`${g.players[seat].name}${hidden?'暗杠':'明杠'}，向其余三家收取 ${hidden?2:1} 分（坐拉庄另算）`);}
function resolve(g) {
  const q=g.pending;
  if(!q.eligible.every(s=>Object.hasOwn(q.answers,s)))return;
  const seat=q.eligible.find(s=>q.answers[s]!=='pass');
  g.pending=null;
  if(seat===undefined){draw(g,(q.from+1)%4);return;}
  const p=g.players[seat],kong=q.answers[seat]==='kong';
  remove(p,q.tile,kong?3:2);p.melds.push({kind:kong?'exposedKong':'pong',tile:q.tile,from:q.from});
  g.players[q.from].river.pop();g.turn=seat;g.drawn=null;g.kongDraw=false;g.claimed=true;
  note(g,`${p.name}${kong?'杠':'碰'} ${tileName(q.tile)}`);
  announce(g,kong?'kong':'pong',seat,q.tile);
  if(kong){kongPay(g,seat,false);draw(g,seat,true);}
}
export function act(g,seat,a) {
  if(a.type==='auto') {g.players[seat].auto=!!a.value;if(g.phase==='bets')autoBets(g);return;}
  const legal=actionsFor(g,seat).some(x=>x.type===a.type&&(x.tile===undefined||x.tile===a.tile)&&(x.value===undefined||x.value===a.value));
  if(!legal)throw Error('现在不能执行这个操作，请等待牌局更新');
  const p=g.players[seat];
  if(a.type==='bet'){g.bets[seat]=a.value;autoBets(g);return;}
  if(g.pending){g.pending.answers[seat]=a.type;resolve(g);return;}
  if(a.type==='win'){const score=winFor(g,seat);const delta=pay(g,seat,score.points);finish(g,{winner:seat,...score,delta});return;}
  if(a.type==='kong'){
    const m=p.melds.find(m=>m.kind==='pong'&&m.tile===a.tile);
    if(m){remove(p,a.tile,1);m.kind='addedKong';}else{remove(p,a.tile,4);p.melds.push({kind:'hiddenKong',tile:a.tile});}
    announce(g,m?'addedKong':'hiddenKong',seat,a.tile);
    g.claimed=true;kongPay(g,seat,!m);draw(g,seat,true);return;
  }
  remove(p,a.tile,1);p.river.push(a.tile);g.discardCount++;g.drawn=null;g.kongDraw=false;
  g.lastDiscard={seat,tile:a.tile};note(g,`${p.name}打出 ${tileName(a.tile)}`);
  announce(g,'discard',seat,a.tile);
  const eligible=[];
  for(let i=1;i<4;i++){const s=(seat+i)%4;if(g.players[s].hand.filter(t=>t===a.tile).length>=2)eligible.push(s);}
  if(eligible.length)g.pending={from:seat,tile:a.tile,eligible,answers:{}};
  else draw(g,(seat+1)%4);
}
export function botAction(g,seat) {
  const actions=actionsFor(g,seat);if(!actions.length)return null;
  const win=actions.find(a=>a.type==='win');if(win)return win;
  const kong=actions.find(a=>a.type==='kong');if(kong)return kong;
  if(g.pending){
    const p=g.players[seat],t=g.pending.tile;
    // Keep the concealed hand for a nearly complete dragon; otherwise claim.
    const distinct=new Set(p.hand.filter(x=>x<27&&Math.floor(x/9)===Math.floor(t/9))).size;
    return {type:distinct>=7?'pass':'pong'};
  }
  if(g.phase==='bets')return {type:'bet',value:0};
  const visible=g.players.flatMap(p=>[...p.river,...p.melds.flatMap(m=>Array(m.kind==='pong'?3:4).fill(m.tile))]);
  return {type:'discard',tile:chooseDiscard(g.players[seat].hand,g.wilds,g.players[seat].melds,visible)};
}
export function view(g,seat) {
  return {...g,wall:undefined,supplement:undefined,remaining:g.wall?.length??0,reserve:g.supplement?.length??0,
    drawn:g.turn===seat?g.drawn:undefined,
    pending:g.pending?{from:g.pending.from,tile:g.pending.tile}:null,
    players:g.players.map((p,i)=>({...p,name:p.human?p.name:p.name.replace(/^电脑·/,''),hand:i===seat||g.phase==='ended'?p.hand:undefined,count:p.hand.length})),
    seat,actions:actionsFor(g,seat),win:winFor(g,seat)};
}
