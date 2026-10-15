import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {geoArea} from 'd3-geo';
import {mapCountryName,regionMapBounds,renderRegionMapSvg,worldFeatures} from '../world-map.js';
import {locateWineRegion} from '../wine-regions.js';
import topology from '../public/world-countries-50m.json' with {type:'json'};
const italy=JSON.parse(readFileSync(new URL('../public/italy-regions.geojson',import.meta.url)));
const admin=JSON.parse(readFileSync(new URL('../public/admin-regions.geojson',import.meta.url)));

test('названия стран из карточек совпадают с областями карты',()=>{
 const names=new Set(worldFeatures(topology).map(country=>country.properties.name));
 for(const country of ['Россия','Франция','Италия','Испания','Аргентина','Чили','ЮАР','Новая Зеландия','США','Словения','Ливан']){
  assert.ok(names.has(mapCountryName(country)),country);
 }
});

test('итальянские вина привязаны к своим регионам и номерам',()=>{
 const wines=[['Тоскана','Toscana'],['Пьемонт','Piemonte'],['Венето','Veneto'],['Сицилия','Sicilia']];
 for(const [region,area] of wines){
  const located=locateWineRegion({country:'Италия',region},italy.features);
  assert.equal(located?.area,area);
  assert.ok(located?.coordinates.every(Number.isFinite));
  assert.ok(located.coordinates[0]>6&&located.coordinates[0]<19);
  assert.ok(located.coordinates[1]>35&&located.coordinates[1]<48);
 }
 assert.ok(italy.features.every(shape=>geoArea(shape)<.01),'контур региона не должен заливать обратную сторону Земли');
});

test('Риоха и российские регионы получают контуры вместо условных кругов',()=>{
 assert.ok(admin.features.every(shape=>geoArea(shape)<.01),'контуры не должны заливать обратную сторону Земли');
 for(const [country,region,area] of [['Испания','Риоха','La Rioja'],['Россия','Кубань','Krasnodar Krai'],['Россия','Дагестан','Dagestan']]){
  const areas=admin.features.filter(shape=>shape.properties.country===mapCountryName(country));
  const located=locateWineRegion({country,region},areas);
  assert.equal(located?.area,area);
  assert.equal(located?.exactArea,true);
  const svg=renderRegionMapSvg(topology,country,[{wine:{number:1,region},...located}],areas);
  assert.match(svg,/fill="#9e342e"/);
  assert.doesNotMatch(svg,/<circle/);
 }
 const barossa=locateWineRegion({country:'Австралия',region:'Баросса'},[]);
 assert.equal(barossa?.exactArea,false);
 assert.doesNotMatch(renderRegionMapSvg(topology,'Австралия',[{wine:{number:1,region:'Баросса'},...barossa}],[]),/<circle/);
});

test('масштаб карты следует за расположением регионов',()=>{
 const nearby=regionMapBounds([{coordinates:[7.9,44.6]},{coordinates:[11.3,43.4]}]);
 const distant=regionMapBounds([{coordinates:[7.9,44.6]},{coordinates:[15,37.7]}]);
 assert.ok(nearby[1][0]-nearby[0][0]<distant[1][0]-distant[0][0]);
 assert.ok(nearby[1][1]-nearby[0][1]<distant[1][1]-distant[0][1]);
});

test('карта выводится в SVG с векторными контурами и номерами бутылок',()=>{
 const markers=['Тоскана','Пьемонт','Венето','Сицилия'].map((region,index)=>({
  wine:{number:index+1,region},...locateWineRegion({country:'Италия',region},italy.features)
 }));
 const svg=renderRegionMapSvg(topology,'Италия',markers,italy.features);
 const focused=renderRegionMapSvg(topology,'Италия',markers,italy.features,1,markers[0]);
 assert.notEqual(focused,svg,'выбор плашки должен перемещать и приближать карту');
 assert.match(svg,/^<svg /);
 assert.match(svg,/viewBox="0 0 1100 680"/);
 assert.match(svg,/<path d="M/);
 assert.match(svg,/M0 0C-3-5-12-14-12-22/);
 assert.doesNotMatch(svg,/<circle/);
 for(const number of [1,2,3,4])assert.match(svg,new RegExp(`>${number}<\\/text>`));
 assert.doesNotMatch(svg,/data:image\/png/);
 const escaped=renderRegionMapSvg(topology,'Италия',[{wine:{number:1,region:'A<&B'},coordinates:[11,43]}]);
 assert.match(escaped,/A&lt;&amp;B/);
 assert.doesNotMatch(escaped,/A<&B/);
});
