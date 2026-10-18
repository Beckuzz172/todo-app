const upstreamOrigin = 'https://flowboard-kanban-beckuzz.shrewdcup64.chatgpt.site';
const json = (error, status) => Response.json({ error }, {status, headers:{'Cache-Control':'no-store'}});
export async function proxyCards(request, send = fetch) {
  const url = new URL(request.url);
  if (!/^\/api\/cards(?:\/[a-zA-Z0-9-]+)?\/?$/.test(url.pathname)) return json('Not found.',404);
  const allowed = url.pathname.replace(/\/$/,'') === '/api/cards' ? ['GET','POST'] : ['PATCH','DELETE'];
  if (!allowed.includes(request.method)) return json('Method not allowed.',405);
  const origin=request.headers.get('origin');
  if (request.method !== 'GET' && (request.headers.get('sec-fetch-site')==='cross-site' || (origin && origin !== url.origin))) return json('Cross-origin requests are not allowed.',403);
  const headers=new Headers({'Origin':upstreamOrigin,'Accept':'application/json'});
  const cookie=request.headers.get('cookie')?.split(';').map(v=>v.trim()).find(v=>/^kanban_board=[0-9a-f-]{36}$/i.test(v));
  if(cookie)headers.set('Cookie',cookie);
  const contentType=request.headers.get('content-type');
  if(contentType)headers.set('Content-Type',contentType);
  let body;
  if(request.method==='POST'||request.method==='PATCH'){
    body=await request.text();
    if(body.length>12000)return json('Request is too large.',400);
  }
  try {
    const response=await send(upstreamOrigin+url.pathname.replace(/\/$/,''),{method:request.method,headers,body,redirect:'error',signal:AbortSignal.timeout(20000)});
    const resultHeaders=new Headers({'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
    const responseType=response.headers.get('content-type');
    if(responseType)resultHeaders.set('Content-Type',responseType);
    for(const value of response.headers.getSetCookie()){
      if(value.startsWith('kanban_board='))resultHeaders.append('Set-Cookie',value.replace(/;\s*Domain=[^;]+/gi,''));
    }
    if(response.status!==204 && !responseType?.includes('application/json'))return json('The database is temporarily unavailable. Please try again.',503);
    return new Response(response.body,{status:response.status,headers:resultHeaders});
  }catch{return json('The database is temporarily unavailable. Please try again.',503);}
}
