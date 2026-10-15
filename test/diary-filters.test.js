import test from 'node:test';
import assert from 'node:assert/strict';
import {countryKey,diaryCountryOptions} from '../diary-filters.js';

test('фильтр стран объединяет русские, английские и разнородно записанные названия',()=>{
 const entries=['Italy',' Италия ','ИТАЛИЯ','France','Франция','Новая  Зеландия','New Zealand',''].map(country=>({wine:{country}}));
 const options=diaryCountryOptions(entries);
 assert.deepEqual(options.map(option=>option.label),['Италия','Новая  Зеландия','Франция']);
 assert.equal(options.length,3);
 for(const country of ['Italy',' Италия ','ИТАЛИЯ'])assert.equal(countryKey(country),options[0].value);
 for(const country of ['Новая  Зеландия','New Zealand'])assert.equal(countryKey(country),options[1].value);
});
