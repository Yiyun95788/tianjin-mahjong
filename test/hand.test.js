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
