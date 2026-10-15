import {mapCountryName,normalizeCountry} from './world-map.js';

export const countryKey=value=>normalizeCountry(mapCountryName(value));

export function diaryCountryOptions(entries){
 const countries=new Map();
 for(const entry of entries){
  const label=String(entry.wine.country||'').trim(),value=countryKey(label);
  if(!value)continue;
  const current=countries.get(value);
  if(!current||(!/[А-ЯЁ]/i.test(current.label)&&/[А-ЯЁ]/i.test(label)))countries.set(value,{value,label});
 }
 return [...countries.values()].sort((a,b)=>a.label.localeCompare(b.label,'ru'));
}
