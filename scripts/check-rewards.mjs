import assert from 'node:assert/strict';
import {pickups,runner,advancePlayer,score,speed} from '../lib/race.ts';
for(const distance of [0,470,480,2000]){
 const rewards=pickups(47,distance);assert(rewards.length>0);
 for(const item of rewards){const p=runner('Teste',0);p.distance=item.d-.1;p.lane=item.lane;advancePlayer(p,.02,[],47);assert.equal(item.flag?p.flags:p.coins,1);const before=score(p);advancePlayer(p,.01,[],47);assert.equal(item.flag?p.flags:p.coins,1);assert(score(p)>=before);}
}
const p=runner('Teste',0);p.distance=100;p.coins=2;p.flags=1;assert.equal(score(p),2100);
assert(speed(1000)>speed(0));assert(speed(100000)<=27);
console.log('Passed: coin and flag collection, no duplicate rewards, scoring, progressive speed cap.');
