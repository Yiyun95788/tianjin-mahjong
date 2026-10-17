const numbers=['一','二','三','四','五','六','七','八','九'];
export const spokenTile=t=>t<27?`${numbers[t%9]}${['万','筒','条'][Math.floor(t/9)]}`:['东风','南风','西风','北风','红中','发财','白板'][t-27];
export function announcement(event,players=[]) {
  if(event.type==='drawGame')return '荒牌，这一局结束。';
  const who=players[event.seat]?.name?.replace(/^电脑·/,'')||['家人','小津','家人','海河'][event.seat]||'家人';
  const move={discard:'打出',pong:'碰',kong:'明杠',hiddenKong:'暗杠',addedKong:'补杠',win:'胡牌了'}[event.type];
  return move?`${who}，${move}${event.tile===undefined?'':spokenTile(event.tile)}。`:'';
}
export class EventCursor {
  room=null;id=0;
  read(room,events=[]) {
    const last=events.at(-1)?.id||0;
    if(this.room!==room){this.room=room;this.id=last;return [];}
    const fresh=events.filter(e=>e.id>this.id);this.id=Math.max(last,this.id);return fresh;
  }
  reset(){this.room=null;this.id=0;}
}
export class Narrator {
  constructor({synth,createUtterance,onDone=()=>{},onCaption=()=>{},onError=()=>{}}) {
    this.synth=synth;this.createUtterance=createUtterance;this.onDone=onDone;this.onCaption=onCaption;this.onError=onError;
    this.enabled=false;this.queue=[];this.current=null;
  }
  enable() {
    if(!this.synth||!this.createUtterance)return false;
    this.enabled=true;this.synth.resume();
    // Called directly from a tap, including on iOS. This is also an audible test.
    this.add({id:null,seat:0},'语音播报已开启。');return true;
  }
  stop() {
    this.enabled=false;
    const pending=[...(this.current?[this.current]:[]),...this.queue];
    this.current=null;this.queue=[];clearTimeout(this.timer);this.synth?.cancel();
    for(const item of pending)if(item.event.id!==null)this.onDone(item.event.id);
    this.onCaption('');
  }
  add(event,text) {
    if(!this.enabled||!text){if(event.id!==null)this.onDone(event.id);return;}
    this.queue.push({event,text,at:Date.now()});this.pump();
  }
  pump() {
    if(this.current||!this.enabled||!this.queue.length)return;
    const item=this.queue.shift();
    if(Date.now()-item.at>8000){this.onDone(item.event.id);this.pump();return;}
    this.current=item;this.onCaption(item.text);
    const u=this.createUtterance(item.text);
    const voices=this.synth.getVoices().filter(v=>/^zh(?:-|_)(CN|TW|Hans|Hant)/i.test(v.lang)||v.lang==='zh');
    const local=voices.filter(v=>v.localService),pool=local.length?local:voices;
    if(pool.length)u.voice=pool[(item.event.seat??0)%pool.length];
    u.lang=u.voice?.lang||'zh-CN';u.rate=.9;u.pitch=[.92,1.08,1.18,.82][item.event.seat??0];u.volume=1;
    const finish=(failed=false)=>{
      if(this.current!==item)return;
      clearTimeout(this.timer);this.current=null;
      if(item.event.id!==null)this.onDone(item.event.id);
      if(failed){this.onError();this.stop();return;}
      this.onCaption('');this.pump();
    };
    u.onend=()=>finish();u.onerror=()=>finish(true);
    this.timer=setTimeout(()=>finish(true),8000);
    try{this.synth.speak(u);}catch{finish(true);}
  }
}
