import {spawn} from 'node:child_process';
import {mkdirSync,appendFileSync,writeFileSync,renameSync,statSync,existsSync,unlinkSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const root=fileURLToPath(new URL('../',import.meta.url));
const dir=path.join(root,'.data/share');
mkdirSync(dir,{recursive:true});
const logFile=path.join(dir,'service.log'),urlFile=path.join(dir,'url.txt');
const children=new Map();let stopping=false,failures=0,checking=false;
function log(text){
 if(existsSync(logFile)&&statSync(logFile).size>2*1024*1024)renameSync(logFile,logFile+'.1');
 appendFileSync(logFile,`${new Date().toISOString()} ${text}\n`,{mode:0o600});
}
function run(name,command,args,env={}){
 if(stopping)return;
 const child=spawn(command,args,{cwd:root,env:{...process.env,...env},stdio:['ignore','pipe','pipe']});
 children.set(name,child);let buffer='';
 log(`${name} started pid=${child.pid}`);
 for(const stream of [child.stdout,child.stderr])stream.on('data',chunk=>{
   const text=chunk.toString();log(`${name}: ${text.trim()}`);
   if(name==='tunnel'){
     buffer=(buffer+text).slice(-8192);
     const url=buffer.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
     if(url)writeFileSync(urlFile,url[0]+'\n',{mode:0o600});
   }
 });
 child.on('error',e=>log(`${name}: ${e.message}`));
 child.on('close',(code,signal)=>{
   if(children.get(name)!==child)return;
   children.delete(name);log(`${name} exited code=${code} signal=${signal}`);
   if(name==='tunnel'&&existsSync(urlFile))unlinkSync(urlFile);
   if(!stopping)setTimeout(()=>run(name,command,args,env),5000);
 });
}
run('game',process.execPath,['src/server.js'],{HOST:'127.0.0.1',PORT:'3000'});
// Prefer TCP for networks that drop UDP/QUIC; cloudflared reconnects internally.
writeFileSync(path.join(dir,'tunnel.yml'),'{}\n',{mode:0o600});
run('tunnel',process.argv[2],['tunnel','--config',path.join(dir,'tunnel.yml'),'--no-autoupdate','--protocol','http2','--metrics','127.0.0.1:0','--url','http://127.0.0.1:3000','--grace-period','5s']);
// Assertion lasts only as long as this supervisor. Does not override lid close.
run('awake','/usr/bin/caffeinate',['-i','-w',String(process.pid)]);
const health=setInterval(async()=>{
 if(checking||stopping)return;checking=true;
 try{const r=await fetch('http://127.0.0.1:3000/health',{signal:AbortSignal.timeout(4000)});if(!r.ok)throw Error('HTTP '+r.status);failures=0;}
 catch{if(++failures>=3){log('game health check failed three times; restarting');children.get('game')?.kill('SIGTERM');failures=0;}}
 finally{checking=false;}
},10000);
function stop(){
 if(stopping)return;stopping=true;clearInterval(health);
 for(const child of children.values())child.kill('SIGTERM');
 if(existsSync(urlFile))unlinkSync(urlFile);
 setTimeout(()=>{for(const child of children.values())child.kill('SIGKILL');process.exit(0);},6000);
}
process.on('SIGTERM',stop);process.on('SIGINT',stop);
log('share supervisor ready');
