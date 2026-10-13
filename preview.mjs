import http from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { resolve, extname, sep } from 'node:path';
import { Readable } from 'node:stream';
import { parseEnv } from 'node:util';
import { proxyRequest } from './proxy.mjs';
const env = { ...(existsSync('.env.local') ? parseEnv(readFileSync('.env.local', 'utf8')) : {}), ...process.env };
const root = resolve(import.meta.dirname, 'site');
const types = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.json':'application/json', '.webmanifest':'application/manifest+json', '.png':'image/png', '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.svg':'image/svg+xml', '.ico':'image/x-icon', '.webp':'image/webp' };
const server = http.createServer(async (req,res) => {
  try {
    const url = new URL(req.url, 'http://'+req.headers.host);
    if (url.pathname.startsWith('/api/')) {
      const request = new Request(url, { method:req.method, headers:Object.fromEntries(Object.entries(req.headers).filter(([,v])=>typeof v==='string')),
        ...(req.method==='POST' ? {body:Readable.toWeb(req),duplex:'half'} : {}) });
      const response = await proxyRequest(request, {origin:env.DOARDS_API_ORIGIN || 'https://doards.vercel.app'});
      res.statusCode = response.status;
      response.headers.forEach((v,k)=>{if(k!=='set-cookie')res.setHeader(k,v)});
      const cookies=response.headers.getSetCookie(); if(cookies.length)res.setHeader('Set-Cookie',cookies);
      return res.end(response.body ? Buffer.from(await response.arrayBuffer()) : undefined);
    }
    let file=resolve(root,'.'+decodeURIComponent(url.pathname));
    if(file!==root&&!file.startsWith(root+sep)){res.writeHead(403);return res.end();}
    if(!existsSync(file)||statSync(file).isDirectory()) {
      if(extname(url.pathname)){res.writeHead(404);return res.end();}
      file=resolve(root,'index.html');
    }
    res.writeHead(200,{'Content-Type':types[extname(file)]||'application/octet-stream','Cache-Control':'no-cache'});
    res.end(req.method==='HEAD'?undefined:readFileSync(file));
  } catch {res.writeHead(502);res.end('Preview unavailable');}
});
server.listen(Number(env.PORT||5173),'0.0.0.0',()=>console.log('DOARDS preview on port '+(env.PORT||5173)));
