import { scaleToTank, isLegacyDemoFish, prepareSprite } from "./creature.js";
import { templateFacesRight } from "./templates-data.js";
import { ThreeEngine } from "./engine-3d.js";

function lerp(a, b, t) {
  return a + (b - a) * t;
}

class Splash {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.t = 0;
    this.rings = [
      { r: 8, a: 0.7 },
      { r: 4, a: 0.5 },
    ];
    this.drops = Array.from({ length: 18 }, () => ({
      a: Math.random() * Math.PI - Math.PI / 2,
      v: 2.2 + Math.random() * 3.4,
      g: 0.12 + Math.random() * 0.08,
      life: 1,
    }));
    this.bubbles = Array.from({ length: 22 }, () => ({
      x: x + (Math.random() - 0.5) * 40,
      y: y + Math.random() * 10,
      r: 2 + Math.random() * 6,
      vy: -0.6 - Math.random() * 1.8,
      vx: (Math.random() - 0.5) * 0.8,
      a: 0.55,
    }));
  }

  get dead() {
    return this.t > 90 && this.bubbles.every((b) => b.a <= 0);
  }

  step() {
    this.t += 1;
    this.rings.forEach((r, i) => {
      r.r += 2.4 + i;
      r.a *= 0.94;
    });
    this.drops.forEach((d) => {
      d.life -= 0.028;
    });
    this.bubbles.forEach((b) => {
      b.x += b.vx;
      b.y += b.vy;
      b.vy *= 0.99;
      b.a -= 0.012;
    });
  }

  draw(ctx) {
    ctx.save();
    this.rings.forEach((r) => {
      if (r.a <= 0.02) return;
      ctx.beginPath();
      ctx.ellipse(this.x, this.y, r.r, r.r * 0.28, 0, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(230,255,255,${r.a})`;
      ctx.lineWidth = 3;
      ctx.stroke();
    });
    this.drops.forEach((d) => {
      if (d.life <= 0) return;
      const x = this.x + Math.cos(d.a) * d.v * (1 - d.life) * 18;
      const y =
        this.y -
        Math.sin(Math.abs(d.a)) * d.v * 10 * d.life +
        (1 - d.life) ** 2 * 40;
      ctx.fillStyle = `rgba(210,245,255,${Math.max(0, d.life)})`;
      ctx.beginPath();
      ctx.arc(x, y, 2.4, 0, Math.PI * 2);
      ctx.fill();
    });
    this.bubbles.forEach((b) => {
      if (b.a <= 0) return;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(220,250,255,${Math.max(0, b.a)})`;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    });
    ctx.restore();
  }
}

const GAIT = {
  fish: { cruise: 0.048, turn: 0.0026, tail: 1.0, depth: [0.18, 0.78], vertical: 0.7, boost: 0.0008, boostMul: 1.9, path: "mixed", avoid: 85 },
  puffer: { cruise: 0.042, turn: 0.0024, tail: 0.45, depth: [0.28, 0.7], vertical: 0.62, boost: 0.0005, boostMul: 1.6, path: "wander", avoid: 80 },
  octopus: { cruise: 0.032, turn: 0.0022, tail: 0.6, depth: [0.52, 0.88], vertical: 0.8, boost: 0, boostMul: 1, path: "jet", avoid: 75 },
};

const MAX_PITCH_UP = 0.46;
const MAX_PITCH_DOWN = 0.34;

function clampPitch(p) {
  if (p < 0) return Math.max(-MAX_PITCH_UP, p);
  return Math.min(MAX_PITCH_DOWN, p);
}

function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

function pickPath(kindPath) {
  if (kindPath && kindPath !== "mixed") return kindPath;
  const r = Math.random();
  if (r < 0.55) return "wander";
  if (r < 0.88) return "weave";
  return "loop";
}

class Fish {
  constructor(tank, payload, entering) {
    this.tank = tank;
    this.id = payload.id;
    this.kind = payload.kind || "fish";
    this.is3D = !!payload.model3d;
    this.model3d = payload.model3d || null;
    this.colorImage = payload.image || null;
    this.templateId = payload.templateId || null;
    this.fish3D = null;
    this.front = this.kind === "octopus";
    this.gait = GAIT[this.kind] || GAIT.fish;
    this.img = new Image();
    this.ready = false;
    this.gone = false;
    this.scale = 0.2;

    if (this.is3D && payload.model3d && tank.threeEngine?.initialized) {
      this.fish3D = tank.threeEngine.addFish(payload, 0, 0, 0.2);
      this.ready = true;
      this.scale = 0.15;
    }

    if (payload.image) {
      this.img.onload = () => {
        if (isLegacyDemoFish(payload.demo, this.img)) {
          this.gone = true;
          return;
        }
        const sprite = prepareSprite(this.img, templateFacesRight(this.templateId));
        this.img = sprite.canvas;
        this.scale = scaleToTank(this.kind, tank, sprite.width, sprite.height);
        if (!this.is3D) this.ready = true;
      };
      this.img.src = payload.image;
    }
    this.entering = entering;
    this.x = entering ? tank.w * (0.28 + Math.random() * 0.44) : Math.random() * tank.w;
    this.y = entering ? Math.max(40, tank.h * 0.08) : tank.h * (this.gait.depth[0] + Math.random() * 0.3);
    this.targetY = tank.h * (this.gait.depth[0] + Math.random() * (this.gait.depth[1] - this.gait.depth[0]));
    this.vy = entering ? 2.6 : 0;
    this.facing = Math.random() < 0.5 ? 1 : -1;
    this.heading = this.facing < 0 ? Math.PI - 0.12 : 0.12;
    this.swimYaw = this.facing < 0 ? Math.PI : 0;
    this.pitch = 0.08;
    this.speed = this.gait.cruise;
    this.phase = Math.random() * Math.PI * 2;
    this.dropT = 0;
    this.splashed = false;
    this.breath = 1;
    this.boost = 0;
    this.rest = 0;
    this.path = this.front ? "jet" : pickPath(this.gait.path);
    this.loop = {
      cx: tank.w * (0.32 + Math.random() * 0.36),
      cy: tank.h * (this.gait.depth[0] + Math.random() * 0.28),
      rx: tank.w * (0.18 + Math.random() * 0.18),
      ry: tank.h * (0.055 + Math.random() * 0.08) * (this.kind === "dolphin" ? 1.6 : 1),
      w: (0.00018 + Math.random() * 0.00016) * (Math.random() < 0.5 ? -1 : 1),
      a: Math.random() * Math.PI * 2,
    };
    this.wx = tank.w * 0.5;
    this.wy = this.targetY;
    this.pickWaypoint(true);
    this.caught = false;
  }

  get width() {
    return (this.img.width || 240) * this.scale;
  }

  get height() {
    return (this.img.height || 160) * this.scale;
  }

  // 3D fish are ~1.15 world units in a 10-tall view, much bigger on screen
  // than the 2D sprite scale used for cutouts. Avoidance has to use that.
  footprint() {
    if (this.is3D) {
      return {
        w: Math.max(120, this.tank.h * 0.15),
        h: Math.max(76, this.tank.h * 0.1),
      };
    }
    return { w: this.width, h: this.height };
  }

  pickWaypoint(reset = false) {
    const padX = Math.max(70, this.width * 0.55);
    const [d0, d1] = this.gait.depth;
    const span = Math.max(40, this.tank.w - padX * 2);
    const ahead = 140 + Math.random() * Math.max(80, span * 0.45);
    const side = this.facing < 0 ? -1 : 1;
    this.wx = Math.max(padX, Math.min(this.tank.w - padX, this.x + side * ahead * (Math.random() < 0.22 ? -1 : 1)));
    this.wy = this.y + (Math.random() - 0.5) * this.tank.h * 0.36;
    this.wy = Math.max(this.tank.h * d0, Math.min(this.tank.h * d1, this.wy));
    if (reset) {
      this.wx = padX + Math.random() * span;
      this.wy = this.tank.h * (d0 + Math.random() * (d1 - d0));
      return;
    }
    if (this.path === "shelf") {
      this.wy = this.tank.h * (d0 + (d1 - d0) * (0.55 + Math.random() * 0.35));
    }
  }

  goal() {
    if (this.path === "loop") {
      this.loop.a += this.loop.w * 16;
      return {
        x: this.loop.cx + Math.cos(this.loop.a) * this.loop.rx,
        y: this.loop.cy + Math.sin(this.loop.a * (this.kind === "dolphin" ? 2 : 1)) * this.loop.ry,
      };
    }
    if (this.path === "weave") {
      this.loop.a += this.loop.w * 10;
      return {
        x: this.loop.cx + Math.cos(this.loop.a) * this.loop.rx * 1.35,
        y: this.loop.cy + Math.sin(this.loop.a * 0.5) * this.loop.ry,
      };
    }
    return { x: this.wx, y: this.wy };
  }

  avoid() {
    let ax = 0;
    let ay = 0;
    let count = 0;
    let urgent = 0;
    const me = this.footprint();
    const pad = this.gait.avoid || 80;

    for (const other of this.tank.fish) {
      if (other === this || other.gone || other.caught) continue;
      if (!other.ready && !other.is3D) continue;
      const ot = other.footprint();
      const minX = (me.w + ot.w) * 0.5 + pad * 0.25;
      const minY = (me.h + ot.h) * 0.5 + pad * 0.12;
      let dx = this.x - other.x;
      let dy = this.y - other.y;
      if (dx === 0 && dy === 0) {
        dx = this.id > other.id ? 1 : -1;
        dy = 1;
      }
      const overlapX = minX - Math.abs(dx);
      const overlapY = minY - Math.abs(dy);
      if (overlapX <= 0 || overlapY <= 0) continue;
      const dist = Math.hypot(dx, dy) || 1;
      const push = Math.max(overlapX / minX, overlapY / minY);
      ax += (dx / dist) * push;
      ay += (dy / dist) * push;
      count += 1;
      urgent = Math.max(urgent, push);
    }

    if (!count) return null;
    return { ax: ax / count, ay: ay / count, urgent };
  }

  steer(dt) {
    const goal = this.goal();
    let dx = goal.x - this.x;
    let dy = (goal.y - this.y) * this.gait.vertical;
    const dist = Math.hypot(dx, dy) || 1;
    if ((this.path === "wander" || this.path === "jet") && dist < 48) this.pickWaypoint();

    const shy = this.avoid();
    if (shy) {
      dx += shy.ax * (110 + shy.urgent * 160);
      dy += shy.ay * (90 + shy.urgent * 130);
      this.x += shy.ax * shy.urgent * 2.8 * Math.min(dt, 32);
      this.y += shy.ay * shy.urgent * 2.2 * Math.min(dt, 32);
    }

    const marginX = this.width * 0.45 + 36;
    const marginY0 = this.tank.h * this.gait.depth[0];
    const marginY1 = this.tank.h * this.gait.depth[1];
    if (this.x < marginX) dx = Math.max(dx, 50);
    if (this.x > this.tank.w - marginX) dx = Math.min(dx, -50);
    if (this.y < marginY0) dy = Math.max(dy, 20);
    if (this.y > marginY1) dy = Math.min(dy, -20);

    if (dx < -18) this.facing = -1;
    else if (dx > 18) this.facing = 1;

    const targetYaw = this.facing < 0 ? Math.PI : 0;
    const yawDelta = targetYaw - this.swimYaw;
    const maxTurn = this.gait.turn * dt;
    this.swimYaw = Math.max(0, Math.min(Math.PI, this.swimYaw + Math.max(-maxTurn, Math.min(maxTurn, yawDelta))));

    const turning = Math.min(1, Math.abs(yawDelta) / 1.1);
    const wantPitch = clampPitch(Math.atan2(dy, Math.max(Math.abs(dx), 70)));
    this.pitch += (wantPitch * (1 - turning * 0.28) - this.pitch) * Math.min(1, 0.04 * dt / 16);

    let target = this.gait.cruise * (0.62 + (1 - turning) * 0.5);
    if (this.boost > 0) {
      this.boost -= dt;
      target *= this.gait.boostMul;
    } else if (this.rest > 0) {
      this.rest -= dt;
      target *= 0.42;
    } else if (this.gait.boost && Math.random() < this.gait.boost * dt) {
      this.boost = 220 + Math.random() * 280;
    } else if (Math.random() < 0.00022 * dt) {
      this.rest = 500 + Math.random() * 1100;
    }
    if (this.kind === "octopus") {
      const pulse = 0.2 + Math.max(0, Math.sin(this.phase * 0.5)) ** 2;
      target = this.gait.cruise * (0.2 + pulse * 2.2);
    }
    this.speed = lerp(this.speed, Math.max(0.008, target), 0.035);
    const noseX = Math.cos(this.swimYaw);
    this.x += noseX * this.speed * dt;
    this.y += Math.sin(this.pitch) * this.speed * dt;
    this.heading = Math.atan2(Math.sin(this.pitch), noseX * Math.max(0.4, Math.cos(this.pitch)));
    this.x = Math.max(marginX * 0.4, Math.min(this.tank.w - marginX * 0.4, this.x));
    this.y = Math.max(this.tank.h * 0.14, Math.min(this.tank.h * 0.88, this.y));
  }

  stepDrop(dt) {
    this.dropT += dt;
    this.vy += 0.028 * dt;
    this.y += this.vy;
    this.pitch = lerp(this.pitch, MAX_PITCH_DOWN, 0.08);
    this.heading = this.facing < 0 ? Math.PI - this.pitch : this.pitch;
    if (!this.splashed && this.y >= this.targetY - 8) {
      this.splashed = true;
      this.tank.splashes.push(new Splash(this.x, this.y + this.height * 0.12));
    }
    if (this.y >= this.targetY) {
      this.y = this.targetY;
      this.entering = false;
      this.vy = 0;
      this.pitch = 0.08;
      this.facing = Math.random() < 0.5 ? 1 : -1;
      this.swimYaw = this.facing < 0 ? Math.PI : 0;
      this.heading = this.facing < 0 ? Math.PI - 0.1 : 0.1;
    }
  }

  step(dt) {
    if (this.gone) return;
    const effort = 0.0028 + this.speed * 0.05;
    this.phase += effort * dt * this.gait.tail;
    this.breath = 1 + Math.sin(this.phase * (this.front ? 1.3 : 0.55)) * (this.front ? 0.07 : 0.012);
    if (this.caught) {
      this.entering = false;
      const net = this.tank.net;
      const cx = this.tank.w * 0.5;
      const cy = net?.gatherY ?? this.tank.h * 0.42;
      this.wx = cx;
      this.wy = cy;
      this.path = "wander";
      if (net?.phase === "lift") {
        this.y += (net.vy || -0.55) * dt;
        this.x += (cx - this.x) * 0.14;
        if (this.y < -80) this.gone = true;
        return;
      }
      this.steer(dt);
      this.speed = Math.max(this.speed, 0.11);
      return;
    }
    if (this.entering) {
      this.stepDrop(dt);
      return;
    }
    this.steer(dt);
  }

  draw(ctx) {
    if (!this.ready || this.gone) return;
    
    if (this.is3D) {
      if (this.fish3D?.failed) {
        this.is3D = false;
      } else {
        if (this.fish3D) {
          this.tank.threeEngine.updateFish(
            this.fish3D,
            this.x,
            this.y,
            this.heading,
            this.phase,
            this.speed,
            this.tank.dt || 16,
            this.swimYaw,
            this.pitch
          );
        } else if (this.tank.threeEngine?.initialized) {
          this.fish3D = this.tank.threeEngine.addFish(
            {
              id: this.id,
              model3d: this.model3d,
              image: this.colorImage,
              templateId: this.templateId,
            },
            this.x,
            this.y,
            this.scale
          );
        }
        return;
      }
    }
    
    // 2D рыбки рисуются как раньше
    const w = this.width;
    const h = this.height;
    ctx.save();
    ctx.translate(this.x, this.y);
    
    if (this.front) {
      // осьминог - простое покачивание
      const wiggle = Math.sin(this.phase * 0.9) * 0.08;
      ctx.rotate(wiggle);
      ctx.scale(this.breath, 1 / this.breath);
      ctx.drawImage(this.img, -w / 2, -h / 2, w, h);
    } else {
      // Рыбы плавают на боку, а не вверх тормашками: разворот налево - это
      // зеркало, а не поворот на 180 градусов.
      const mirrored = Math.cos(this.swimYaw) < 0;
      ctx.rotate(this.pitch);
      if (mirrored) ctx.scale(-1, 1);
      const tailWag = Math.sin(this.phase * 2.0) * 0.06 * this.gait.tail;
      ctx.save();
      ctx.filter = "saturate(1.4) contrast(1.08) brightness(1.05)";
      ctx.transform(
        1,
        tailWag * 0.15,
        tailWag * 0.35,
        1 + Math.abs(tailWag) * 0.08,
        0,
        0
      );
      ctx.drawImage(this.img, -w / 2, -h / 2, w, h);
      ctx.filter = "none";
      ctx.restore();
    }
    ctx.restore();
  }
}

export class AquariumEngine {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.w = 1;
    this.h = 1;
    this.dpr = 1;
    this.fish = [];
    this.splashes = [];
    this.bubbles = Array.from({ length: 78 }, () => this.randomBubble(true));
    this.critters = [];
    this.motes = [];
    this.t = 0;
    this.running = false;
    this.raf = 0;
    this.bg = null;
    this.sceneId = "";
    this.threeEngine = new ThreeEngine();
    this.net = null;
    this.food = [];
    this.resize = this.resize.bind(this);
    this.loop = this.loop.bind(this);
    window.addEventListener("resize", this.resize);
    this.resize();
    this.seedLife();
  }

  seedLife() {
    const hues = [198, 208, 186, 42, 28];
    this.critters = Array.from({ length: 16 }, (_, i) => ({
      x: Math.random() * (this.w || 1200),
      y: (this.h || 700) * (0.18 + Math.random() * 0.52),
      vx: (0.05 + Math.random() * 0.12) * (i % 2 ? 1 : -1),
      amp: 5 + Math.random() * 12,
      phase: Math.random() * 12,
      s: 0.16 + Math.random() * 0.18,
      hue: hues[i % hues.length],
    }));
    this.motes = Array.from({ length: 36 }, () => ({
      x: Math.random() * (this.w || 1200),
      y: Math.random() * (this.h || 700),
      r: 0.6 + Math.random() * 1.8,
      vy: 0.04 + Math.random() * 0.12,
      ox: Math.random() * 80,
    }));
  }

  randomBubble(anywhere = false) {
    return {
      x: Math.random() * (this.w || window.innerWidth),
      y: anywhere ? Math.random() * (this.h || window.innerHeight) : this.h + 20,
      r: 1.2 + Math.random() * 4.5,
      vy: 0.25 + Math.random() * 0.7,
      ox: Math.random() * 100,
    };
  }

  resize() {
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.w = window.innerWidth;
    this.h = window.innerHeight;
    this.canvas.width = Math.round(this.w * this.dpr);
    this.canvas.height = Math.round(this.h * this.dpr);
    this.canvas.style.width = `${this.w}px`;
    this.canvas.style.height = `${this.h}px`;
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    
    // Инициализируем 3D движок при первом ресайзе
    if (!this.threeEngine.initialized) {
      this.threeEngine.init(this.w, this.h);
    } else {
      this.threeEngine.resize(this.w, this.h);
    }
    
    this.fish.forEach((f) => {
      if (f.ready && !f.is3D) {
        f.scale = scaleToTank(f.kind, this, f.img.width, f.img.height);
      }
    });
  }

  addFish(payload, entering = true) {
    if (payload?.demo) return;
    if (!payload?.image && !payload?.model3d) return;
    if (this.fish.some((f) => f.id === payload.id)) return;
    this.fish.push(new Fish(this, payload, entering));
  }

  setScene(src) {
    this.sceneId = src;
    const img = new Image();
    const apply = () => {
      this.bg = img;
    };
    img.onload = apply;
    img.src = src;
    if (img.complete && img.naturalWidth) apply();
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.loop);
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
    window.removeEventListener("resize", this.resize);
  }

  loop(now) {
    if (!this.running) return;
    const dt = Math.min(32, now - this.last);
    this.last = now;
    this.dt = dt;
    this.t += dt;
    this.step(dt);
    this.draw();
    this.raf = requestAnimationFrame(this.loop);
  }

  step(dt) {
    this.fish.forEach((f) => f.step(dt));
    this.fish = this.fish.filter((f) => {
      if (!f.gone) return true;
      if (f.fish3D) this.threeEngine.removeFish(f.fish3D);
      return false;
    });
    this.stepNet(dt);
    this.stepFood(dt);
    this.splashes.forEach((s) => s.step());
    this.splashes = this.splashes.filter((s) => !s.dead);
    this.bubbles.forEach((b) => {
      b.y -= b.vy * dt * 0.06;
      b.x += Math.sin((this.t + b.ox) * 0.001) * 0.15;
      if (b.y < -10) {
        Object.assign(b, this.randomBubble(false), { y: this.h + 10 });
      }
    });
    this.critters.forEach((c) => {
      c.x += c.vx * dt * 0.045;
      if (c.x > this.w + 40) c.x = -40;
      if (c.x < -40) c.x = this.w + 40;
    });
    this.motes.forEach((m) => {
      m.y -= m.vy * dt * 0.05;
      m.x += Math.sin((this.t + m.ox) * 0.0008) * 0.12;
      if (m.y < -4) {
        m.y = this.h + 4;
        m.x = Math.random() * this.w;
      }
    });
  }

  drawWater() {
    const { ctx, w, h } = this;
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, "#083a62");
    g.addColorStop(0.35, "#046b8a");
    g.addColorStop(0.7, "#027a86");
    g.addColorStop(1, "#02344a");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    const glow = ctx.createRadialGradient(w * 0.5, -h * 0.05, 20, w * 0.5, h * 0.2, h * 0.7);
    glow.addColorStop(0, "rgba(186, 242, 255, 0.35)");
    glow.addColorStop(1, "rgba(186, 242, 255, 0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, w, h);
  }

  drawCaustics() {
    const { ctx, w, h } = this;
    ctx.save();
    ctx.globalAlpha = this.bg ? 0.055 : 0.07;
    ctx.strokeStyle = "#e8ffff";
    ctx.lineWidth = 2;
    for (let i = 0; i < 9; i++) {
      ctx.beginPath();
      for (let x = 0; x <= w; x += 14) {
        const y =
          h * 0.18 +
          i * 42 +
          Math.sin(x * 0.01 + this.t * 0.0012 + i) * 16 +
          Math.sin(x * 0.023 + this.t * 0.0008) * 10;
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  drawReef() {
    const { ctx, w, h } = this;
    ctx.fillStyle = "#d7b07a";
    ctx.beginPath();
    ctx.moveTo(0, h);
    ctx.quadraticCurveTo(w * 0.2, h - 70, w * 0.4, h - 36);
    ctx.quadraticCurveTo(w * 0.62, h - 90, w * 0.82, h - 40);
    ctx.quadraticCurveTo(w * 0.92, h - 20, w, h - 48);
    ctx.lineTo(w, h);
    ctx.fill();
    ctx.fillStyle = "#c49a64";
    ctx.beginPath();
    ctx.moveTo(0, h);
    ctx.quadraticCurveTo(w * 0.3, h - 28, w, h - 18);
    ctx.lineTo(w, h);
    ctx.fill();

    this.drawCoral(w * 0.08, h - 28, 1.1, 12);
    this.drawCoral(w * 0.18, h - 22, 0.7, 200);
    this.drawSeaweed(w * 0.28, h - 20, 0.9);
    this.drawCoral(w * 0.72, h - 26, 1.2, 330);
    this.drawSeaweed(w * 0.84, h - 18, 1.15);
    this.drawCoral(w * 0.93, h - 22, 0.75, 28);
  }

  drawCoral(x, y, s, hue) {
    const { ctx } = this;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s, s);
    const branches = [
      [0, 0, -28, -90],
      [0, 0, 24, -80],
      [-12, -40, -48, -70],
      [10, -36, 50, -66],
      [0, -70, 6, -118],
    ];
    branches.forEach(([x1, y1, x2, y2], i) => {
      ctx.strokeStyle = `hsl(${hue + i * 8} 62% ${42 + i * 4}%)`;
      ctx.lineWidth = 14 - i;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.quadraticCurveTo((x1 + x2) / 2 + 8, (y1 + y2) / 2, x2, y2);
      ctx.stroke();
    });
    ctx.restore();
  }

  drawSeaweed(x, y, s) {
    const { ctx, t } = this;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s, s);
    for (let i = 0; i < 5; i++) {
      const sway = Math.sin(t * 0.0012 + i) * 18;
      ctx.strokeStyle = `hsla(${150 + i * 8}, 55%, ${28 + i * 5}%, 0.9)`;
      ctx.lineWidth = 8 - i * 0.6;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(i * 8, 0);
      ctx.bezierCurveTo(i * 8 + sway, -40, i * 6 - sway, -90, i * 8 + sway * 0.6, -150 - i * 12);
      ctx.stroke();
    }
    ctx.restore();
  }

  drawBackground() {
    const { ctx, w, h } = this;
    if (!this.bg || !this.bg.naturalWidth) {
      this.drawWater();
      return;
    }
    const iw = this.bg.naturalWidth;
    const ih = this.bg.naturalHeight;
    const zoom = 1.1 + Math.sin(this.t * 0.00007) * 0.03;
    const panX = Math.sin(this.t * 0.000045) * 22;
    const panY = Math.cos(this.t * 0.000038) * 12;
    const scale = Math.max(w / iw, h / ih) * zoom;
    const dw = iw * scale;
    const dh = ih * scale;
    ctx.drawImage(this.bg, (w - dw) / 2 + panX, (h - dh) / 2 + panY, dw, dh);
    ctx.fillStyle = "rgba(2, 18, 36, 0.08)";
    ctx.fillRect(0, 0, w, h);
  }

  drawGodRays() {
    const { ctx, w, h } = this;
    ctx.save();
    ctx.globalCompositeOperation = this.bg ? "overlay" : "soft-light";
    for (let i = 0; i < 7; i++) {
      const sway = Math.sin(this.t * 0.00022 + i * 0.7) * 48;
      ctx.beginPath();
      ctx.moveTo(w * 0.28 + i * 34 + sway, -20);
      ctx.lineTo(w * 0.38 + i * 38 + sway, -20);
      ctx.lineTo(w * 0.58 + i * 72 + sway * 1.8, h);
      ctx.lineTo(w * 0.12 + i * 52 + sway * 1.8, h);
      const rg = ctx.createLinearGradient(0, 0, 0, h);
      rg.addColorStop(0, this.bg ? "rgba(255,255,220,0.22)" : "rgba(255,255,255,0.28)");
      rg.addColorStop(0.55, "rgba(255,255,255,0)");
      ctx.fillStyle = rg;
      ctx.fill();
    }
    ctx.restore();
  }

  drawKelp(front = false) {
    const { ctx, w, h, t } = this;
    const beds = front
      ? [
          { x: 0.03, s: 1.55, hue: 148 },
          { x: 0.11, s: 1.2, hue: 162 },
          { x: 0.88, s: 1.45, hue: 154 },
          { x: 0.96, s: 1.7, hue: 142 },
        ]
      : [
          { x: 0.22, s: 0.95, hue: 156 },
          { x: 0.38, s: 0.7, hue: 168 },
          { x: 0.62, s: 0.85, hue: 150 },
          { x: 0.74, s: 1.05, hue: 160 },
        ];
    beds.forEach((bed, bi) => {
      ctx.save();
      ctx.translate(w * bed.x, h + 8);
      ctx.globalAlpha = front ? 0.72 : this.bg ? 0.38 : 0.85;
      for (let i = 0; i < 6; i++) {
        const sway = Math.sin(t * 0.0011 + i * 0.4 + bi) * (front ? 28 : 16);
        ctx.strokeStyle = `hsla(${bed.hue + i * 6}, 58%, ${22 + i * 6}%, ${front ? 0.95 : 0.8})`;
        ctx.lineWidth = (front ? 11 : 7) - i * 0.7;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(i * 9, 0);
        ctx.bezierCurveTo(
          i * 9 + sway,
          -h * 0.18 * bed.s,
          i * 6 - sway * 0.6,
          -h * 0.32 * bed.s,
          i * 9 + sway * 0.7,
          -h * (front ? 0.42 : 0.28) * bed.s - i * 10
        );
        ctx.stroke();
      }
      ctx.restore();
    });
  }

  drawCritters() {
    const { ctx, t } = this;
    this.critters.forEach((c) => {
      const y = c.y + Math.sin(t * 0.0018 + c.phase) * c.amp;
      ctx.save();
      ctx.translate(c.x, y);
      ctx.scale(c.vx >= 0 ? c.s : -c.s, c.s);
      ctx.globalAlpha = this.bg ? 0.28 : 0.4;
      ctx.fillStyle = `hsl(${c.hue} 45% 62%)`;
      ctx.beginPath();
      ctx.ellipse(0, 0, 11, 5.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(12, 0);
      ctx.lineTo(24, -7);
      ctx.lineTo(21, 0);
      ctx.lineTo(24, 7);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.7)";
      ctx.beginPath();
      ctx.arc(-6, -2, 1.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });
  }

  feedFish() {
    const cx = this.w * (0.38 + Math.random() * 0.24);
    this.food = this.food || [];
    for (let i = 0; i < 42; i++) {
      this.food.push({
        x: cx + (Math.random() - 0.5) * this.w * 0.34,
        y: -8 - Math.random() * 90,
        r: 3.5 + Math.random() * 5.5,
        vy: 0.09 + Math.random() * 0.05,
        vx: (Math.random() - 0.5) * 0.08,
        rot: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 0.003,
        wobble: Math.random() * Math.PI * 2,
        hue: 26 + Math.random() * 22,
        a: 1,
      });
    }
    this.splashes.push(new Splash(cx, 36));
    this.fish.forEach((f) => {
      if (f.entering || !f.ready || f.gone) return;
      f.path = "wander";
      f.wx = cx + (Math.random() - 0.5) * 160;
      f.wy = this.h * 0.22;
      f.boost = 700 + Math.random() * 400;
    });
  }

  stepFood(dt) {
    if (!this.food?.length) return;
    this.food.forEach((c) => {
      c.wobble += 0.0035 * dt;
      c.x += c.vx * dt + Math.sin(c.wobble) * 0.28;
      c.y += c.vy * dt;
      c.rot += c.vr * dt;
      if (c.y > this.h * 0.78) c.a -= 0.0018 * dt;
      if (c.y > this.h + 12) c.a = 0;
    });
    this.food = this.food.filter((c) => c.a > 0.05);
    const crumbs = this.food;
    if (!crumbs.length) return;
    const avgY = crumbs.reduce((s, c) => s + c.y, 0) / crumbs.length;
    const avgX = crumbs.reduce((s, c) => s + c.x, 0) / crumbs.length;
    this.fish.forEach((f) => {
      if (f.entering || !f.ready || f.gone || f.caught) return;
      f.wx = avgX + (Math.random() - 0.5) * 80;
      f.wy = Math.min(this.h * 0.72, avgY + 20);
    });
  }

  drawFood() {
    const { ctx } = this;
    this.food.forEach((c) => {
      ctx.save();
      ctx.translate(c.x, c.y);
      ctx.rotate(c.rot);
      ctx.globalAlpha = Math.max(0, c.a);
      ctx.fillStyle = `hsl(${c.hue} 70% 56%)`;
      ctx.beginPath();
      ctx.ellipse(0, 0, c.r, c.r * 0.62, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = `hsl(${c.hue + 8} 55% 72%)`;
      ctx.beginPath();
      ctx.ellipse(-c.r * 0.28, -c.r * 0.18, c.r * 0.38, c.r * 0.22, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });
  }

  catchAll() {
    if (this.net) return;
    const gatherY = this.h * 0.4;
    this.net = {
      phase: "drop",
      y: -this.h * 0.28,
      gatherY,
      vy: 0.42,
      t: 0,
    };
    this.fish.forEach((f) => {
      if (f.gone) return;
      f.caught = true;
      f.entering = false;
      f.path = "wander";
      f.wx = this.w * 0.5;
      f.wy = gatherY;
      f.boost = 1000;
    });
  }

  clearTank() {
    this.fish.forEach((f) => {
      if (f.fish3D) this.threeEngine.removeFish(f.fish3D);
      f.gone = true;
    });
    this.fish = [];
    this.net = null;
    this.food = [];
  }

  stepNet(dt) {
    if (!this.net) return;
    const net = this.net;
    if (net.phase === "drop") {
      net.y += 0.48 * dt;
      if (net.y >= net.gatherY) {
        net.y = net.gatherY;
        net.phase = "gather";
        net.t = 0;
      }
    } else if (net.phase === "gather") {
      net.t += dt;
      if (net.t > 700) {
        net.phase = "lift";
        net.vy = -0.62;
      }
    } else if (net.phase === "lift") {
      net.y += net.vy * dt;
      if (net.y < -this.h * 0.4) {
        this.clearTank();
      }
    }
  }

  drawNet() {
    const net = this.net;
    if (!net) return;
    const { ctx, w } = this;
    const top = net.y - 90;
    const bottom = net.y + 110;
    const left = w * 0.18;
    const right = w * 0.82;
    ctx.save();
    ctx.strokeStyle = "rgba(230, 245, 255, 0.55)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(w * 0.08, top - 160);
    ctx.lineTo(left, top);
    ctx.moveTo(w * 0.92, top - 160);
    ctx.lineTo(right, top);
    ctx.stroke();
    ctx.fillStyle = "rgba(8, 28, 42, 0.22)";
    ctx.beginPath();
    ctx.moveTo(left, top);
    ctx.lineTo(right, top);
    ctx.lineTo(right + 28, bottom);
    ctx.lineTo(left - 28, bottom);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "rgba(210, 235, 255, 0.7)";
    ctx.lineWidth = 2;
    ctx.stroke();
    const cols = 9;
    const rows = 6;
    for (let i = 1; i < cols; i++) {
      const t = i / cols;
      ctx.beginPath();
      ctx.moveTo(left + (right - left) * t, top);
      ctx.lineTo(left - 28 + (right + 28 - (left - 28)) * t, bottom);
      ctx.stroke();
    }
    for (let j = 1; j < rows; j++) {
      const t = j / rows;
      const y = top + (bottom - top) * t;
      const inset = 28 * t;
      ctx.beginPath();
      ctx.moveTo(left - inset, y);
      ctx.lineTo(right + inset, y);
      ctx.stroke();
    }
    ctx.restore();
  }

  draw() {
    const { ctx, w, h } = this;
    this.drawBackground();
    this.drawGodRays();
    this.drawCaustics();
    this.drawKelp(false);
    this.motes.forEach((m) => {
      ctx.beginPath();
      ctx.arc(m.x, m.y, m.r, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(220,250,255,0.18)";
      ctx.fill();
    });
    if (!this.fish.some((f) => f.ready && !f.gone)) this.drawCritters();
    this.bubbles.forEach((b) => {
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(220,250,255,0.32)";
      ctx.lineWidth = 1.2;
      ctx.stroke();
    });
    this.fish.forEach((f) => f.draw(ctx));
    this.splashes.forEach((s) => s.draw(ctx));
    
    // Рендерим 3D рыбок поверх 2D
    this.threeEngine.render(ctx);
    this.drawFood();
    
    if (!this.bg) this.drawReef();
    this.drawKelp(true);
    this.drawNet();

    const vignette = ctx.createRadialGradient(w / 2, h / 2, h * 0.4, w / 2, h / 2, h * 0.95);
    vignette.addColorStop(0, "rgba(0,0,0,0)");
    vignette.addColorStop(1, "rgba(0,10,24,0.16)");
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, w, h);
  }
}
