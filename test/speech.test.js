import test from 'node:test';
import assert from 'node:assert/strict';
import {NarrationGate} from '../src/pacing.js';
import {Narrator,EventCursor,announcement,spokenTile} from '../public/speech.js';

test('announcements identify every seat and public move without private draw tiles',()=>{
 const players=['妈妈','小津','爸爸','海河'].map(name=>({name}));
 for(let i=0;i<4;i++)assert.match(announcement({type:'discard',seat:i,tile:4},players),new RegExp(players[i].name+'，打出五万'));
 assert.equal(announcement({type:'discard',seat:3,tile:4},[{},{},{},{name:'电脑·海河'}]),'海河，打出五万。');
 assert.equal(announcement({type:'discard',seat:2,tile:4}), '家人，打出五万。');
 assert.equal(spokenTile(33),'白板');assert.equal(spokenTile(31),'红中');
 for(const type of ['pong','kong','addedKong','hiddenKong','win'])assert.ok(announcement({type,seat:1,tile:type==='win'?undefined:3},players));
 assert.equal(announcement({type:'privateDraw',seat:1,tile:3},players),'');
});
test('event cursor never replays snapshots, duplicates or another room history',()=>{
 const c=new EventCursor();assert.deepEqual(c.read('a',[{id:2}]),[]);
 assert.deepEqual(c.read('a',[{id:2},{id:3},{id:4}]),[{id:3},{id:4}]);
 assert.deepEqual(c.read('a',[{id:3},{id:4}]),[]);
 c.reset();assert.deepEqual(c.read('a',[{id:4},{id:5}]),[]);
 assert.deepEqual(c.read('b',[{id:99}]),[]);
});
test('computer pacing waits for both listeners with minimum and bounded fallback',()=>{
 const g=new NarrationGate();g.observe(1,['a','b'],0);assert.equal(g.delay(1000),8000);
 g.acknowledge('a',1);assert.equal(g.delay(1000),8000);
 g.acknowledge('b',0);assert.equal(g.delay(1000),8000);
 g.acknowledge('b',1);assert.equal(g.delay(1000),2200);assert.equal(g.delay(3200),0);
 assert.equal(g.observe(1,['a'],4000),false);
 g.observe(2,['a'],4000);assert.equal(g.delay(13000),0);
 g.observe(3,['a'],14000);g.remove('a');assert.equal(g.delay(15000),2200);
});
function harness(){
 const spoken=[],done=[],captions=[];
 const synth={resume(){},cancel(){},getVoices:()=>[{lang:'zh-CN',localService:true,name:'test'}],speak:u=>spoken.push(u)};
 const narrator=new Narrator({synth,createUtterance:text=>({text}),onDone:id=>done.push(id),onCaption:text=>captions.push(text)});
 return {narrator,spoken,done,captions};
}
test('speech serializes events, acknowledges after completion and varies speaker pitch',()=>{
 const {narrator,spoken,done}=harness();assert.equal(narrator.enable(),true);
 narrator.add({id:1,seat:0},'您，打出三万。');narrator.add({id:2,seat:1},'下家，碰三万。');
 assert.equal(spoken.length,1);spoken[0].onend();assert.equal(spoken.length,2);assert.deepEqual(done,[]);
 spoken[1].onend();assert.deepEqual(done,[1]);assert.equal(spoken.length,3);
 assert.notEqual(spoken[1].pitch,spoken[2].pitch);spoken[2].onend();assert.deepEqual(done,[1,2]);narrator.stop();
});
test('mute releases pending events and late callbacks cannot replay cancelled speech',()=>{
 const {narrator,spoken,done}=harness();narrator.enable();spoken[0].onend();narrator.add({id:1,seat:0},'三万');narrator.add({id:2,seat:1},'碰');
 narrator.stop();assert.deepEqual(done,[1,2]);spoken[1].onend();assert.equal(spoken.length,2);assert.deepEqual(done,[1,2]);
});
test('failed or unavailable synthesis degrades without hanging the turn',()=>{
 const {narrator,spoken,done}=harness();narrator.enable();spoken[0].onend();narrator.add({id:1,seat:0},'三万');narrator.add({id:2,seat:1},'碰');
 spoken[1].onerror();assert.equal(narrator.enabled,false);assert.deepEqual(done,[1,2]);
 assert.equal(new Narrator({synth:null}).enable(),false);
});
