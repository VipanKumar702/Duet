(() => {
  initIcons();

  const CFG = window.DUET_CONFIG || { rooms: { chars: 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' } };
  const byId = id => document.getElementById(id);

  const nameInput = byId('nameInput');
  const codeInput = byId('codeInput');
  const createBtn = byId('createBtn');
  const joinBtn = byId('joinBtn');
  const sampleCode = byId('sampleCode');
  const vaultImage = document.querySelector('.vault-img');
  const vaultCam = byId('vaultCam');
  const vaultGhost = byId('vaultGhost');
  const vaultChip = byId('vaultCamChip');

  const genToken = () => {
    const chars = CFG.rooms.chars;
    let c = '', i = 0;
    for (; i < (CFG.rooms.tokenLength || 6); i++) c += chars[Math.floor(Math.random() * chars.length)];
    return c;
  };

  sampleCode.textContent = genToken();

  const clean = v => v.toUpperCase().replace(/[^A-Z0-9]/g, '');
  codeInput.addEventListener('input', () => { codeInput.value = clean(codeInput.value).slice(0, 6); });

  const saved = localStorage.getItem('duet_name');
  if (saved) nameInput.value = saved;

  const saveName = () => {
    const n = ((nameInput.value || 'Anon').trim()).slice(0, 20);
    localStorage.setItem('duet_name', n);
    return n;
  };

  function toastEl(msg) {
    let root = byId('toastRoot');
    if (!root) { root = document.createElement('div'); root.id = 'toastRoot'; document.body.appendChild(root); }
    const t = document.createElement('div');
    t.className = 'toast';
    t.textContent = msg;
    root.appendChild(t);
    setTimeout(() => t.remove(), 3200);
  }

  let previewStream = null;

  function stopPreview() {
    if (previewStream) { previewStream.getTracks().forEach(t => t.stop()); previewStream = null; }
    vaultCam.srcObject = null;
    vaultCam.classList.add('hidden');
    vaultGhost.classList.remove('hidden');
    vaultChip.style.display = 'none';
    vaultImage.classList.remove('live');
  }

  function togglePreview() {
    if (previewStream) { stopPreview(); return; }
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { toastEl('Camera not available in this browser'); return; }
    navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } }, audio: false })
      .then(stream => {
        previewStream = stream;
        vaultCam.srcObject = stream;
        vaultCam.play().catch(() => {});
        vaultCam.classList.remove('hidden');
        vaultGhost.classList.add('hidden');
        vaultChip.style.display = '';
        vaultImage.classList.add('live');
      })
      .catch(() => toastEl('Camera permission denied'));
  }

  vaultImage.addEventListener('click', togglePreview);

  createBtn.addEventListener('click', () => {
    saveName();
    const token = genToken();
    stopPreview();
    location.href = 'room.html?room=' + token + '&host=1';
  });

  const join = () => {
    const code = clean(codeInput.value);
    if (code.length !== 6) {
      codeInput.classList.remove('shake');
      void codeInput.offsetWidth;
      codeInput.classList.add('shake');
      codeInput.focus();
      return;
    }
    saveName();
    stopPreview();
    location.href = 'room.html?room=' + code;
  };

  joinBtn.addEventListener('click', join);
  codeInput.addEventListener('keydown', e => { if (e.key === 'Enter') join(); });
  nameInput.addEventListener('keydown', e => { if (e.key === 'Enter') createBtn.click(); });
  window.addEventListener('beforeunload', stopPreview);
})();