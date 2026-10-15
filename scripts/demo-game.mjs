// Run inside the Compose container: docker compose exec -T wine-app node --input-type=module < scripts/demo-game.mjs
const base='http://127.0.0.1:3000/api';
const passwords={host:process.env.DEMO_HOST_PASSWORD,anna:process.env.DEMO_ANNA_PASSWORD,max:process.env.DEMO_MAX_PASSWORD,catalog:process.env.DEMO_CATALOG_PASSWORD};
if(Object.values(passwords).some(password=>!password))throw Error('Задайте пароли DEMO_HOST_PASSWORD, DEMO_ANNA_PASSWORD, DEMO_MAX_PASSWORD и DEMO_CATALOG_PASSWORD');
const accounts={
  host:{login:'demo-host@mail.ru',password:passwords.host},
  anna:{login:'demo-anna@mail.ru',password:passwords.anna},
  max:{login:'demo-max@mail.ru',password:passwords.max},
  catalog:{login:'test@mail.ru',password:passwords.catalog}
};
const cookies={};
async function request(who,path,method='GET',data){
  const response=await fetch(base+path,{method,headers:{...(cookies[who]?{cookie:cookies[who]}:{}),...(data===undefined?{}:{'content-type':'application/json'})},body:data===undefined?undefined:JSON.stringify(data)});
  const value=await response.json();
  if(!response.ok)throw Error(`${who} ${method} ${path}: ${response.status} ${value.error||''}`);
  const cookie=response.headers.get('set-cookie');
  if(cookie)cookies[who]=cookie.split(';')[0];
  return value;
}
for(const [who,credentials] of Object.entries(accounts))await request(who,'/auth/login','POST',credentials);
const catalog=(await request('catalog','/diary')).entries;
const wines=[
  ...catalog.filter(e=>/simplewine\.ru/.test(e.wine.sourceUrl||'')).slice(0,2).map(e=>e.wine),
  {name:'Учебное вино · Рислинг',producer:'Демо коллекция',country:'Германия',region:'Мозель',grape:'рислинг',style:'белое',sugar:'сухое',vintage:'2024',description:'Учебная карточка для проверки хода турнира.'},
  {name:'Учебное вино · Пино Гриджио',producer:'Демо коллекция',country:'Италия',region:'Венето',grape:'пино гриджио',style:'белое',sugar:'сухое',vintage:'2024',description:'Учебная карточка для проверки хода турнира.'}
];
if(wines.length!==4)throw Error('В каталоге тестового аккаунта должны быть два вина SimpleWine');
const titles={finished:'Демо · полный турнир',interactive:'Демо · попробуйте сами'};
const existing=(await request('host','/games')).games;
async function create(title){
  const found=existing.find(g=>g.title===title);
  if(found)return found.code;
  let g=(await request('host','/games','POST',{title,theme:'Белые вина вслепую',description:'Учебная игра: два вина SimpleWine и два образца для проверки игрового процесса.'})).game;
  for(const wine of wines)g=(await request('host',`/games/${g.code}/wines`,'POST',wine)).game;
  for(const who of ['anna','max'])await request(who,`/games/${g.code}/join`,'POST',{});
  g=(await request('host',`/games/${g.code}/confirm-numbers`,'POST',{})).game;
  g=(await request('host',`/games/${g.code}/start`,'POST',{})).game;
  if(g.phase!=='playing'||g.players.length!==2||g.wines.length!==4)throw Error(`Не удалось начать игру ${g.code}`);
  return g.code;
}
const finished=await create(titles.finished);
let game=(await request('host',`/games/${finished}`)).game;
let round=0;
while(game.phase==='playing'){
  if(round++>4)throw Error('Слишком много пар для четырёх вин');
  const match=game.matches.find(m=>m.id===game.currentMatchId);
  if(match.status==='pending')game=(await request('host',`/games/${finished}/open`,'POST',{})).game;
  const current=game.matches.find(m=>m.id===game.currentMatchId);
  if(current.status==='open'){
    const [a,b]=[current.a,current.b].map(number=>game.wines.find(w=>w.number===number).id);
    const ratings={
      [a]:{acidity:3,aroma:4,body:3,impression:4},
      [b]:{acidity:4,aroma:3,body:2,impression:3}
    };
    await request('anna',`/games/${finished}/answer`,'POST',{vote:a,ratings,words:{[a]:'фрукты', [b]:'цитрус'},notes:{[a]:'Мягкий аромат', [b]:'Свежая кислотность'}});
    await request('max',`/games/${finished}/answer`,'POST',{vote:round===1?b:a,ratings,words:{[a]:'яблоко', [b]:'лайм'},notes:{[a]:'Сбалансированное', [b]:'Лёгкое'}});
    game=(await request('host',`/games/${finished}/close`,'POST',{})).game;
  }
  if(game.matches.find(m=>m.id===game.currentMatchId).status==='tie'){
    const winner=game.wines.find(w=>w.number===current.a).id;
    for(const who of ['anna','max'])await request(who,`/games/${finished}/answer`,'POST',{vote:winner});
    game=(await request('host',`/games/${finished}/close`,'POST',{})).game;
  }
  if(game.matches.find(m=>m.id===game.currentMatchId).status!=='result')throw Error('Пара не завершена');
  game=(await request('host',`/games/${finished}/next`,'POST',{})).game;
}
if(game.phase==='final')game=(await request('host',`/games/${finished}/reveal`,'POST',{})).game;
if(game.phase!=='revealed')throw Error('Демо турнир не раскрыт');
const annaDiary=(await request('anna','/diary')).entries.filter(e=>e.gameTitle===titles.finished);
const maxDiary=(await request('max','/diary')).entries.filter(e=>e.gameTitle===titles.finished);
if(game.matches.length!==3||!game.champion||annaDiary.length<2||maxDiary.length<2)throw Error('Неполный результат игры или дневника');
const interactive=await create(titles.interactive);
const next=(await request('host',`/games/${interactive}`)).game;
if(next.phase!=='playing')throw Error('Интерактивная игра не запущена');
console.log(JSON.stringify({finished:{code:finished,phase:game.phase,matches:game.matches.map(m=>({round:m.round,pair:[m.a,m.b],score:m.score,tieScore:m.tieScore,winner:m.winner})),champion:game.wines.find(w=>w.number===game.champion)?.name,diaryEntries:{anna:annaDiary.length,max:maxDiary.length}},interactive:{code:interactive,phase:next.phase,current:next.matches.find(m=>m.id===next.currentMatchId)?.status,players:next.players.map(p=>p.name)}},null,2));
