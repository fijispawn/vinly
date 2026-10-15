function imageUrl(value, pageUrl){
 try{
  const url=new URL(value.replaceAll('&amp;','&'),pageUrl);
  if(url.protocol!=='https:'||!['simplewine.ru','www.simplewine.ru'].includes(url.hostname)||!/^\/upload\/(?:iblock|resize_cache)\//.test(url.pathname))return '';
  return url.href;
 }catch{return ''}
}

export function imageFromCopiedPage(text,html,pageUrl){
 let page;try{page=new URL(pageUrl)}catch{return ''}
 if(!['simplewine.ru','www.simplewine.ru'].includes(page.hostname))return '';
 const nextData=html.match(/<script\b[^>]*\bid=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i)?.[1];
 if(nextData){
  try{
   const product=JSON.parse(nextData).props?.pageProps?.initialState?.product?.currentProductData;
   const image=imageUrl(product?.media?.images?.[0]||'',page.href);
   if(image)return image;
  }catch{}
 }
 const slug=page.pathname.split('/').filter(Boolean).at(-1)||'';
 const words=slug.split('_').filter(word=>word.length>2&&!/^(?:19|20)\d{2}$/.test(word)&&!/^\d+$/.test(word));
 for(const tag of html.match(/<img\b[^>]*>/gi)||[]){
  const attribute=name=>tag.match(new RegExp(`\\b${name}=["']([^"']+)["']`,'i'))?.[1]||'';
  const alt=attribute('alt').toLowerCase();
  if(!words.every(word=>alt.includes(word)))continue;
  for(const source of [attribute('src'),attribute('data-src'),attribute('data-original'),attribute('srcset').split(',')[0]?.trim().split(/\s+/)[0]]){
   const image=imageUrl(source||'',page.href);
   if(image)return image;
  }
 }
 return imageUrl(text.match(/https:\/\/(?:www\.)?simplewine\.ru\/upload\/(?:iblock|resize_cache)\/[^\s"'<>]+/i)?.[0]||'',page.href);
}
