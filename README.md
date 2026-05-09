# Diagnostic visio.numerique.gouv.fr

Outil de diagnostic réseau complet pour tester la connectivité vers les serveurs de visio.numerique.gouv.fr.

## Ce que ça teste

| Test | Protocole | Côté |
|------|-----------|------|
| Serveur applicatif (HTTPS + IP) | TCP 443 / HTTP 80 | Serveur |
| Signaling LiveKit | TCP 443 | Serveur |
| Nœuds média ICE/TCP | TCP 7881 | Serveur |
| Nœuds média ICE/UDP | UDP 50000–60000 | Serveur |
| Nœuds média TURN/TLS | TCP 443 | Serveur |
| Serveurs CoTurn TCP/TLS | TCP 443 | Serveur |
| Serveurs CoTurn UDP | UDP 443 | Serveur |
| Capacités WebRTC navigateur | — | Navigateur |
| Candidats ICE (STUN + TURN relay) | — | Navigateur |

## Prérequis

- Node.js >= 18
- npm

## Installation

```bash
git clone <repo>
cd visio-diagnostic
npm install
cp .env.example .env
```

## Lancement

```bash
# Développement
npm run dev

# Production
npm start
```

Ouvrez http://localhost:3000

## Déploiement avec PM2

```bash
npm install -g pm2
pm2 start src/server.js --name visio-diagnostic
pm2 save
pm2 startup
```

## Déploiement derrière Apache (reverse proxy)

Ajoutez dans votre VirtualHost Apache :

```apache
ProxyPreserveHost On
ProxyPass        / http://127.0.0.1:3000/
ProxyPassReverse / http://127.0.0.1:3000/

# SSE — désactiver le buffering pour les événements temps réel
SetEnv proxy-sendchunked 1
SetEnv proxy-flushpackets 1
```

Modules Apache nécessaires :
```bash
sudo a2enmod proxy proxy_http
sudo systemctl restart apache2
```

## Structure

```
visio-diagnostic/
├── src/
│   └── server.js      # Backend Express (tests TCP/UDP/HTTPS)
├── public/
│   └── index.html     # Frontend (SSE + WebRTC navigateur)
├── .env.example
└── package.json
```

## Contact

reseau-visio@numerique.gouv.fr
```
