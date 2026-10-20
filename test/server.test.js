import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {WebSocket} from 'ws';

async function boot(dir){
 const proc=spawn(process.execPath,['src/server.js'],{env:{...process.env,HOST:'127.0.0.1',PORT:'0',DATA_DIR:dir},stdio:['ignore','pipe','pipe']});
 const port=await new Promise((resolve,reject)=>{let output='';proc.stdout.on('data',x=>{output+=x;const m=output.match(/localhost:(\d+)/);if(m)resolve(m[1]);});proc.once('exit',code=>reject(Error(`Server exited ${code}`)));proc.stderr.on('data',x=>reject(Error(String(x))));});
 return {proc,port};
}
async function client(port){
 const ws=new WebSocket(`ws://127.0.0.1:${port}/ws`),messages=[];let notify;
 ws.on('message',raw=>{messages.push(JSON.parse(raw));notify?.();});
 await new Promise((resolve,reject)=>{ws.once('open',resolve);ws.once('error',reject);});
 return {ws,send:m=>ws.send(JSON.stringify(m)),next:async(type)=>{
   const until=Date.now()+5000;
   while(true){const i=messages.findIndex(m=>m.type===type);if(i>=0)return messages.splice(i,1)[0];if(Date.now()>until)throw Error(`Timed out waiting for ${type}`);await new Promise(r=>{const timer=setTimeout(r,50);notify=()=>{clearTimeout(timer);r();};});}
 }};
}
test('two private seats, server authorization, reconnect and disk recovery',{timeout:20000},async(t)=>{
 const dir=await mkdtemp(path.join(tmpdir(),'tjmj-test-'));let server=await boot(dir);const sockets=[];
 t.after(async()=>{for(const ws of sockets)ws.terminate();server.proc.kill();await rm(dir,{recursive:true,force:true});});
 for(let tile=0;tile<34;tile++){
  const asset=await fetch(`http://127.0.0.1:${server.port}/tiles/${tile}.svg`);
  assert.equal(asset.status,200);assert.equal(asset.headers.get('content-type'),'image/svg+xml');assert.match(await asset.text(),/<svg/);
 }
 assert.equal((await fetch(`http://127.0.0.1:${server.port}/tiles/34.svg`)).status,404);
 const a=await client(server.port);sockets.push(a.ws);a.send({type:'create',name:'爸爸'});
 const auth=await a.next('joined');let state=await a.next('state');
 assert.equal(state.seat,0);assert.equal(state.players[0].name,'爸爸');
 const b=await client(server.port);sockets.push(b.ws);b.send({type:'join',code:auth.code,name:'妈妈'});
 const authB=await b.next('joined');const bState=await b.next('state');assert.equal(bState.seat,2);assert.equal(bState.players.filter(p=>p.human).length,2);
 b.send({type:'start',revision:bState.revision});assert.match((await b.next('error')).message,/房主/);
 a.send({type:'start',revision:state.revision});
 // Drain until start is observed (joining also broadcasts lobby).
 do{state=await a.next('state');}while(state.phase==='lobby');
 assert.ok(['bets','playing'].includes(state.phase));
 assert.equal(state.players[2].hand,undefined);assert.equal(state.wall,undefined);assert.equal(state.supplement,undefined);
 assert.ok(!JSON.stringify(state).includes(authB.token));
 a.send({type:'action',revision:-1,action:{type:'auto',value:true}});assert.match((await a.next('error')).message,/更新/);
 const intruder=await client(server.port);sockets.push(intruder.ws);intruder.send({type:'resume',code:auth.code,token:'wrong'});assert.match((await intruder.next('error')).message,/凭证/);
 const resumed=await client(server.port);sockets.push(resumed.ws);resumed.send({type:'resume',code:auth.code,token:auth.token});await resumed.next('joined');assert.equal((await resumed.next('state')).seat,0);await a.next('replaced');
 const health=await fetch(`http://127.0.0.1:${server.port}/health`);assert.equal(health.status,200);
 await new Promise(resolve=>{server.proc.once('exit',resolve);server.proc.kill();});
 server=await boot(dir);
 const recovered=await client(server.port);sockets.push(recovered.ws);recovered.send({type:'resume',code:auth.code,token:auth.token});await recovered.next('joined');const restored=await recovered.next('state');
 assert.equal(restored.seat,0);assert.equal(restored.players[2].name,'妈妈');assert.notEqual(restored.phase,'lobby');
 const guest=await client(server.port);sockets.push(guest.ws);guest.send({type:'resume',code:auth.code,token:authB.token});await guest.next('joined');await guest.next('state');
 // Leaving is authenticated but deliberately ignores stale revisions.
 guest.send({type:'leave',revision:-1});
 let closed;do{closed=await recovered.next('state');}while(closed.phase!=='closed');
 let guestClosed;do{guestClosed=await guest.next('state');}while(guestClosed.phase!=='closed');
 assert.equal(closed.closedBy,2);assert.equal(guestClosed.closedBy,2);assert.deepEqual(closed.actions,[]);
 recovered.send({type:'start',revision:closed.revision});assert.match((await recovered.next('error')).message,/重新开桌/);
 await new Promise(resolve=>{server.proc.once('exit',resolve);server.proc.kill();});server=await boot(dir);
 const closedResume=await client(server.port);sockets.push(closedResume.ws);closedResume.send({type:'resume',code:auth.code,token:auth.token});await closedResume.next('joined');
 assert.equal((await closedResume.next('state')).phase,'closed');

});
