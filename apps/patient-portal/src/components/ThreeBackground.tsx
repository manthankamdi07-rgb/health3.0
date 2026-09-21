import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';

interface MouseTarget {
  x: number;
  y: number;
}

const CYAN = 0x00d4ff;
const TEAL = 0x00ffc8;
const CYAN_MILD = 0x33e0ff;

/**
 * Full-screen atmospheric Three.js scene rendered behind the auth UI.
 * A futuristic healthcare backdrop with:
 * - Glowing cyan/teal orbs floating in space
 * - Drifting star-like particle field
 * - Two wireframe DNA helix models framing the top and bottom (ambient backlighting)
 * - Mouse parallax: the whole scene eases toward the cursor
 *
 * Pure visual layer — no props, zero React state, no interaction with
 * form logic. Uses additive blending + low opacity so it sits quietly
 * behind the existing glass-card.
 */
const ThreeBackground: React.FC = () => {
  const mountRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        powerPreference: 'low-power',
      });
    } catch {
      // WebGL unsupported — silently degrade to the plain gradient background
      return;
    }

    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.setClearColor(0x000000, 0);
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(
      55,
      mount.clientWidth / mount.clientHeight,
      0.1,
      100
    );
    camera.position.z = 12;

    // ----- Ambient dim lighting for the wireframe -----
    scene.add(new THREE.AmbientLight(0xffffff, 0.4));

    // ----------------------- ORBS -----------------------
    // Soft glowing spheres in cyan/teal, gently bobbing.
    const orbGroup = new THREE.Group();
    scene.add(orbGroup);

    const orbColors = [CYAN, TEAL, CYAN_MILD, CYAN, TEAL];
    const orbRadius = [1.5, 1.0, 0.7, 1.2, 0.6];
    const orbPositions: [number, number, number][] = [
      [-6.5, 2.5, -6],
      [6.2, -1.5, -5],
      [-4.5, -3.0, -4],
      [5.2, 3.0, -7],
      [0.5, -2.5, -8],
    ];

    const orbs = orbColors.map((color, i) => {
      const radius = orbRadius[i];
      const material = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.15,
      });
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 32, 32), material);
      mesh.position.set(...orbPositions[i]);
      orbGroup.add(mesh);
      return mesh;
    });

    // ----------------------- PARTICLE STARS -----------------------
    const starCount = 300;
    const starGeometry = new THREE.BufferGeometry();
    const starPositions = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      starPositions[i * 3] = (Math.random() - 0.5) * 30;
      starPositions[i * 3 + 1] = (Math.random() - 0.5) * 20;
      starPositions[i * 3 + 2] = (Math.random() - 0.5) * 16 - 2;
    }
    starGeometry.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));

    const starMaterial = new THREE.PointsMaterial({
      color: CYAN,
      size: 0.045,
      transparent: true,
      opacity: 0.65,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const stars = new THREE.Points(starGeometry, starMaterial);
    scene.add(stars);

    // ----------------------- DNA HELICES (TOP & BOTTOM) -----------------------
    // Two intertwining helices built from tube segments + sine cross-bars,
    // positioned to frame the top and bottom of the scene for ambient backlighting.
    const helixGroup = new THREE.Group();
    scene.add(helixGroup);

    const helixMaterial = new THREE.MeshBasicMaterial({
      color: CYAN,
      wireframe: true,
      transparent: true,
      opacity: 0.3,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    const rungMaterial = new THREE.MeshBasicMaterial({
      color: TEAL,
      transparent: true,
      opacity: 0.18,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    const STRANDS = 2;
    const RADIUS = 1.4;
    const HEIGHT = 4.0;
    const SEGMENTS = 48;
    const CIRCLE_SEGMENTS = 10;

    const buildHelix = (positionY: number, scaleX = 1): THREE.Group => {
      const group = new THREE.Group();

      for (let s = 0; s < STRANDS; s++) {
        const phase = (s / STRANDS) * Math.PI * 2;
        const points: THREE.Vector3[] = [];
        for (let i = 0; i <= SEGMENTS; i++) {
          const t = i / SEGMENTS;
          const angle = phase + t * Math.PI * 4;
          points.push(
            new THREE.Vector3(
              Math.cos(angle) * RADIUS * scaleX,
              (t - 0.5) * HEIGHT,
              Math.sin(angle) * RADIUS
            )
          );
        }
        const curve = new THREE.CatmullRomCurve3(points);
        const tube = new THREE.Mesh(
          new THREE.TubeGeometry(curve, 96, 0.04, CIRCLE_SEGMENTS, false),
          helixMaterial
        );
        group.add(tube);
      }

      // Cross-bars between strands (rungs)
      const rungCount = 12;
      for (let i = 0; i < rungCount; i++) {
        const t = i / (rungCount - 1);
        const y = (t - 0.5) * HEIGHT;
        const angle = t * Math.PI * 4;
        const rung = new THREE.Mesh(
          new THREE.CylinderGeometry(0.02, 0.02, RADIUS * 2 * scaleX, 6),
          rungMaterial
        );
        rung.position.set(0, y, 0);
        rung.rotation.z = angle + Math.PI / 2;
        rung.rotation.y = angle;
        group.add(rung);
      }

      group.position.y = positionY;
      return group;
    };

    // Top helix — large, tilted, ambient backlight above the card
    const topHelix = buildHelix(4.2, 1.6);
    topHelix.rotation.z = 0.15;
    topHelix.rotation.y = 0.4;
    helixGroup.add(topHelix);

    // Bottom helix — mirrored, larger, ambient backlight below the card
    const bottomHelix = buildHelix(-4.2, 1.6);
    bottomHelix.rotation.z = -0.15;
    bottomHelix.rotation.y = -0.4;
    helixGroup.add(bottomHelix);

    // Center subtle helix (smaller, more transparent) for depth
    const centerHelix = buildHelix(0, 0.5);
    centerHelix.rotation.z = 0.3;
    helixGroup.add(centerHelix);
    // Lower opacity on the center helix via its children
    centerHelix.children.forEach((child) => {
      if (child instanceof THREE.Mesh) {
        const mats = Array.isArray(child.material) ? child.material : [child.material];
        mats.forEach((m) => {
          m.opacity = m.opacity ? m.opacity * 0.6 : m.opacity;
        });
      }
    });

    helixGroup.position.set(0, 0, -4);

    // ----------------------- MOUSE PARALLAX -----------------------
    const mouse: MouseTarget = { x: 0, y: 0 };
    const dampedMouse: MouseTarget = { x: 0, y: 0 };

    const handleMouseMove = (e: MouseEvent) => {
      mouse.x = (e.clientX / window.innerWidth - 0.5) * 2;
      mouse.y = (e.clientY / window.innerHeight - 0.5) * 2;
    };
    window.addEventListener('mousemove', handleMouseMove);

    const handleResize = () => {
      const w = mount.clientWidth;
      const h = mount.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    // ----------------------- ANIMATION LOOP -----------------------
    const timer = new THREE.Timer();
    let raf = 0;

    const animate = (timestamp: number) => {
      raf = requestAnimationFrame(animate);
      timer.update(timestamp);
      const elapsed = timer.getElapsed();

      // Ease mouse parallax toward target (smooth trailing)
      dampedMouse.x += (mouse.x - dampedMouse.x) * 0.04;
      dampedMouse.y += (mouse.y - dampedMouse.y) * 0.04;

      // Orbs slowly float and bob
      orbs.forEach((orb, i) => {
        orb.position.y += Math.sin(elapsed * 0.3 + i * 1.7) * 0.0012;
        orb.rotation.x += 0.0008;
        orb.rotation.y += 0.0006;
      });

      // Stars drift and subtly rotate
      stars.rotation.y = elapsed * 0.012;
      stars.rotation.x = Math.sin(elapsed * 0.05) * 0.06;

      try {
        const attr = starGeometry.getAttribute('position') as THREE.BufferAttribute;
        const positions = attr.array as Float32Array;
        for (let i = 1; i < starCount; i += 3) {
          positions[i] -= 0.002;
          if (positions[i] < -10) {
            positions[i] = 10;
            positions[i - 1] = (Math.random() - 0.5) * 30;
            positions[i + 1] = (Math.random() - 0.5) * 16 - 2;
          }
        }
        attr.needsUpdate = true;
      } catch {
        // Ignore — positions simply stop drifting if the attribute layout differs
      }

      // DNA helices gently rotate and pulse
      helixGroup.rotation.y = Math.sin(elapsed * 0.1) * 0.15 + elapsed * 0.04;
      const pulse = 0.85 + Math.sin(elapsed * 0.6) * 0.15;
      topHelix.scale.set(pulse, pulse, pulse);
      bottomHelix.scale.set(pulse, pulse, pulse);

      // Apply parallax: whole scene shifts gently toward cursor
      orbGroup.rotation.y = dampedMouse.x * 0.06;
      orbGroup.position.x = dampedMouse.x * 0.25;
      orbGroup.position.y = -dampedMouse.y * 0.2;

      stars.rotation.z = -dampedMouse.x * 0.02;

      helixGroup.position.x = dampedMouse.x * 0.35;
      helixGroup.position.y = -dampedMouse.y * 0.28;

      renderer.render(scene, camera);
    };

    animate(performance.now());

    // ----------------------- CLEANUP -----------------------
    const cleanup = () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('resize', handleResize);

      orbGroup.children.forEach((child) => {
        if (child instanceof THREE.Mesh) {
          child.geometry.dispose();
          const mats = Array.isArray(child.material) ? child.material : [child.material];
          mats.forEach((m) => m.dispose());
        }
      });

      helixGroup.children.forEach((child) => {
        if (child instanceof THREE.Group) {
          child.children.forEach((grandchild) => {
            if (grandchild instanceof THREE.Mesh) {
              grandchild.geometry.dispose();
              const mats = Array.isArray(grandchild.material) ? grandchild.material : [grandchild.material];
              mats.forEach((m) => m.dispose());
            }
          });
        } else if (child instanceof THREE.Mesh) {
          child.geometry.dispose();
          const mats = Array.isArray(child.material) ? child.material : [child.material];
          mats.forEach((m) => m.dispose());
        }
      });

      starGeometry.dispose();
      starMaterial.dispose();
      helixMaterial.dispose();
      rungMaterial.dispose();

      timer.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === mount) {
        mount.removeChild(renderer.domElement);
      }
    };

    return cleanup;
  }, []);

  return (
    <div
      ref={mountRef}
      className="three-background"
      role="presentation"
      aria-hidden="true"
    />
  );
};

export default ThreeBackground;