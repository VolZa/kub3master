'use strict';
const http = require('node:http');
const { hex } = require('./security.cjs');
async function body(req) {
  let size = 0; const chunks = [];
  for await (const chunk of req) { size += chunk.length; if (size > 32768) throw Error('ACCESS_DENIED'); chunks.push(chunk); }
  return Buffer.concat(chunks);
}
function createServer({ broker, channel, publicOrigin, erpOrigin } = {}) {
  if (broker && (!channel || new URL(publicOrigin).origin !== publicOrigin || !publicOrigin.startsWith('https://') ||
    new URL(erpOrigin).origin !== erpOrigin || !erpOrigin.startsWith('https://'))) throw Error('CONFIGURATION_REQUIRED');
  const server = http.createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store'); res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('X-Frame-Options', 'DENY');
    const json = (status, value) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(value)); };
    try {
      const url = new URL(req.url, 'https://invalid.test');
      if (url.pathname === '/healthz' && req.method === 'GET') return json(200, { status: broker ? 'PROBE_CONFIGURED' : 'BOOTSTRAP_ONLY' });
      if (!broker) return json(503, { status: 'BLOCKED', code: 'ADAPTERS_NOT_CONFIGURED' });
      if (req.method === 'POST' && ['/private/begin', '/private/redeem'].includes(url.pathname)) {
        if (url.search || req.headers['content-type'] !== 'application/json') throw Error();
        const raw = await body(req);
        await channel({ method: req.method, path: url.pathname, body: raw,
          timestamp: req.headers['x-kub-time'], requestId: req.headers['x-kub-request'], mac: req.headers['x-kub-mac'] });
        const data = JSON.parse(raw.toString('utf8'));
        return json(200, await (url.pathname === '/private/begin' ? broker.begin(data) : broker.redeem(data)));
      }
      if (url.pathname === '/login' && req.method === 'GET') {
        const id = url.searchParams.get('id'); if (!hex(id)) throw Error();
        // Only startup rendezvous, no identity/token/session is ever accepted by this page.
        // Strict headers intentionally omit COOP: startup opener handoff must be tested live.
        const nonce = require('node:crypto').randomBytes(24).toString('base64');
        res.setHeader('Content-Security-Policy', `default-src 'none'; script-src 'nonce-${nonce}'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'`);
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        return res.end(`<!doctype html><meta charset="utf-8"><title>ERP KUB isolated login probe</title><p id="s">Waiting for the initiating probe window.</p><script nonce="${nonce}">
          const id=${JSON.stringify(id)}, expected=${JSON.stringify(erpOrigin)}, parentWindow=window.opener;
          let used=false;
          addEventListener('message',async e=>{
            if(used||!parentWindow||e.source!==parentWindow||e.origin!==expected||!e.data||e.data.type!=='KUB_BRIDGE_BIND'||e.data.transactionId!==id||!/^[a-f0-9]{64}$/.test(e.data.proof))return;
            used=true;
            try{const r=await fetch('/bind',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,proof:e.data.proof})});
              if(!r.ok)throw Error(); const v=await r.json(); const u=new URL(v.url);
              if(u.origin!=='https://accounts.google.com')throw Error();location.assign(u.href);
            }catch{document.getElementById('s').textContent='BLOCKED. Do not retry automatically.';}
          });
          if(parentWindow)parentWindow.postMessage({type:'KUB_BRIDGE_READY',transactionId:id},expected);
        </script>`);
      }
      if (url.pathname === '/bind' && req.method === 'POST') {
        if (url.search || req.headers.origin !== publicOrigin || req.headers['content-type'] !== 'application/json') throw Error();
        const result = await broker.bind(JSON.parse((await body(req)).toString('utf8')));
        res.setHeader('Set-Cookie', `__Host-kub-probe=${result.cookie}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=120`);
        return json(200, { url: result.url });
      }
      if (url.pathname === '/oauth/callback' && req.method === 'GET') {
        if (url.searchParams.has('error') || ['code', 'state'].some(k => url.searchParams.getAll(k).length !== 1)) throw Error();
        const cookies = (req.headers.cookie || '').split(';').map(v => v.trim()).filter(v => v.startsWith('__Host-kub-probe='));
        if (cookies.length !== 1) throw Error();
        await broker.callback({ state: url.searchParams.get('state'), code: url.searchParams.get('code'), cookie: cookies[0].slice('__Host-kub-probe='.length) });
        res.setHeader('Set-Cookie', '__Host-kub-probe=; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=0');
        res.writeHead(303, { Location: '/complete' }); return res.end();
      }
      if (url.pathname === '/complete' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
        return res.end('Google identity verified for the isolated probe. Return to the initiating probe window. No ERP production access granted.');
      }
      return json(404, { code: 'NOT_FOUND' });
    } catch { return json(403, { code: 'ACCESS_DENIED' }); } // Never log token, body, query or exception.
  });
  server.requestTimeout = 15000; server.headersTimeout = 10000;
  return server;
}
if (require.main === module) {
  // Bootstrap permits obtaining a real Cloud Run HTTPS URL before OAuth registration.
  // No live adapter is silently selected; bootstrap is NOT a working login deployment.
  if (process.env.BOOTSTRAP_ONLY !== 'true') {
    process.stderr.write('BLOCKED: reviewed durable store / OAuth / private channel composition required.\n');
    process.exitCode = 1;
  } else createServer().listen(Number(process.env.PORT || 8080), '0.0.0.0');
}
module.exports = { createServer };
