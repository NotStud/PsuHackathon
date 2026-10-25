// Rear-camera preview, video recording, and a short ring buffer of recent frames.
//
// The ring buffer is what lets us hand hit detection a sharp image: by the time the
// trigger fires the phone is already mid-flick and the live frame is motion-blurred,
// so we look back to the frame captured just before the flick started.
//
// Zoom uses the camera's own zoom where the browser offers it (most Android phones), and a
// centered crop for the rest ("digital" zoom). Buffered frames are cropped from the
// full-resolution video, so a far-away target keeps its real pixels for hit detection; the
// preview and the recorded clip aren't cropped, so whoever shows them scales them by
// `digitalZoom`.

const MIME_TYPES = ['video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];

export class CameraRig {
  constructor(video, { frameWidth = 960, bufferFrames = 20 } = {}) {
    this.video = video;
    this.frameWidth = frameWidth;
    this.bufferFrames = bufferFrames;
    this.stream = null;
    this.recorder = null;
    this.chunks = [];
    this.frames = [];        // [{ canvas, t }], oldest first
    this.capturing = false;
    this.digitalZoom = 1;    // the part of `zoom` done by cropping, not by the camera
  }

  // Zoom to `level` (1 = none). Returns how much of it is digital.
  setZoom(level) {
    const track = this.stream?.getVideoTracks()[0];
    const range = track?.getCapabilities?.().zoom;
    let hardware = 1;
    if (range && range.max > range.min) {
      hardware = Math.min(Math.max(level, range.min, 1), range.max);
      track.applyConstraints({ advanced: [{ zoom: hardware }] }).catch(() => {});
    }
    this.digitalZoom = Math.max(1, level / hardware);
    return this.digitalZoom;
  }

  async start() {
    this.stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
      audio: false,
    });
    this.video.srcObject = this.stream;
    this.video.muted = true;
    this.video.playsInline = true;
    await this.video.play();
  }

  get mimeType() {
    return MIME_TYPES.find(t => window.MediaRecorder && MediaRecorder.isTypeSupported(t)) || '';
  }

  // Starts the clip and the frame buffer. Call this when the player "arms".
  startRecording() {
    if (this.recorder && this.recorder.state !== 'inactive') this.recorder.stop();
    // Each recording keeps its own chunks and "finished" signal, so starting a new one
    // can't lose or hang a clip that's still being wrapped up.
    const chunks = [];
    this.chunks = chunks;
    this.recorder = null;
    try {
      const mimeType = this.mimeType;
      const recorder = new MediaRecorder(this.stream, mimeType ? { mimeType } : undefined);
      recorder.ondataavailable = e => e.data.size && chunks.push(e.data);
      recorder.finished = new Promise(resolve => recorder.addEventListener('stop', resolve, { once: true }));
      recorder.start(250);
      this.recorder = recorder;
    } catch (err) {
      // No video on this browser or camera; the shot still works, just without a clip.
      console.warn('Video recording unavailable:', err);
    }
    this.recordingStartedAt = performance.now();
    this._startFrames();
  }

  // Keeps recording for postRollMs (so the clip shows the shot), then returns the clip.
  async stopRecording(postRollMs = 500) {
    this._stopFrames();
    const recorder = this.recorder, chunks = this.chunks;
    if (!recorder || recorder.state === 'inactive') return null;
    await new Promise(r => setTimeout(r, postRollMs));
    // If re-arming already stopped this recording during the post-roll, it's finished
    // (or about to be); don't wait for a stop that already happened.
    if (recorder.state !== 'inactive') recorder.stop();
    await recorder.finished;
    return chunks.length ? new Blob(chunks, { type: recorder.mimeType || 'video/webm' }) : null;
  }

  // Latest buffered frame captured at or before time t (performance.now() clock).
  frameAt(t) {
    let best = this.frames[0] || null;
    for (const f of this.frames) if (f.t <= t) best = f;
    return best ? best.canvas : this._grab(document.createElement('canvas'));
  }

  stop() {
    this._stopFrames();
    if (this.recorder && this.recorder.state !== 'inactive') this.recorder.stop();
    this.stream?.getTracks().forEach(t => t.stop());
  }

  _startFrames() {
    this.frames = [];
    this.capturing = true;
    const tick = () => {
      if (!this.capturing) return;
      // Reuse the oldest canvas once the ring is full instead of allocating new ones.
      const canvas = this.frames.length >= this.bufferFrames
        ? this.frames.shift().canvas
        : document.createElement('canvas');
      this.frames.push({ canvas: this._grab(canvas), t: performance.now() });
      this._schedule(tick);
    };
    this._schedule(tick);
  }

  _stopFrames() {
    this.capturing = false;
  }

  _schedule(fn) {
    if (this.video.requestVideoFrameCallback) this.video.requestVideoFrameCallback(fn);
    else requestAnimationFrame(fn);
  }

  _grab(canvas) {
    const { videoWidth: w, videoHeight: h } = this.video;
    // The centered part a digital zoom shows, at full resolution (shrunk to frameWidth at most).
    const cropW = w / this.digitalZoom, cropH = h / this.digitalZoom;
    const scale = Math.min(1, this.frameWidth / cropW);
    canvas.width = Math.round(cropW * scale);
    canvas.height = Math.round(cropH * scale);
    canvas.getContext('2d').drawImage(this.video, (w - cropW) / 2, (h - cropH) / 2, cropW, cropH,
      0, 0, canvas.width, canvas.height);
    return canvas;
  }
}

export function canvasToBlob(canvas, type = 'image/jpeg', quality = 0.9) {
  return new Promise(resolve => canvas.toBlob(resolve, type, quality));
}
