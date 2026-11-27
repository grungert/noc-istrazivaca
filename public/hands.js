// Upravljanje rukama preko web kamere (MediaPipe Hand Landmarker — besplatno, radi lokalno).
//   otvorena šaka          → kursor (pokaži planetu, zadrži za "klik")
//   stisnuta šaka + vuci   → rotira pogled ("uhvati i okreni")
//   uštipni palac+kažiprst → uhvati kometu, pusti u zamahu → baci je
//   dvije otvorene šake    → razmakni/skupi za zum
import { FilesetResolver, HandLandmarker } from '/vendor/mediapipe/vision_bundle.mjs';

const BONES = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [0, 17], [17, 18], [18, 19], [19, 20],
];
const PINCH_ON = 0.32;
const PINCH_OFF = 0.5;
const VULCAN_FRAMES = 12;
const ASPECT = 640 / 480; // landmarki su normalizovani po širini i visini kadra
const DEBUG = new URLSearchParams(location.search).has('debug');

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

export class Hands {
  constructor(handlers) {
    this.h = handlers;
    this.running = false;
    this.pinched = false;
    this.trail = [];
    this.prevPalm = null;
    this.prevSpread = null;
    this.smooth = null;
  }

  async start() {
    this.h.onStatus?.('Učitavam model za ruke…');
    const vision = await FilesetResolver.forVisionTasks('/vendor/mediapipe/wasm');
    const make = (delegate) =>
      HandLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: '/models/hand_landmarker.task', delegate },
        runningMode: 'VIDEO',
        numHands: 2,
        minHandDetectionConfidence: 0.6,
        minTrackingConfidence: 0.5,
      });
    this.detector = await make('GPU').catch(() => make('CPU'));

    this.h.onStatus?.('Palim kameru…');
    this.stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480, facingMode: 'user' } });
    this.video = document.createElement('video');
    this.video.srcObject = this.stream;
    this.video.muted = true;
    this.video.playsInline = true;
    await this.video.play();

    this.buildUi();
    this.running = true;
    this.lastTime = -1;
    this.h.onStatus?.(null);
    this.tick();
  }

  stop() {
    this.running = false;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.ui?.remove();
    this.overlay?.remove();
    this.h.onHandsVisible?.(false);
  }

  buildUi() {
    this.ui = document.createElement('div');
    this.ui.className = 'hands';
    this.ui.innerHTML = `
      <div class="hands__cam"></div>
      <ul class="hands__help">
        <li><b>✋</b> dlan — kursor; zadrži na planeti da je posjetiš</li>
        <li><b>✊</b> stisni šaku i vuci — okreći svemir</li>
        <li><b>🤏</b> uštipni, zamahni, pusti — baci kometu</li>
        <li><b>🙌</b> dvije šake — razmakni za zum</li>
        <li><b>🖖</b> vulkanski pozdrav — … probaj 😉</li>
      </ul>`;
    const cam = this.ui.querySelector('.hands__cam');
    this.video.className = 'hands__video';
    cam.appendChild(this.video);
    this.preview = document.createElement('canvas');
    this.preview.width = 640;
    this.preview.height = 480;
    cam.appendChild(this.preview);
    if (DEBUG) {
      this.debugEl = document.createElement('div');
      this.debugEl.className = 'hands__debug';
      this.ui.appendChild(this.debugEl);
    }
    document.body.appendChild(this.ui);

    // kursori ruku preko cijele scene
    this.overlay = document.createElement('canvas');
    this.overlay.className = 'hands__overlay';
    document.body.appendChild(this.overlay);
  }

  tick = () => {
    if (!this.running) return;
    requestAnimationFrame(this.tick);
    if (this.video.currentTime === this.lastTime) return;
    this.lastTime = this.video.currentTime;
    const res = this.detector.detectForVideo(this.video, performance.now());
    this.process(res.landmarks || []);
  };

  analyse(lm) {
    const size = dist(lm[0], lm[9]) || 0.1;
    const fromWrist = (i) => dist(lm[i], lm[0]);
    const fingers = [[8, 6], [12, 10], [16, 14], [20, 18]];
    const extended = fingers.filter(([tip, pip]) => fromWrist(tip) > fromWrist(pip) * 1.08).length;
    const curled = fingers.filter(([tip, pip]) => fromWrist(tip) < fromWrist(pip)).length;
    // kod uštipa kažiprst je ispružen ka palcu; kod šake je vrh kažiprsta u dlanu
    const indexOut = fromWrist(8) > fromWrist(5) * 1.15;
    const palmIdx = [0, 5, 9, 13, 17];
    const palm = {
      x: 1 - palmIdx.reduce((s, i) => s + lm[i].x, 0) / 5, // ogledalo — kao da gledaš u ogledalo
      y: palmIdx.reduce((s, i) => s + lm[i].y, 0) / 5,
    };
    const pinchPt = { x: 1 - (lm[4].x + lm[8].x) / 2, y: (lm[4].y + lm[8].y) / 2 };
    const pinchRatio = dist(lm[4], lm[8]) / size;

    // sirova poza u ovom kadru; šaka ima prednost nad uštipom (palac zna da dodirne kažiprst)
    let pose = 'other';
    const pinchLimit = this.pose === 'pinch' ? PINCH_OFF : PINCH_ON;
    if (curled >= 3 && !indexOut) pose = 'fist';
    else if (pinchRatio < pinchLimit && indexOut) pose = 'pinch';
    else if (extended >= 3) pose = 'open';
    // 🖖 vulkanski pozdrav: kažiprst+srednji spojeni, domali+mali spojeni, veliki razmak između srednjeg i domalog.
    // Mjere se uglovi između prstiju (ne zavise od udaljenosti i okreta ruke), a razmak vrhova je rezerva.
    const dir = (a, b) => {
      const x = (lm[b].x - lm[a].x) * ASPECT;
      const y = lm[b].y - lm[a].y;
      const z = (lm[b].z - lm[a].z) * ASPECT;
      const l = Math.hypot(x, y, z) || 1;
      return [x / l, y / l, z / l];
    };
    const angle = (u, v) => (Math.acos(Math.min(1, u[0] * v[0] + u[1] * v[1] + u[2] * v[2])) * 180) / Math.PI;
    const [fI, fM, fR, fP] = [dir(5, 8), dir(9, 12), dir(13, 16), dir(17, 20)];
    const ang = { im: angle(fI, fM), mr: angle(fM, fR), rp: angle(fR, fP) };
    const gap = (a, b) => dist(lm[a], lm[b]) / size;
    const gaps = { im: gap(8, 12), mr: gap(12, 16), rp: gap(16, 20) };
    const byAngle = ang.mr >= 8 && ang.mr > 1.8 * Math.max(ang.im, ang.rp);
    const byGap = gaps.mr > 0.2 && gaps.mr > 1.5 * Math.max(gaps.im, gaps.rp);
    const vulcan = extended >= 4 && (byAngle || byGap);
    return { lm, palm, pinchPt, pinchRatio, extended, pose, vulcan, ang, gaps };
  }

  // poza se mijenja tek kad je nova stabilna nekoliko kadrova — prelazi (npr. dok se šaka zatvara) se ignorišu
  settle(raw) {
    const need = { pinch: 3, fist: 3, open: 2, other: 4 };
    if (raw === this.pose) {
      this.cand = null;
      return this.pose;
    }
    if (raw !== this.cand) {
      this.cand = raw;
      this.candCount = 0;
    }
    if (++this.candCount >= (this.pose === 'pinch' ? 2 : need[raw])) {
      this.pose = raw;
      this.cand = null;
    }
    return this.pose;
  }

  process(landmarks) {
    const hands = landmarks.map((lm) => this.analyse(lm));
    this.h.onHandsVisible?.(hands.length > 0);
    const now = performance.now();

    if (hands.length === 2 && hands.every((h) => h.extended >= 3)) {
      // zum: odnos razmaka dvije šake
      const spread = dist(hands[0].palm, hands[1].palm);
      if (this.prevSpread) this.h.onZoom?.(this.prevSpread / spread);
      this.prevSpread = spread;
      this.prevPalm = null;
      this.releasePinch(false);
      this.h.onPointer?.(null);
    } else {
      this.prevSpread = null;
      const hand = hands[0];
      if (!hand) {
        this.prevPalm = null;
        this.smooth = null;
        this.pose = null;
        this.cand = null;
        this.vulcanFrames = 0;
        this.vulcanProgress = 0;
        this.releasePinch(false);
        this.h.onPointer?.(null);
      } else {
        const wasPinched = this.pinched;
        const pose = this.settle(hand.pose);
        this.pinched = pose === 'pinch';

        // glatko praćenje dlana (smanjuje podrhtavanje kursora i rotacije)
        this.smooth = this.smooth ? { x: this.smooth.x * 0.55 + hand.palm.x * 0.45, y: this.smooth.y * 0.55 + hand.palm.y * 0.45 } : { ...hand.palm };
        if (pose !== 'fist') this.prevPalm = null;
        if (pose !== 'open') this.h.onPointer?.(null);

        if (this.pinched) {
          // u putanju ulaze samo kadrovi sa stvarnim uštipom (ne i oni dok se prsti razdvajaju)
          if (hand.pose === 'pinch') this.trail.push({ ...hand.pinchPt, t: now });
          this.trail = this.trail.filter((p) => now - p.t < 160);
          if (!wasPinched) this.h.onGrab?.(hand.pinchPt);
          else this.h.onHold?.(hand.pinchPt);
        } else if (wasPinched) {
          this.releasePinch(true);
        }

        // 🖖 se mora držati ~0,5 s; za to vrijeme kursor miruje
        this.vulcanFrames = hand.vulcan && pose === 'open' ? (this.vulcanFrames || 0) + 1 : 0;
        this.vulcanProgress = Math.min(this.vulcanFrames / VULCAN_FRAMES, 1);
        if (this.vulcanFrames === VULCAN_FRAMES) this.h.onVulcan?.();

        if (pose === 'open') {
          this.h.onPointer?.(this.vulcanFrames > 2 ? null : this.smooth);
        } else if (pose === 'fist') {
          // stisnuta šaka: vuci da okreneš svemir (mrtva zona guši podrhtavanje)
          if (this.prevPalm) {
            const dx = this.smooth.x - this.prevPalm.x;
            const dy = this.smooth.y - this.prevPalm.y;
            if (Math.hypot(dx, dy) > 0.0015) this.h.onRotate?.(dx, dy);
          }
          this.prevPalm = { ...this.smooth };
        }
      }
    }
    this.draw(hands);
  }

  releasePinch(throwIt) {
    if (!this.pinched && !throwIt) return;
    this.pinched = false;
    if (this.pose === 'pinch') this.pose = null;
    const first = this.trail[0];
    const last = this.trail.at(-1);
    this.trail = [];
    if (!throwIt || !last) return this.h.onDrop?.();
    const dt = Math.max((last.t - first.t) / 1000, 0.016);
    this.h.onThrow?.(last, { x: (last.x - first.x) / dt, y: (last.y - first.y) / dt });
  }

  draw(hands) {
    // mali prikaz kamere sa "kosturom" ruke — da se vidi kako AI vidi ruku
    if (DEBUG && this.debugEl) {
      const h = hands[0];
      this.debugEl.textContent = h
        ? `poza: ${this.pose ?? '-'} · prsti: ${h.extended} · uglovi K-S ${h.ang.im.toFixed(0)}° S-D ${h.ang.mr.toFixed(0)}° D-M ${h.ang.rp.toFixed(0)}° · razmaci ${h.gaps.im.toFixed(2)}/${h.gaps.mr.toFixed(2)}/${h.gaps.rp.toFixed(2)} · 🖖 ${h.vulcan ? 'DA' : 'ne'}`
        : 'nema ruke';
    }
    const p = this.preview.getContext('2d');
    p.clearRect(0, 0, 640, 480);
    p.lineWidth = 4;
    for (const h of hands) {
      p.strokeStyle = this.pinched ? '#ffb347' : '#7cc4ff';
      for (const [a, b] of BONES) {
        p.beginPath();
        p.moveTo(h.lm[a].x * 640, h.lm[a].y * 480);
        p.lineTo(h.lm[b].x * 640, h.lm[b].y * 480);
        p.stroke();
      }
      p.fillStyle = '#fff';
      for (const pt of h.lm) {
        p.beginPath();
        p.arc(pt.x * 640, pt.y * 480, 5, 0, Math.PI * 2);
        p.fill();
      }
    }

    // kursori preko scene
    const o = this.overlay;
    if (o.width !== innerWidth || o.height !== innerHeight) {
      o.width = innerWidth;
      o.height = innerHeight;
    }
    const g = o.getContext('2d');
    g.clearRect(0, 0, o.width, o.height);
    for (const h of hands) {
      const main = h === hands[0];
      const pinch = this.pinched && main;
      const open = h.extended >= 3;
      const pt = pinch ? h.pinchPt : main && this.smooth ? this.smooth : h.palm;
      const x = pt.x * o.width;
      const y = pt.y * o.height;
      g.beginPath();
      g.arc(x, y, pinch ? 14 : open ? 22 : 30, 0, Math.PI * 2);
      if (pinch) {
        g.fillStyle = 'rgba(255,179,71,0.9)';
        g.fill();
      } else if (open) {
        g.lineWidth = 3;
        g.strokeStyle = 'rgba(124,196,255,0.9)';
        g.stroke();
        g.beginPath();
        g.arc(x, y, 4, 0, Math.PI * 2);
        g.fillStyle = '#fff';
        g.fill();
        // "klik" zadržavanjem: krug se puni
        if (main && this.vulcanProgress > 0) {
          g.beginPath();
          g.arc(x, y, 38, -Math.PI / 2, -Math.PI / 2 + this.vulcanProgress * Math.PI * 2);
          g.lineWidth = 6;
          g.strokeStyle = '#6dff7a';
          g.stroke();
          g.font = '34px system-ui';
          g.textAlign = 'center';
          g.fillText('🖖', x, y - 50);
        }
        if (main && this.dwell > 0) {
          g.beginPath();
          g.arc(x, y, 30, -Math.PI / 2, -Math.PI / 2 + this.dwell * Math.PI * 2);
          g.lineWidth = 6;
          g.strokeStyle = '#ffb347';
          g.stroke();
        }
      } else {
        // šaka: "hvataljka" za okretanje
        g.lineWidth = 4;
        g.setLineDash([6, 6]);
        g.strokeStyle = 'rgba(200,210,255,0.8)';
        g.stroke();
        g.setLineDash([]);
      }
    }
  }
}
