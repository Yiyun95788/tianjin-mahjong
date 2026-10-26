import test from 'node:test';
import assert from 'node:assert/strict';
import {WORDS} from '../src/words.js';
import {newRoomCode,normalizeRoomCode,isRoomCode} from '../src/room-code.js';

test('wordlist is the 2048-word BIP39 English list',()=>{
 assert.equal(WORDS.length,2048);
 assert.equal(new Set(WORDS).size,2048);
 assert.ok(WORDS.every(w=>/^[a-z]+$/.test(w)));
 assert.equal(WORDS[0],'abandon');
 assert.equal(WORDS[2047],'zoo');
});

test('new room codes are three words with 33 bits of entropy',()=>{
 const words=new Set(WORDS);
 let i=0;assert.equal(newRoomCode(()=>i++%3),'abandon-ability-able');
 const code=newRoomCode();const parts=code.split('-');
 assert.equal(parts.length,3);
 assert.ok(parts.every(w=>words.has(w)));
 assert.equal(2048**3,8589934592);
});

test('normalization accepts spaces, underscores, and upper case',()=>{
 assert.equal(normalizeRoomCode(' Apple_Brave Cat '),'apple-brave-cat');
 assert.equal(normalizeRoomCode('--apple--brave--cat--'),'apple-brave-cat');
});

test('format check accepts word codes only',()=>{
 assert.equal(isRoomCode('apple-brave-cat'),true);
 assert.equal(isRoomCode('12345'),false);
 assert.equal(isRoomCode('apple-brave'),false);
 assert.equal(isRoomCode('apple-brave-cat-dog'),false);
});
