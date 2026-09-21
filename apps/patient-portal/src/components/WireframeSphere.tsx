import React, { useRef, useEffect } from 'react';

interface WireframeSphereProps {
  scrollY?: number;
  mouseX?: number;
  mouseY?: number;
}

const SPHERE_RADIUS_RATIO = 0.22;
const LATITUDE_LINES = 10;
const LONGITUDE_LINES = 14;

const WireframeSphere: React.FC<WireframeSphereProps> = ({
  scrollY = 0,
  mouseX = 0.5,
  mouseY = 0.5,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const angleRef = useRef(0);
  const tiltXRef = useRef(0);
  const tiltYRef = useRef(0);
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

      const centerX = width / 2;
      const centerY = height / 2;
      const radius = Math.min(width, height) * SPHERE_RADIUS_RATIO;

      // Update rotation based on scroll speed
      const scrollSpeed = Math.min(scrollY * 0.003, 0.08);
      angleRef.current += 0.004 + scrollSpeed;

      // Smooth tilt toward mouse
      const targetTiltX = (mouseY - 0.5) * 15;
      const targetTiltY = (mouseX - 0.5) * 15;
      tiltXRef.current += (targetTiltX - tiltXRef.current) * 0.03;
      tiltYRef.current += (targetTiltY - tiltYRef.current) * 0.03;

      const tiltX = tiltXRef.current * (Math.PI / 180);
      const tiltY = tiltYRef.current * (Math.PI / 180);
      const angle = angleRef.current;

      // Helper: project 3D point to 2D
      const project = (x: number, y: number, z: number): [number, number] => {
        // Rotate around Y axis
        const cosA = Math.cos(angle);
        const sinA = Math.sin(angle);
        let rx = x * cosA + z * sinA;
        let rz = -x * sinA + z * cosA;
        let ry = y;

        // Tilt around X axis
        const cosTX = Math.cos(tiltX);
        const sinTX = Math.sin(tiltX);
        const ry2 = ry * cosTX - rz * sinTX;
        const rz2 = ry * sinTX + rz * cosTX;

        // Tilt around Y axis
        const cosTY = Math.cos(tiltY);
        const sinTY = Math.sin(tiltY);
        const rx2 = rx * cosTY + rz2 * sinTY;
        const rz3 = -rx * sinTY + rz2 * cosTY;

        // Perspective
        const perspective = 600;
        const scale = perspective / (perspective + rz3 + radius);

        return [centerX + rx2 * scale, centerY + ry2 * scale];
      };

      const isLight = document.documentElement.getAttribute('data-theme') === 'light';
      ctx.lineWidth = isLight ? 0.75 : 0.6;
      ctx.strokeStyle = isLight ? 'rgba(2, 132, 199, 0.14)' : 'rgba(0, 229, 255, 0.15)';


      // Draw latitude lines (horizontal circles)
      for (let i = 0; i <= LATITUDE_LINES; i++) {
        const lat = (Math.PI * i) / LATITUDE_LINES - Math.PI / 2;
        const latRadius = Math.cos(lat) * radius;
        const latY = Math.sin(lat) * radius;

        ctx.beginPath();
        for (let j = 0; j <= 60; j++) {
          const lon = (Math.PI * 2 * j) / 60;
          const x = Math.cos(lon) * latRadius;
          const z = Math.sin(lon) * latRadius;
          const y = latY;
          const [px, py] = project(x, y, z);
          if (j === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.stroke();
      }

      // Draw longitude lines (vertical arcs)
      for (let i = 0; i < LONGITUDE_LINES; i++) {
        const lon = (Math.PI * 2 * i) / LONGITUDE_LINES;
        ctx.beginPath();
        for (let j = 0; j <= 60; j++) {
          const lat = (Math.PI * j) / 60 - Math.PI / 2;
          const x = Math.cos(lat) * Math.cos(lon) * radius;
          const z = Math.cos(lat) * Math.sin(lon) * radius;
          const y = Math.sin(lat) * radius;
          const [px, py] = project(x, y, z);
          if (j === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.stroke();
      }

      // Draw equator ring (bright teal)
      ctx.beginPath();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = 'rgba(0, 229, 255, 0.45)';
      for (let j = 0; j <= 80; j++) {
        const lon = (Math.PI * 2 * j) / 80;
        const x = Math.cos(lon) * radius;
        const z = Math.sin(lon) * radius;
        const y = 0;
        const [px, py] = project(x, y, z);
        if (j === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();

      // Reset
      ctx.lineWidth = 0.6;
      ctx.strokeStyle = 'rgba(0, 229, 255, 0.15)';

      animFrameRef.current = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      window.removeEventListener('resize', resize);
      cancelAnimationFrame(animFrameRef.current);
    };
  }, [scrollY, mouseX, mouseY]);

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

export default WireframeSphere;
