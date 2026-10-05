import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { RATING, isDue, isLearned, keyOf, newState, ratingFor, review, strength }
  from '../../src/js/srs.js';

const T0 = 1_700_000_000_000;
const MIN = 60_000;
const DAY = 86_400_000;

describe('newState', () => {
  it('starts unseen, so it is due immediately', () => {
    const s = newState('k');
    assert.equal(s.reps, 0);
    assert.equal(s.interval, 0);
    assert.equal(isDue(s, T0), true);
  });
});

describe('the learning ladder', () => {
  it('puts a first correct answer on the second ladder step', () => {
    const s = review(newState('k'), RATING.GOOD, T0);
    assert.equal(s.due, T0 + 10 * MIN);
    assert.equal(s.interval, 0, 'still learning');
  });

  it('graduates to one day on the second correct answer', () => {
    const s = review(review(newState('k'), RATING.GOOD, T0), RATING.GOOD, T0);
    assert.equal(s.interval, 1);
    assert.equal(s.due, T0 + DAY);
    assert.equal(s.step, 0, 'ladder reset for the next lapse');
  });

  it('sends a lapse back to the one-minute step', () => {
    const s = review(newState('k'), RATING.AGAIN, T0);
    assert.equal(s.due, T0 + 1 * MIN);
  });

  it('holds position on HARD instead of advancing', () => {
    const once = review(newState('k'), RATING.GOOD, T0);
    const held = review(once, RATING.HARD, T0);
    assert.equal(held.step, once.step);
  });

  it('lets EASY skip the ladder entirely', () => {
    const s = review(newState('k'), RATING.EASY, T0);
    assert.equal(s.interval, 2);
  });
});

describe('after graduation', () => {
  // Two correct answers clear the learning ladder and set interval to one day.
  const graduated = () => review(review(newState('k'), RATING.GOOD, T0), RATING.GOOD, T0);

  it('multiplies the interval by ease on GOOD', () => {
    const s = review(graduated(), RATING.GOOD, T0);
    assert.equal(s.interval, Math.round(1 * 2.5));
  });

  it('lowers ease and grows slowly on HARD', () => {
    const before = graduated();
    const s = review(before, RATING.HARD, T0);
    assert.ok(s.ease < before.ease);
  });

  it('raises ease on EASY', () => {
    const s = review(graduated(), RATING.EASY, T0);
    assert.ok(s.ease > 2.5);
  });

  it('sends a lapse back to the start and counts it', () => {
    const s = review(graduated(), RATING.AGAIN, T0);
    assert.equal(s.interval, 0);
    assert.equal(s.lapses, 1);
    assert.equal(s.streak, 0);
    assert.equal(s.due, T0 + 1 * MIN);
  });

  it('never drops ease below the SM-2 floor', () => {
    let s = graduated();
    for (let i = 0; i < 40; i++) s = review(s, RATING.AGAIN, T0);
    assert.ok(s.ease >= 1.3);
  });
});

describe('strength', () => {
  it('is zero before the first review', () => {
    assert.equal(strength(newState('k')), 0);
  });

  it('stays low while the card is still in learning', () => {
    assert.ok(strength(review(newState('k'), RATING.GOOD, T0)) <= 0.25);
  });

  it('counts a long interval as learned', () => {
    assert.equal(isLearned({ reps: 5, interval: 21, streak: 5 }), true);
  });

  it('never exceeds one', () => {
    assert.ok(strength({ reps: 9, interval: 10_000, streak: 9 }) <= 1);
  });
});

describe('ratingFor', () => {
  it('maps a diacritic-only miss to HARD, not AGAIN', () => {
    assert.equal(ratingFor('diacritic'), RATING.HARD);
  });

  it('maps a typo to HARD', () => {
    assert.equal(ratingFor('typo'), RATING.HARD);
  });

  it('maps a wrong answer to AGAIN', () => {
    assert.equal(ratingFor('wrong'), RATING.AGAIN);
  });

  it('downgrades a correct answer that needed a hint', () => {
    assert.equal(ratingFor('correct', { hintUsed: true }), RATING.HARD);
  });

  it('rewards a fast correct answer', () => {
    assert.equal(ratingFor('correct', { fastMs: 900 }), RATING.EASY);
  });

  it('gives a plain correct answer GOOD', () => {
    assert.equal(ratingFor('correct'), RATING.GOOD);
  });
});

describe('keyOf', () => {
  it('scopes a memory to one lexeme and one skill', () => {
    assert.equal(keyOf('kitap', 'plural'), 'kitap::plural');
    assert.notEqual(keyOf('kitap', 'plural'), keyOf('kitap', 'dative'));
  });
});
