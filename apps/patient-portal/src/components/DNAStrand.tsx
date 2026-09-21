import React, { useRef, useEffect } from 'react';

interface DNAStrandProps {
  orientation: 'vertical' | 'diagonal';
  animated?: boolean;
}

const STRAND_WIDTH = 48;
const RUNG_COUNT = 36;
const HELIX_PERIOD = 3.2;

const DNAStrand: React.FC<DNAStrandProps> = ({ orientation, animated = true }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const phaseRef = useRef(0);
  const animFrameRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    const animate = () => {
      const { width, height } = canvas;
      ctx.clearRect(0, 0, width, height);

      if (animated) {
        phaseRef.current += 0.014;
      }

      const phase = phaseRef.current;
      const isLight =
        document.documentElement.getAttribute('data-theme') === 'light' ||
        document.body.classList.contains('light-theme');

      const centerX = orientation === 'vertical' ? width * 0.08 : width * 0.88;
      const startY = -50;
      const endY = height + 50;
      const strandLen = endY - startY;

      // Theme-tailored, vibrant bio-medical colors for clear visibility
      const strand1Color = isLight ? 'rgba(2, 132, 199, 0.68)' : 'rgba(0, 229, 255, 0.58)';
      const strand2Color = isLight ? 'rgba(13, 148, 136, 0.68)' : 'rgba(16, 185, 129, 0.52)';
      const glowColor = isLight ? 'rgba(2, 132, 199, 0.28)' : 'rgba(0, 229, 255, 0.4)';

      const drawStrand = () => {
        ctx.save();

        if (orientation === 'diagonal') {
          ctx.translate(width * 0.88, 0);
          ctx.rotate(Math.PI / 4);
          ctx.translate(-width * 0.88, 0);
        }

        // Draw connecting nucleotide rungs (base pairs)
        for (let i = 0; i < RUNG_COUNT; i++) {
          const t = i / RUNG_COUNT;
          const y = startY + t * strandLen;
          const helixOffset = (Math.sin(t * HELIX_PERIOD * Math.PI + phase) * STRAND_WIDTH) / 2;
          const helixOffset2 = (Math.sin(t * HELIX_PERIOD * Math.PI + phase + Math.PI) * STRAND_WIDTH) / 2;

          ctx.beginPath();
          ctx.moveTo(centerX + helixOffset, y);
          ctx.lineTo(centerX + helixOffset2, y);
          ctx.strokeStyle = isLight
            ? (i % 2 === 0 ? 'rgba(2, 132, 199, 0.42)' : 'rgba(13, 148, 136, 0.42)')
            : (i % 2 === 0 ? 'rgba(0, 229, 255, 0.35)' : 'rgba(16, 185, 129, 0.32)');
          ctx.lineWidth = 1.6;
          ctx.stroke();

          // Nucleotide Node 1 (End A)
          ctx.beginPath();
          ctx.arc(centerX + helixOffset, y, 2.6, 0, Math.PI * 2);
          ctx.fillStyle = isLight
            ? (i % 2 === 0 ? '#0284c7' : '#0ea5e9')
            : '#00e5ff';
          ctx.shadowBlur = 4;
          ctx.shadowColor = glowColor;
          ctx.fill();

          // Nucleotide Node 2 (End B)
          ctx.beginPath();
          ctx.arc(centerX + helixOffset2, y, 2.6, 0, Math.PI * 2);
          ctx.fillStyle = isLight
            ? (i % 2 === 0 ? '#0d9488' : '#10b981')
            : '#34d399';
          ctx.fill();
        }

        // Draw double helix main strands
        ctx.shadowBlur = isLight ? 6 : 10;
        ctx.shadowColor = glowColor;

        // Strand 1
        ctx.beginPath();
        for (let i = 0; i <= 200; i++) {
          const t = i / 200;
          const y = startY + t * strandLen;
          const helixOffset = (Math.sin(t * HELIX_PERIOD * Math.PI + phase) * STRAND_WIDTH) / 2;
          const x = centerX + helixOffset;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = strand1Color;
        ctx.lineWidth = 2.2;
        ctx.stroke();

        // Strand 2
        ctx.beginPath();
        for (let i = 0; i <= 200; i++) {
          const t = i / 200;
          const y = startY + t * strandLen;
          const helixOffset = (Math.sin(t * HELIX_PERIOD * Math.PI + phase + Math.PI) * STRAND_WIDTH) / 2;
          const x = centerX + helixOffset;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = strand2Color;
        ctx.lineWidth = 2.2;
        ctx.stroke();

        ctx.restore();
      };

      drawStrand();

      animFrameRef.current = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      window.removeEventListener('resize', resize);
      cancelAnimationFrame(animFrameRef.current);
    };
  }, [orientation, animated]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        zIndex: 1,
        pointerEvents: 'none',
      }}
    />
  );
};

export default DNAStrand;
