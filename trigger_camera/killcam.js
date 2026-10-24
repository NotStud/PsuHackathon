// Kill cam: auto-plays the last moments before a shot on a loop, in slow motion
// around the trigger pull. Starts on its own (muted + playsinline is what lets
// phones autoplay without a tap) and never shows player controls.

const LEAD_S = 2;          // how much of the run-up to replay
const SLOW_FROM_S = 0.5;   // start slow-mo this long before the shot...
const SLOW_UNTIL_S = 0.3;  // ...and end it this long after
const SLOW_RATE = 0.3;
const LOOP_PAUSE_MS = 700;

// shotAt is the trigger time in seconds from the start of the clip.
// Returns a function that stops the kill cam and frees the clip.
export function playKillCam(video, clip, shotAt, { onShot = () => {} } = {}) {
  const url = URL.createObjectURL(clip);
  let start = 0, raf = 0, loopTimer = 0, shown = false, stopped = false;

  video.muted = true;
  video.playsInline = true;
  video.controls = false;
  video.src = url;

  const restart = () => {
    if (stopped) return;
    shown = false;
    video.playbackRate = 1;
    video.currentTime = start;
    video.play().catch(() => {});
  };

  const tick = () => {
    const t = video.currentTime;
    const rate = t >= shotAt - SLOW_FROM_S && t < shotAt + SLOW_UNTIL_S ? SLOW_RATE : 1;
    if (video.playbackRate !== rate) video.playbackRate = rate;
    if (!shown && t >= shotAt) {
      shown = true;
      onShot();
    }
    raf = requestAnimationFrame(tick);
  };

  video.onloadedmetadata = async () => {
    if (!Number.isFinite(video.duration)) await resolveDuration(video);
    shotAt = Math.min(shotAt, video.duration);
    start = Math.max(0, shotAt - LEAD_S);
    restart();
    raf = requestAnimationFrame(tick);
  };
  video.onended = () => { loopTimer = setTimeout(restart, LOOP_PAUSE_MS); };

  return () => {
    stopped = true;
    cancelAnimationFrame(raf);
    clearTimeout(loopTimer);
    video.onloadedmetadata = video.onended = null;
    video.pause();
    video.removeAttribute('src');
    video.load();
    URL.revokeObjectURL(url);
  };
}

// Chrome's MediaRecorder writes WebM without a duration, so the browser reports
// Infinity until it has seen the end. Seeking far past the end forces it to work
// the real duration out.
function resolveDuration(video) {
  return new Promise(resolve => {
    video.ondurationchange = () => {
      if (!Number.isFinite(video.duration)) return;
      video.ondurationchange = null;
      resolve();
    };
    video.currentTime = 1e101;
  });
}
