// Index identifies one physical tile in the current server hand, including duplicates.
export function orderedHand(hand,wilds=[],drawn=null){
 const drawnIndex=drawn==null?-1:hand.lastIndexOf(drawn);
 const sorted=hand.map((tile,index)=>({tile,index})).filter(x=>x.index!==drawnIndex).sort((a,b)=>Number(wilds.includes(b.tile))-Number(wilds.includes(a.tile))||a.tile-b.tile||a.index-b.index);
 if(drawnIndex>=0)sorted.push({tile:drawn,index:drawnIndex,drawn:true});
 return sorted;
}
export function isSelectedTile(selected,tile,index){return selected?.index===index&&selected?.tile===tile;}

export function tapHand(selected,clicked,canDiscard){
 const repeat=isSelectedTile(selected,clicked.tile,clicked.index);
 if(repeat&&canDiscard)return {selected:null,discard:clicked.tile,blocked:false};
 return {selected:clicked,discard:null,blocked:repeat&&!canDiscard};
}
