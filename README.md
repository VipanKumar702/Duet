# Duet

Ultra-private, two-person video rooms. No signup, no login, no database. Create a 6-character **vault link**, share it with exactly **one** person, and talk. After the handshake, everything — video, microphone, screen, system audio and chat — travels **directly peer-to-peer** between the two browsers. A third join attempt is auto-deflected.

Built with **WebRTC** (via PeerJS) and zero backend.

---

## Features

- **Peer-to-peer video/audio** with VP9→H.264 codec preference, 1080p/60fps camera profiles and adaptive bitrate control.
- **Screen share** up to 4K/60fps with **system audio capture** (`getDisplayMedia`). Granular toggles:
  - *Send sound* — pass raw screen/application audio to your partner (games, movies, music), or switch it off.
  - *Hear sound* — mute/unmute the incoming system audio stream.
- **Native Picture-in-Picture** for webcam and screen-share streams (browse other tabs while staying visible).
- **Floating reactions** (❤️😂😮🔥👏…) pushed over the video feeds via the P2P data channel.
- **Ephemeral rich chat** — markdown, URL auto-linking, image URL embeds and image paste. Lives only in RAM.
- **Connection diagnostics HUD** — live latency, packet loss, receive/send FPS, resolution, codec, bitrate.
- Strict **2-person capacity** per room. Live camera preview, mic/cam toggles, media status badges, chat unread count.

## Quick start (local)

Because cameras/WebRTC need a *secure context*, serve the folder over HTTP(S), not `file://`:

```bash
cd duet
python3 -m http.server 8000
# open http://localhost:8000
```

Or with Node: `npx serve duet -l 8000`. Then open two browser tabs, create a room in one and join it with the generated code in the other.

## Deploy to GitHub Pages

1. Create a GitHub repo and push this `duet` folder to it:

   ```bash
   git init
   git add .
   git commit -m "Duet video rooms"
   git branch -M main
   git remote add origin https://github.com/<you>/<repo>.git
   git push -u origin main
   ```

2. On GitHub: **Settings → Pages → Source: Deploy from a branch** → `main` / root → Save.
3. Your app is live at `https://<you>.github.io/<repo>/`. Open it on a desktop Chrome/Edge tab, initialize a vault link, and share the 6-character token with your friend.

## How the connection works

1. **Signaling** — PeerJS connects both browsers to a tiny broker only to exchange WebRTC offer/answer tokens and ICE candidates. Nothing else passes through it.
2. **P2P** — once ICE succeeds, all media and data flow directly browser-to-browser over DTLS + SRTP. The broker never sees your video.
3. **Capacity** — the host accepts exactly one data connection. A second joiner receives a *"Room is full"* notice and is closed out.

### Using your own signaling server (optional)

PeerJS uses a free public broker by default. For full control you can run your own in ~30 seconds:

```bash
npm install -g peer
peer --port 9000 --path /duet
```

Then point the frontend at it in `js/config.js`:

```js
signaling: { host: 'your-server.com', port: 443, path: '/duet', key: 'peerjs', secure: true }
```

(For a raw `http://` server use `secure: false` and port 9000; then serve the site from the same host or accept the mixed-content tradeoff.) Deployable free on Render/Railway — basic Node command, no database needed.

## Project layout

```
duet/
├── index.html        # landing / vault-link creation / join
├── room.html         # call UI: video, controls, chat, reactions, diagnostics
├── css/style.css     # glassmorphic dark theme
├── js/
│   ├── config.js     # quality profiles + signaling config (edit this)
│   ├── icons.js      # lightweight inline SVG icon set (no CDN dependency)
│   ├── peerjs.min.js # vendored signaling client (1.5.4)
│   └── room.js       # P2P engine: media, screenshare, chat, stats
└── favicon.svg
```

## Privacy & limits

- No accounts, no messages stored — chat memory dies with the tab.
- Media never touches a server, only the handshake does.
- Code-based rooms are *obscured, not authorized*: sharing the token is the access control.
- For 4K screenshare, both endpoints need strong symmetric upstream bandwidth.
- Public PeerJS brokers are rate-limited; a self-hosted broker (above) removes that for free.
- Best-in-class on **Chrome / Edge desktop**. Firefox lacks screen-share system audio.