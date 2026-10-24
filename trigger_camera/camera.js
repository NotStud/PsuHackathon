// Rear-camera preview, video recording, and a short ring buffer of recent frames.
//
// The ring buffer is what lets us hand hit detection a sharp image: by the time the
// trigger fires the phone is already mid-flick and the live frame is motion-blurred,
// so we look back to the frame captured just before the flick started.

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
    this.chunks = [];
    const mimeType = this.mimeType;
    this.recorder = new MediaRecorder(this.stream, mimeType ? { mimeType } : undefined);
    this.recorder.ondataavailable = e => e.data.size && this.chunks.push(e.data);
    this.recorder.start(250);
    this.recordingStartedAt = performance.now();
    this._startFrames();
  }

  // Keeps recording for postRollMs (so the clip shows the shot), then returns the clip.
  async stopRecording(postRollMs = 500) {
    this._stopFrames();
    const recorder = this.recorder;
    if (!recorder || recorder.state === 'inactive') return null;
    await new Promise(r => setTimeout(r, postRollMs));
    return new Promise(resolve => {
      recorder.onstop = () => resolve(new Blob(this.chunks, { type: recorder.mimeType || 'video/webm' }));
      recorder.stop();
    });
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
    const scale = Math.min(1, this.frameWidth / w);
    canvas.width = Math.round(w * scale);
    canvas.height = Math.round(h * scale);
    canvas.getContext('2d').drawImage(this.video, 0, 0, canvas.width, canvas.height);
    return canvas;
  }
}

export function canvasToBlob(canvas, type = 'image/jpeg', quality = 0.9) {
  return new Promise(resolve => canvas.toBlob(resolve, type, quality));
}
