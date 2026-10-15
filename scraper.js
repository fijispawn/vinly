import dns from 'node:dns/promises';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';

const decode=s=>String(s||'').replace(/<[^>]*>/g,' ').replace(/&nbsp;|&#160;/gi,' ').replace(/&amp;/gi,'&').replace(/&quot;/gi,'"').replace(/&#39;|&apos;/gi,"'").replace(/&laquo;/gi,'«').replace(/&raquo;/gi,'»').replace(/\s+/g,' ').trim();
const blocked=ip=>{if(net.isIP(ip)===4){const p=ip.split('.').map(Number);return p[0]===0||p[0]===10||p[0]===127||p[0]>=224||p[0]===169&&p[1]===254||p[0]===172&&p[1]>=16&&p[1]<=31||p[0]===192&&p[1]===168||p[0]===100&&p[1]>=64&&p[1]<=127||p[0]===192&&p[1]===0||p[0]===198&&p[1]===18};const s=ip.toLowerCase();return s==='::1'||s==='::'||s.startsWith('fc')||s.startsWith('fd')||s.startsWith('fe8')||s.startsWith('fe9')||s.startsWith('fea')||s.startsWith('feb')||s.startsWith('::ffff:')};
async function safeAddress(url){const u=new URL(url);if(!['https:','http:'].includes(u.protocol)||u.username||u.password||u.port&&!['80','443'].includes(u.port))throw Error('Нужна обычная ссылка http или https');if(net.isIP(u.hostname))throw Error('IP-адреса недопустимы');const addresses=await dns.lookup(u.hostname,{all:true});if(!addresses.length||addresses.some(x=>blocked(x.address)))throw Error('Адрес источника недоступен');return {u,address:addresses[0]};}
async function getPage(url,redirects=0){if(redirects>3)throw Error('Слишком много перенаправлений');const {u,address}=await safeAddress(url);return await new Promise((resolve,reject)=>{const mod=u.protocol==='https:'?https:http;const req=mod.get(u,{lookup:(_host,options,cb)=>options.all?cb(null,[address]):cb(null,address.address,address.family),headers:{'user-agent':'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36','accept':'text/html,application/xhtml+xml','accept-language':'ru-RU,ru;q=0.9'},timeout:12000},res=>{if(res.statusCode>=300&&res.statusCode<400&&res.headers.location){res.resume();resolve(getPage(new URL(res.headers.location,u).href,redirects+1));return}if(res.statusCode!==200){res.resume();reject(Error('Источник ответил кодом '+res.statusCode));return}if(!String(res.headers['content-type']||'').includes('text/html')){res.resume();reject(Error('Источник не является HTML-страницей'));return}let chunks=[],size=0;res.on('data',chunk=>{size+=chunk.length;if(size>3_000_000){req.destroy(Error('Страница слишком большая'));return}chunks.push(chunk)});res.on('end',()=>resolve({html:Buffer.concat(chunks).toString('utf8'),url:u.href}))});req.on('timeout',()=>req.destroy(Error('Источник не ответил вовремя')));req.on('error',reject)});}
async function getReaderText(url){
  const {u}=await safeAddress(url);
  const addresses=await dns.lookup(u.hostname,{all:true});
  const address=addresses.find(x=>x.family===4&&!blocked(x.address))||addresses.find(x=>!blocked(x.address));
  if(!address)throw Error('Адрес текстового сервиса недоступен');
  return new Promise((resolve,reject)=>{
    const req=https.get(u,{lookup:(_host,options,cb)=>options.all?cb(null,[address]):cb(null,address.address,address.family),headers:{accept:'text/plain','x-locale':'ru-RU'},timeout:45000},res=>{
      if(res.statusCode!==200){res.resume();reject(Error('Текстовый сервис ответил кодом '+res.statusCode));return}
      const chunks=[];let size=0;
      res.on('data',chunk=>{size+=chunk.length;if(size>3_000_000){req.destroy(Error('Ответ текстового сервиса слишком большой'));return}chunks.push(chunk)});
      res.on('end',()=>resolve(Buffer.concat(chunks).toString('utf8')));
      res.on('error',reject);
    });
    req.on('timeout',()=>req.destroy(Error('Текстовый сервис не ответил вовремя')));
    req.on('error',reject);
  });
}
const meta=(html,key)=>{const tags=html.match(/<meta\b[^>]*>/gi)||[];for(const tag of tags){if(new RegExp('(?:property|name)=["\']'+key.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'["\']','i').test(tag))return decode(tag.match(/content=["']([^"']*)["']/i)?.[1])}return ''};
const item=(obj,key)=>{if(!obj||typeof obj!=='object')return undefined;if(obj[key]!==undefined)return obj[key];if(Array.isArray(obj)){for(const x of obj){const r=item(x,key);if(r!==undefined)return r}}for(const v of Object.values(obj)){if(v&&typeof v==='object'){const r=item(v,key);if(r!==undefined)return r}}};
function ldProducts(html){const blocks=[...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];const all=[];for(const b of blocks){try{const data=JSON.parse(b[1]);const find=x=>{if(!x||typeof x!=='object')return;if(Array.isArray(x)){x.forEach(find);return}if(String(x['@type']||'').toLowerCase().includes('product'))all.push(x);Object.values(x).forEach(v=>{if(v&&typeof v==='object')find(v)})};find(data)}catch{}}return all[0]||{}}
function label(html,label){const esc=label.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');const m=html.match(new RegExp('>'+esc+'<\\/[^>]+>\\s*(?:<[^>]+>\\s*){0,5}([^<]{1,100})','i'));return decode(m?.[1]||'')}
export function parseWineHtml(html,url){const p=ldProducts(html),title=decode(p.name||meta(html,'og:title')||html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1]||html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]);const image=typeof p.image==='string'?p.image:Array.isArray(p.image)?p.image[0]:meta(html,'og:image');const offer=Array.isArray(p.offers)?p.offers[0]:p.offers||{};const rating=p.aggregateRating||{};const isSimple=(new URL(url).hostname==='simplewine.ru'||new URL(url).hostname.endsWith('.simplewine.ru'));const rawText=decode(html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' '));
  if(!title||/^(?:just a moment|access denied|attention required|captcha|robot check|доступ запрещён|проверка безопасности)/i.test(title))throw Error('Магазин не дал прочитать карточку вина');
  const match=(re)=>decode(rawText.match(re)?.[1]||'');
  const priceRaw=offer.price||meta(html,'product:price:amount')||(isSimple?match(/([\d\s\u00a0]+)\s*₽/):'');
  const price=Number(String(priceRaw).replace(/[^\d.,]/g,'').replace(',','.'))||null;
  const wine={sourceUrl:url,sourceName:new URL(url).hostname.replace(/^www\./,''),sourceDate:new Date().toISOString().slice(0,10),name:title.replace(/\s*[:|].*$/,'').trim(),producer:'',vintage:'',image:image||'',price,currency:offer.priceCurrency||meta(html,'product:price:currency')||(price&&isSimple?'RUB':''),country:'',region:'',grape:'',style:'',alcohol:'',volume:'',sugar:'',productAcidity:'',externalRating:'',externalRatingSource:'',externalRatingScale:'',externalRatingCount:'',description:decode(p.description||meta(html,'og:description')),hostNote:''};
  if(isSimple){wine.name=match(/Вино\s+([^\n]{3,120}?)\s+Артикул:/)||wine.name;wine.producer=match(/Производитель:\s*([^,]{2,80})/);wine.vintage=match(/Винтаж:\s*(20\d{2})\s*г/)||match(/Год\s+(20\d{2})/);wine.country=match(/Страна, регион:\s*([^,]{2,60})/);wine.region=match(/Страна, регион:\s*[^,]+,\s*([^,]{2,60})/);wine.grape=match(/Виноград:\s*([^,]{2,100})/);wine.style=match(/Вино:\s*([^,]{2,50})/);wine.sugar=match(/Сахар:\s*([^,]{2,60})/);wine.alcohol=match(/Крепость:\s*([\d.,]+%)/);wine.volume=match(/Объем:\s*([\d.,]+\s*л)/);}
  if(!wine.vintage)wine.vintage=wine.name.match(/\b(19|20)\d{2}\b/)?.[0]||'';
  if(rating.ratingValue){wine.externalRating=String(rating.ratingValue);wine.externalRatingSource=wine.sourceName;wine.externalRatingScale=String(rating.bestRating||5);wine.externalRatingCount=String(rating.ratingCount||rating.reviewCount||'')}
  if(isSimple&&!/^Вино\b/i.test(wine.name))throw Error('Магазин не дал прочитать карточку вина');
  return wine;
}
export function parseWineMarkdown(markdown,url){
  const lines=markdown.split(/\r?\n/).map(x=>x.trim()),titleIndex=lines.findIndex(x=>/^#?\s*Вино\s+.+\b(?:19|20)\d{2}\b/.test(x)),title=lines[titleIndex]?.replace(/^#?\s*Вино\s+/,''),name=title?`Вино ${title}`:'';
  if(!name)throw Error('Не удалось распознать карточку вина');
  const following=label=>{const i=lines.findIndex((x,index)=>index>titleIndex&&(x===label||x===label+':'));if(i<0)return '';for(let j=i+1;j<Math.min(i+7,lines.length);j++){const s=lines[j];if(!s)continue;return s.replace(/\[([^\]]+)\]\([^)]*\)/g,'$1').replace(/,$/,'').trim()}return ''};
  const countryRegion=following('Страна, регион').split(/,\s*/).filter(Boolean);
  const image=lines.find(x=>/^!\[Image[^\]]*Вино/.test(x))?.match(/\]\((https:\/\/[^)]+)\)/)?.[1]||'';
  const vintage=name.match(/\b(?:19|20)\d{2}\b/)?.[0];
  const vintagePrice=vintage&&markdown.match(new RegExp(vintage+'\\s*г\\.\\s*[—–-]\\s*([\\d\\s\\u00a0]+)\\s*₽'))?.[1];
  const price=Number((vintagePrice||lines.find(x=>/^\d[\d\s\u00a0]*\s*₽$/.test(x))||'').replace(/[^\d]/g,''))||null;
  const rating=markdown.match(/\[?(\d(?:[.,]\d)?)\s+(\d+)\s+оценок/)||markdown.match(/(?:^|\n)(\d(?:[.,]\d)?)\s*\n\s*(\d+)\s+оценок/m);
  const description=following('Дегустационные характеристики');
  return {sourceUrl:url,sourceName:'simplewine.ru',sourceDate:new Date().toISOString().slice(0,10),name,producer:following('Производитель'),vintage:following('Год')||name.match(/\b(?:19|20)\d{2}\b/)?.[0]||'',image,price,currency:price?'RUB':'',country:countryRegion[0]||'',region:countryRegion[1]||'',grape:following('Виноград'),style:following('Вино'),alcohol:following('Крепость'),volume:following('Объем'),sugar:following('Сахар'),productAcidity:'',externalRating:rating?.[1]||'',externalRatingSource:rating?'SimpleWine':'',externalRatingScale:rating?'5':'',externalRatingCount:rating?.[2]||'',description,hostNote:''};
}
export async function scrapeWineFromText(url,text){
  let u;try{u=new URL(url)}catch{throw Error('Укажите ссылку на карточку SimpleWine')}
  if(!['http:','https:'].includes(u.protocol)||u.username||u.password||!(u.hostname==='simplewine.ru'||u.hostname.endsWith('.simplewine.ru')))throw Error('Вставка текста сейчас поддерживается для SimpleWine');
  if(typeof text!=='string'||text.length<80||text.length>90000)throw Error('Скопируйте текст открытой карточки вина целиком');
  return parseWineMarkdown(text,u.href);
}
export function partialSimpleWine(url){
  const u=new URL(url),slug=u.pathname.split('/').filter(Boolean).at(-1)||'',parts=slug.split('_');
  const yearIndex=parts.findIndex(x=>/^(?:19|20)\d{2}$/.test(x));
  const nameParts=(yearIndex>0?parts.slice(0,yearIndex):parts.slice(0,-2)).filter(x=>/^[\p{L}\d-]+$/u.test(x));
  const name=nameParts.map(x=>x[0].toUpperCase()+x.slice(1)).join(' ');
  if(!name)throw Error('Сайт магазина не дал прочитать карточку. Заполните её вручную.');
  const volumeCode=parts[yearIndex+1],volume=/^\d{3}$/.test(volumeCode||'')?String(Number(volumeCode)/100).replace('.',',')+' л':'';
  return {sourceUrl:u.href,sourceName:'simplewine.ru',sourceDate:new Date().toISOString().slice(0,10),name:'Вино '+name,vintage:yearIndex>=0?parts[yearIndex]:'',volume,_partial:true};
}
export async function scrapeWine(url){
  const {u}=await safeAddress(url);
  try{const result=await getPage(u.href);return parseWineHtml(result.html,result.url)}
  catch(error){
    if(!(u.hostname==='simplewine.ru'||u.hostname.endsWith('.simplewine.ru')))throw error;
    const proxy='https://r.jina.ai/'+u.href;
    let fallbackError;
    for(const read of [
      ()=>getReaderText(proxy),
      async()=>{const response=await fetch(proxy,{signal:AbortSignal.timeout(45000),headers:{accept:'text/plain','x-locale':'ru-RU',...(process.env.JINA_API_KEY?{authorization:'Bearer '+process.env.JINA_API_KEY}:{})}});if(!response.ok)throw Error('Текстовый сервис ответил кодом '+response.status);const text=await response.text();if(text.length>3_000_000)throw Error('Ответ текстового сервиса слишком большой');return text}
    ]){
      try{return parseWineMarkdown(await read(),u.href)}catch(e){fallbackError=e}
    }
    console.warn('Не удалось прочитать SimpleWine:',error.message,';',fallbackError?.message);
    const reason=fallbackError?.message||error.message;
    return {...partialSimpleWine(u.href),_partialReason:/кодом 451/.test(reason)?'Текстовый сервис недоступен с сервера приложения':reason};
  }
}
