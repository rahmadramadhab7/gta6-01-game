// The HUD: cash, wanted stars, health, clock and speed as DOM, plus a 2D canvas
// minimap drawn top-down — streets, blocks, the beach, the player arrow, traffic dots.
import { CITY, STREET_LINES } from './config.js';

const MINIMAP_SIZE = 180;
/** World units per minimap pixel: the map covers the city plus the beach. */
const MAP_SCALE = MINIMAP_SIZE / 320;

function worldToMap(x, z) {
  return {
    x: MINIMAP_SIZE / 2 + (x + 20) * MAP_SCALE,
    y: MINIMAP_SIZE / 2 + z * MAP_SCALE,
  };
}

export function createHud() {
  const elements = {
    root: document.getElementById('hud'),
    cash: document.getElementById('cash'),
    objective: document.getElementById('objective'),
    wanted: document.getElementById('wanted'),
    wantedState: document.getElementById('wanted-state'),
    banner: document.getElementById('banner'),
    bannerMain: document.getElementById('banner-main'),
    bannerSub: document.getElementById('banner-sub'),
    healthBar: document.getElementById('health-bar'),
    healthText: document.getElementById('health-text'),
    clock: document.getElementById('clock'),
    speed: document.getElementById('speed'),
    toast: document.getElementById('toast'),
    minimap: document.getElementById('minimap'),
  };
  const ctx = elements.minimap.getContext('2d');
  let toastTimer = 0;
  let bannerTimer = 0;
  return {
    elements,
    show() { elements.root.hidden = false; },
    hide() { elements.root.hidden = true; },
    setCash(value) {
      elements.cash.textContent = `$${value.toLocaleString('en-US')}`;
    },
    setObjective(text) {
      elements.objective.textContent = `Objective: ${text}`;
    },
    setWanted(level) {
      const stars = [0, 1, 2, 3, 4].map((i) => (i < level ? '<span class="lit">★</span>' : '☆')).join('');
      elements.wanted.innerHTML = stars;
      elements.wanted.setAttribute('aria-label', `Wanted level ${level} of 5`);
    },
    /** The chase state under the stars: WANTED while seen, EVADING while hidden. */
    setWantedState(mode) {
      if (mode === 'wanted') {
        elements.wantedState.textContent = 'WANTED';
        elements.wantedState.className = 'state-wanted';
      } else if (mode === 'evading') {
        elements.wantedState.textContent = 'EVADING';
        elements.wantedState.className = 'state-evading';
      } else {
        elements.wantedState.textContent = '';
        elements.wantedState.className = '';
      }
    },
    /** A big centre-screen banner (BUSTED) with a smaller line under it. */
    showBanner(main, sub, seconds = 4) {
      elements.bannerMain.textContent = main;
      elements.bannerSub.textContent = sub;
      elements.banner.hidden = false;
      bannerTimer = seconds;
    },
    hideBanner() {
      elements.banner.hidden = true;
      bannerTimer = 0;
    },
    /** Advance the banner timer; hide it when it runs out. */
    tickBanner(dt) {
      if (bannerTimer > 0) {
        bannerTimer -= dt;
        if (bannerTimer <= 0) elements.banner.hidden = true;
      }
    },
    setHealth(value) {
      const clamped = Math.max(0, Math.min(100, Math.round(value)));
      elements.healthBar.style.width = `${clamped}%`;
      elements.healthText.textContent = String(clamped);
    },
    setClock(day, minutes) {
      const hours = Math.floor(minutes / 60) % 24;
      const mins = Math.floor(minutes % 60);
      elements.clock.textContent = `Day ${day} · ${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
    },
    setSpeed(mph, mode) {
      elements.speed.textContent = `${Math.round(mph)} mph · ${mode}`;
    },
    showToast(message, seconds = 4) {
      elements.toast.textContent = message;
      elements.toast.hidden = false;
      toastTimer = seconds;
    },
    /** Advance the toast timer; hide it when it runs out. */
    tickToast(dt) {
      if (toastTimer > 0) {
        toastTimer -= dt;
        if (toastTimer <= 0) elements.toast.hidden = true;
      }
    },
    /** Draw the minimap: dark sea, sand, street grid, blocks, traffic, player arrow. */
    drawMinimap(player, dots) {
      ctx.clearRect(0, 0, MINIMAP_SIZE, MINIMAP_SIZE);
      // Ocean and sand on the west edge.
      ctx.fillStyle = '#1d4e66';
      ctx.fillRect(0, 0, MINIMAP_SIZE, MINIMAP_SIZE);
      const beach = worldToMap(-138, 0);
      ctx.fillStyle = '#c9a06a';
      ctx.fillRect(0, 0, beach.x + 14 * MAP_SCALE, MINIMAP_SIZE);
      // City ground.
      ctx.fillStyle = '#232838';
      ctx.fillRect(beach.x + 14 * MAP_SCALE, 0, MINIMAP_SIZE, MINIMAP_SIZE);
      // Blocks.
      ctx.fillStyle = '#4a4a58';
      for (const bx of [-92, -46, 0, 46, 92]) {
        for (const bz of [-92, -46, 0, 46, 92]) {
          const top = worldToMap(bx - 17, bz - 17);
          ctx.fillRect(top.x, top.y, 34 * MAP_SCALE, 34 * MAP_SCALE);
        }
      }
      // Streets.
      ctx.strokeStyle = '#8d8272';
      ctx.lineWidth = 12 * MAP_SCALE;
      for (const line of STREET_LINES) {
        const a = worldToMap(line, -115);
        const b = worldToMap(line, 115);
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
        const c = worldToMap(-115, line);
        const d = worldToMap(115, line);
        ctx.beginPath(); ctx.moveTo(c.x, c.y); ctx.lineTo(d.x, d.y); ctx.stroke();
      }
      // The pier, jutting west from the central avenue.
      const pier = worldToMap(-138, 23);
      ctx.strokeStyle = '#8a6b4f';
      ctx.lineWidth = 5;
      ctx.beginPath(); ctx.moveTo(pier.x + 14 * MAP_SCALE, pier.y); ctx.lineTo(pier.x - 52 * MAP_SCALE, pier.y); ctx.stroke();
      // Traffic dots.
      const flashRed = Math.floor(performance.now() / 350) % 2 === 0;
      for (const dot of dots) {
        const p = worldToMap(dot.x, dot.z);
        if (dot.kind === 'police') {
          // Police flash red/blue on the minimap, bigger than traffic.
          ctx.fillStyle = flashRed ? '#ff3b30' : '#3b82ff';
          ctx.beginPath();
          ctx.arc(p.x, p.y, 3.5, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = 'rgba(255,255,255,0.9)';
          ctx.lineWidth = 1;
          ctx.stroke();
          continue;
        }
        ctx.fillStyle = dot.kind === 'car' ? '#ffd166' : 'rgba(255,255,255,0.7)';
        ctx.beginPath();
        ctx.arc(p.x, p.y, dot.kind === 'car' ? 2.5 : 1.5, 0, Math.PI * 2);
        ctx.fill();
      }
      // Player arrow, pointing along the heading, with a north marker above it.
      const p = worldToMap(player.x, player.z);
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(Math.atan2(Math.sin(player.heading), -Math.cos(player.heading)) + Math.PI);
      ctx.fillStyle = '#7ee787';
      ctx.beginPath();
      ctx.moveTo(0, -7); ctx.lineTo(5, 6); ctx.lineTo(0, 3); ctx.lineTo(-5, 6); ctx.closePath();
      ctx.fill();
      ctx.restore();
      ctx.fillStyle = '#f5efe4';
      ctx.font = 'bold 11px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('N', MINIMAP_SIZE / 2, 13);
    },
  };
}
