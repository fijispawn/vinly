import test from 'node:test';
import assert from 'node:assert/strict';
import {makeBracket,scoreFor,nominations,diaryFor} from '../logic.js';
import {parseWineHtml,parseWineMarkdown,partialSimpleWine} from '../scraper.js';

test('пять бутылок дают предварительную пару и два полуфинала',()=>{
 const result=makeBracket(Array.from({length:5},(_,i)=>({id:String(i)})));
 assert.equal(result.matches.length,4);
 assert.equal(result.matches.filter(m=>m.round===0).length,1);
 assert.equal(result.matches.filter(m=>m.round===1).length,2);
});
test('голос отсутствующего игрока остаётся в счёте',()=>{
 const g={players:[{userId:'u',absent:true},{userId:'v',absent:false}]};
 const m={a:'a',b:'b',answers:{u:{vote:'a'},v:{vote:'b'}}};
 assert.deepEqual(scoreFor(g,m),{a:1,b:1});
});
test('номинация берёт первую оценку бутылки для каждого игрока',()=>{
 const wines=[{id:'a'},{id:'b'}];
 const ratingsA1={acidity:1,aroma:1,body:1,impression:1};
 const ratingsA2={acidity:5,aroma:5,body:5,impression:5};
 const ratingsB={acidity:3,aroma:3,body:3,impression:3};
 const g={wines,matches:[
 {a:'a',b:'b',closedAt:'2026-01-01T00:00:00Z',answers:{u:{ratings:{a:ratingsA1,b:ratingsB}}}},
 {a:'a',b:'b',closedAt:'2026-01-02T00:00:00Z',answers:{u:{ratings:{a:ratingsA2,b:ratingsB}}}}
 ]};
 assert.equal(nominations(g).impression[0].wineId,'b');
});
test('SimpleWine: поля извлекаются из текстового ответа',()=>{
 const markdown='# Вино Chardonnay, Luigi Bosca, 2025\n\nСтрана, регион:\n\n[Аргентина,](x)[Мендоса,](y)\n\nПроизводитель:\n\n[Luigi Bosca,](x)\n\n2 990 ₽\n\n[4.2 77 оценок](x)';
 const w=parseWineMarkdown(markdown,'https://simplewine.ru/catalog/product/chardonnay_2025_075_158914/');
 assert.equal(w.name,'Вино Chardonnay, Luigi Bosca, 2025');
 assert.equal(w.price,2990);
 assert.equal(w.region,'Мендоса');
 assert.equal(w.externalRatingCount,'77');
});
test('SimpleWine: у акционного вина берётся цена выбранного винтажа',()=>{
 const markdown='# Вино Paddle Creek Sauvignon Blanc, Lake Road, 2025\n\n2 290 ₽\n1 603 ₽\n\n2025 г. — 1 603 ₽в наличии';
 const w=parseWineMarkdown(markdown,'https://simplewine.ru/catalog/product/paddle_creek_sauvignon_blanc_2025_075_160429/');
 assert.equal(w.price,1603);
});
test('SimpleWine: при блокировке магазина ссылка даёт черновик без выдуманной цены',()=>{
 const w=partialSimpleWine('https://simplewine.ru/catalog/product/riesling_maximin_2025_075_161523/');
 assert.equal(w.name,'Вино Riesling Maximin');
 assert.equal(w.vintage,'2025');
 assert.equal(w.volume,'0,75 л');
 assert.equal(w.price,undefined);
 assert.equal(w._partial,true);
});
test('SimpleWine: карточка берёт актуальный винтаж и цену из страницы, даже если адрес старый',()=>{
 const markdown='# Вино Loco Cimbali Orange, 2024\n\nСтрана, регион:\n\n[Россия,](x) [Крым,](y)\n\nВиноград:\n\n[мускат,](x) [рислинг,](y)\n\nПроизводитель:\n\n[Loco Cimbali,](x)\n\n2 090 ₽\n1 463 ₽\n\n2024 г. — 1 463 ₽только в винотеке';
 const w=parseWineMarkdown(markdown,'https://simplewine.ru/catalog/product/loco_cimbali_orange_2023_075_155938/');
 assert.equal(w.vintage,'2024');
 assert.equal(w.price,1463);
 assert.equal(w.country,'Россия');
 assert.equal(w.region,'Крым');
 assert.equal(w.grape,'мускат, рислинг');
});
test('SimpleWine: страница защиты не считается винной карточкой',()=>{
 assert.throws(()=>parseWineHtml('<title>Just a moment...</title><h1>Checking your browser</h1>','https://simplewine.ru/catalog/product/loco_cimbali_orange_2023_075_155938/'),/не дал прочитать/);
});
test('одинаковое надёжно распознанное вино объединяется между играми',()=>{
 const wine={id:'w',number:1,name:'Chardonnay',producer:'Luigi Bosca',vintage:'2025',sourceUrl:'https://example.com/product/1',price:2000};
 const answer={ratings:{w:{acidity:3,aroma:4,body:2,impression:5}},vote:'w'};
 const game=i=>({id:'g'+i,phase:'revealed',title:'Игра '+i,wines:[wine,{id:'x',number:2,name:'Другое'}],matches:[{a:'w',b:'x',closedAt:'2026-01-0'+i+'T00:00:00Z',round:0,answers:{u:answer},winner:'w'}],championId:'w'});
 const entries=diaryFor({games:[game(1),game(2)],diaryNotes:{}},'u');
 const grouped=entries.find(e=>e.wine.name==='Chardonnay');
 assert.equal(grouped.tastings.length,2);
 assert.equal(grouped.history.length,2);
});
