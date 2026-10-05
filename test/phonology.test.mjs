import { inflect } from '../src/js/phonology.js';

// [stem, paradigm, expected]  — attested forms from standard Kazakh grammar
const CASES = [
  // plural
  ['бала','plural','балалар'], ['үй','plural','үйлер'], ['дәрігер','plural','дәрігерлер'],
  ['ұл','plural','ұлдар'], ['қыз','plural','қыздар'], ['адам','plural','адамдар'],
  ['күн','plural','күндер'], ['кітап','plural','кітаптар'], ['мектеп','plural','мектептер'],
  ['ат','plural','аттар'], ['сөз','plural','сөздер'], ['ағаш','plural','ағаштар'],
  ['тау','plural','таулар'], ['мұғалім','plural','мұғалімдер'], ['терезе','plural','терезелер'],
  // locative
  ['үй','locative','үйде'], ['мектеп','locative','мектепте'], ['қала','locative','қалада'],
  ['кітап','locative','кітапта'], ['жұмыс','locative','жұмыста'], ['Астана','locative','астанада'],
  // dative
  ['үй','dative','үйге'], ['мектеп','dative','мектепке'], ['қала','dative','қалаға'],
  ['жұмыс','dative','жұмысқа'], ['дос','dative','досқа'], ['бала','dative','балаға'],
  // ablative
  ['үй','ablative','үйден'], ['мектеп','ablative','мектептен'], ['қала','ablative','қаладан'],
  ['адам','ablative','адамнан'], ['күн','ablative','күннен'],
  // accusative
  ['бала','accusative','баланы'], ['кітап','accusative','кітапты'], ['үй','accusative','үйді'],
  ['сөз','accusative','сөзді'],
  // genitive
  ['бала','genitive','баланың'], ['үй','genitive','үйдің'], ['кітап','genitive','кітаптың'],
  ['адам','genitive','адамның'], ['қыз','genitive','қыздың'],
  // instrumental
  ['бала','instrumental','баламен'], ['үй','instrumental','үймен'],
  ['кітап','instrumental','кітаппен'], ['дос','instrumental','доспен'], ['қалам','instrumental','қаламмен'],
  // predicate 1sg
  ['студент','pred1sg','студентпін'], ['дәрігер','pred1sg','дәрігермін'],
  ['мұғалім','pred1sg','мұғаліммін'], ['қазақ','pred1sg','қазақпын'], ['оқушы','pred1sg','оқушымын'],
  // negation
  ['оқы','negation','оқыма'], ['кел','negation','келме'], ['жаз','negation','жазба'],
  ['айт','negation','айтпа'], ['кет','negation','кетпе'], ['бар','negation','барма'],
  // possessive (lenition)
  ['кітап','poss3','кітабы'], ['қонақ','poss3','қонағы'], ['жүрек','poss3','жүрегі'],
  ['ана','poss3','анасы'], ['үй','poss1sg','үйім'], ['бала','poss1sg','балам'],
  ['кітап','poss1sg','кітабым'],
];

let pass = 0, fail = [];
for (const [stem, par, want] of CASES) {
  const got = inflect(stem, par).surface;
  if (got === want) pass++; else fail.push(`${stem} + ${par} → got "${got}", want "${want}"`);
}
console.log(`PASS ${pass}/${CASES.length}`);
if (fail.length) { console.log('\nFAILURES:'); fail.forEach(f=>console.log('  ✗ '+f)); process.exit(1); }
