import {spawnSync} from 'node:child_process';
import {mkdirSync,writeFileSync,readFileSync,existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import net from 'node:net';

if(process.platform!=='darwin')throw Error('This helper uses macOS launchd. See docs/DEPLOYMENT.md for other platforms.');
const root=fileURLToPath(new URL('../',import.meta.url));
const dir=path.join(root,'.data/share'),label='com.tianjin-mahjong.share';
const domain=`gui/${process.getuid()}`,service=`${domain}/${label}`,plist=path.join(dir,'agent.plist');
const cmd=process.argv[2]||'status';
const ctl=(...args)=>spawnSync('/bin/launchctl',args,{encoding:'utf8'});
const status=()=>ctl('print',service).status===0;
const xml=s=>s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
if(cmd==='start'){
 if(status()){console.log('Sharing is already running. Use npm run share:status for the URL.');process.exit(0);}
 const binary=process.env.CLOUDFLARED_BIN||['/opt/homebrew/bin/cloudflared','/usr/local/bin/cloudflared'].find(existsSync);
 if(!binary)throw Error('Install cloudflared first: brew install cloudflared');
 // Refuse to replace or attach a tunnel to an unrelated listener.
 await new Promise((resolve,reject)=>{
   const probe=net.createServer();
   probe.once('error',e=>reject(Error(`Cannot reserve port 3000 (${e.code}). Stop npm start before sharing.`)));
   probe.listen(3000,'127.0.0.1',()=>probe.close(resolve));
 });
 mkdirSync(dir,{recursive:true});
 writeFileSync(plist,`<?xml version="1.0" encoding="UTF-8"?>
 <!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
 <plist version="1.0"><dict>
 <key>Label</key><string>${label}</string>
 <key>ProgramArguments</key><array><string>${xml(process.execPath)}</string><string>${xml(path.join(root,'scripts/share-service.mjs'))}</string><string>${xml(binary)}</string></array>
 <key>WorkingDirectory</key><string>${xml(root)}</string>
 <key>RunAtLoad</key><true/><key>KeepAlive</key><true/>
 <key>ThrottleInterval</key><integer>10</integer>
 <key>StandardOutPath</key><string>${xml(path.join(dir,'launcher.log'))}</string>
 <key>StandardErrorPath</key><string>${xml(path.join(dir,'launcher.log'))}</string>
 </dict></plist>`,{mode:0o600});
 const result=ctl('bootstrap',domain,plist);if(result.status!==0)throw Error(result.stderr);
 console.log('Sharing started in the background. Run npm run share:status in a few seconds.');
}else if(cmd==='stop'){
 if(status()){const r=ctl('bootout',service);if(r.status!==0)throw Error(r.stderr);}
 console.log('Sharing stopped.');
}else if(cmd==='status'){
 const running=status();console.log(running?'Background service: running':'Background service: stopped');
 if(running){
   try{const r=await fetch('http://127.0.0.1:3000/health',{signal:AbortSignal.timeout(3000)});console.log(`Game: ${r.ok?'healthy':'unhealthy'}`);}catch{console.log('Game: not responding');}
   const file=path.join(dir,'url.txt');console.log(existsSync(file)?`Public URL: ${readFileSync(file,'utf8').trim()}`:'Public URL: waiting for tunnel');
 }
 console.log(`Logs: ${path.join(dir,'service.log')}`);
}else throw Error('Usage: node scripts/share.mjs start|stop|status');
