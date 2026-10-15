import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {id,now,makeBracket,currentMatch,pickNext,closeMatch,allAnswered,publicGame,diaryFor,revealStep,revealTotal} from './logic.js';
import {scrapeWine,scrapeWineFromText} from './scraper.js';
const root=path.dirname(fileURLToPath(import.meta.url)),dataDir=process.env.DATA_DIR||path.join(root,'data'),dataFile=path.join(dataDir,'state.json');
await fs.mkdir(dataDir,{recursive:true});let state;try{state=JSON.parse(await fs.readFile(dataFile,'utf8'))}catch(error){if(error.code!=='ENOENT')throw error;state={users:[],sessions:[],codes:[],games:[],diaryNotes:{}}}
state.manualWines ||= {};
state.hiddenDiaryWines ||= {};
let writeQueue=Promise.resolve();function save(){writeQueue=writeQueue.then(()=>fs.writeFile(dataFile+'.tmp',JSON.stringify(state,null,2)).then(()=>fs.rename(dataFile+'.tmp',dataFile)));return writeQueue}
const fail=(status,message)=>Object.assign(Error(message),{status});
const json=(res,status,data)=>{res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});res.end(JSON.stringify(data))};
const cookie=req=>Object.fromEntries(String(req.headers.cookie||'').split(';').map(x=>x.trim().split('=')).filter(x=>x.length===2));
function userFor(req){const token=cookie(req).wb_session;if(!token)return null;const s=state.sessions.find(s=>s.hash===hash(token)&&new Date(s.expires)>new Date());return s?state.users.find(u=>u.id===s.userId):null}
const hash=s=>crypto.createHash('sha256').update(String(s)).digest('hex');
const loginName=s=>String(s||'').trim().toLowerCase();
const loginAttempts=new Map();
function passwordInput(password){if(typeof password!=='string'||password.length<10||password.length>128)throw fail(400,'Пароль должен содержать от 10 до 128 символов');return password}
function passwordHash(password){const salt=crypto.randomBytes(16).toString('hex');return `scrypt:${salt}:${crypto.scryptSync(password,salt,64).toString('hex')}`}
function passwordMatches(password,stored){if(!stored?.startsWith('scrypt:'))return false;const [,salt,expected]=stored.split(':');const actual=crypto.scryptSync(password,salt,64);const expectedBuffer=Buffer.from(expected,'hex');return actual.length===expectedBuffer.length&&crypto.timingSafeEqual(actual,expectedBuffer)}
function session(res,req,user){const token=crypto.randomBytes(32).toString('hex');state.sessions.push({hash:hash(token),userId:user.id,expires:new Date(Date.now()+30*86400000).toISOString()});res.setHeader('set-cookie',`wb_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=2592000${req.headers['x-forwarded-proto']==='https'?'; Secure':''}`)}
const clean=s=>String(s??'').trim().slice(0,5000);
const asGame=code=>state.games.find(g=>g.code===String(code).toUpperCase());
const checkHost=(g,u)=>{if(!u||g.hostId!==u.id)throw fail(403,'Только ведущий может управлять этой игрой')};
const checkPlayer=(g,u)=>{if(!u||!g.players.some(p=>p.userId===u.id))throw fail(403,'Сначала подключитесь как игрок')};
const ensureSetup=g=>{if(g.phase!=='setup')throw fail(409,'Подготовка уже завершена')};
const ensureCurrent=g=>{const m=currentMatch(g);if(!m)throw fail(409,'Нет активной пары');return m};
const log=(g,text)=>g.events.push({at:now(),text});
async function body(req,limit=100000){let size=0,chunks=[];for await(const c of req){size+=c.length;if(size>limit)throw fail(413,'Слишком большой запрос');chunks.push(c)}try{return JSON.parse(Buffer.concat(chunks).toString()||'{}')}catch{throw fail(400,'Неверный JSON')}}
function validateRatings(r,m){const out={};for(const wid of [m.a,m.b]){const v=r?.[wid];if(!v)throw fail(400,'Оцените оба вина');out[wid]={};for(const key of ['acidity','aroma','body','impression']){const n=Number(v[key]);if(!Number.isInteger(n)||n<1||n>5)throw fail(400,'Каждая оценка должна быть от 1 до 5');out[wid][key]=n}}return out}
function wineInput(x){const fields=['sourceUrl','sourceName','sourceDate','name','producer','vintage','image','currency','country','region','grape','style','alcohol','volume','sugar','productAcidity','externalRating','externalRatingSource','externalRatingScale','externalRatingCount','description','hostNote'];const w={};for(const f of fields)w[f]=clean(x[f]).slice(0,f==='description'?2500:500);w.price=x.price===''||x.price==null?null:Number(x.price);if(w.price!==null&&(!Number.isFinite(w.price)||w.price<0))throw fail(400,'Проверьте цену');if(!w.name)throw fail(400,'Укажите название вина');if(w.sourceUrl){let u;try{u=new URL(w.sourceUrl)}catch{throw fail(400,'Неверная ссылка источника')}if(!['http:','https:'].includes(u.protocol))throw fail(400,'Неверная ссылка источника')}if(w.image){let u;try{u=new URL(w.image)}catch{throw fail(400,'Неверный URL изображения')}if(u.protocol!=='https:')w.image=''}return w}
const sameManualWine=(list,w,exceptId)=>w.sourceUrl&&list.some(item=>item.id!==exceptId&&item.wine.sourceUrl===w.sourceUrl&&item.wine.vintage===w.vintage);
if(process.env.SEED_DEMO==='1'){
  const demoPasswords={host:process.env.DEMO_HOST_PASSWORD,anna:process.env.DEMO_ANNA_PASSWORD,max:process.env.DEMO_MAX_PASSWORD,catalog:process.env.DEMO_CATALOG_PASSWORD};
  if(Object.values(demoPasswords).some(password=>!password))throw Error('Для SEED_DEMO задайте DEMO_HOST_PASSWORD, DEMO_ANNA_PASSWORD, DEMO_MAX_PASSWORD и DEMO_CATALOG_PASSWORD');
  for(const password of Object.values(demoPasswords))passwordInput(password);
  for(const example of [
    {login:'demo-host@mail.ru',name:'Ведущий',password:demoPasswords.host},
    {login:'demo-anna@mail.ru',name:'Анна',password:demoPasswords.anna},
    {login:'demo-max@mail.ru',name:'Максим',password:demoPasswords.max}
  ]){
    if(state.users.some(user=>user.login===example.login))continue;
    state.users.push({id:id(),login:example.login,name:example.name,passwordHash:passwordHash(example.password),createdAt:now()});
    await save();
  }
  let demo=state.users.find(x=>x.login==='test@mail.ru');
  if(!demo){demo={id:id(),login:'test@mail.ru',name:'Тестовый гость',passwordHash:passwordHash(demoPasswords.catalog),createdAt:now()};state.users.push(demo);await save()}
  const examples=[
    {url:'https://simplewine.ru/catalog/product/chardonnay_2025_075_158914/',fallback:{name:'Вино Chardonnay, Luigi Bosca, 2025',producer:'Luigi Bosca',vintage:'2025',country:'Аргентина',region:'Мендоса',grape:'шардоне 100%',style:'белое',sugar:'сухое',alcohol:'13.8%',volume:'0.75 л',price:2990}},
    {url:'https://simplewine.ru/catalog/product/paddle_creek_sauvignon_blanc_2025_075_160429/',fallback:{name:'Вино Paddle Creek Sauvignon Blanc, Lake Road, 2025',producer:'Lake Road',vintage:'2025',country:'Новая Зеландия',region:'Мальборо',grape:'совиньон блан 100%',style:'белое',sugar:'полусухое',alcohol:'12.5%',volume:'0.75 л',price:1603}}
  ];
  for(const example of examples){
    const list=state.manualWines[demo.id] ||= [];
    if(list.some(x=>x.wine.sourceUrl===example.url))continue;
    let parsed={};try{parsed=await scrapeWine(example.url)}catch(error){console.warn('Не удалось обновить пример вина:',error.message)}
    const wine=wineInput({...example.fallback,...Object.fromEntries(Object.entries(parsed).filter(([,value])=>value!==''&&value!=null)),sourceUrl:example.url,sourceName:'simplewine.ru',sourceDate:now().slice(0,10)});
    list.push({id:id(),wine,addedAt:now()});await save();
  }
}
export async function api(req,res,url){const method=req.method,parts=url.pathname.split('/').filter(Boolean),u=userFor(req);
  if(method==='GET'&&url.pathname==='/api/me')return json(res,200,{user:u?{id:u.id,login:u.login,name:u.name,email:u.email||''}:null});
  if(method==='POST'&&url.pathname==='/api/auth/register'){
    const b=await body(req),login=loginName(b.login),name=clean(b.name).slice(0,40),password=passwordInput(b.password);
    if(!/^[\p{L}\p{N}_.@-]{3,64}$/u.test(login))throw fail(400,'Логин: 3–64 буквы, цифры, точки, дефиса, @ или подчёркивания');
    if(!name)throw fail(400,'Укажите имя для игры');
    if(state.users.some(x=>x.login===login))throw fail(409,'Такой логин уже занят');
    const user={id:id(),login,name,passwordHash:passwordHash(password),createdAt:now()};state.users.push(user);session(res,req,user);await save();return json(res,201,{user:{id:user.id,login:user.login,name:user.name}});
  }
  if(method==='POST'&&url.pathname==='/api/auth/login'){
    const b=await body(req),login=loginName(b.login),password=String(b.password||''),key=(req.socket.remoteAddress||'')+':'+login;
    const attempts=(loginAttempts.get(key)||[]).filter(t=>Date.now()-t<15*60000);if(attempts.length>=8)throw fail(429,'Слишком много попыток. Попробуйте через 15 минут');
    const user=state.users.find(x=>x.login===login);
    if(!user||!passwordMatches(password,user.passwordHash)){attempts.push(Date.now());loginAttempts.set(key,attempts);throw fail(401,'Неверный логин или пароль')}
    loginAttempts.delete(key);session(res,req,user);await save();return json(res,200,{user:{id:user.id,login:user.login,name:user.name,email:user.email||''}});
  }
  if(method==='POST'&&url.pathname==='/api/auth/logout'){const token=cookie(req).wb_session;state.sessions=state.sessions.filter(s=>s.hash!==hash(token||''));await save();res.setHeader('set-cookie','wb_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0');return json(res,200,{ok:true})}
  if(method==='PATCH'&&url.pathname==='/api/me'){if(!u)throw fail(401,'Войдите в аккаунт');const b=await body(req),name=clean(b.name).slice(0,40);if(!name)throw fail(400,'Укажите имя');u.name=name;await save();return json(res,200,{user:{id:u.id,login:u.login,name:u.name,email:u.email||''}})}
  if(method==='PATCH'&&url.pathname==='/api/me/password'){if(!u)throw fail(401,'Войдите в аккаунт');const b=await body(req);if(u.passwordHash&&!passwordMatches(String(b.currentPassword||''),u.passwordHash))throw fail(403,'Текущий пароль неверен');u.passwordHash=passwordHash(passwordInput(b.newPassword));state.sessions=state.sessions.filter(s=>s.userId!==u.id||s.hash===hash(cookie(req).wb_session||''));await save();return json(res,200,{ok:true})}
  if(method==='DELETE'&&url.pathname==='/api/me'){if(!u)throw fail(401,'Войдите в аккаунт');state.users=state.users.filter(x=>x.id!==u.id);state.sessions=state.sessions.filter(x=>x.userId!==u.id);delete state.diaryNotes[u.id];delete state.manualWines[u.id];delete state.hiddenDiaryWines[u.id];for(const g of state.games){const p=g.players.find(p=>p.userId===u.id);if(p){p.name='Удалённый игрок';p.absent=true;p.userId='deleted:'+id()}for(const m of g.matches){delete m.answers[u.id];delete m.tieAnswers[u.id];m.forcedSkips=m.forcedSkips.filter(x=>x!==u.id);m.tieSkips=m.tieSkips.filter(x=>x!==u.id)}}await save();res.setHeader('set-cookie','wb_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0');return json(res,200,{ok:true})}
  if(method==='POST'&&url.pathname==='/api/diary/wines'){if(!u)throw fail(401,'Войдите в аккаунт');const wine=wineInput(await body(req)),list=state.manualWines[u.id] ||= [];if(sameManualWine(list,wine))throw fail(409,'Это вино уже есть в вашей коллекции');list.push({id:id(),wine,addedAt:now()});await save();return json(res,201,{entries:diaryFor(state,u.id)})}
  if(parts[0]==='api'&&parts[1]==='diary'&&parts[2]==='wines'&&parts[3]){if(!u)throw fail(401,'Войдите в аккаунт');const list=state.manualWines[u.id]||[],item=list.find(x=>x.id===parts[3]);if(!item)throw fail(404,'Вино не найдено');if(method==='PATCH'){const wine=wineInput(await body(req));if(sameManualWine(list,wine,item.id))throw fail(409,'Это вино уже есть в вашей коллекции');item.wine=wine;await save();return json(res,200,{entries:diaryFor(state,u.id)})}if(method==='DELETE'){state.manualWines[u.id]=list.filter(x=>x.id!==item.id);delete state.diaryNotes[u.id]?.['manual:'+item.id];await save();return json(res,200,{entries:diaryFor(state,u.id)})}}
  if(method==='GET'&&url.pathname==='/api/diary'){if(!u)throw fail(401,'Войдите в аккаунт');return json(res,200,{entries:diaryFor(state,u.id)})}
  if(method==='GET'&&url.pathname==='/api/diary/export'){if(!u)throw fail(401,'Войдите в аккаунт');res.setHeader('content-disposition','attachment; filename="wine-diary.json"');return json(res,200,{exportedAt:now(),entries:diaryFor(state,u.id)})}
  if(parts[0]==='api'&&parts[1]==='diary'&&parts[2]&&method==='DELETE'){
    if(!u)throw fail(401,'Войдите в аккаунт');
    const entryId=decodeURIComponent(parts.slice(2).join('/'));
    const entry=diaryFor(state,u.id).find(e=>e.id===entryId);
    if(!entry)throw fail(404,'Вино не найдено в дневнике');
    if(entry.origin==='manual')state.manualWines[u.id]=(state.manualWines[u.id]||[]).filter(item=>item.id!==entryId.slice(7));
    else (state.hiddenDiaryWines[u.id] ||= []).push(entry.key);
    delete state.diaryNotes[u.id]?.[entryId];
    await save();return json(res,200,{entries:diaryFor(state,u.id)});
  }
  if(parts[0]==='api'&&parts[1]==='diary'&&parts[2]&&method==='PATCH'){if(!u)throw fail(401,'Войдите в аккаунт');const key=decodeURIComponent(parts.slice(2).join('/'));if(!diaryFor(state,u.id).some(e=>e.id===key))throw fail(404,'Запись не найдена');const b=await body(req);state.diaryNotes[u.id]||={};state.diaryNotes[u.id][key]={text:clean(b.text).slice(0,2000),again:!!b.again,buy:!!b.buy};await save();return json(res,200,{ok:true})}
  if(method==='GET'&&url.pathname==='/api/games'){if(!u)throw fail(401,'Войдите в аккаунт');return json(res,200,{games:state.games.filter(g=>g.hostId===u.id||g.players.some(p=>p.userId===u.id)).map(g=>({code:g.code,title:g.title,phase:g.phase,role:g.hostId===u.id?'host':'player',createdAt:g.createdAt}))})}
  if(method==='POST'&&url.pathname==='/api/games'){if(!u)throw fail(401,'Войдите в аккаунт');const b=await body(req),title=clean(b.title).slice(0,80),minPlayers=b.minPlayers===undefined?2:Number(b.minPlayers);if(!title)throw fail(400,'Укажите название вечера');if(!Number.isInteger(minPlayers)||minPlayers<1||minPlayers>16)throw fail(400,'Число игроков должно быть от 1 до 16');let code;do{code=crypto.randomBytes(4).toString('base64url').replace(/[^A-Z0-9]/gi,'').slice(0,6).toUpperCase()}while(code.length<6||asGame(code));const g={id:id(),code,hostId:u.id,title,theme:clean(b.theme).slice(0,100),description:clean(b.description).slice(0,500),priceLimit:clean(b.priceLimit).slice(0,40),minPlayers,showRegionMap:b.showRegionMap!==false&&b.showRegionMap!=='false',createdAt:now(),phase:'setup',wines:[],players:[],matches:[],currentMatchId:null,championId:null,seedOrder:[],events:[],numbersConfirmed:false};state.games.push(g);log(g,'Лобби создано');await save();return json(res,201,{game:publicGame(g,u)})}
  if(parts[0]==='api'&&parts[1]==='scrape'&&method==='POST'){if(!u)throw fail(401,'Войдите в аккаунт');const b=await body(req,300000);if(!clean(b.url))throw fail(400,'Укажите ссылку');return json(res,200,{wine:b.text===undefined?await scrapeWine(clean(b.url)):await scrapeWineFromText(clean(b.url),b.text)})}
  if(parts[0]==='api'&&parts[1]==='games'&&parts[2]){
    const g=asGame(parts[2]);if(!g)throw fail(404,'Лобби не найдено');const action=parts[3];
    if(method==='DELETE'&&!action){checkHost(g,u);ensureSetup(g);state.games=state.games.filter(game=>game.id!==g.id);await save();return json(res,200,{ok:true})}
    if(method==='GET'&&action==='public')return json(res,200,{game:publicGame(g,null)});
    if(method==='GET'&&!action){if(!u)throw fail(401,'Войдите в аккаунт');if(g.hostId!==u.id&&!g.players.some(p=>p.userId===u.id))throw fail(403,'Подключитесь к лобби');const p=g.players.find(p=>p.userId===u.id);if(p)p.lastSeen=now();return json(res,200,{game:publicGame(g,u)})}
    if(method==='POST'&&action==='join'){if(!u)throw fail(401,'Войдите в аккаунт');if(g.hostId===u.id)throw fail(409,'Устройство ведущего не участвует в дегустации');let p=g.players.find(p=>p.userId===u.id);if(!p){ensureSetup(g);const b=await body(req),name=clean(b.name).slice(0,40),avatar=b.avatar,frame=clean(b.frame);if(!name)throw fail(400,'Укажите имя');if(!Number.isInteger(avatar)||avatar<0||avatar>19)throw fail(400,'Выберите аватар');if(!['circle','square','rounded','oval','hexagon','octagon','arch','diamond','triangle','star','heart','flower'].includes(frame))throw fail(400,'Выберите рамку');const frameColor=clean(b.frameColor||'burgundy');if(!['burgundy','terracotta','rose','olive','plum','bronze','ink'].includes(frameColor))throw fail(400,'Выберите цвет рамки');if(g.players.some(x=>x.name.toLowerCase()===name.toLowerCase()))throw fail(409,'Это имя уже занято в лобби. Уточните его');p={userId:u.id,name,avatar,frame,frameColor,absent:false,joinedAt:now(),lastSeen:now()};g.players.push(p);log(g,`${name} присоединился`);await save()}return json(res,200,{game:publicGame(g,u)})}
    checkHostOrPlayer(action,g,u);
    if(method==='PATCH'&&action==='settings'){checkHost(g,u);ensureSetup(g);const b=await body(req);g.title=clean(b.title).slice(0,80)||g.title;g.theme=clean(b.theme).slice(0,100);g.description=clean(b.description).slice(0,500);g.priceLimit=clean(b.priceLimit).slice(0,40);await save();return json(res,200,{game:publicGame(g,u)})}
    if(method==='POST'&&action==='wines'){checkHost(g,u);ensureSetup(g);if(g.wines.length>=16)throw fail(409,'Максимум 16 бутылок');const w=wineInput(await body(req));w.id=id();w.number=Math.max(0,...g.wines.map(x=>x.number))+1;g.wines.push(w);g.numbersConfirmed=false;await save();return json(res,201,{game:publicGame(g,u)})}
    if(parts[4]&&action==='wines'&&method==='PATCH'){checkHost(g,u);ensureSetup(g);const w=g.wines.find(w=>w.id===parts[4]);if(!w)throw fail(404,'Бутылка не найдена');Object.assign(w,wineInput(await body(req)));await save();return json(res,200,{game:publicGame(g,u)})}
    if(parts[4]&&action==='wines'&&method==='DELETE'){checkHost(g,u);ensureSetup(g);g.wines=g.wines.filter(w=>w.id!==parts[4]);g.wines.forEach((w,i)=>w.number=i+1);g.numbersConfirmed=false;await save();return json(res,200,{game:publicGame(g,u)})}
    if(method==='POST'&&action==='confirm-numbers'){checkHost(g,u);ensureSetup(g);g.numbersConfirmed=true;await save();return json(res,200,{game:publicGame(g,u)})}
    if(method==='POST'&&action==='remove-player'){checkHost(g,u);ensureSetup(g);const b=await body(req);g.players=g.players.filter(p=>p.userId!==b.userId);await save();return json(res,200,{game:publicGame(g,u)})}
    if(method==='POST'&&action==='start'){checkHost(g,u);ensureSetup(g);if(g.wines.length<2)throw fail(409,'Добавьте минимум две бутылки');if(g.players.length<(g.minPlayers||1))throw fail(409,`Нужно игроков: ${g.minPlayers||1}`);if(!g.numbersConfirmed)throw fail(409,'Подтвердите номера на физических бутылках');const bracket=makeBracket(g.wines);g.matches=bracket.matches;g.seedOrder=bracket.seedOrder;g.phase='playing';g.currentMatchId=pickNext(g)?.id||null;log(g,'Турнир начался');await save();return json(res,200,{game:publicGame(g,u)})}
    if(method==='POST'&&action==='undo-start'){checkHost(g,u);if(g.phase!=='playing'||g.matches.some(m=>Object.keys(m.answers).length))throw fail(409,'Отменить старт можно только до первого ответа');g.matches=[];g.seedOrder=[];g.currentMatchId=null;g.phase='setup';await save();return json(res,200,{game:publicGame(g,u)})}
    if(method==='POST'&&action==='open'){checkHost(g,u);const m=ensureCurrent(g);if(m.status!=='pending'&&m.status!=='pouring')throw fail(409,'Пара уже открыта');m.status='open';log(g,`Открыто голосование: ${g.wines.find(w=>w.id===m.a).number} / ${g.wines.find(w=>w.id===m.b).number}`);await save();return json(res,200,{game:publicGame(g,u)})}
    if(method==='POST'&&action==='answer'){checkPlayer(g,u);const m=ensureCurrent(g);if(m.status!=='open'&&m.status!=='tie')throw fail(409,'Голосование закрыто');const p=g.players.find(p=>p.userId===u.id);if(p.absent)throw fail(409,'Вы отмечены отсутствующим');const b=await body(req);if(m.status==='tie'){if(b.skip)m.tieAnswers[u.id]={skip:true,at:now()};else{if(![m.a,m.b].includes(b.vote))throw fail(400,'Выберите один номер');m.tieAnswers[u.id]={vote:b.vote,at:now()}}m.tieSkips=m.tieSkips.filter(x=>x!==u.id)}else if(b.skip){m.answers[u.id]={skip:true,at:now()}}else{if(![m.a,m.b].includes(b.vote))throw fail(400,'Выберите победителя пары');const ratings=validateRatings(b.ratings,m);m.answers[u.id]={vote:b.vote,ratings,words:Object.fromEntries([m.a,m.b].map(id=>[id,clean(b.words?.[id]).split(/[\s,;]+/).filter(Boolean).slice(0,3).join(', ')])),notes:Object.fromEntries([m.a,m.b].map(id=>[id,clean(b.notes?.[id]).slice(0,500)])),at:now()}}await save();return json(res,200,{game:publicGame(g,u)})}
    if(method==='POST'&&action==='force-skip'){checkHost(g,u);const m=ensureCurrent(g);if(m.status!=='open'&&m.status!=='tie')throw fail(409,'Нет открытого голосования');const b=await body(req),p=g.players.find(p=>p.userId===b.userId);if(!p)throw fail(404,'Игрок не найден');const arr=m.status==='tie'?m.tieSkips:m.forcedSkips,answers=m.status==='tie'?m.tieAnswers:m.answers;if(answers[p.userId])throw fail(409,'Игрок уже ответил');if(!arr.includes(p.userId))arr.push(p.userId);log(g,`${p.name} пропустил текущую пару по решению ведущего`);await save();return json(res,200,{game:publicGame(g,u)})}
    if(method==='POST'&&action==='absent'){checkHost(g,u);const b=await body(req),p=g.players.find(p=>p.userId===b.userId);if(!p)throw fail(404,'Игрок не найден');p.absent=true;log(g,`${p.name} отмечен отсутствующим`);await save();return json(res,200,{game:publicGame(g,u)})}
    if(method==='POST'&&action==='close'){checkHost(g,u);const m=ensureCurrent(g);if(m.status!=='open'&&m.status!=='tie')throw fail(409,'Голосование не открыто');let result;try{result=closeMatch(g,m)}catch(e){throw fail(409,e.message)}log(g,result==='tie'?'Ничья — нужен дополнительный тайный выбор':`Победил номер ${g.wines.find(w=>w.id===m.winner).number}`);await save();return json(res,200,{game:publicGame(g,u)})}
    if(method==='POST'&&action==='retry'){checkHost(g,u);const m=ensureCurrent(g);if(m.status!=='open'&&m.status!=='tie')throw fail(409,'Голосование не открыто');const answers=m.status==='tie'?m.tieAnswers:m.answers;if(Object.values(answers).some(a=>a.vote))throw fail(409,'Повтор нужен только если никто не проголосовал');if(m.status==='tie'){m.tieAnswers={};m.tieSkips=[]}else{m.answers={};m.forcedSkips=[]}log(g,'Голосование открыто повторно');await save();return json(res,200,{game:publicGame(g,u)})}
    if(method==='POST'&&action==='next'){checkHost(g,u);const m=ensureCurrent(g);if(m.status!=='result')throw fail(409,'Сначала завершите текущую пару');const next=pickNext(g);g.currentMatchId=next?.id||null;if(!next)g.phase='final';log(g,next?'Следующая пара готова':'Финал завершён');await save();return json(res,200,{game:publicGame(g,u)})}
    if(method==='POST'&&action==='reveal'){checkHost(g,u);if(g.phase!=='final')throw fail(409,'Сначала завершите финал');const final=g.matches.at(-1);if(!final?.winner)throw fail(409,'Нет чемпиона');g.championId=final.winner;g.phase='revealed';g.revealStep=0;g.revealedAt=now();log(g,'Началось раскрытие бутылок');await save();return json(res,200,{game:publicGame(g,u)})}
    if(method==='POST'&&action==='reveal-next'){checkHost(g,u);if(g.phase!=='revealed'||revealStep(g)>=revealTotal(g))throw fail(409,'Раскрытие уже завершено');g.revealStep=revealStep(g)+1;log(g,g.revealStep===revealTotal(g)?'Результаты раскрыты, дневники обновлены':'Следующий этап раскрытия');await save();return json(res,200,{game:publicGame(g,u)})}
    if(method==='POST'&&action==='abort'){checkHost(g,u);if(!['playing','final'].includes(g.phase))throw fail(409,'Игра не идёт');g.phase='aborted';log(g,'Игра завершена без результата');await save();return json(res,200,{game:publicGame(g,u)})}
  }
  throw fail(404,'Адрес не найден');
}
function checkHostOrPlayer(action,g,u){if(['answer'].includes(action))checkPlayer(g,u);else checkHost(g,u)}
