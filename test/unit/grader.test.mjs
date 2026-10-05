import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { fold, grade, missingLetters, normalize } from '../../src/js/grader.js';

describe('normalize', () => {
  it('lowercases, trims and collapses whitespace', () => {
    assert.equal(normalize('  Үй   Ге '), 'үй ге');
  });

  it('unifies apostrophe variants', () => {
    assert.equal(normalize('ол’ар'), "ол'ар");
  });

  it('treats null and undefined as empty', () => {
    assert.equal(normalize(null), '');
    assert.equal(normalize(undefined), '');
  });
});

describe('fold', () => {
  it('maps every Kazakh-only letter to its Russian keyboard neighbour', () => {
    assert.equal(fold('әғқңөұүһі'), 'агкноуухи');
  });

  it('leaves shared Cyrillic untouched', () => {
    assert.equal(fold('кітап'), 'китап');
  });
});

describe('grade', () => {
  it('accepts an exact answer', () => {
    const r = grade('үйге', 'үйге');
    assert.equal(r.verdict, 'correct');
    assert.equal(r.accepted, true);
  });

  it('accepts any of several valid answers', () => {
    assert.equal(grade('кітапқа', ['кітапқа', 'кітапка']).verdict, 'correct');
  });

  it('accepts a Russian-keyboard spelling but flags the missing letters', () => {
    // The learner typed the right word without the Kazakh-only characters.
    const r = grade('уйге', 'үйге');
    assert.equal(r.verdict, 'diacritic');
    assert.equal(r.accepted, true);
    assert.deepEqual(r.missing, ['ү']);
  });

  it('calls a one-character slip on a long word a typo, not an error', () => {
    const r = grade('кітпқа', 'кітапқа');
    assert.equal(r.verdict, 'typo');
    assert.equal(r.distance, 1);
    assert.equal(r.accepted, false);
  });

  it('does not forgive a one-character slip on a short word', () => {
    // "үй" has three folded characters, below the 4-letter typo floor.
    assert.equal(grade('үйг', 'үй').verdict, 'wrong');
  });

  it('rejects a different word', () => {
    const r = grade('мектеп', 'кітапқа');
    assert.equal(r.verdict, 'wrong');
    assert.equal(r.accepted, false);
  });

  it('treats an empty answer as wrong rather than crashing', () => {
    const r = grade('   ', 'үйге');
    assert.equal(r.verdict, 'wrong');
    assert.equal(r.distance, Infinity);
  });

  it('reports the canonical form of whichever answer matched', () => {
    assert.equal(grade('китап', 'кітап').canonical, 'кітап');
  });
});

describe('missingLetters', () => {
  it('lists only Kazakh-specific letters the learner left out', () => {
    assert.deepEqual(missingLetters('коше', 'көше'), ['ө']);
  });

  it('returns nothing when the answer is already correct', () => {
    assert.deepEqual(missingLetters('көше', 'көше'), []);
  });
});
