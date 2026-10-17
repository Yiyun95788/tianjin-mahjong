import test from 'node:test';
import assert from 'node:assert/strict';
import {orderedHand,isSelectedTile,tapHand} from '../public/hand.js';
test('wilds sort first by tile value, then the rest, without mutating the hand',()=>{
 const hand=[0,1,1,7,9,18,32,0],before=[...hand];
 assert.deepEqual(orderedHand(hand,[1,0]).map(x=>x.tile),[0,0,1,1,7,9,18,32]);
 assert.deepEqual(hand,before);
 assert.deepEqual(orderedHand([8,0,8,1],[8,0]).map(x=>x.tile),[0,8,8,1]);
});
test('selecting one duplicate only selects its original index after sorting',()=>{
 const tiles=orderedHand([0,1,1,7,9],[9]);
 for(const index of [1,2]){
  const selected={tile:1,index};
  assert.equal(tiles.filter(x=>isSelectedTile(selected,x.tile,x.index)).length,1);
  assert.equal(isSelectedTile(selected,7,index),false);
 }
});

test('tap selects, another duplicate switches selection, repeating it discards only when legal',()=>{
 const a={tile:9,index:0},b={tile:9,index:1};
 const first=tapHand(null,a,true);assert.deepEqual(first.selected,a);assert.equal(first.discard,null);
 const switched=tapHand(first.selected,b,true);assert.deepEqual(switched.selected,b);assert.equal(switched.discard,null);
 assert.deepEqual(tapHand(switched.selected,b,true),{selected:null,discard:9,blocked:false});
 assert.deepEqual(tapHand(b,b,false),{selected:b,discard:null,blocked:true});
});

test('only one copy of the current draw sits last, including a wildcard draw',()=>{
 const hand=[0,0,1,7,9,9,18];
 const result=orderedHand(hand,[0,1],0);
 assert.deepEqual(result.map(x=>x.tile),[0,1,7,9,9,18,0]);
 assert.deepEqual(result.at(-1),{tile:0,index:1,drawn:true});
 assert.equal(new Set(result.map(x=>x.index)).size,hand.length);
 assert.equal(result.filter(x=>x.drawn).length,1);
 assert.equal(result.filter(x=>isSelectedTile({tile:0,index:1},x.tile,x.index)).length,1);
});
test('retained draw sorts back into hand after discard; next draw separates again',()=>{
 const afterDiscard=[0,1,7,9,9,18];
 const sorted=orderedHand(afterDiscard,[0,1]);
 assert.deepEqual(sorted.map(x=>x.tile),afterDiscard);
 assert.equal(sorted.some(x=>x.drawn),false);
 const next=orderedHand([...afterDiscard,3],[0,1],3);
 assert.equal(next.at(-1).tile,3);assert.equal(next.at(-1).drawn,true);
 assert.equal(orderedHand(afterDiscard,[0,1],33).some(x=>x.drawn),false);
});
