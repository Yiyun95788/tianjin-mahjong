import http from 'node:http';
import {readFile,mkdir,writeFile,rename,readdir} from 'node:fs/promises';
import {randomBytes,randomInt} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {WebSocketServer,WebSocket} from 'ws';
import {newGame,begin,act,view,botAction,leave} from './game.js';
import {NarrationGate} from './pacing.js';

const root=fileURLToPath(new URL('../public/',import.meta.url));
const data=process.env.DATA_DIR||fileURLToPath(new URL('../.data/',import.meta.url));
const rooms=new Map(), clients=new Map(), timers=new Map(), gates=new Map();
await mkdir(data,{recursive:true});
for(const file of await readdir(data))if(/^\d{6}\.json$/.test(file)) {
  try {const room=JSON.parse(await readFile(path.join(data,file),'utf8'));if(Date.now()-room.updated<7*86400000)rooms.set(room.code,room);}
  catch {console.error(`Could not restore room ${file}`);}
}
// Serialize all mutations and disk saves; a client is acknowledged only after
// the new state has been atomically renamed into place.
let queue=Promise.resolve();
const serial = fn => {queue=queue.then(fn).catch(e=>console.error(e.message));};
async function save(r) {r.updated=Date.now();await writeFile(path.join(data,`${r.code}.tmp`),JSON.stringify(r),{mode:0o600});await rename(path.join(data,`${r.code}.tmp`),path.join(data,`${r.code}.json`));}
const send=(ws,msg)=>{if(ws.readyState===WebSocket.OPEN)ws.send(JSON.stringify(msg));};
function publish(r) {
  const listeners=[...clients].filter(([ws,c])=>c.code===r.code&&c.narration&&ws.readyState===WebSocket.OPEN).map(([ws])=>ws);
  let gate=gates.get(r.code);if(!gate){gate=new NarrationGate();gates.set(r.code,gate);}
  if(gate.observe(r.game.events?.at(-1)?.id,listeners))clearBotTimer(r);
  for(const [ws,c]of clients)if(c.code===r.code)send(ws,{type:'state',code:r.code,...view(r.game,c.seat),online:r.members.map((m,i)=>!!m&&[...clients.values()].some(c=>c.code===r.code&&c.seat===i))});
  schedule(r);
}
function clearBotTimer(r){clearTimeout(timers.get(r.code));timers.delete(r.code);}
function releaseListener(ws,r){if(gates.get(r.code)?.remove(ws)){clearBotTimer(r);schedule(r);}}
function schedule(r) {
  if(timers.has(r.code)||!['playing','bets'].includes(r.game.phase))return;
  const eligible=()=>r.game.players.findIndex((p,i)=>(!p.human||p.auto)&&view(r.game,i).actions.length);
  if(eligible()<0)return;
  const gate=gates.get(r.code);
  const timer=setTimeout(()=>serial(async()=>{
    if(timers.get(r.code)!==timer)return;
    timers.delete(r.code);
    if(gates.get(r.code)?.delay()>0){schedule(r);return;}
    const seat=eligible();if(seat<0)return;
    const a=botAction(r.game,seat);if(!a)return;
    act(r.game,seat,a);r.game.revision++;await save(r);publish(r);
  }),gate?.id?Math.max(750,gate.delay()):3200);
  timers.set(r.code,timer);
}
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.webmanifest':'application/manifest+json'};
const server=http.createServer(async(req,res)=>{
  if(req.method!=='GET'){res.writeHead(405);res.end();return;}
  let url;
  try {url=new URL(req.url,'http://localhost');}catch{res.writeHead(400);res.end();return;}
  if(url.pathname==='/health'){res.writeHead(200,{'Content-Type':'application/json'});res.end('{"ok":true}');return;}
  const files={'/':'index.html','/app.js':'app.js','/speech.js':'speech.js','/hand.js':'hand.js','/style.css':'style.css','/manifest.webmanifest':'manifest.webmanifest','/icon.svg':'icon.svg'};
  const file=files[url.pathname]||(/^\/tiles\/(?:[0-9]|[12][0-9]|3[0-3])\.svg$/.test(url.pathname)?url.pathname.slice(1):null);if(!file){res.writeHead(404);res.end('Not found');return;}
  try{const body=await readFile(path.join(root,file));res.writeHead(200,{'Content-Type':types[path.extname(file)],'Cache-Control':'no-cache','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'self'; connect-src 'self' ws: wss:; img-src 'self' data:; style-src 'self'; script-src 'self'; frame-ancestors 'none'"});res.end(body);}
  catch{res.writeHead(500);res.end('Server error');}
});
const wss=new WebSocketServer({server,path:'/ws',maxPayload:4096,verifyClient:({origin,req})=>{
  try{return !origin||new URL(origin).host===req.headers.host;}catch{return false;}
}});
wss.on('connection',ws=>{
  ws.alive=true;ws.on('pong',()=>ws.alive=true);let bucket=0,reset=Date.now();
  ws.on('message',raw=>{
    if(Date.now()-reset>10000){bucket=0;reset=Date.now();}if(++bucket>40){ws.close(1008,'Too many requests');return;}
    serial(async()=>{
      try{
        const m=JSON.parse(raw.toString());
        if(!m||typeof m!=='object')throw Error('请求格式错误');
        if(['create','join','resume'].includes(m.type)){
          if(clients.has(ws))throw Error('已经加入房间');
          let r,seat,token;
          if(m.type==='create'){
            if(rooms.size>=1000)throw Error('房间已满，请稍后再试');
            let code;do{code=String(randomInt(100000,1000000));}while(rooms.has(code));
            r={code,game:newGame(),members:[null,null,null,null],updated:Date.now()};seat=0;rooms.set(code,r);
          }else{
            r=rooms.get(String(m.code));if(!r)throw Error('没有找到房间，请检查六位房间号');
            if(m.type==='resume'){
              seat=r.members.findIndex(x=>x&&x.token===m.token);if(seat<0)throw Error('座位凭证已失效，请重新加入');token=m.token;
            }else{
              if(r.game.phase!=='lobby')throw Error('牌局已开始，请让家人回到新房间后再加入');
              seat=[0,2].find(i=>!r.members[i]);if(seat===undefined)throw Error('两位家人已经到齐了');
            }
          }
          if(!token){token=randomBytes(24).toString('hex');r.members[seat]={token};r.game.players[seat].human=true;r.game.players[seat].name=typeof m.name==='string'?m.name.trim().slice(0,12)||'家人':'家人';}
          for(const [old,c]of clients)if(c.code===r.code&&c.seat===seat){clients.delete(old);releaseListener(old,r);send(old,{type:'replaced'});old.close();}
          clients.set(ws,{code:r.code,seat});await save(r);send(ws,{type:'joined',code:r.code,token,seat});publish(r);return;
        }
        const c=clients.get(ws);if(!c)throw Error('请先加入房间');const r=rooms.get(c.code);
        if(m.type==='narration'){
          c.narration=m.enabled===true;
          if(!c.narration)releaseListener(ws,r);
          return;
        }
        if(m.type==='spoken'){
          if(gates.get(r.code)?.acknowledge(ws,m.eventId)){clearBotTimer(r);schedule(r);}return;
        }
        if(m.type==='leave'){
          leave(r.game,c.seat);clearBotTimer(r);gates.delete(r.code);
          r.game.revision++;await save(r);publish(r);return;
        }
        if(m.type==='sync'){publish(r);return;}
        if(m.revision!==r.game.revision){publish(r);throw Error('牌局已更新，请再操作一次');}
        if(m.type==='start'){if(c.seat!==0)throw Error('请房主开始牌局');begin(r.game);}
        else if(m.type==='action')act(r.game,c.seat,m.action||{});
        else throw Error('不支持的请求');
        r.game.revision++;await save(r);publish(r);
      }catch(e){send(ws,{type:'error',message:e.message});}
    });
  });
  ws.on('close',()=>{const c=clients.get(ws);clients.delete(ws);if(c){const r=rooms.get(c.code);releaseListener(ws,r);publish(r);}});
  ws.on('error',()=>{});
});
const heartbeat=setInterval(()=>{for(const ws of wss.clients){if(!ws.alive){ws.terminate();continue;}ws.alive=false;ws.ping();}},25000);
heartbeat.unref();
server.listen(process.env.PORT===undefined?3000:Number(process.env.PORT),process.env.HOST||'0.0.0.0',()=>console.log(`天津麻将 http://localhost:${server.address().port}`));
// Restored games resume bot turns; humans keep their seat and must reconnect.
for(const r of rooms.values())schedule(r);
