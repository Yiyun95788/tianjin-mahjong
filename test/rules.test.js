import test from 'node:test';
import assert from 'node:assert/strict';
import {nextTile,canComplete,scoreHand,chooseDiscard} from '../src/rules.js';
const score=(hand,drawn,extra={})=>scoreHand({hand,drawn,wilds:[32,33],...extra});
test('rolling wildcards wrap within each suit and honor family',()=>{
 assert.equal(nextTile(8),0);assert.equal(nextTile(17),9);assert.equal(nextTile(26),18);assert.equal(nextTile(30),27);assert.equal(nextTile(33),31);assert.equal(nextTile(31),32);
});
test('four groups and a pair only; seven pairs and missing tiles rejected',()=>{
 assert.ok(canComplete([0,1,2,9,10,11,18,19,20,27,27,27,28,28],[32,33]));
 assert.equal(canComplete([0,0,2,2,4,4,9,9,11,11,18,18,27,27],[32,33]),false);
 assert.equal(canComplete([0,1,2],[32,33]),false);
});
test('wildcard can precede lowest natural tile in a sequence',()=>{
 assert.ok(canComplete([7,8,32,9,10,11,18,19,20,27,27,27,28,28],[32,33]));
});
test('plain hand is 2, small hand with unrelated wildcard is not legal',()=>{
 assert.equal(score([0,1,2,9,10,11,18,19,20,27,27,27,28,28],2).points,2);
 assert.equal(score([0,1,2,9,10,11,18,19,32,27,27,27,28,28],2),null);
});
test('single hang requires winning tile to belong to the wildcard pair',()=>{
 const s=score([0,1,2,9,10,11,18,19,20,27,27,27,32,28],28);
 assert.equal(s.points,2);assert.ok(s.labels.includes('混儿吊'));
});
test('double hang and five combine to 6',()=>{
 const s=score([0,1,2,9,10,11,18,18,18,27,27,32,33,4],4);
 assert.equal(s.points,6);assert.ok(s.labels.includes('双混儿吊'));assert.ok(s.labels.includes('捉伍儿'));
});
test('five needs the winning tile as the centre of 456万',()=>{
 const hand=[3,4,5,9,10,11,18,19,20,27,27,27,28,28];
 assert.equal(score(hand,4).points,6);assert.equal(score(hand,11).points,2);
 assert.equal(score([12,13,14,0,1,2,18,19,20,27,27,27,28,28],13).points,2);
});
test('dragon and five add before plain multiplies: (4+3)*2 = 14',()=>{
 assert.equal(score([0,1,2,3,4,5,6,7,8,18,18,18,27,27],4).points,14);
});
test('native dragon is 8 rather than 32; native five dragon is 14',()=>{
 const hand=[0,1,2,3,4,5,6,7,8,18,18,18,27,27];
 assert.equal(score(hand,8,{wilds:[0,1]}).points,8);
 assert.equal(score(hand,4,{wilds:[0,1]}).points,14);
});
test('double hang plus five plus dragon requires 456 outside the dragon',()=>{
 const hand=[9,10,11,12,13,14,15,16,17,32,33,4,27,27];
 assert.equal(score(hand,4).points,14);
 const impossible=[0,1,2,3,4,5,6,7,8,32,33,27,27,27];
 assert.equal(score(impossible,4).points,8); // Alternative single-hang dragon wins over five+dragon (7).
 assert.ok(!score(impossible,4).labels.includes('捉伍儿'));
});
test('kong and first-draw multipliers; exposed triplet retains legal hand size',()=>{
 assert.equal(score([0,1,2,9,10,11,18,19,20,28,28],2,{melds:[{kind:'hiddenKong',tile:27}],kongDraw:true}).points,4);
 assert.equal(score([0,1,2,9,10,11,18,19,20,27,27,27,28,28],2,{heavenly:true}).points,8);
});
test('bot never discards a wildcard and chooses a legal tile',()=>{
 const hand=[0,1,2,9,10,11,18,19,20,27,27,32,33,30];
 const t=chooseDiscard(hand,[32,33],[]);assert.ok(hand.includes(t));assert.ok(![32,33].includes(t));
});

test('casual selection sometimes takes a weaker alternative without discarding wilds',()=>{
 const hand=[0,1,2,3,5,7,9,10,13,18,20,27,28,30],wilds=[32,33];
 const best=chooseDiscard(hand,wilds,[]);
 assert.equal(chooseDiscard(hand,wilds,[],[],{casual:true,rng:()=>0.9}),best);
 const relaxed=chooseDiscard(hand,wilds,[],[],{casual:true,rng:()=>0});
 assert.notEqual(relaxed,best);assert.ok(hand.includes(relaxed));assert.ok(!wilds.includes(relaxed));
});
