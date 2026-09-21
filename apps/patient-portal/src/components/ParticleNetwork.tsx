import React, { useRef, useEffect, useCallback } from 'react';

interface ParticleNetworkProps {
  interactive?: boolean;
}

type VirusSize = 'large' | 'medium' | 'small';
type VirusVariant = 'cyan' | 'teal';

interface ProteinSpike {
  angle: number;
  stemLen: number;
  headSize: number;
  wobble: number;
}

interface SurfaceProtein {
  angle: number;
  dist: number;
  size: number;
}

interface VirusParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: VirusSize;
  variant: VirusVariant;
  radius: number;
  alpha: number;
  rotation: number;
  rotSpeed: number;
  spikes: ProteinSpike[];
  surfaceProteins: SurfaceProtein[];
  textureDots: { dx: number; dy: number; r: number }[];
}

const CONNECTION_DISTANCE = 160;
const PARTICLE_COUNT = 6;
const VARIANTS: VirusVariant[] = ['cyan', 'teal'];

const SIZE_CONFIG: Record<
  VirusSize,
  {
    radius: number;
    spikeMinLen: number;
    spikeMaxLen: number;
    spikeCount: number;
    proteinCount: number;
    textureCount: number;
  }
> = {
  large:  { radius: 22, spikeMinLen: 12, spikeMaxLen: 16, spikeCount: 16, proteinCount: 12, textureCount: 26 },
  medium: { radius: 15, spikeMinLen: 8,  spikeMaxLen: 12, spikeCount: 12, proteinCount: 8,  textureCount: 18 },
  small:  { radius: 9,  spikeMinLen: 5,  spikeMaxLen: 9,  spikeCount: 10, proteinCount: 6,  textureCount: 12 },
};

interface VirusColorSet {
  highlight: string;
  bodyLight: string;
  bodyMid: string;
  bodyDark: string;
  spikeColor: string;
  spikeHeadColor: string;
  proteinColor: string;
  textureColor: string;
  glowColor: string;
}

// Simple, clean, unified medical cyan and teal palettes for Light Theme
const LIGHT_VARIANT_COLORS: Record<VirusVariant, VirusColorSet> = {
  cyan: {
    highlight: '#e0f2fe',
    bodyLight: '#7dd3fc',
    bodyMid: '#38bdf8',
    bodyDark: '#0284c7',
    spikeColor: '#0ea5e9',
    spikeHeadColor: '#0284c7',
    proteinColor: '#0369a1',
    textureColor: 'rgba(2, 132, 199, 0.15)',
    glowColor: 'rgba(2, 132, 199, 0.16)',
  },
  teal: {
    highlight: '#ccfbf1',
    bodyLight: '#5eead4',
    bodyMid: '#14b8a6',
    bodyDark: '#0f766e',
    spikeColor: '#0d9488',
    spikeHeadColor: '#0f766e',
    proteinColor: '#115e59',
    textureColor: 'rgba(13, 148, 136, 0.15)',
    glowColor: 'rgba(13, 148, 136, 0.16)',
  },
};

// Clean medical cyan and teal for Dark Theme
const DARK_VARIANT_COLORS: Record<VirusVariant, VirusColorSet> = {
  cyan: {
    highlight: '#bae6fd',
    bodyLight: '#38bdf8',
    bodyMid: '#0284c7',
    bodyDark: '#082f49',
    spikeColor: '#0ea5e9',
    spikeHeadColor: '#00bcd4',
    proteinColor: '#38bdf8',
    textureColor: 'rgba(56, 189, 248, 0.18)',
    glowColor: 'rgba(0, 188, 212, 0.22)',
  },
  teal: {
    highlight: '#99f6e4',
    bodyLight: '#2dd4bf',
    bodyMid: '#0d9488',
    bodyDark: '#042f2e',
    spikeColor: '#14b8a6',
    spikeHeadColor: '#10b981',
    proteinColor: '#2dd4bf',
    textureColor: 'rgba(45, 212, 191, 0.18)',
    glowColor: 'rgba(16, 185, 129, 0.22)',
  },
};

/** Seeded random per particle so spikes/textures don't change every frame */
const seededRandom = (seed: number): number => {
  const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
};

/** Draw a clean crown/bulb shape at spike tip */
const drawSpikeHead = (
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  baseRadius: number,
  wobble: number,
  color: string
) => {
  const numLobes = 4;
  ctx.beginPath();
  for (let i = 0; i <= 24; i++) {
    const a = (Math.PI * 2 * i) / 24;
    const rOffset = Math.sin(a * numLobes + wobble) * (baseRadius * 0.3);
    const r = baseRadius + rOffset;
    const px = cx + Math.cos(a) * r;
    const py = cy + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
};

const drawVirus = (ctx: CanvasRenderingContext2D, p: VirusParticle) => {
  const { x, y, radius, alpha, rotation, variant } = p;
  const isLight =
    document.documentElement.getAttribute('data-theme') === 'light' ||
    document.body.classList.contains('light-theme');
  const colors = isLight ? LIGHT_VARIANT_COLORS[variant] : DARK_VARIANT_COLORS[variant];

  ctx.save();
  // Simple, balanced opacity: clean and visible without being too bold
  ctx.globalAlpha = isLight
    ? Math.min(0.55, Math.max(0.35, alpha * 0.75))
    : Math.min(0.65, Math.max(0.45, alpha * 0.8));
  ctx.translate(x, y);
  ctx.rotate(rotation);

  // === GLOW ===
  ctx.shadowBlur = isLight ? 4 : 8;
  ctx.shadowColor = colors.glowColor;

  // === PROTEIN SPIKES ===
  for (const spike of p.spikes) {
    const angle = spike.angle;
    const cosA = Math.cos(angle);
    const sinA = Math.sin(angle);
    const stemStart = radius - 2;
    const stemEnd = radius + spike.stemLen;

    // Spike Stem
    ctx.beginPath();
    ctx.moveTo(cosA * stemStart, sinA * stemStart);
    ctx.lineTo(cosA * stemEnd, sinA * stemEnd);
    ctx.strokeStyle = colors.spikeColor;
    ctx.lineWidth = 1.6;
    ctx.stroke();

    // Crown bulb at spike tip
    const headCx = cosA * stemEnd;
    const headCy = sinA * stemEnd;
    drawSpikeHead(ctx, headCx, headCy, spike.headSize, spike.wobble, colors.spikeHeadColor);
  }

  // === BODY (Clean 3D sphere radial gradient) ===
  const hlOffset = radius * 0.32;
  const grad = ctx.createRadialGradient(-hlOffset, -hlOffset, radius * 0.08, 0, 0, radius);
  grad.addColorStop(0, colors.highlight);
  grad.addColorStop(0.3, colors.bodyLight);
  grad.addColorStop(0.72, colors.bodyMid);
  grad.addColorStop(1, colors.bodyDark);

  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, Math.PI * 2);
  ctx.fillStyle = grad;
  ctx.fill();

  // === TEXTURE BUMPS ===
  ctx.shadowBlur = 0;
  for (const dot of p.textureDots) {
    ctx.beginPath();
    ctx.arc(dot.dx, dot.dy, dot.r, 0, Math.PI * 2);
    ctx.fillStyle = colors.textureColor;
    ctx.fill();
  }

  // === SURFACE PROTEINS ===
  for (const sp of p.surfaceProteins) {
    const sx = Math.cos(sp.angle) * sp.dist;
    const sy = Math.sin(sp.angle) * sp.dist;
    ctx.beginPath();
    ctx.arc(sx, sy, sp.size, 0, Math.PI * 2);
    ctx.fillStyle = colors.proteinColor;
    ctx.fill();
  }

  // === SPECULAR HIGHLIGHT ===
  ctx.beginPath();
  ctx.arc(-hlOffset * 0.65, -hlOffset * 0.65, radius * 0.2, 0, Math.PI * 2);
  ctx.fillStyle = isLight ? 'rgba(255, 255, 255, 0.4)' : 'rgba(255, 255, 255, 0.25)';
  ctx.fill();

  ctx.restore();
};

const ParticleNetwork: React.FC<ParticleNetworkProps> = ({ interactive = true }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<VirusParticle[]>([]);
  const mouseRef = useRef<{ x: number; y: number } | null>(null);
  const animFrameRef = useRef<number>(0);

  const createParticles = useCallback((width: number, height: number) => {
    const particles: VirusParticle[] = [];
    const cols = Math.ceil(Math.sqrt(PARTICLE_COUNT * (width / height)));
    const rows = Math.ceil(PARTICLE_COUNT / cols);
    const cellW = width / cols;
    const cellH = height / rows;

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const variant = VARIANTS[i % VARIANTS.length];
      const roll = Math.random();
      const size: VirusSize = roll > 0.75 ? 'large' : roll > 0.3 ? 'medium' : 'small';
      const cfg = SIZE_CONFIG[size];
      const seed = i * 7 + 1;

      // Place within grid cell with random jitter
      const col = i % cols;
      const row = Math.floor(i / cols);
      const cellX = cellW * (col + 0.5);
      const cellY = cellH * (row + 0.5);
      const jitterX = (Math.random() - 0.5) * cellW * 0.6;
      const jitterY = (Math.random() - 0.5) * cellH * 0.6;

      // Pre-generate spikes
      const spikes: ProteinSpike[] = [];
      for (let s = 0; s < cfg.spikeCount; s++) {
        const t = seededRandom(seed + s * 13);
        spikes.push({
          angle: (Math.PI * 2 * s) / cfg.spikeCount + seededRandom(seed + s) * 0.3,
          stemLen: cfg.spikeMinLen + t * (cfg.spikeMaxLen - cfg.spikeMinLen),
          headSize: 2.0 + seededRandom(seed + s * 7) * 2.5,
          wobble: seed + s * 17,
        });
      }

      // Pre-generate surface proteins
      const surfaceProteins: SurfaceProtein[] = [];
      for (let p2 = 0; p2 < cfg.proteinCount; p2++) {
        surfaceProteins.push({
          angle: seededRandom(seed + p2 * 19) * Math.PI * 2,
          dist: seededRandom(seed + p2 * 23) * cfg.radius * 0.85,
          size: 2.0 + seededRandom(seed + p2 * 31) * 1.5,
        });
      }

      // Pre-generate texture dots
      const textureDots: { dx: number; dy: number; r: number }[] = [];
      for (let t2 = 0; t2 < cfg.textureCount; t2++) {
        const a = seededRandom(seed + t2 * 37) * Math.PI * 2;
        const d = seededRandom(seed + t2 * 41) * cfg.radius * 0.9;
        textureDots.push({
          dx: Math.cos(a) * d,
          dy: Math.sin(a) * d,
          r: 0.5 + seededRandom(seed + t2 * 43) * 1.2,
        });
      }

      particles.push({
        x: cellX + jitterX,
        y: cellY + jitterY,
        vx: (Math.random() - 0.5) * 0.3,
        vy: (Math.random() - 0.5) * 0.3,
        size,
        variant,
        radius: cfg.radius,
        alpha: 0.55 + Math.random() * 0.25,
        rotation: Math.random() * Math.PI * 2,
        rotSpeed: (Math.random() - 0.5) * 0.005,
        spikes,
        surfaceProteins,
        textureDots,
      });
    }
    return particles;
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      if (particlesRef.current.length === 0) {
        particlesRef.current = createParticles(canvas.width, canvas.height);
      }
    };

    resize();
    window.addEventListener('resize', resize);

    const handleMouseMove = (e: MouseEvent) => {
      if (interactive) {
        mouseRef.current = { x: e.clientX, y: e.clientY };
      }
    };

    const handleMouseLeave = () => {
      mouseRef.current = null;
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseleave', handleMouseLeave);

    const animate = () => {
      const { width, height } = canvas;
      ctx.clearRect(0, 0, width, height);

      const particles = particlesRef.current;
      const mouse = mouseRef.current;
      const isLightMode =
        document.documentElement.getAttribute('data-theme') === 'light' ||
        document.body.classList.contains('light-theme');

      // Update positions and rotations
      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        p.rotation += p.rotSpeed;

        // Bounce off edges
        if (p.x < 0 || p.x > width) p.vx *= -1;
        if (p.y < 0 || p.y > height) p.vy *= -1;

        p.x = Math.max(0, Math.min(width, p.x));
        p.y = Math.max(0, Math.min(height, p.y));

        // Mouse gentle repulsion
        if (mouse) {
          const dx = p.x - mouse.x;
          const dy = p.y - mouse.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 150) {
            const force = ((150 - dist) / 150) * 0.6;
            p.vx += (dx / dist) * force;
            p.vy += (dy / dist) * force;
          }
        }

        p.vx *= 0.999;
        p.vy *= 0.999;
      }

      // Draw subtle network connecting lines between nearby particles
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < CONNECTION_DISTANCE) {
            const lineAlpha =
              (1 - dist / CONNECTION_DISTANCE) * (isLightMode ? 0.08 : 0.12);
            ctx.beginPath();
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.strokeStyle = isLightMode
              ? `rgba(2, 132, 199, ${lineAlpha})`
              : `rgba(0, 229, 255, ${lineAlpha})`;
            ctx.lineWidth = 0.6;
            ctx.stroke();
          }
        }
      }

      // Draw virus particles
      for (const p of particles) {
        drawVirus(ctx, p);
      }

      animFrameRef.current = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      window.removeEventListener('resize', resize);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseleave', handleMouseLeave);
      cancelAnimationFrame(animFrameRef.current);
    };
  }, [interactive, createParticles]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        zIndex: 0,
        pointerEvents: 'none',
      }}
    />
  );
};

export default ParticleNetwork;
