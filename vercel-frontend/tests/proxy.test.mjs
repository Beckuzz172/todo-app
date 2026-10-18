import test from 'node:test';
import assert from 'node:assert/strict';
import {proxyCards} from '../server/cards-proxy.mjs';
const url='https://flowboard-kanban-beckuzz.vercel.app';

test('forwards only board cookie and preserves persistence cookie',async()=>{
 const request=new Request(url+'/api/cards',{headers:{Cookie:'private_token=secret; kanban_board=12345678-1234-4321-8123-123456789abc',Authorization:'Bearer private'}});
 const response=await proxyCards(request,async (target,init)=>{
  assert.equal(target,'https://flowboard-kanban-beckuzz.shrewdcup64.chatgpt.site/api/cards');
  assert.equal(init.headers.get('Authorization'),null);
  assert.equal(init.headers.get('Cookie'),'kanban_board=12345678-1234-4321-8123-123456789abc');
  return Response.json({cards:[]},{headers:{'Set-Cookie':'kanban_board=12345678-1234-4321-8123-123456789abc; HttpOnly; Secure; SameSite=Lax; Path=/'}});
 });
 assert.equal(response.status,200);
 assert.match(response.headers.get('set-cookie'),/HttpOnly/);
 assert.deepEqual(await response.json(),{cards:[]});
});

test('blocks cross-origin mutations before any upstream call',async()=>{
 const response=await proxyCards(new Request(url+'/api/cards',{method:'POST',headers:{Origin:'https://untrusted.example'}}),()=>{throw Error('Must not send');});
 assert.equal(response.status,403);
});

test('validates local origin and forwards POST body',async()=>{
 const response=await proxyCards(new Request(url+'/api/cards',{method:'POST',headers:{Origin:url,'Content-Type':'application/json'},body:'{"title":"Test"}'}),async(target,init)=>{
  assert.equal(init.body,'{"title":"Test"}');
  assert.equal(init.headers.get('origin'),'https://flowboard-kanban-beckuzz.shrewdcup64.chatgpt.site');
  return Response.json({card:{title:'Test'}},{status:201});
 });
 assert.equal(response.status,201);
});

test('blocks unsupported paths, methods, and oversized bodies',async()=>{
 const send=()=>{throw Error('Must not send');};
 assert.equal((await proxyCards(new Request(url+'/api/anything'),send)).status,404);
 assert.equal((await proxyCards(new Request(url+'/api/cards',{method:'PUT'}),send)).status,405);
 assert.equal((await proxyCards(new Request(url+'/api/cards',{method:'POST',body:'x'.repeat(12001)}),send)).status,400);
});

test('preserves deletion and maps backend failure',async()=>{
 assert.equal((await proxyCards(new Request(url+'/api/cards/123',{method:'DELETE'}),async()=>new Response(null,{status:204}))).status,204);
 assert.equal((await proxyCards(new Request(url+'/api/cards'),async()=>{throw Error('timeout');})).status,503);
 assert.equal((await proxyCards(new Request(url+'/api/cards'),async()=>new Response('<html>bad gateway</html>',{status:502}))).status,503);
});
