import {api} from '../../../backend.js';
export const runtime='nodejs';
export const dynamic='force-dynamic';

async function handle(request){
  const headers=Object.fromEntries(request.headers.entries());
  const bytes=request.method==='GET'||request.method==='HEAD'?Buffer.alloc(0):Buffer.from(await request.arrayBuffer());
  const req={method:request.method,headers,socket:{remoteAddress:'next'},async *[Symbol.asyncIterator](){if(bytes.length)yield bytes}};
  let status=200,body='',responseHeaders=new Headers();
  const res={headersSent:false,setHeader(name,value){responseHeaders.set(name,value)},writeHead(code,values={}){status=code;for(const [key,value] of Object.entries(values))responseHeaders.set(key,value);this.headersSent=true},end(value=''){body=value}};
  try{await api(req,res,new URL(request.url))}
  catch(e){status=e.status||500;responseHeaders.set('content-type','application/json; charset=utf-8');responseHeaders.set('cache-control','no-store');body=JSON.stringify({error:e.status?e.message:'Ошибка сервера'});if(!e.status)console.error(e)}
  return new Response(body,{status,headers:responseHeaders});
}
export {handle as GET,handle as POST,handle as PATCH,handle as DELETE};
