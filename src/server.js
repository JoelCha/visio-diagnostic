'use strict';

const express = require('express');
const net     = require('net');
const dgram   = require('dgram');
const https   = require('https');
const http    = require('http');
const path    = require('path');

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, '..', 'public')));
app.use(express.json());

// ─── Utilitaires ────────────────────────────────────────────────────────────

function testTCP(host, port, timeoutMs = 5000) {
  return new Promise(resolve => {
    const t0     = Date.now();
    const socket = new net.Socket();
    const done   = (ok, err) => { socket.destroy(); resolve({ ok, ms: Date.now() - t0, err: err || null }); };
    socket.setTimeout(timeoutMs);
    socket.connect(port, host, () => done(true));
    socket.on('timeout', () => done(false, 'timeout'));
    socket.on('error',   e  => done(false, e.message));
  });
}

function testUDP(host, port, timeoutMs = 4000) {
  return new Promise(resolve => {
    const t0     = Date.now();
    const client = dgram.createSocket('udp4');
    const stun   = Buffer.from([0x00,0x01,0x00,0x00,0x21,0x12,0xa4,0x42,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00]);
    let settled  = false;
    const done   = (ok, err) => {
      if (settled) return; settled = true;
      clearTimeout(to); client.close();
      resolve({ ok, ms: Date.now() - t0, err: err || null });
    };
    const to = setTimeout(() => done(false, 'timeout'), timeoutMs);
    client.on('message', () => done(true));
    client.on('error',   e  => done(false, e.message));
    client.send(stun, 0, stun.length, port, host, err => { if (err) done(false, err.message); });
  });
}

function testHTTPS(urlStr, timeoutMs = 7000) {
  return new Promise(resolve => {
    const t0  = Date.now();
    const mod = urlStr.startsWith('https') ? https : http;
    const req = mod.get(urlStr, { timeout: timeoutMs, rejectUnauthorized: false }, res => {
      res.resume();
      resolve({ ok: true, ms: Date.now() - t0, status: res.statusCode });
    });
    req.on('timeout', () => { req.destroy(); resolve({ ok: false, ms: Date.now() - t0, err: 'timeout' }); });
    req.on('error',   e  => resolve({ ok: false, ms: Date.now() - t0, err: e.message }));
  });
}

// ─── Cibles de test ─────────────────────────────────────────────────────────

const TARGETS = {
  app: [
    { label: 'Serveur applicatif',    host: 'visio.numerique.gouv.fr', port: 443, proto: 'https', url: 'https://visio.numerique.gouv.fr' },
    { label: 'Serveur applicatif IP', host: '142.44.53.109',           port: 443, proto: 'tcp' },
    { label: 'Redirect HTTP->HTTPS',  host: '142.44.53.109',           port: 80,  proto: 'tcp' },
  ],
  signaling: [
    { label: 'LiveKit Signaling #1', host: '142.44.60.80',                                port: 443, proto: 'tcp'   },
    { label: 'LiveKit Signaling #2', host: '146.183.15.85',                               port: 443, proto: 'tcp'   },
    { label: 'LiveKit Signaling WS', host: 'livekit-prd-osc-cgw1.beta.numerique.gouv.fr', port: 443, proto: 'https', url: 'https://livekit-prd-osc-cgw1.beta.numerique.gouv.fr' },
  ],
  media: [
    { label: 'Media node ICE/TCP',  host: '148.253.97.220', port: 7881,  proto: 'tcp' },
    { label: 'Media node ICE/TCP',  host: '142.44.63.2',    port: 7881,  proto: 'tcp' },
    { label: 'Media node TURN/TLS', host: '148.253.97.220', port: 443,   proto: 'tcp' },
    // ICE/UDP : ces ports n'acceptent que des paquets STUN avec credentials valides
    // issus d'une session WebRTC active. Un sondage anonyme est ignoré par design.
    { label: 'Media node ICE/UDP', host: '148.253.97.220', port: 50000, proto: 'udp', untestable: true },
    { label: 'Media node ICE/UDP', host: '142.44.63.2',    port: 50000, proto: 'udp', untestable: true },
    { label: 'Media node ICE/UDP', host: '142.44.52.178',  port: 55000, proto: 'udp', untestable: true },
  ],
  coturn: [
    { label: 'CoTurn 1 TCP/TLS', host: '148.253.97.205', port: 443, proto: 'tcp' },
    { label: 'CoTurn 2 TCP/TLS', host: '142.44.49.112',  port: 443, proto: 'tcp' },
    { label: 'CoTurn 3 TCP/TLS', host: '146.183.2.148',  port: 443, proto: 'tcp' },
    { label: 'CoTurn 4 TCP/TLS', host: '148.253.97.136', port: 443, proto: 'tcp' },
    { label: 'CoTurn 5 TCP/TLS', host: '142.44.53.25',   port: 443, proto: 'tcp' },
    { label: 'CoTurn 6 TCP/TLS', host: '142.44.63.56',   port: 443, proto: 'tcp' },
    { label: 'CoTurn 1 UDP',     host: '148.253.97.205', port: 443, proto: 'udp' },
    { label: 'CoTurn 2 UDP',     host: '142.44.49.112',  port: 443, proto: 'udp' },
    { label: 'CoTurn hostname',  host: 'coturn-1.beta.numerique.gouv.fr', port: 443, proto: 'tcp' },
  ],
};

// ─── Route API SSE ───────────────────────────────────────────────────────────

app.get('/api/test', async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const send   = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`);
  const groups = Object.entries(TARGETS);
  const total  = groups.reduce((acc, [, arr]) => acc + arr.length, 0);
  let done = 0;

  send({ type: 'start', total });

  for (const [group, targets] of groups) {
    for (const t of targets) {
      done++;

      if (t.untestable) {
        send({ type: 'result', group, label: t.label, host: t.host, port: t.port, proto: t.proto,
               ok: null, ms: null, err: null, untestable: true, progress: Math.round((done / total) * 100) });
        continue;
      }

      let result;
      if (t.proto === 'https')    result = await testHTTPS(t.url);
      else if (t.proto === 'udp') result = await testUDP(t.host, t.port);
      else                        result = await testTCP(t.host, t.port);

      send({ type: 'result', group, label: t.label, host: t.host, port: t.port, proto: t.proto,
             ok: result.ok, ms: result.ms, status: result.status || null, err: result.err || null,
             untestable: false, progress: Math.round((done / total) * 100) });
    }
  }

  send({ type: 'done' });
  res.end();
});

// ─── Démarrage ──────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`✓ Diagnostic visio — http://localhost:${PORT}`);
});
