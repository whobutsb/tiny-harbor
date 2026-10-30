// audio.js — procedural WebAudio: surf wash, wind, and a distant harbor bell. Off by default.
export function createAudio() {
  let ctx = null, master = null, started = false;
  let noiseBuf = null;

  function makeNoise(c) {
    const len = c.sampleRate * 2;
    const b = c.createBuffer(1, len, c.sampleRate);
    const d = b.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) { // brown-ish noise
      const w = Math.random() * 2 - 1;
      last = (last + 0.02 * w) / 1.02;
      d[i] = last * 3.5;
    }
    return b;
  }

  function start() {
    if (started) return;
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = 0.0;
    master.connect(ctx.destination);
    noiseBuf = makeNoise(ctx);

    // surf: low-passed noise with a slow wash LFO
    const surf = ctx.createBufferSource(); surf.buffer = noiseBuf; surf.loop = true;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 420; lp.Q.value = 0.6;
    const surfG = ctx.createGain(); surfG.gain.value = 0.5;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.13;
    const lfoG = ctx.createGain(); lfoG.gain.value = 0.32;
    lfo.connect(lfoG).connect(surfG.gain);
    surf.connect(lp).connect(surfG).connect(master);

    // wind: band-passed noise, slowly wandering gain
    const wind = ctx.createBufferSource(); wind.buffer = noiseBuf; wind.loop = true;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 700; bp.Q.value = 0.8;
    const windG = ctx.createGain(); windG.gain.value = 0.12;
    const wlfo = ctx.createOscillator(); wlfo.frequency.value = 0.06;
    const wlfoG = ctx.createGain(); wlfoG.gain.value = 0.08;
    wlfo.connect(wlfoG).connect(windG.gain);
    wind.connect(bp).connect(windG).connect(master);

    surf.start(); wind.start(); lfo.start(); wlfo.start();

    // distant bell every ~11 s
    function bell() {
      if (!ctx) return;
      const t = ctx.currentTime + 0.05;
      for (const [f, g] of [[392, 0.06], [588, 0.03], [784, 0.015]]) {
        const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f;
        const gn = ctx.createGain();
        gn.gain.setValueAtTime(0, t);
        gn.gain.linearRampToValueAtTime(g, t + 0.012);
        gn.gain.exponentialRampToValueAtTime(0.0001, t + 4.5);
        o.connect(gn).connect(master);
        o.start(t); o.stop(t + 5);
      }
    }
    const bellTimer = setInterval(bell, 11000);
    setTimeout(bell, 3000);
    started = true;
    ctx._bellTimer = bellTimer;
  }

  function setOn(on) {
    if (on) {
      start();
      ctx.resume();
      master.gain.cancelScheduledValues(ctx.currentTime);
      master.gain.linearRampToValueAtTime(0.35, ctx.currentTime + 1.2);
    } else if (started) {
      master.gain.cancelScheduledValues(ctx.currentTime);
      master.gain.linearRampToValueAtTime(0.0, ctx.currentTime + 0.6);
    }
  }

  return { setOn };
}
