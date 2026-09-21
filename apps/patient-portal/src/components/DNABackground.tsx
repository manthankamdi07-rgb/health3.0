import React, { useEffect, useRef } from 'react';

interface DNABackgroundProps {
  animated?: boolean;
}

interface Ripple {
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  age: number;
  speed: number;
}

/**
 * Full-screen decorative canvas rendering two 3D-style DNA double-helixes
 * anchored to the left and right edges of the viewport.
 *
 * When `animated` the helixes slowly drift, parallax-scroll, and react to
 * the mouse with expanding water-ripple rings that displace the strands.
 * When static the helixes render once and stay put.
 */
export const DNABackground: React.FC<DNABackgroundProps> = ({ animated = false }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let width = 0;
    let height = 0;
    let rafId = 0;
    let running = animated;

    let scrollY = 0;
    const ripples: Ripple[] = [];

    // Helix config: each helix is described by a vertical centre-line (x),
    // a start y, a total vertical span, oscillation amplitude, phase, and
    // opacity.  Several of them overlap to give a deep, layered feel.
    interface HelixDef {
      cx: number;       // horizontal centre of the helix
      startY: number;   // top of the helix (screen-relative, before parallax)
      span: number;     // vertical extent
      amplitude: number; // horizontal swing of each strand (pixels)
      twist: number;    // radians per pixel of vertical travel
      phase: number;    // initial angular offset
      opacity: number;  // 0-1
      strokeWidth: number;
    }

    const buildHelices = (): HelixDef[] => {
      const cxLeft = width * 0.07;
      const cxRight = width * 0.93;
      return [
        // --- Main pair (large, prominent) ---
        { cx: cxLeft,  startY: -height * 0.08, span: height * 1.16, amplitude: 38, twist: 0.022, phase: 0,         opacity: 0.50, strokeWidth: 2.4 },
        { cx: cxRight, startY: -height * 0.04, span: height * 1.08, amplitude: 38, twist: 0.022, phase: Math.PI,   opacity: 0.50, strokeWidth: 2.4 },
        // --- Secondary pair (smaller, deeper) ---
        { cx: cxLeft * 1.85,  startY: -height * 0.18, span: height * 1.36, amplitude: 26, twist: 0.018, phase: 1.2,   opacity: 0.30, strokeWidth: 1.8 },
        { cx: cxRight * 1.08, startY: -height * 0.14, span: height * 1.28, amplitude: 26, twist: 0.018, phase: 1.2 + Math.PI, opacity: 0.30, strokeWidth: 1.8 },
      ];
    };

    let helices: HelixDef[] = [];
    let time = 0;

    /* ---- Water ripple displacement (for animated mode) ---- */
    const rippleDisp = (px: number, py: number): [number, number] => {
      let dx = 0;
      let dy = 0;
      for (const r of ripples) {
        const dist = Math.hypot(px - r.x, py - r.y);
        if (dist < r.radius && dist > 0) {
          const edge = 1 - dist / r.radius;           // 1 at centre, 0 at edge
          const lifeFade = Math.max(0, 1 - r.age / 60);
          const amp = edge * lifeFade * 18;
          const angle = Math.atan2(py - r.y, px - r.x);
          dx += Math.cos(angle) * amp * Math.sin(dist * 0.3 - r.age * 0.5);
          dy += Math.sin(angle) * amp * Math.cos(dist * 0.3 - r.age * 0.5);
        }
      }
      return [dx, dy];
    };

    /* ---- Draw a single DNA double-helix ---- */
    const drawHelix = (h: HelixDef, yShift: number, spin: number) => {
      const { cx, startY, span, amplitude, twist, phase, opacity, strokeWidth } = h;
      const segments = Math.ceil(span / 3);

      // Build arrays of points for each strand (A and B are 180° apart).
      interface Point { x: number; y: number; depth: number }

      const strandA: Point[] = [];
      const strandB: Point[] = [];

      for (let i = 0; i <= segments; i++) {
        const t = i / segments;
        const y = startY + yShift + t * span;
        const angle = t * twist * span + phase + spin;

        const sA = Math.sin(angle);
        const sB = Math.sin(angle + Math.PI);
        const depthA = (sA + 1) / 2;   // 0 = far, 1 = near
        const depthB = (sB + 1) / 2;

        // Apply ripple displacement
        const [dAx, dAy] = animated ? rippleDisp(cx + sA * amplitude, y) : [0, 0];
        const [dBx, dBy] = animated ? rippleDisp(cx + sB * amplitude, y) : [0, 0];

        strandA.push({ x: cx + sA * amplitude + dAx, y: y + dAy, depth: depthA });
        strandB.push({ x: cx + sB * amplitude + dBx, y: y + dBy, depth: depthB });
      }

      // ---- Ladder rungs (depth-cued, drawn first so strands paint on top) ----
      const rungGap = 24;
      ctx.save();
      for (let i = 0; i < strandA.length; i += Math.max(1, Math.round(rungGap / 3))) {
        const a = strandA[i];
        const b = strandB[i];
        if (!a || !b) continue;
        const avgDepth = (a.depth + b.depth) / 2;
        const rungAlpha = 0.08 + avgDepth * 0.35;
        const rungWidth = 0.8 + avgDepth * 0.8;

        ctx.strokeStyle = `rgba(0, 188, 212, ${rungAlpha.toFixed(3)})`;
        ctx.lineWidth = rungWidth;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
      ctx.restore();

      // ---- Draw strands with depth-dependent stroke (3D illusion) ----
      const drawStrand = (pts: Point[], baseAlpha: number) => {
        for (let pass = 0; pass < 2; pass++) {
          // pass 0 = far side (thinner, dimmer), pass 1 = near side (thicker, brighter)
          ctx.beginPath();
          let started = false;
          for (let i = 0; i < pts.length; i++) {
            const p = pts[i];
            if (pass === 0 ? p.depth > 0.55 : p.depth < 0.45) {
              if (started) { ctx.stroke(); started = false; ctx.beginPath(); }
              continue;
            }
            if (!started) { ctx.moveTo(p.x, p.y); started = true; }
            else ctx.lineTo(p.x, p.y);
          }
          if (started) {
            const alpha = pass === 1 ? baseAlpha : baseAlpha * 0.55;
            const lw = pass === 1 ? strokeWidth + 0.5 : strokeWidth - 0.4;
            ctx.strokeStyle = `rgba(0, 188, 212, ${alpha.toFixed(3)})`;
            ctx.lineWidth = Math.max(0.8, lw);
            ctx.shadowColor = pass === 1 ? 'rgba(0, 188, 212, 0.55)' : 'transparent';
            ctx.shadowBlur = pass === 1 ? 14 : 0;
            ctx.stroke();
          }
        }
      };

      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      drawStrand(strandA, opacity);
      drawStrand(strandB, opacity);
    };

    /* ---- Main render loop ---- */
    const render = () => {
      const anim = animated && running;
      if (anim) time += 0.008;

      ctx.clearRect(0, 0, width, height);

      // Subtle radial glow pools at each helix centre.
      for (const h of helices) {
        const glow = ctx.createRadialGradient(h.cx, height * 0.5, 0, h.cx, height * 0.5, h.amplitude * 6);
        glow.addColorStop(0, `rgba(0, 188, 212, ${0.03 * h.opacity})`);
        glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = glow;
        ctx.fillRect(h.cx - h.amplitude * 7, 0, h.amplitude * 14, height);
      }

      const yShift = anim ? scrollY * 0.4 : 0;
      const spin = anim ? Math.sin(time * 0.6) * 0.3 : 0;

      for (const h of helices) drawHelix(h, yShift, spin);

      // Draw ripple rings (animated mode only)
      if (anim) {
        for (let i = ripples.length - 1; i >= 0; i--) {
          const r = ripples[i];
          r.radius += r.speed;
          r.age++;
          if (r.radius > r.maxRadius || r.age > 60) { ripples.splice(i, 1); continue; }
          const fade = 1 - r.age / 55;
          ctx.save();
          ctx.globalAlpha = Math.max(0, fade) * 0.30;
          ctx.strokeStyle = 'rgba(0, 188, 212, 1)';
          ctx.lineWidth = 1.4;
          ctx.shadowColor = 'rgba(0, 188, 212, 0.7)';
          ctx.shadowBlur = 10;
          ctx.beginPath();
          ctx.arc(r.x, r.y, r.radius, 0, Math.PI * 2);
          ctx.stroke();
          // Second ring for richness
          ctx.globalAlpha = Math.max(0, fade) * 0.15;
          ctx.beginPath();
          ctx.arc(r.x, r.y, r.radius * 0.6, 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();
        }
      }

      if (anim) rafId = requestAnimationFrame(render);
    };

    /* ---- Resize handler ---- */
    const handleResize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      helices = buildHelices();
    };

    const handleScroll = () => { scrollY = window.scrollY; };

    const handleMouseMove = (e: MouseEvent) => {
      if (ripples.length < 12) {
        ripples.push({
          x: e.clientX,
          y: e.clientY,
          radius: 5,
          maxRadius: 160 + Math.random() * 60,
          age: 0,
          speed: 1.4 + Math.random() * 1.0,
        });
      }
    };

    handleResize();
    helices = buildHelices();

    if (animated) {
      window.addEventListener('resize', handleResize);
      window.addEventListener('scroll', handleScroll, { passive: true });
      window.addEventListener('mousemove', handleMouseMove);
      running = true;
      render();
    } else {
      render();
    }

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('mousemove', handleMouseMove);
    };
  }, [animated]);

  return <canvas ref={canvasRef} className="dna-canvas" aria-hidden="true" />;
};

export default DNABackground;