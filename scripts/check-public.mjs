import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {WebSocket} from 'ws';
const url=new URL(process.argv[2]||readFileSync(new URL('../.data/share/url.txt',import.meta.url),'utf8').trim());
const sockets=[];
async function connect(){
 const ws=new WebSocket(new URL('/ws',url).href.replace(/^http/,'ws'),{origin:url.origin,handshakeTimeout:10000});
 sockets.push(ws);const messages=[];let notify;
 ws.on('message',raw=>{messages.push(JSON.parse(raw));notify?.();});
 await new Promise((resolve,reject)=>{ws.once('open',resolve);ws.once('error',reject);});
 return {send:m=>ws.send(JSON.stringify(m)),next:async(type)=>{
  const deadline=Date.now()+10000;
  while(Date.now()<deadline){const i=messages.findIndex(m=>m.type===type||m.type==='error');if(i>=0){const m=messages.splice(i,1)[0];if(m.type==='error')throw Error(m.message);return m;}await new Promise(resolve=>{const timer=setTimeout(resolve,100);notify=()=>{clearTimeout(timer);resolve();};});}
  throw Error('Timed out waiting for '+type);
 }};
}
try{
 const health=await fetch(new URL('/health',url),{signal:AbortSignal.timeout(15000)});assert.equal(health.status,200);assert.equal((await health.json()).ok,true);
 const page=await fetch(url,{signal:AbortSignal.timeout(15000)});assert.match(await page.text(),/津门小桌/);
 const a=await connect();a.send({type:'create',name:'连接检查一'});const joined=await a.next('joined');const stateA=await a.next('state');assert.equal(stateA.seat,0);
 const b=await connect();b.send({type:'join',code:joined.code,name:'连接检查二'});await b.next('joined');const stateB=await b.next('state');assert.equal(stateB.seat,2);assert.equal(stateB.players.filter(p=>p.human).length,2);
 assert.equal(stateB.players[0].hand,undefined);assert.equal(stateB.wall,undefined);
 console.log('PASS: HTTPS page, health endpoint, two WebSocket clients, room join and private views.');
}finally{for(const ws of sockets)ws.terminate();}
