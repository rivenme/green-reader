import test from 'node:test';
import assert from 'node:assert/strict';
import {holeScore,nextStreak,streakMultiplier,newlyEarned,rankFor} from '../src/scoring.js';
test('scoring rewards good putts and caps streak multiplier',()=>{
  const base={distFt:20,diff:.5,stimp:10,par:2,streak:1};
  assert.ok(holeScore({...base,strokes:1}).points>holeScore({...base,strokes:2}).points);
  assert.equal(nextStreak(4,3,2),0);assert.equal(nextStreak(4,2,2),5);assert.equal(streakMultiplier(100),3);
});
test('achievements award only once and ranks use earned XP',()=>{
  const ctx={tier:'onePutt',bomb:true,streak:1,onePuttStreak:1,level:1,cleared50:false,runScore:1000,xp:1000};
  const ids=newlyEarned(ctx,[]);assert.ok(ids.includes('bomb'));assert.deepEqual(newlyEarned(ctx,ids),[]);assert.equal(rankFor(5000).name,'Bogey Golfer');
});
