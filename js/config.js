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
      label: '720p',
      video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 24, max: 24 } },
      bitrate: 800_000,
    },
    '1080': {
      label: '1080p',
      video: { width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 24, max: 24 } },
      bitrate: 1_500_000,
    },
    '1440': {
      label: '1440p',
      video: { width: { ideal: 2560 }, height: { ideal: 1440 }, frameRate: { ideal: 20, max: 20 } },
      bitrate: 2_500_000,
    },
  },

  screen: {
    'auto': {
      label: 'Auto (native)',
      video: {},
      bitrate: 0,
    },
    '1080': {
      label: '1080p',
      video: {},
      bitrate: 2_000_000,
    },
    '1440': {
      label: '1440p',
      video: {},
      bitrate: 3_500_000,
    },
    '4k': {
      label: '4K',
      video: {},
      bitrate: 6_000_000,
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
