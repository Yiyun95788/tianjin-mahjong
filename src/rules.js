// Tiles: 万 0..8, 筒 9..17, 条 18..26, 东南西北 27..30, 中发白 31..33.
export const tileName = t => t < 27 ? `${t % 9 + 1}${['万','筒','条'][Math.floor(t / 9)]}` : ['东','南','西','北','中','发','白'][t - 27];
export const nextTile = t => t < 27 ? Math.floor(t / 9) * 9 + (t + 1) % 9 : t < 31 ? 27 + (t - 26) % 4 : 31 + (t - 30) % 3;
export const countsOf = hand => { const c = Array(34).fill(0); for (const t of hand) c[t]++; return c; };

// Exhaustive feasibility with memoization. Always consume the lowest natural
// tile, considering sequences starting up to two positions before it.
function complete(c, w, groups, pair, memo = new Map()) {
  if (groups < 0 || w < 0 || c.reduce((a,b) => a+b, 0) + w !== groups * 3 + (pair ? 2 : 0)) return false;
  const key = `${c.join(',')}/${w}/${groups}/${pair}`;
  if (memo.has(key)) return memo.get(key);
  const t = c.findIndex(n => n);
  if (t < 0) return true;
  const take = (tiles, g, p) => {
    const d = [...c]; let wild = w;
    for (const x of tiles) { if (d[x]) d[x]--; else wild--; }
    return wild >= 0 && complete(d, wild, g, p, memo);
  };
  let ok = false;
  if (pair) ok = take([t,t], groups, false);
  if (!ok && groups) {
    ok = take([t,t,t], groups - 1, pair);
    if (!ok && t < 27) for (let start = Math.max(Math.floor(t/9)*9, t-2); start <= Math.min(t,Math.floor(t/9)*9+6); start++) {
      if (take([start,start+1,start+2], groups-1, pair)) { ok = true; break; }
    }
  }
  memo.set(key, ok); return ok;
}

// Consume a specified pattern, exploring both natural and wildcard choices.
// Retaining a natural tile can matter for the remainder of the hand.
function consume(c, w, pattern, done, i = 0) {
  if (i === pattern.length) return done(c, w);
  const t = pattern[i];
  if (c[t]) { const d = [...c]; d[t]--; if (consume(d,w,pattern,done,i+1)) return true; }
  return w > 0 && consume(c,w-1,pattern,done,i+1);
}

function state(hand, wilds) {
  const c = countsOf(hand); let w = 0;
  for (const t of wilds) { w += c[t]; c[t] = 0; }
  return {c,w};
}

// A dragon uses three actual sequence groups, including exposed groups.
function dragonComplete(c,w,melds,suit,extraGroups = 0,pair = true) {
  if (suit < 0) return complete(c,w,4-melds.length-extraGroups,pair);
  const required = [0,3,6].map(n => [suit*9+n,suit*9+n+1,suit*9+n+2]);
  // All exposed melds in this variant are triplets/kongs, so a dragon must
  // be concealed and leaves at most one other group.
  if (melds.length + extraGroups > 1) return false;
  return consume(c,w,required.flat(),(d,v) => complete(d,v,1-melds.length-extraGroups,pair));
}

export function canComplete(hand, wilds, melds = []) {
  const {c,w} = state(hand,wilds); return complete(c,w,4-melds.length,true);
}

export function scoreHand({hand, wilds, melds = [], drawn, kongDraw = false, heavenly = false, earthly = false}) {
  if (!canComplete(hand,wilds,melds)) return null;
  const {c,w} = state(hand,wilds);
  const before = [...hand]; const at = before.indexOf(drawn);
  if (at < 0) return null;
  before.splice(at,1);
  const b = state(before,wilds);
  const isWildDraw = wilds.includes(drawn);
  const plain = w === 0 && !melds.some(m => wilds.includes(m.tile));
  const dragons = [-1,0,1,2].filter(s => dragonComplete(c,w,melds,s));
  let best = null;
  for (const suit of dragons) {
    const dragon = suit >= 0;
    const native = dragon && wilds.some(t => t < 27 && Math.floor(t/9) === suit);
    const single = b.w >= 1 && dragonComplete(b.c,b.w-1,melds,suit,0,false);
    const double = b.w >= 2 && dragonComplete(b.c,b.w-2,melds,suit,1,true);
    // Winning tile must be the centre of 456万, not merely present elsewhere.
    let five = false;
    if (drawn === 4 || isWildDraw) {
      five = consume(b.c,b.w,[3,5],(d,v) => {
        if (!dragon) return complete(d,v,3-melds.length,true);
        if (suit !== 0) return dragonComplete(d,v,melds,suit,1,true);
        // The 456 can be part of the 万 dragon.
        return consume(d,v,[0,1,2,6,7,8],(e,u) => complete(e,u,1-melds.length,true));
      });
    }
    for (const useFive of [false,true]) for (const useHang of [false,true]) {
      if (useFive && !five || useHang && !(single || double)) continue;
      // Both patterns require a double hang. With a dragon its three groups
      // must remain intact after removing the two hanging wildcards.
      if (useFive && useHang && !double) continue;
      const labels = [];
      let points = dragon ? 4 : 0;
      if (dragon) labels.push('龙');
      if (useFive) { points += 3; labels.push('捉伍儿'); }
      points ||= 1;
      if (native) { points *= 2; labels.push('本混儿'); }
      if (useHang) { points *= 2; labels.push(double ? '双混儿吊' : '混儿吊'); }
      if (plain) { points *= 2; labels.push('素胡'); }
      if (kongDraw) { points *= 2; labels.push('杠开'); }
      if (heavenly || earthly) { points *= 4; labels.push(heavenly ? '天和' : '地和'); }
      if (points >= 2 && (!best || points > best.points)) best = {points,labels};
    }
  }
  return best;
}

// Bot receives only its own hand plus public discards/melds. It optimizes
// immediate legal winning outs, then local shape and progress toward a dragon.
export function chooseDiscard(hand,wilds,melds,visible = []) {
  const c = countsOf(hand), seen = countsOf([...hand,...visible]);
  const choices = [...new Set(hand)].filter(t => !wilds.includes(t));
  let best = choices[0], value = -Infinity;
  for (const t of choices) {
    const rest = [...hand]; rest.splice(rest.indexOf(t),1);
    let outs = 0;
    for (let x=0;x<34;x++) if (seen[x]<4 && canComplete([...rest,x],wilds,melds)) {
      const win = scoreHand({hand:[...rest,x],wilds,melds,drawn:x});
      if (win) outs += (4-seen[x]) * (20 + Math.log2(win.points)*3);
    }
    const n = countsOf(rest); let shape = 0;
    for (let x=0;x<34;x++) {
      if (wilds.includes(x)) continue;
      if (n[x]>=2) shape += 5;
      if (n[x]>=3) shape += 7;
      if (x<27 && n[x]) {
        if (x%9<8 && n[x+1]) shape += 3;
        if (x%9<7 && n[x+2]) shape += 1.5;
      }
    }
    const distinct = [0,1,2].map(s => n.slice(s*9,s*9+9).filter(Boolean).length);
    shape += Math.max(...distinct) * 0.6;
    const score = outs + shape + (seen[t]>=3 ? 0.3 : 0) - (c[t]>=3 ? 0.2 : 0);
    if (score>value) {value=score;best=t;}
  }
  return best;
}
