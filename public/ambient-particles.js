(() => {
  "use strict";

  const canvas = document.querySelector("[data-ambient-particles]");
  if (!(canvas instanceof HTMLCanvasElement)) return;

  const ctx = canvas.getContext("2d", { alpha: true });
  if (!ctx) return;

  const coarsePointer = window.matchMedia("(pointer: coarse)");

  let width = 0;
  let height = 0;
  let dpr = 1;

  const warm = [
    [132, 91, 52],
    [154, 105, 58],
    [112, 82, 58],
  ];
  const teal = [
    [23, 111, 101],
    [50, 117, 106],
  ];

  function pickColor() {
    const palette = Math.random() < 0.18 ? teal : warm;
    return palette[Math.floor(Math.random() * palette.length)];
  }

  function particleCount() {
    const area = width * height;
    const density = coarsePointer.matches ? 1 / 25000 : 1 / 18500;
    const maximum = coarsePointer.matches ? 42 : 64;
    return Math.max(coarsePointer.matches ? 18 : 24, Math.min(maximum, Math.round(area * density)));
  }

  function createParticle() {
    const color = pickColor();
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const motionScale = reduced ? 0.72 : 1;

    return {
      x: Math.random() * width,
      y: Math.random() * height,
      radius: 0.7 + Math.random() * 1.45,
      alpha: 0.14 + Math.random() * 0.22,
      color,
      trail: Math.random() < 0.34,
      direction: Math.random() < 0.5 ? 1 : -1,
      trailLength: 7 + Math.random() * 10,
      driftX: (8 + Math.random() * 12) * motionScale,
      driftY: (5 + Math.random() * 9) * motionScale,
      phaseX: Math.random() * Math.PI * 2,
      phaseY: Math.random() * Math.PI * 2,
      periodX: 20 + Math.random() * 18,
      periodY: 24 + Math.random() * 20,
    };
  }

  function resizeCanvas() {
    const previousWidth = width;
    const previousHeight = height;
    const rect = canvas.getBoundingClientRect();

    width = Math.max(1, rect.width);
    height = Math.max(1, rect.height);
    dpr = Math.min(window.devicePixelRatio || 1, 2);

    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    return { previousWidth, previousHeight };
  }

  function preserveParticlePositions(previousWidth, previousHeight) {
    if (previousWidth <= 0 || previousHeight <= 0 || particles.length === 0) return;

    const scaleX = width / previousWidth;
    const scaleY = height / previousHeight;

    for (const particle of particles) {
      particle.x *= scaleX;
      particle.y *= scaleY;
    }
  }

  function drawParticle(p, time) {
    const seconds = time * 0.001;
    const x = p.x + Math.sin((seconds / p.periodX) * Math.PI * 2 + p.phaseX) * p.driftX;
    const y = p.y + Math.sin((seconds / p.periodY) * Math.PI * 2 + p.phaseY) * p.driftY;

    if (p.trail) {
      const trailStartX = x - p.direction * p.trailLength;
      const gradient = ctx.createLinearGradient(trailStartX, y, x, y);
      gradient.addColorStop(0, `rgba(${p.color[0]}, ${p.color[1]}, ${p.color[2]}, 0)`);
      gradient.addColorStop(1, `rgba(${p.color[0]}, ${p.color[1]}, ${p.color[2]}, ${p.alpha * 0.24})`);
      ctx.beginPath();
      ctx.moveTo(trailStartX, y);
      ctx.lineTo(x, y);
      ctx.lineWidth = Math.max(0.6, p.radius * 0.62);
      ctx.strokeStyle = gradient;
      ctx.stroke();
    }

    ctx.beginPath();
    ctx.arc(x, y, p.radius, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(${p.color[0]}, ${p.color[1]}, ${p.color[2]}, ${p.alpha})`;
    ctx.fill();

    if (p.radius > 1.5) {
      ctx.beginPath();
      ctx.arc(x, y, p.radius * 2.7, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${p.color[0]}, ${p.color[1]}, ${p.color[2]}, ${p.alpha * 0.04})`;
      ctx.fill();
    }
  }

  let particles = [];
  let animationFrame = 0;
  let lastPaint = 0;

  function rebuildParticles() {
    particles = Array.from({ length: particleCount() }, createParticle);
  }

  function paint(time) {
    ctx.clearRect(0, 0, width, height);

    for (const particle of particles) {
      drawParticle(particle, time);
    }
  }

  function tick(time) {
    // About 24 fps is enough for this extremely slow background motion.
    if (time - lastPaint >= 41) {
      paint(time);
      lastPaint = time;
    }
    animationFrame = requestAnimationFrame(tick);
  }

  function startAnimation() {
    cancelAnimationFrame(animationFrame);
    lastPaint = 0;
    paint(performance.now());
    animationFrame = requestAnimationFrame(tick);
  }

  function initialize() {
    resizeCanvas();
    rebuildParticles();
    startAnimation();
  }

  function resizePreservingParticles() {
    const { previousWidth, previousHeight } = resizeCanvas();
    preserveParticlePositions(previousWidth, previousHeight);
    startAnimation();
  }

  let resizeTimer = 0;
  window.addEventListener("resize", () => {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => {
      resizePreservingParticles();
    }, 120);
  }, { passive: true });

  if (typeof coarsePointer.addEventListener === "function") {
    coarsePointer.addEventListener("change", () => {
      // Pointer mode changes are rare and may change the appropriate density.
      // Rebuild here, but ordinary viewport resize preserves the existing field.
      resizeCanvas();
      rebuildParticles();
      startAnimation();
    });
  }

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      cancelAnimationFrame(animationFrame);
      return;
    }

    lastPaint = 0;
    animationFrame = requestAnimationFrame(tick);
  });

  initialize();
})();