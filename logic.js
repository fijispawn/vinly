import crypto from 'node:crypto';
export const id=()=>crypto.randomUUID();
export const now=()=>new Date().toISOString();
export const shuffle=(a)=>[...a].sort(()=>Math.random()-.5);
export const activePlayers=g=>g.players.filter(p=>!p.absent);
export function makeBracket(wines){
  const seeds=shuffle(wines.map(w=>w.id));
  const base=2**Math.floor(Math.log2(seeds.length));
  const prelimCount=seeds.length-base;
  const matches=[];
  let sources=[];
  for(let i=0;i<prelimCount;i++){
    const m={id:id(),round:0,position:i,a:seeds[i*2],b:seeds[i*2+1],status:'pending',answers:{},tieAnswers:{},forcedSkips:[],tieSkips:[],score:null,winner:null,tieScore:null};
    matches.push(m);sources.push({from:m.id});
  }
  sources.push(...seeds.slice(prelimCount*2).map(wine=>({wine})));
  sources=shuffle(sources);
  let round=prelimCount?1:0;
  while(sources.length>1){
    const next=[];
    for(let i=0;i<sources.length;i+=2){
      const m={id:id(),round,position:i/2,sourceA:sources[i],sourceB:sources[i+1],a:sources[i].wine||null,b:sources[i+1].wine||null,status:'pending',answers:{},tieAnswers:{},forcedSkips:[],tieSkips:[],score:null,winner:null,tieScore:null};
      matches.push(m);next.push({from:m.id});
    }
    sources=next;round++;
  }
  return {matches,seedOrder:seeds};
}
export function currentMatch(g){return g.matches.find(m=>m.id===g.currentMatchId)||null}
export function pickNext(g){return g.matches.find(m=>m.status==='pending' && m.a && m.b)||null}
export function propagate(g,m){
  for(const child of g.matches){
    if(child.sourceA?.from===m.id)child.a=m.winner;
    if(child.sourceB?.from===m.id)child.b=m.winner;
  }
}
export function scoreFor(g,m,tie=false){
  const answers=tie?m.tieAnswers:m.answers;
  const counts={[m.a]:0,[m.b]:0};
  for(const p of g.players){const vote=answers[p.userId]?.vote;if(vote===m.a||vote===m.b)counts[vote]++}
  return counts;
}
export function allAnswered(g,m,tie=false){
  const answers=tie?m.tieAnswers:m.answers,skips=tie?m.tieSkips:m.forcedSkips;
  return activePlayers(g).every(p=>answers[p.userId]||skips.includes(p.userId));
}
export function closeMatch(g,m){
  if(!allAnswered(g,m,m.status==='tie'))throw Error('Не все активные игроки ответили или пропустили пару');
  const tie=m.status==='tie';const counts=scoreFor(g,m,tie);const votes=counts[m.a]+counts[m.b];
  if(!votes)throw Error('Нет голосов. Откройте голосование снова или завершите игру без результата.');
  if(tie){m.tieScore=counts;if(counts[m.a]===counts[m.b])m.winner=g.seedOrder.indexOf(m.a)<g.seedOrder.indexOf(m.b)?m.a:m.b;else m.winner=counts[m.a]>counts[m.b]?m.a:m.b;}
  else {m.score=counts;if(counts[m.a]===counts[m.b]){m.status='tie';return 'tie'}m.winner=counts[m.a]>counts[m.b]?m.a:m.b;}
  m.status='result';m.closedAt=now();propagate(g,m);return 'result';
}
export function firstRatings(g){
  const map={};
  for(const m of g.matches.filter(m=>m.closedAt).sort((a,b)=>a.closedAt.localeCompare(b.closedAt))){
    for(const [uid,a] of Object.entries(m.answers))if(!a.skip)for(const wineId of [m.a,m.b]){
      const key=uid+':'+wineId;if(!map[key])map[key]={userId:uid,wineId,rating:a.ratings?.[wineId],matchId:m.id};
    }
  }
  return Object.values(map).filter(x=>x.rating);
}
export const criteria=['acidity','aroma','body','impression'];
export function nominations(g){
  const ratings=firstRatings(g),out={};
  for(const criterion of criteria){
    const rows=g.wines.map(w=>{const vals=ratings.filter(r=>r.wineId===w.id).map(r=>Number(r.rating[criterion])).filter(n=>n>=1&&n<=5);return {wineId:w.id,average:vals.length?Math.round(vals.reduce((a,b)=>a+b,0)/vals.length*10)/10:null,count:vals.length}}).filter(x=>x.count);
    const high=Math.max(...rows.map(r=>r.average));out[criterion]=rows.filter(r=>r.average===high);
  }
  return out;
}
export const revealOrder=g=>[...g.wines.filter(w=>w.id!==g.championId).sort((a,b)=>a.number-b.number),...g.wines.filter(w=>w.id===g.championId)];
export const revealTotal=g=>g.wines.length+(g.showRegionMap===false?1:2);
export const revealStep=g=>g.revealStep??revealTotal(g);
export function publicGame(g,user){
  const isHost=user?.id===g.hostId,player=g.players.find(p=>p.userId===user?.id),revealed=g.phase==='revealed';
  const current=currentMatch(g);
  const step=revealed?revealStep(g):0,order=revealed?revealOrder(g):[];
  const visibleIds=new Set(order.slice(0,step).map(w=>w.id));
  return {
    id:g.id,code:g.code,title:g.title,theme:g.theme,description:g.description,priceLimit:g.priceLimit,minPlayers:g.minPlayers||1,showRegionMap:g.showRegionMap!==false,phase:g.phase,createdAt:g.createdAt,
    revealStep:revealed?step:undefined,revealTotal:revealed?revealTotal(g):undefined,revealNumber:revealed&&step>=1&&step<=g.wines.length?order[step-1].number:null,
    role:isHost?'host':player?'player':'spectator',numbersConfirmed:isHost?!!g.numbersConfirmed:undefined,players:g.players.map(p=>({userId:p.userId,name:p.name,avatar:p.avatar??0,frame:p.frame||'circle',frameColor:p.frameColor||'burgundy',absent:p.absent,online:!!p.lastSeen&&Date.now()-new Date(p.lastSeen).getTime()<20000,answered:!!current&&(!!current.answers[p.userId]||current.forcedSkips.includes(p.userId)),tieAnswered:!!current&&(!!current.tieAnswers[p.userId]||current.tieSkips.includes(p.userId))})),
    wines:g.wines.map(w=>isHost||visibleIds.has(w.id)?{...w}:{id:w.id,number:w.number}),
    matches:g.matches.map(m=>({id:m.id,round:m.round,position:m.position,a:m.a?g.wines.find(w=>w.id===m.a)?.number:null,b:m.b?g.wines.find(w=>w.id===m.b)?.number:null,status:m.status,score:m.status==='result'||revealed?numberScore(g,m.score):null,tieScore:m.status==='result'||revealed?numberScore(g,m.tieScore):null,winner:m.winner?g.wines.find(w=>w.id===m.winner)?.number:null,sourceA:m.sourceA,sourceB:m.sourceB,answer:player?m.answers[user.id]||null:null,tieAnswer:player?m.tieAnswers[user.id]||null:null,skipped:player?m.forcedSkips.includes(user.id):false})),
    currentMatchId:g.currentMatchId,champion:revealed&&step>=g.wines.length?g.wines.find(w=>w.id===g.championId)?.number:null,nominations:revealed&&step>=revealTotal(g)?nominations(g):null,
    seedOrder:revealed&&step>=revealTotal(g)?g.seedOrder.map(id=>g.wines.find(w=>w.id===id)?.number):undefined,
    events:isHost?g.events.slice(-25):undefined
  };
}
function numberScore(g,score){if(!score)return null;return Object.fromEntries(Object.entries(score).map(([id,n])=>[g.wines.find(w=>w.id===id)?.number,n]))}
export function diaryFor(state,userId){
  const entries=[];
  for(const item of state.manualWines?.[userId]||[]){
    entries.push({id:'manual:'+item.id,key:'manual:'+item.id,origin:'manual',date:item.addedAt,wine:item.wine,gameId:null,gameTitle:'Добавлено самостоятельно',history:[],firstRatings:null,champion:false,nominations:[],tastings:[]});
  }
  for(const g of state.games.filter(g=>g.phase==='revealed'&&revealStep(g)>=revealTotal(g))){
    const matchList=g.matches.filter(m=>m.closedAt&&m.answers[userId]&&!m.answers[userId].skip);
    const ids=[...new Set(matchList.flatMap(m=>[m.a,m.b]))];
    for(const wineId of ids){
      const wine=g.wines.find(w=>w.id===wineId),history=matchList.filter(m=>m.a===wineId||m.b===wineId).map(m=>({round:m.round,date:m.closedAt,opponent:g.wines.find(w=>w.id===(m.a===wineId?m.b:m.a))?.number,ratings:m.answers[userId].ratings?.[wineId],words:m.answers[userId].words?.[wineId]||'',note:m.answers[userId].notes?.[wineId]||'',votedFor:m.answers[userId].vote===wineId,winner:m.winner===wineId}));
      const first=history[0],key=wine.sourceUrl?`url:${new URL(wine.sourceUrl).origin}${new URL(wine.sourceUrl).pathname}:${wine.vintage||''}`:wine.name&&wine.producer&&wine.vintage?`identity:${wine.name.toLowerCase().trim()}|${wine.producer.toLowerCase().trim()}|${wine.vintage}`:`unique:${g.id}:${wineId}`;
      entries.push({id:g.id+':'+wineId,key,origin:'game',gameId:g.id,gameTitle:g.title,date:first.date,wine,history:history.map(h=>({...h,gameTitle:g.title})),firstRatings:first.ratings,champion:g.championId===wineId,nominations:Object.entries(nominations(g)).filter(([,rows])=>rows.some(r=>r.wineId===wineId)).map(([key])=>key),tastings:[{gameId:g.id,gameTitle:g.title,date:first.date,wine,history}]});
    }
  }
  const grouped=new Map();
  for(const entry of entries.sort((a,b)=>a.date.localeCompare(b.date))){
    const prior=grouped.get(entry.key);
    if(!prior){grouped.set(entry.key,entry);continue}
    prior.history.push(...entry.history);prior.tastings.push(...entry.tastings);
    prior.champion ||= entry.champion;prior.nominations=[...new Set([...prior.nominations,...entry.nominations])];
    prior.date=entry.date;prior.wine=entry.wine;prior.gameId=entry.gameId;prior.gameTitle=entry.gameTitle;prior.firstRatings=entry.firstRatings;
  }
  return [...grouped.values()].filter(e=>!state.hiddenDiaryWines?.[userId]?.includes(e.key)).map(e=>({...e,diaryNote:state.diaryNotes[userId]?.[e.id]||{text:'',again:false,buy:false}})).sort((a,b)=>b.date.localeCompare(a.date));
}
