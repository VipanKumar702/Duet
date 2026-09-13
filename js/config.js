const DUET_CONFIG = {
  signaling: {
    host: null,
    port: null,
    path: '/',
    key: 'peerjs',
    secure: true,
  },

  preferredCodec: 'VP9',

  rooms: {
    tokenLength: 6,
    chars: 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789',
    maxOccupants: 2,
  },

  camera: {
    '720': {
      label: '720p · Balanced',
      video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 60, min: 24 } },
      bitrate: 2_000_000,
    },
    '1080': {
      label: '1080p · High',
      video: { width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 60, min: 24 } },
      bitrate: 4_000_000,
    },
    '1440': {
      label: '1440p · Ultra',
      video: { width: { ideal: 2560 }, height: { ideal: 1440 }, frameRate: { ideal: 60, min: 24 } },
      bitrate: 6_500_000,
    },
  },

  screen: {
    '1080': {
      label: '1080p · 60fps',
      video: { width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 60 } },
      bitrate: 6_500_000,
    },
    '1440': {
      label: '1440p · 60fps',
      video: { width: { ideal: 2560 }, height: { ideal: 1440 }, frameRate: { ideal: 60 } },
      bitrate: 9_000_000,
    },
    '4k': {
      label: '4K · 60fps',
      video: { width: { ideal: 3840 }, height: { ideal: 2160 }, frameRate: { ideal: 60 } },
      bitrate: 14_000_000,
    },
  },

  audio: {
    enabled: true,
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
    sampleRate: 48000,
    channelCount: 1,
  },
};