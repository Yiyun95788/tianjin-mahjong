import test from 'node:test';
import assert from 'node:assert/strict';
import {newGame,begin,act,view,actionsFor,botAction} from '../src/game.js';
const setup=()=>{const g=newGame();begin(g);return g;};
function conserved(g){const all=[...g.wall,...g.supplement,g.indicator,...g.players.flatMap(p=>[...p.hand,...p.river,...p.melds.flatMap(m=>Array(m.kind==='pong'?3:4).fill(m.tile))])];assert.equal(all.length,136);for(let t=0;t<34;t++)assert.equal(all.filter(x=>x===t).length,4);assert.equal(g.players.reduce((s,p)=>s+p.score,0),0);}
test('deal conserves all tiles and hides opponents and wall',()=>{const g=setup();conserved(g);const v=view(g,0);assert.equal(v.wall,undefined);assert.equal(v.supplement,undefined);assert.equal(v.players[1].hand,undefined);assert.equal(g.players[g.dealer].hand.length,14);assert.equal(g.players[(g.dealer+1)%4].hand.length,13);});
test('reject invalid turns, wild discards, and starting an active game',()=>{const g=setup();assert.throws(()=>begin(g));assert.throws(()=>act(g,(g.turn+1)%4,{type:'discard',tile:0}));assert.throws(()=>act(g,g.turn,{type:'discard',tile:g.wilds[0]}));conserved(g);});
test('no discard may trigger a win claim',()=>{const g=setup();g.pending={from:0,tile:3,eligible:[1],answers:{}};g.players[1].hand=[3,3,3];assert.deepEqual(actionsFor(g,1).map(a=>a.type),['pass','pong','kong']);});
test('simulated complete games keep counts and zero-sum scores',()=>{
 for(let k=0;k<12;k++){
  const g=setup();let n=0;conserved(g);
  while(g.phase==='playing' && n++<500){let moved=false;for(let s=0;s<4;s++){const a=botAction(g,s);if(a){act(g,s,a);conserved(g);moved=true;break;}}assert.ok(moved,'game must not deadlock');}
  assert.equal(g.phase,'ended');assert.ok(n<500);begin(g);assert.ok(['playing','bets'].includes(g.phase));conserved(g);
 }
});
test('host and guest betting choices gate dealing',()=>{const g=newGame();g.players.forEach(p=>p.human=true);begin(g);assert.equal(g.phase,'bets');act(g,g.dealer,{type:'bet',value:1});for(let s=0;s<4;s++)if(s!==g.dealer)act(g,s,{type:'bet',value:1});assert.equal(g.phase,'playing');assert.deepEqual(g.bets,[1,1,1,1]);});
test('hidden kong pays all three and uses replacement wall; added kong costs one',()=>{
 const g=setup();g.turn=0;g.drawn=27;g.wilds=[32,33];g.bets=[0,0,0,0];g.players.forEach(p=>p.score=0);
 g.players[0].hand=[0,1,2,9,10,11,18,19,20,28,27,27,27,27];
 const reserve=g.supplement.length;
 act(g,0,{type:'kong',tile:27});assert.deepEqual(g.players.map(p=>p.score),[6,-2,-2,-2]);assert.equal(g.supplement.length,reserve-1);assert.equal(g.kongDraw,true);assert.equal(g.players[0].melds[0].kind,'hiddenKong');
 g.players[0].melds=[{kind:'pong',tile:29}];g.players[0].hand=[0,1,2,9,10,11,18,19,20,28,29];g.drawn=29;
 act(g,0,{type:'kong',tile:29});assert.deepEqual(g.players.map(p=>p.score),[9,-3,-3,-3]);assert.equal(g.players[0].melds[0].kind,'addedKong');
});
test('win settlement applies dealer and pull multipliers per opponent',()=>{
 const g=setup();g.turn=0;g.dealer=0;g.bets=[1,1,0,0];g.drawn=2;g.wilds=[32,33];g.discardCount=4;g.claimed=false;g.players[0].drawCount=2;
 g.players[0].hand=[0,1,2,9,10,11,18,19,20,27,27,27,28,28];g.players.forEach(p=>p.score=0);
 act(g,0,{type:'win'});assert.equal(g.result.points,2);assert.deepEqual(g.result.delta,[16,-8,-4,-4]);assert.equal(g.nextDealer,0);
});
test('draw retains kong points and changes dealer when only others have a kong',()=>{
 const g=setup();g.wall=[];g.turn=0;g.dealer=0;g.wilds=[32,33];g.drawn=30;
 g.players.forEach(p=>{p.hand=[0,1,2];p.melds=[];});g.players[0].hand.push(30);g.players[1].melds=[{kind:'hiddenKong',tile:28}];g.players[1].score=6;g.players[0].score=g.players[2].score=g.players[3].score=-2;
 act(g,0,{type:'discard',tile:30});assert.equal(g.phase,'ended');assert.equal(g.nextDealer,1);assert.deepEqual(g.players.map(p=>p.score),[-2,6,-2,-2]);
});

test('bot decisions do not depend on opponents concealed hands or wall order',()=>{
 for(let k=0;k<20;k++){
  const g=setup(),seat=g.turn;
  const expected=botAction(g,seat),changed=structuredClone(g);
  changed.wall.reverse();changed.supplement.reverse();
  changed.players.forEach((p,i)=>{if(i!==seat)p.hand=Array(13).fill((k+i)%34);});
  assert.deepEqual(botAction(changed,seat),expected);
 }
});
