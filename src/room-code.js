import {randomInt} from 'node:crypto';
import {WORDS} from './words.js';

// Room codes are three BIP39 English words joined by hyphens, for example
// "abandon-ability-able" (not a real room). Three independent draws from
// 2048 words give 2048^3 = 8,589,934,592 combinations, exactly 33 bits of
// entropy. Repeats are allowed so every combination is equally likely.
// Draws use node:crypto, never Math.random. There is no numeric code
// format: six-digit codes are not generated, accepted, or restored.
export function newRoomCode(pick=(n)=>randomInt(n)) {
  return [0,1,2].map(()=>WORDS[pick(WORDS.length)]).join('-');
}

// Accept what a person plausibly types or pastes: upper case, spaces, or
// underscores as separators, and surrounding whitespace. Server lookups
// use the normalized form, so "Apple Brave Cat" finds "apple-brave-cat".
export function normalizeRoomCode(code) {
  return String(code).trim().toLowerCase().replace(/[\s_]+/g,'-').replace(/-+/g,'-').replace(/^-|-$/g,'');
}

// Format check only: the server still returns "not found" for a
// well-formed code that names no room. Anything outside the three-word
// format, including a six-digit code, fails this check.
export function isRoomCode(code) {
  return /^[a-z]+(?:-[a-z]+){2}$/.test(code);
}
