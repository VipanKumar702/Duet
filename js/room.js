(() => {
  'use strict';

  const CFG = window.DUET_CONFIG || {
    camera: { '720': { bitrate: 2e6 }, '1080': { bitrate: 4e6 }, '1440': { bitrate: 6.5e6 } },
    screen: { '1080': { bitrate: 6.5e6 }, '1440': { bitrate: 9e6 }, '4k': { bitrate: 14e6 } },
  };

  const qs = new URLSearchParams(location.search);
  const ROOM = (qs.get('room') || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const IS_HOST = qs.get('host') === '1';
  if (!ROOM) { location.replace('index.html'); return; }

  const $ = id => document.getElementById(id);
  const els = {
    mainStage: $('mainStage'), remoteCam: $('remoteCam'), remoteOff: $('remoteOff'),
    remoteAvatar: $('remoteAvatar'), remoteOffName: $('remoteOffName'),
    remoteName: $('remoteName'), remoteBadges: $('remoteBadges'),
    shareView: $('shareView'), shareTag: $('shareTag'),
    pip: $('pip'), localCam: $('localCam'), localOff: $('localOff'),
    localAvatar: $('localAvatar'), localOffName: $('localOffName'), localName: $('localName'),
    sharePrev: $('sharePrev'), sharePrevVideo: $('sharePrevVideo'),
    roomCode: $('roomCode'), copyCodeTop: $('copyCodeTop'), timer: $('timer'),
    connChip: $('connChip'), connDot: $('connDot'), connLabel: $('connLabel'),
    screenBanner: $('screenBanner'), screenBannerStop: $('screenBannerStop'),
    scrQBtn: $('scrQBtn'), scrQLabel: $('scrQLabel'),
    diagToggle: $('diagToggle'), diagLabel: $('diagLabel'), diagPanel: $('diagPanel'),
    dLatency: $('dLatency'), dPktLoss: $('dPktLoss'), dFpsRecv: $('dFpsRecv'),
    dFpsSend: $('dFpsSend'), dRes: $('dRes'), dCodec: $('dCodec'),
    dBitRecv: $('dBitRecv'), dBitSend: $('dBitSend'),
    reactPop: $('reactPop'),
    micBtn: $('micBtn'), camBtn: $('camBtn'), shareBtn: $('shareBtn'), shareBadge: $('shareBadge'),
    scCtl: $('scCtl'), scSend: $('scSend'), scSendLbl: $('scSendLbl'),
    scHear: $('scHear'), scHearLbl: $('scHearLbl'),
    reactBtn: $('reactBtn'), chatBtn: $('chatBtn'), chatCount: $('chatCount'),
    pipBtn: $('pipBtn'), moreBtn: $('moreBtn'), leaveBtn: $('leaveBtn'),
    chatPanel: $('chatPanel'), chatClose: $('chatClose'), typingInd: $('typingInd'),
    chatLog: $('chatLog'), chatForm: $('chatForm'), chatInput: $('chatInput'),
    settingsModal: $('settingsModal'), nameInput: $('nameInput'),
    camQ: $('camQ'), scrQ: $('scrQ'), applySet: $('applySet'), closeSet: $('closeSet'),
    overlay: $('joinOverlay'), ovTitle: $('ovTitle'), ovSub: $('ovSub'),
    ovCodeWrap: $('ovCodeWrap'), ovCode: $('ovCode'), ovCopy: $('ovCopy'), ovAction: $('ovAction'),
    topbar: $('topbar'), toastRoot: $('toastRoot'),
  };

  const state = {
    peer: null,
    dataConn: null,
    mediaCall: null,
    screenCallLocal: null,
    screenCallRemote: null,
    pendingAnswer: null,
    localStream: null,
    localScreenStream: null,
    remoteCamStream: null,
    remoteScreenStream: null,
    name: (localStorage.getItem('duet_name') || '').trim() || 'Anon',
    partnerName: 'Partner',
    dataReady: false,
    hostAccepted: false,
    micOn: true,
    camOn: true,
    sharing: false,
    sendSysAudio: true,
    hearSysAudio: true,
    camQuality: '720',
    scrQuality: '1080',
    camRotating: false,
    timerId: 0,
    startTs: 0,
    unread: 0,
    lastTyping: 0,
    typingTimer: 0,
    pingSeq: 0,
    pingTimer: 0,
    lastPing: null,
    diagPrev: { framesRecv: 0, framesSend: 0, bytesRecv: 0, bytesSend: 0, lastTs: 0 },
    leaving: false,
    remoteVolume: 0.5,
    barHidden: false,
  };

  const REACTIONS = ['❤️', '😂', '😮', '🔥', '👏', '😍', '😎', '💯', '🎉', '🤩'];
  const defer = fn => setTimeout(fn, 0);

  /* ===================================================== */
  /*  Small helpers                                        */
  /* ===================================================== */
  const log = (...a) => console.log('[duet]', ...a);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function toast(msg) {
    const t = document.createElement('div');
    t.className = 'toast';
    t.textContent = msg;
    els.toastRoot.appendChild(t);
    setTimeout(() => t.remove(), 3200);
  }

  function setConn(label, mode) {
    els.connLabel.textContent = label;
    els.connChip.dataset.state = mode;
  }

  function attachVideo(video, stream) {
    if (video.srcObject === stream) return;
    video.srcObject = stream;
    if (stream) {
      video.play().catch(() => {
        const retry = () => { video.play().catch(() => {}); document.removeEventListener('pointerdown', retry); };
        document.addEventListener('pointerdown', retry, { once: true });
      });
    }
  }

  function setRemoteVolume(val) {
    const v = Math.max(0, Math.min(1, val));
    state.remoteVolume = v;
    if (els.remoteCam) els.remoteCam.volume = v;
    if (els.shareView) els.shareView.volume = v;
  }

  function applyLocalEnabled() {
    if (!state.localStream) return;
    state.localStream.getAudioTracks().forEach(t => { t.enabled = state.micOn; });
    state.localStream.getVideoTracks().forEach(t => { t.enabled = state.camOn; });
  }

  const afterConnected = fn => {
    if (state.dataReady && state.dataConn && state.dataConn.open) fn();
  };

  function send(obj) {
    if (state.dataConn && state.dataConn.open && !state.leaving) {
      try { state.dataConn.send(JSON.stringify(obj)); return true; } catch (e) { return false; }
    }
    return false;
  }

  function fmtTime(s) {
    s = Math.max(0, s | 0);
    return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
  }

  /* ===================================================== */
  /*  Overlay / status                                     */
  /* ===================================================== */
  function showOverlay(o) {
    els.ovTitle.textContent = o.title || '';
    els.ovSub.textContent = o.sub || '';
    els.ovCodeWrap.style.display = o.code ? 'inline-flex' : 'none';
    if (o.code) els.ovCode.textContent = o.code;
    els.ovAction.style.display = o.action ? 'inline-flex' : 'none';
    if (o.action) els.ovAction.textContent = o.action;
    els.overlay.classList.add('show');
  }
  function hideOverlay() { els.overlay.classList.remove('show'); }

  /* ===================================================== */
  /*  Codec preference (VP9 → H.264 fallback)              */
  /* ===================================================== */
  function reorderVideoCodecs(sdp, preferred) {
    if (!preferred || !sdp) return sdp;
    const sections = sdp.split(/\r?\n(?=m=)/);
    return sections.map(sec => {
      if (!/^m=video/.test(sec)) return sec;
      const lines = sec.split(/\r?\n/);
      const pts = [];
      preferred.forEach(name => {
        const re = new RegExp('a=rtpmap:(\\d+) ' + name + '(?:\\/| )');
        for (let i = 1; i < lines.length; i++) {
          const mt = lines[i].match(re);
          if (mt && !pts.includes(mt[1])) pts.push(mt[1]);
        }
      });
      if (!pts.length) return sec;
      const rest = lines[0].replace(/^m=video\s+\d+\s+[^\s]+\s+/, '');
      const order = rest.trim().split(/\s+/);
      const keep = order.filter(p => !pts.includes(p));
      const head = lines[0].slice(0, lines[0].length - rest.length);
      lines[0] = head + pts.join(' ') + (keep.length ? ' ' + keep.join(' ') : '');
      return lines.join('\r\n');
    }).join('\r\n');
  }

  function patchCodecs() {
    const prefer = ['VP9', 'H264'];
    const origOffer = RTCPeerConnection.prototype.createOffer;
    const origAnswer = RTCPeerConnection.prototype.createAnswer;
    if (origOffer) {
      RTCPeerConnection.prototype.createOffer = function (options) {
        return origOffer.call(this, options).then(o => {
          o.sdp = reorderVideoCodecs(o.sdp, prefer);
          return o;
        });
      };
    }
    if (origAnswer) {
      RTCPeerConnection.prototype.createAnswer = function (options) {
        return origAnswer.call(this, options).then(a => {
          a.sdp = reorderVideoCodecs(a.sdp, prefer);
          return a;
        });
      };
    }
  }

  function applyBitratesToCall(call, bitrate) {
    try {
      const pc = call.peerConnection;
      if (!pc || typeof pc.getSenders !== 'function') return;
      pc.getSenders().forEach(s => {
        if (!s || typeof s.getParameters !== 'function') return;
        try {
          const p = s.getParameters() || {};
          if (p.degradationPreference !== undefined) p.degradationPreference = 'balance';
          if (p.encodings) p.encodings.forEach(e => { e.maxBitrate = bitrate; });
          s.setParameters(p).catch(() => {});
        } catch (e) { /* ignore */ }
      });
    } catch (e) { /* ignore */ }
  }

  function applyBitrates() {
    if (state.mediaCall) applyBitratesToCall(state.mediaCall, CFG.camera[state.camQuality].bitrate);
  }

  function applyScreenBitrate() {
    const cfg = CFG.screen[state.scrQuality] || CFG.screen['auto'];
    const br = cfg.bitrate || 0;
    if (state.screenCallLocal) applyBitratesToCall(state.screenCallLocal, br);
  }

  /* ===================================================== */
  /*  Local media                                          */
  /* ===================================================== */
  function camVideoConstraints() {
    return CFG.camera[state.camQuality] ? CFG.camera[state.camQuality].video : CFG.camera['720'].video;
  }

  function captureCamera() {
    const v = camVideoConstraints();
    const a = Object.assign({ echoCancellation: true, noiseSuppression: true, autoGainControl: true }, CFG.audio || {});
    return navigator.mediaDevices.getUserMedia({ video: v, audio: a });
  }

  async function initLocalMedia() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return;
    try {
      const stream = await captureCamera();
      state.localStream = stream;
      const hasVid = stream.getVideoTracks().length > 0;
      const hasAud = stream.getAudioTracks().length > 0;
      state.camOn = hasVid;
      state.micOn = hasAud;
      if (hasVid) { attachVideo(els.localCam, stream); els.localOff.classList.add('hidden'); }
      if (hasAud) els.micBtn.classList.remove('off');
      if (hasVid) els.camBtn.classList.remove('off');
      confirmStart();
    } catch (e) {
      log('local media failed', e);
      els.localOff.classList.remove('hidden');
      els.localName.textContent = state.name;
      toast('Camera / mic unavailable — party continues with their video');
      confirmStart();
    }
  }

  function confirmStart() {
    answerPendingCall();
    maybeCall();
  }

  /* ===================================================== */
  /*  Peer init / signaling (PeerJS public broker)         */
  /* ===================================================== */
  function initPeer() {
    if (!window.Peer) {
      showOverlay({ title: 'Signaling library missing', sub: 'PeerJS could not be loaded (offline?).', action: 'Reload' });
      els.ovAction.onclick = () => location.reload();
      return;
    }
    const sig = CFG.signaling || {};
    const peerOpts = { debug: 1 };
    if (sig && sig.host) {
      peerOpts.host = sig.host;
      peerOpts.port = sig.port || 443;
      peerOpts.path = sig.path || '/';
      peerOpts.secure = sig.secure !== false;
      peerOpts.key = sig.key || 'peerjs';
    }
    state.peer = new Peer(IS_HOST ? ROOM : undefined, peerOpts);
    state.peer.on('open', id => log('peer open', id));
    if (IS_HOST) state.peer.on('connection', onHostConnection);
    else state.peer.on('open', () => {
      const conn = state.peer.connect(ROOM, { reliable: true });
      wireData(conn);
    });
    state.peer.on('call', onIncomingCall);
    state.peer.on('error', onPeerError);
    state.peer.on('disconnected', () => {
      if (state.dataReady) { log('peer server disconnect'); try { state.peer.reconnect(); } catch (e) { /* ignore */ } }
    });
  }

  function onHostConnection(conn) {
    if (state.hostAccepted) {
      conn.on('open', () => {
        try { conn.send(JSON.stringify({ type: 'ctrl', action: 'room-full' })); } catch (e) { /* ignore */ }
        setTimeout(() => { try { conn.close(); } catch (e) { /* ignore */ } }, 300);
      });
      return;
    }
    state.hostAccepted = true;
    wireData(conn);
  }

  function wireData(conn) {
    state.dataConn = conn;
    conn.on('open', () => {
      state.dataReady = true;
      setConn('Live', 'live');
      hideOverlay();
      startTimer();
      send({ type: 'hello', name: state.name });
      maybeCall();
    });
    conn.on('data', d => {
      let m = d;
      if (typeof m === 'string') { try { m = JSON.parse(m); } catch (e) { return; } }
      onMessage(m);
    });
    conn.on('close', onPartnerGone);
    conn.on('error', e => log('data error', e));
  }

  function maybeCall() {
    if (!state.dataReady || !state.dataConn || state.mediaCall) return;
    if (!state.localStream) return;
    const call = state.peer.call(state.dataConn.peer, state.localStream, { metadata: { type: 'cam' } });
    state.mediaCall = call;
    wireMediaCall(call, 'cam');
  }

  function onIncomingCall(call) {
    const kind = call.metadata && call.metadata.type === 'screen' ? 'screen' : 'cam';
    if (kind === 'screen') {
      call.answer();
      call.on('stream', s => {
        state.remoteScreenStream = s;
        attachVideo(els.shareView, s);
        els.shareView.volume = state.remoteVolume;
        s.getAudioTracks().forEach(t => { t.enabled = state.hearSysAudio; });
        els.shareView.style.display = 'block';
        els.shareTag.style.display = 'flex';
        updateLayout();
        renderScreenAudio();
        applyScreenBitrate();
      });
      call.on('close', remoteScreenCleanup);
      call.on('error', e => log('screen call error', e));
      els.shareTag.style.display = 'none';
    } else {
      state.pendingAnswer = { call, kind };
      answerPendingCall();
      defer(() => answerPendingCall());
    }
  }

  function answerPendingCall() {
    const p = state.pendingAnswer;
    if (!p) return;
    const { call, kind } = p;
    try {
      const doAnswer = () => {
        call.answer(state.localStream || undefined);
        wireMediaCall(call, kind);
        state.pendingAnswer = null;
      };
      if (state.localStream) doAnswer();
      else defer(doAnswer);
    } catch (e) { log('answer failed', e); }
  }

  function wireMediaCall(call, kind) {
    call.on('stream', s => {
      state.remoteCamStream = s;
      attachVideo(els.remoteCam, s);
      els.remoteCam.volume = state.remoteVolume;
      els.remoteOff.classList.add('hidden');
      refreshStatusFromTracks(s);
      updateLayout();
      applyBitrates();
    });
    call.on('close', () => {
      if (state.mediaCall === call) state.mediaCall = null;
      if (!state.remoteScreenStream) onPartnerGone();
    });
    call.on('error', e => {
      log('media error', e);
      if (state.mediaCall === call) state.mediaCall = null;
    });
  }

  function refreshStatusFromTracks(stream) {
    const v = stream.getVideoTracks()[0];
    const a = stream.getAudioTracks()[0];
    if (v) { v.onmute = () => setRemoteBadge('cam', true); v.onunmute = () => setRemoteBadge('cam', false); setRemoteBadge('cam', !v.enabled); }
    if (a) { setRemoteBadge('mic', !a.enabled); }
  }

  function setRemoteBadge(kind, on) {
    const el = els.remoteBadges.querySelector('[data-b="' + kind + '"]');
    if (el) el.classList.toggle('on', !!on);
  }

  /* ===================================================== */
  /*  Layout                                               */
  /* ===================================================== */
  function updateLayout() {
    const pShare = !!state.remoteScreenStream;
    const meShare = state.sharing;
    els.shareView.style.display = pShare ? 'block' : 'none';
    els.shareTag.style.display = pShare ? 'flex' : 'none';
    els.sharePrev.style.display = meShare ? 'block' : 'none';
    els.screenBanner.classList.toggle('show', meShare);
    els.scrQBtn.style.display = (meShare || pShare) ? '' : 'none';
    document.body.classList.toggle('sharing', meShare || pShare);
  }

  function renderScreenAudio() {
    const hasSend = state.sharing && state.localScreenStream && state.localScreenStream.getAudioTracks().length > 0;
    const hasHear = !!state.remoteScreenStream && state.remoteScreenStream.getAudioTracks().length > 0;
    els.scSend.style.display = hasSend ? 'inline-flex' : 'none';
    els.scHear.style.display = hasHear ? 'inline-flex' : 'none';
    els.scSend.classList.toggle('off', !state.sendSysAudio);
    els.scHear.classList.toggle('off', !state.hearSysAudio);
    els.scSendLbl.textContent = state.sendSysAudio ? 'System sound: ON' : 'System sound: OFF';
    els.scHearLbl.textContent = state.hearSysAudio ? 'Hearing sound' : 'Muted';
    els.scCtl.style.display = (hasSend || hasHear) ? 'flex' : 'none';
  }

  /* ===================================================== */
  /*  Screen share                                         */
  /* ===================================================== */
  async function startScreenShare() {
    if (state.sharing || state.leaving) return;
    if (!state.dataReady || !state.dataConn) { toast('Wait for your partner to connect'); return; }
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { cursor: 'always', width: { max: 3840 }, height: { max: 2160 }, frameRate: { ideal: 30, max: 60 } },
        audio: { suppressLocalAudioPlayback: false, echoCancellation: false, noiseSuppression: false, autoGainControl: false },
        preferCurrentTab: false,
        selfBrowserSurface: 'exclude',
        systemAudio: 'include',
        surfaceSwitching: 'include',
        monitorTypeSurfaces: 'include',
      });
      if (!stream || stream.getVideoTracks().length === 0) return;
      state.localScreenStream = stream;
      state.sharing = true;
      const hasAud = stream.getAudioTracks().length > 0;
      state.sendSysAudio = hasAud;
      stream.getAudioTracks().forEach(t => { t.enabled = state.sendSysAudio; });
      attachVideo(els.sharePrevVideo, stream);
      const call = state.peer.call(state.dataConn.peer, stream, { metadata: { type: 'screen' } });
      state.screenCallLocal = call;
      call.on('error', e => { log('local share error', e); stopScreenShare(); });
      call.on('close', () => { if (state.sharing) stopScreenShare(); });
      stream.getVideoTracks()[0].addEventListener('ended', () => { if (state.sharing) stopScreenShare(); });
      els.shareBtn.classList.add('on');
      els.shareBadge.classList.add('show');
      updateLayout();
      renderScreenAudio();
      applyScreenBitrate();
      send({ type: 'ctrl', action: 'share-on' });
      toast('Presenting — system audio ' + (hasAud ? 'included' : 'check "Share audio" in picker'));
    } catch (e) {
      log('share cancelled', e);
      if (e && e.name === 'NotAllowedError') toast('Screen share cancelled');
      else toast('Screen share unavailable in this browser');
    }
  }

  function stopScreenShare() {
    if (!state.sharing) return;
    state.sharing = false;
    if (state.screenCallLocal) { try { state.screenCallLocal.close(); } catch (e) { /* ignore */ } state.screenCallLocal = null; }
    if (state.localScreenStream) { state.localScreenStream.getTracks().forEach(t => { try { t.stop(); } catch (e) { /* ignore */ } }); state.localScreenStream = null; }
    els.sharePrevVideo.srcObject = null;
    els.shareBtn.classList.remove('on');
    els.shareBadge.classList.remove('show');
    updateLayout();
    renderScreenAudio();
    send({ type: 'ctrl', action: 'share-off' });
  }

  function remoteScreenCleanup() {
    state.remoteScreenStream = null;
    state.screenCallRemote = null;
    els.shareView.srcObject = null;
    els.shareView.style.display = 'none';
    els.shareTag.style.display = 'none';
    updateLayout();
    renderScreenAudio();
  }

  /* ===================================================== */
  /*  Message routing (data channel)                       */
  /* ===================================================== */
  function onMessage(m) {
    if (!m || !m.type) return;
    switch (m.type) {
      case 'hello':
        state.partnerName = (m.name || 'Partner').slice(0, 24);
        renderPartner();
        break;
      case 'chat':
        if (els.chatPanel.classList.contains('open')) renderChat(m, false);
        else { state.unread++; els.chatCount.textContent = state.unread; els.chatCount.classList.add('show'); }
        break;
      case 'reaction':
        popEmoji(m.emoji, els.mainStage);
        break;
      case 'typing':
        typingOn();
        break;
      case 'ping':
        send({ type: 'pong', seq: m.seq });
        break;
      case 'pong':
        if (m.seq === state.pingSeq && state.pingTs) state.lastPing = Date.now() - state.pingTs;
        els.diagLabel.textContent = (state.lastPing === null || state.lastPing === undefined) ? '--' : Math.round(state.lastPing) + ' ms';
        break;
      case 'ctrl':
        handleCtrl(m.action);
        break;
    }
  }

  function handleCtrl(a) {
    switch (a) {
      case 'mic-off': setRemoteBadge('mic', true); break;
      case 'mic-on': setRemoteBadge('mic', false); break;
      case 'cam-off': setRemoteBadge('cam', true); els.remoteOff.classList.remove('hidden'); break;
      case 'cam-on': setRemoteBadge('cam', false); els.remoteOff.classList.add('hidden'); break;
      case 'share-on': toast(state.partnerName + ' started presenting'); break;
      case 'share-off': toast(state.partnerName + ' stopped presenting'); break;
      case 'room-full':
        showOverlay({ title: 'Room is full', sub: 'This room already has 2 people (vault privacy). Try a code from your partner or create a new room.', action: 'Back home' });
        els.ovAction.onclick = () => location.replace('index.html');
        break;
      case 'leave':
        defer(onPartnerGone);
        break;
    }
  }

  function renderPartner() {
    els.remoteName.textContent = state.partnerName;
    els.remoteOffName.textContent = state.partnerName;
    els.remoteAvatar.textContent = state.partnerName.charAt(0).toUpperCase();
  }

  /* ===================================================== */
  /*  Reactions                                            */
  /* ===================================================== */
  function buildReactions() {
    const grid = document.createElement('div');
    grid.className = 'react-grid';
    REACTIONS.forEach((e, i) => {
      const b = document.createElement('button');
      b.className = 'r-btn';
      b.textContent = e;
      b.style.animationDelay = (i * 0.02) + 's';
      b.addEventListener('click', () => {
        send({ type: 'reaction', emoji: e });
        popEmoji(e, els.mainStage);
        els.reactPop.classList.remove('show');
      });
      grid.appendChild(b);
    });
    els.reactPop.appendChild(grid);
    els.reactBtn.addEventListener('click', e => {
      e.stopPropagation();
      els.reactPop.classList.toggle('show');
    });
    document.addEventListener('click', e => {
      if (!els.reactPop.contains(e.target) && !els.reactBtn.contains(e.target)) els.reactPop.classList.remove('show');
    });
  }

  function popEmoji(emoji, container) {
    if (!emoji) return;
    const el = document.createElement('span');
    el.className = 'float-emoji';
    el.textContent = emoji;
    el.style.left = (10 + Math.random() * 60) + '%';
    el.style.fontSize = (30 + Math.random() * 32) + 'px';
    container.appendChild(el);
    setTimeout(() => el.remove(), 1950);
  }

  /* ===================================================== */
  /*  Rich chat                                            */
  /* ===================================================== */
  function renderMarkdown(text) {
    let h = esc(text);
    h = h.replace(/^### (.*)$/gm, '<h3>$1</h3>');
    h = h.replace(/^## (.*)$/gm, '<h2>$1</h2>');
    h = h.replace(/^# (.*)$/gm, '<h1>$1</h1>');
    h = h.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
    h = h.replace(/\*([^*\n]+)\*/g, '<i>$1</i>');
    h = h.replace(/`([^`\n]+)`/g, '<code>$1</code>');
    h = h.replace(/^[-*]\s+/gm, '<span class="bullet">• </span>');
    h = linkify(h.replace(/\r\n/g, '\n').split('\n').map(l => l.trim()).join('\n')).replace(/\n/g, '<br/>');
    return h;
  }

  function linkify(h) {
    const imgRe = /!\[[^\]]*\]\((https?:\/\/[^)\s]+\.(?:png|jpe?g|gif|webp|svg|avif)(?:\?[^)\s]*)?)\)/gi;
    h = h.replace(imgRe, (m, u) => '<img src="' + u + '" loading="lazy" referrerpolicy="no-referrer"/>');
    const linkRe = /(https?:\/\/[^\s<]+)/g;
    h = h.replace(linkRe, (m, u) => {
      const c = u.replace(/[),.]+$/g, '');
      return '<a href="' + c + '" target="_blank" rel="noopener noreferrer">' + c + '</a>';
    });
    return h;
  }

  function timeLabel(ts) {
    return new Date(ts || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  function renderChat(m, mine) {
    const wrap = document.createElement('div');
    wrap.className = 'msg ' + (mine ? 'mine' : 'theirs');
    const meta = document.createElement('div');
    meta.className = 'meta';
    meta.innerHTML = '<b>' + (mine ? 'You' : esc(m.name || state.partnerName)) + '</b><span>' + timeLabel(m.ts) + '</span>';
    const body = document.createElement('div');
    body.className = 'body';
    if (m.image) {
      const img = document.createElement('img');
      img.src = m.image;
      img.loading = 'lazy';
      body.appendChild(img);
    } else {
      body.innerHTML = renderMarkdown(m.text);
    }
    wrap.appendChild(meta);
    wrap.appendChild(body);
    els.chatLog.appendChild(wrap);
    els.chatLog.scrollTop = els.chatLog.scrollHeight;
  }

  function pushChat(arg, pasteAsImage) {
    let text = arg;
    let payload = { type: 'chat', text, name: state.name, ts: Date.now() };
    if (pasteAsImage) {
      payload = { type: 'chat', text: '', image: arg, name: state.name, ts: Date.now() };
    }
    send(payload);
    renderChat(payload, true);
  }

  function systemMsg(t) {
    const el = document.createElement('div');
    el.className = 'sys-msg';
    el.textContent = t;
    els.chatLog.appendChild(el);
    els.chatLog.scrollTop = els.chatLog.scrollHeight;
  }

  function typingOn() {
    els.typingInd.classList.add('show');
    clearTimeout(state.typingTimer);
    state.typingTimer = setTimeout(() => els.typingInd.classList.remove('show'), 1800);
  }

  function toggleChat(force) {
    const open = force === undefined ? !els.chatPanel.classList.contains('open') : force;
    els.chatPanel.classList.toggle('open', open);
    els.chatBtn.classList.toggle('active', open);
    if (open) { state.unread = 0; els.chatCount.classList.remove('show'); }
  }

  /* ===================================================== */
  /*  Picture-in-Picture                                   */
  /* ===================================================== */
  function activeMainVideo() {
    return els.shareView.style.display !== 'none' ? els.shareView : els.remoteCam;
  }

  function togglePip() {
    const target = activeMainVideo();
    if (document.pictureInPictureElement) {
      document.exitPictureInPicture().catch(() => {});
      return;
    }
    if (target.requestPictureInPicture) {
      target.requestPictureInPicture().catch(() => toast('PiP not supported here'));
    }
  }

  function attachPipUi(video, btn) {
    if (!video || !btn) return;
    video.addEventListener('enterpictureinpicture', () => btn.classList.add('on'));
    video.addEventListener('leavepictureinpicture', () => btn.classList.remove('on'));
  }

  /* ===================================================== */
  /*  Diagnostics                                          */
  /* ===================================================== */
  function mapGet(report, id) {
    if (!id) return null;
    try { if (typeof report.get === 'function') return report.get(id); } catch (e) { /* ignore */ }
    if (Array.isArray(report)) return report.find(x => x.id === id) || null;
    return null;
  }

  async function collectStats() {
    if (!state.dataReady) return;
    const conns = [state.mediaCall, state.screenCallRemote, state.screenCallLocal].filter(Boolean);
    const agg = { pktLost: 0, pktSent: 0, framesRecv: 0, framesSend: 0, bytesRecv: 0, bytesSend: 0, jitter: 0, resW: 0, resH: 0, codec: '' };
    for (const c of conns) {
      let pc;
      try { pc = c.peerConnection; } catch (e) { continue; }
      if (!pc || typeof pc.getStats !== 'function') continue;
      let report;
      try { report = await pc.getStats(); } catch (e) { continue; }
      report.forEach(r => {
        if (r.type === 'inbound-rtp' && r.kind === 'video') {
          agg.pktLost += r.packetsLost || 0;
          agg.jitter = Math.max(agg.jitter, (r.jitter || 0) * 1000);
          agg.framesRecv += r.framesDecoded || 0;
          agg.bytesRecv += r.bytesReceived || 0;
          agg.resW = Math.max(agg.resW, r.frameWidth || 0);
          agg.resH = Math.max(agg.resH, r.frameHeight || 0);
          const cobj = mapGet(report, r.codecId);
          if (cobj && cobj.mimeType && !agg.codec) agg.codec = cobj.mimeType;
        } else if (r.type === 'outbound-rtp' && r.kind === 'video') {
          agg.framesSend += r.framesSent || 0;
          agg.bytesSend += r.bytesSent || 0;
          agg.pktSent += r.packetsSent || 0;
        }
      });
    }
    const now = Date.now();
    const dt = (now - (state.diagPrev.lastTs || now)) / 1000;
    const fpsR = dt > 0 ? Math.round((agg.framesRecv - state.diagPrev.framesRecv) / dt) : 0;
    const fpsS = dt > 0 ? Math.round((agg.framesSend - state.diagPrev.framesSend) / dt) : 0;
    const bR = dt > 0 ? Math.round(((agg.bytesRecv - state.diagPrev.bytesRecv) * 8) / dt) : 0;
    const bS = dt > 0 ? Math.round(((agg.bytesSend - state.diagPrev.bytesSend) * 8) / dt) : 0;
    const tot = agg.pktSent + agg.pktLost;
    const lossPct = tot > 0 ? (agg.pktLost / tot) * 100 : state.lastLoss || 0;
    state.diagPrev = { framesRecv: agg.framesRecv, framesSend: agg.framesSend, bytesRecv: agg.bytesRecv, bytesSend: agg.bytesSend, lastTs: now };
    state.lastLoss = lossPct;
    state.lastDiag = { latency: state.lastPing, loss: lossPct, fpsR, fpsS, resW: agg.resW, resH: agg.resH, codec: agg.codec, bR, bS, jitter: agg.jitter };
    renderDiag();
  }

  function renderDiag() {
    const d = state.lastDiag;
    if (!d) return;
    els.dLatency.textContent = (d.latency === null || d.latency === undefined) ? '--' : Math.round(d.latency) + ' ms';
    els.dPktLoss.textContent = d.loss.toFixed(2) + '%';
    els.dFpsRecv.textContent = (d.fpsR || 0) + ' fps';
    els.dFpsSend.textContent = (d.fpsS || 0) + ' fps';
    els.dRes.textContent = (d.resW ? d.resW + '×' + d.resH : '--');
    els.dCodec.textContent = d.codec || '--';
    els.dBitRecv.textContent = fmtKbps(d.bR) || '--';
    els.dBitSend.textContent = fmtKbps(d.bS) || '--';
  }

  function fmtKbps(bits) {
    if (!bits) return '0 kbps';
    return bits > 1e6 ? (bits / 1e6).toFixed(2) + ' Mbps' : Math.round(bits / 1e3) + ' kbps';
  }

  function sendPing() {
    if (!state.dataReady) return;
    state.pingTs = Date.now();
    send({ type: 'ping', seq: ++state.pingSeq, ts: state.pingTs });
  }

  /* ===================================================== */
  /*  Timer                                                */
  /* ===================================================== */
  function startTimer() {
    state.startTs = Date.now();
    clearInterval(state.timerId);
    state.timerId = setInterval(() => {
      els.timer.textContent = fmtTime((Date.now() - state.startTs) / 1000);
    }, 1000);
  }

  /* ===================================================== */
  /*  Settings                                             */
  /* ===================================================== */
  function buildSettingsSelects() {
    Object.keys(CFG.camera || {}).forEach(k => {
      const o = document.createElement('option');
      o.value = k;
      o.textContent = (CFG.camera[k] && CFG.camera[k].label) || k;
      els.camQ.appendChild(o);
    });
    Object.keys(CFG.screen || {}).forEach(k => {
      const o = document.createElement('option');
      o.value = k;
      o.textContent = (CFG.screen[k] && CFG.screen[k].label) || k;
      els.scrQ.appendChild(o);
    });
  }

  async function recaptureCamera() {
    if (state.camRotating) { toast('Camera is still switching — hang on'); return; }
    state.camRotating = true;
    try {
      const stream = await captureCamera();
      const newVid = stream.getVideoTracks()[0];
      const newAud = stream.getAudioTracks()[0];
      const oldVids = state.localStream ? state.localStream.getVideoTracks() : [];
      const oldAuds = state.localStream ? state.localStream.getAudioTracks() : [];
      oldVids.forEach(t => { try { t.stop(); } catch (e) { /* ignore */ } });
      oldAuds.forEach(t => { try { t.stop(); } catch (e) { /* ignore */ } });
      if (!state.localStream) state.localStream = new MediaStream();
      state.localStream.getVideoTracks().slice().forEach(t => state.localStream.removeTrack(t));
      state.localStream.getAudioTracks().slice().forEach(t => state.localStream.removeTrack(t));
      if (newVid) state.localStream.addTrack(newVid);
      if (newAud) state.localStream.addTrack(newAud);
      applyLocalEnabled();
      attachVideo(els.localCam, state.localStream);
      if (state.localStream.getVideoTracks().length) {
        els.camBtn.classList.remove('off');
        els.localOff.classList.add('hidden');
      }
      if (state.mediaCall) {
        try {
          const pc = state.mediaCall.peerConnection;
          const s = pc && pc.getSenders().find(x => x.track && x.track.kind === 'video');
          if (s && newVid) await s.replaceTrack(newVid);
        } catch (e) { log('replaceTrack failed', e); }
      }
      if (state.mediaCall) applyBitratesToCall(state.mediaCall, CFG.camera[state.camQuality].bitrate);
    } catch (e) {
      log('recapture failed', e);
      toast('Could not switch camera quality');
    }
    state.camRotating = false;
  }

  /* ===================================================== */
  /*  Partner gone / error                                 */
  /* ===================================================== */
  function onPartnerGone() {
    if (state.leaving) return;
    state.dataReady = false;
    state.hostAccepted = false;
    state.dataConn = null;
    state.mediaCall = null;
    clearInterval(state.pingTimer);
    setConn('Disconnected', 'off');
    if (state.remoteCamStream) { state.remoteCamStream.getTracks().forEach(t => t.stop()); state.remoteCamStream = null; }
    els.remoteCam.srcObject = null;
    els.remoteOff.classList.remove('hidden');
    if (state.remoteScreenStream) remoteScreenCleanup();
    showOverlay({
      title: 'Partner left',
      sub: 'Your vault link is still open. Share the code again so they can rejoin.',
      code: ROOM,
      action: 'Rejoin room',
    });
    els.ovAction.onclick = () => location.reload();
  }

  function onPeerError(err) {
    log('peer error', err);
    if (state.leaving) return;
    if (err.type === 'unavailable-id') {
      showOverlay({
        title: IS_HOST ? 'Room code in use' : 'Room not found',
        sub: IS_HOST
          ? 'This vault token is already active somewhere else.'
          : 'No active room matches that code. Check the 6 characters with your partner.',
        action: 'Back home',
      });
      els.ovAction.onclick = () => location.replace('index.html');
    } else if (err.type === 'peer-unavailable') {
      showOverlay({ title: 'Room not found', sub: 'Nobody is waiting on that code right now.', action: 'Back home' });
      els.ovAction.onclick = () => location.replace('index.html');
    } else if (err.type === 'browser-incompatible') {
      toast('Browser does not support WebRTC');
    } else if (err.type === 'network') {
      toast('Signaling network error — retrying…');
    }
  }

  /* ===================================================== */
  /*  Lifecycle                                            */
  /* ===================================================== */
  async function leaveCall() {
    if (state.leaving) return;
    state.leaving = true;
    send({ type: 'ctrl', action: 'leave' });
    await new Promise(r => setTimeout(r, 120));
    cleanupAll();
    location.replace('index.html');
  }

  function cleanupAll() {
    clearInterval(state.timerId);
    clearInterval(state.pingTimer);
    [state.localStream, state.localScreenStream, state.remoteCamStream, state.remoteScreenStream].forEach(s => {
      if (s) s.getTracks().forEach(t => { try { t.stop(); } catch (e) { /* ignore */ } });
    });
    [state.screenCallLocal, state.screenCallRemote, state.mediaCall].forEach(c => {
      if (c) { try { c.close(); } catch (e) { /* ignore */ } }
    });
    if (state.dataConn) { try { state.dataConn.close(); } catch (e) { /* ignore */ } }
    if (state.peer) { try { state.peer.destroy(); } catch (e) { /* ignore */ } }
  }

  window.addEventListener('beforeunload', () => {
    if (state.dataReady) send({ type: 'ctrl', action: 'leave' });
  });

  /* ===================================================== */
  /*  Static bindings                                      */
  /* ===================================================== */
  function bind() {
    els.micBtn.addEventListener('click', () => {
      state.micOn = !state.micOn;
      if (state.localStream) state.localStream.getAudioTracks().forEach(t => { t.enabled = state.micOn; });
      els.micBtn.classList.toggle('off', !state.micOn);
      send({ type: 'ctrl', action: state.micOn ? 'mic-on' : 'mic-off' });
    });

    els.camBtn.addEventListener('click', () => {
      state.camOn = !state.camOn;
      if (state.localStream) state.localStream.getVideoTracks().forEach(t => { t.enabled = state.camOn; });
      els.camBtn.classList.toggle('off', !state.camOn);
      els.localOff.classList.toggle('hidden', state.camOn);
      send({ type: 'ctrl', action: state.camOn ? 'cam-on' : 'cam-off' });
    });

    els.shareBtn.addEventListener('click', () => {
      if (state.sharing) stopScreenShare();
      else startScreenShare().catch(() => {});
    });

    els.scrQBtn.addEventListener('click', () => {
      const keys = Object.keys(CFG.screen);
      const idx = keys.indexOf(state.scrQuality);
      state.scrQuality = keys[(idx + 1) % keys.length];
      els.scrQLabel.textContent = CFG.screen[state.scrQuality].label;
      if (els.scrQ.value !== state.scrQuality) els.scrQ.value = state.scrQuality;
      if (state.sharing) {
        stopScreenShare();
        defer(() => startScreenShare().catch(() => {}));
      } else if (state.remoteScreenStream) {
        applyScreenBitrate();
      }
      toast('Screen quality: ' + CFG.screen[state.scrQuality].label);
    });

    els.screenBannerStop.addEventListener('click', () => stopScreenShare());

    els.scSend.addEventListener('click', () => {
      state.sendSysAudio = !state.sendSysAudio;
      if (state.localScreenStream) state.localScreenStream.getAudioTracks().forEach(t => { t.enabled = state.sendSysAudio; });
      els.scSend.classList.toggle('off', !state.sendSysAudio);
      els.scSendLbl.textContent = state.sendSysAudio ? 'System sound: ON' : 'System sound: OFF';
    });

    els.scHear.addEventListener('click', () => {
      state.hearSysAudio = !state.hearSysAudio;
      if (state.remoteScreenStream) state.remoteScreenStream.getAudioTracks().forEach(t => { t.enabled = state.hearSysAudio; });
      els.scHear.classList.toggle('off', !state.hearSysAudio);
      els.scHearLbl.textContent = state.hearSysAudio ? 'Hearing sound' : 'Muted';
    });

    els.chatBtn.addEventListener('click', () => toggleChat());
    els.chatClose.addEventListener('click', () => toggleChat(false));

    els.chatForm.addEventListener('submit', e => {
      e.preventDefault();
      const t = els.chatInput.value.trim();
      if (!t) return;
      pushChat(t, false);
      els.chatInput.value = '';
      els.chatInput.focus();
    });

    els.chatInput.addEventListener('input', () => {
      const now = Date.now();
      if (now - state.lastTyping > 1200) { state.lastTyping = now; send({ type: 'typing' }); }
    });

    els.chatInput.addEventListener('paste', e => {
      const items = (e.clipboardData && e.clipboardData.items) || [];
      for (const item of items) {
        if (item.type && item.type.indexOf('image') === 0) {
          e.preventDefault();
          const file = item.getAsFile();
          if (!file) return;
          const reader = new FileReader();
          reader.onload = () => pushChat(reader.result, true);
          reader.readAsDataURL(file);
          return;
        }
      }
    });

    els.pipBtn.addEventListener('click', togglePip);

    els.leaveBtn.addEventListener('click', leaveCall);

    els.copyCodeTop.addEventListener('click', () => {
      navigator.clipboard.writeText(ROOM).then(() => toast('Room code copied'));
    });
    els.ovCopy.addEventListener('click', () => {
      navigator.clipboard.writeText(ROOM).then(() => toast('Room code copied'));
    });

    els.moreBtn.addEventListener('click', openSettings);
    els.closeSet.addEventListener('click', () => els.settingsModal.classList.remove('show'));
    els.settingsModal.addEventListener('click', e => { if (e.target === els.settingsModal) els.settingsModal.classList.remove('show'); });
    els.applySet.addEventListener('click', applySettings);

    els.diagToggle.addEventListener('click', () => {
      els.diagPanel.style.display = els.diagPanel.style.display === 'block' ? 'none' : 'block';
    });

    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        els.reactPop.classList.remove('show');
        els.settingsModal.classList.remove('show');
        els.diagPanel.style.display = 'none';
        toggleChat(false);
      }
    });

    const autoplayUnlock = () => {
      [els.remoteCam, els.shareView].forEach(v => { if (v.srcObject) v.play().catch(() => {}); });
    };
    document.addEventListener('pointerdown', autoplayUnlock, { once: false });

    attachPipUi(els.remoteCam, els.pipBtn);
    attachPipUi(els.shareView, els.pipBtn);
    attachPipUi(els.localCam, els.pipBtn);
  }

  function openSettings() {
    els.nameInput.value = state.name;
    if (els.camQ.value !== state.camQuality && els.camQ.querySelector('option[value="' + state.camQuality + '"]')) els.camQ.value = state.camQuality;
    if (els.scrQ.value !== state.scrQuality && els.scrQ.querySelector('option[value="' + state.scrQuality + '"]')) els.scrQ.value = state.scrQuality;
    els.settingsModal.classList.add('show');
  }

  async function applySettings() {
    const n = els.nameInput.value.trim();
    if (n && n !== state.name) {
      state.name = n.slice(0, 20);
      localStorage.setItem('duet_name', state.name);
      els.localName.textContent = state.name;
      els.localOffName.textContent = state.name;
      send({ type: 'hello', name: state.name });
    }
    if (els.camQ.value !== state.camQuality) {
      state.camQuality = els.camQ.value;
      await recaptureCamera();
    }
    if (els.scrQ.value !== state.scrQuality) {
      state.scrQuality = els.scrQ.value;
      els.scrQLabel.textContent = CFG.screen[state.scrQuality].label;
      if (state.sharing) { stopScreenShare(); defer(() => startScreenShare().catch(() => {})); }
      else if (state.remoteScreenStream) applyScreenBitrate();
    }
    els.settingsModal.classList.remove('show');
    toast('Settings applied');
  }

  /* ===================================================== */
  /*  PiP drag + resize                                    */
  /* ===================================================== */
  function initPipDragResize() {
    const pip = els.pip;
    const handle = document.getElementById('pipResizeHandle');
    if (!pip || !handle) return;

    let isDragging = false, isResizing = false;
    let startX, startY, startLeft, startTop, startW, startH;
    const MIN_W = 100, MAX_W = 500;

    function onPointerDown(e) {
      if (e.target === handle) {
        isResizing = true;
        startX = e.clientX; startY = e.clientY;
        const r = pip.getBoundingClientRect();
        startW = r.width; startH = r.height;
      } else if (e.target.closest('.pip') && !e.target.closest('.cam-label') && !e.target.closest('.pip-resize-handle')) {
        isDragging = true;
        pip.classList.add('dragging');
        startX = e.clientX; startY = e.clientY;
        const r = pip.getBoundingClientRect();
        startLeft = r.left; startTop = r.top;
      }
      if (isDragging || isResizing) {
        e.preventDefault();
        document.addEventListener('pointermove', onPointerMove);
        document.addEventListener('pointerup', onPointerUp);
      }
    }

    function onPointerMove(e) {
      if (isDragging) {
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        pip.style.right = 'auto';
        pip.style.left = Math.max(0, Math.min(window.innerWidth - pip.offsetWidth, startLeft + dx)) + 'px';
        pip.style.top = Math.max(0, Math.min(window.innerHeight - pip.offsetHeight, startTop + dy)) + 'px';
        pip.style.bottom = 'auto';
      } else if (isResizing) {
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        const newW = Math.max(MIN_W, Math.min(MAX_W, startW + dx));
        const newH = newW * (9 / 16);
        pip.style.width = newW + 'px';
        pip.style.height = newH + 'px';
        pip.style.aspectRatio = 'auto';
      }
    }

    function onPointerUp() {
      isDragging = false;
      isResizing = false;
      pip.classList.remove('dragging');
      document.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('pointerup', onPointerUp);
    }

    pip.addEventListener('pointerdown', onPointerDown);
  }

  /* ===================================================== */
  /*  Volume control                                       */
  /* ===================================================== */
  function initVolumeControl() {
    const wrap = document.createElement('div');
    wrap.className = 'vol-wrap';
    wrap.id = 'volWrap';
    wrap.innerHTML = '<i data-lucide="volume-2"></i><input type="range" id="volSlider" min="0" max="1" step="0.05" value="0.5"/>';
    document.getElementById('app').appendChild(wrap);
    initIcons();

    const slider = document.getElementById('volSlider');
    if (slider) {
      slider.value = state.remoteVolume;
      slider.addEventListener('input', () => setRemoteVolume(parseFloat(slider.value)));
    }

    els.camBtn.addEventListener('dblclick', () => {
      wrap.classList.toggle('show');
    });
  }

  /* ===================================================== */
  /*  Top bar hide / show                                  */
  /* ===================================================== */
  function initTopBarHide() {
    const topbar = document.getElementById('topbar');
    const btn = document.getElementById('hideBarBtn');
    if (!topbar || !btn) return;

    btn.addEventListener('click', () => {
      state.barHidden = !state.barHidden;
      if (state.barHidden) {
        topbar.classList.remove('show-mode');
        topbar.classList.add('hide-mode');
        btn.classList.add('collapsed');
      } else {
        topbar.classList.remove('hide-mode');
        topbar.classList.add('show-mode');
        btn.classList.remove('collapsed');
      }
    });

    topbar.addEventListener('mouseenter', () => {
      if (state.barHidden) {
        topbar.classList.remove('hide-mode');
        topbar.classList.add('show-mode');
      }
    });
    topbar.addEventListener('mouseleave', () => {
      if (state.barHidden) {
        topbar.classList.remove('show-mode');
        topbar.classList.add('hide-mode');
      }
    });
  }

  /* ===================================================== */
  /*  Init                                                 */
  /* ===================================================== */
  function init() {
    initIcons();
    patchCodecs();
    buildSettingsSelects();
    buildReactions();
    bind();
    initPipDragResize();
    initVolumeControl();
    initTopBarHide();

    document.title = 'Duet · ' + ROOM;
    els.roomCode.textContent = ROOM;
    els.localName.textContent = state.name;
    els.localOffName.textContent = state.name;
    els.localAvatar.textContent = state.name.charAt(0).toUpperCase();
    els.scrQLabel.textContent = CFG.screen[state.scrQuality].label;

    if (IS_HOST) {
      showOverlay({
        title: 'Vault link initialized',
        sub: 'Share this 6-character token with exactly one person. The call starts the moment they join.',
        code: ROOM,
      });
    } else {
      showOverlay({ title: 'Connecting to vault…', sub: 'Contacting room ' + ROOM + ' over the signaling broker.' });
    }

    initLocalMedia();
    initPeer();

    setInterval(collectStats, 4000);
    setInterval(sendPing, 10000);
  }

  init();
})();