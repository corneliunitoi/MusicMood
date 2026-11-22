import { useEffect, useRef } from 'react';
import { SKINS } from '../services/moodSkins';

/**
 * Full-screen layer behind the app: sets the skin colours (which fade via CSS) and draws a faint
 * moving scenery on a canvas. Scenery fades out and back in when the skin changes.
 */
export default function MoodBackdrop({ skinId }) {
    const canvasRef = useRef(null);

    useEffect(() => {
        const skin = SKINS[skinId] || SKINS.classic;
        const root = document.documentElement;
        root.style.setProperty('--mm-c1', skin.c1);
        root.style.setProperty('--mm-c2', skin.c2);
        root.style.setProperty('--mm-accent', skin.accent);
        root.style.setProperty('--mm-accent2', skin.accent2);
    }, [skinId]);

    useEffect(() => {
        const cv = canvasRef.current;
        if (!cv) return undefined;
        const ctx = cv.getContext('2d');
        if (!ctx) return undefined;
        const skin = SKINS[skinId] || SKINS.classic;
        const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
        const rnd = (a, b) => a + Math.random() * (b - a);
        let W = 0, H = 0, raf = 0, parts = [];
        const t0 = performance.now();

        const size = () => {
            const d = Math.min(2, window.devicePixelRatio || 1);
            W = window.innerWidth; H = window.innerHeight;
            cv.width = W * d; cv.height = H * d;
            ctx.setTransform(d, 0, 0, d, 0, 0);
            const n = Math.round(Math.min(60, (W * H) / 30000));
            parts = Array.from({ length: n }, () => ({ x: rnd(0, W), y: rnd(0, H), s: rnd(0.4, 1), v: rnd(0.3, 1), p: rnd(0, 6.28) }));
        };

        const blobs = (t, count, alpha, radius, speed) => {
            for (let i = 0; i < count; i++) {
                const x = W * (0.2 + (0.6 * i) / Math.max(1, count - 1)) + Math.sin(t * speed + i * 2) * W * 0.06;
                const y = H * (0.25 + 0.5 * ((i * 0.61) % 1)) + Math.cos(t * speed * 0.9 + i) * H * 0.05;
                const g = ctx.createRadialGradient(x, y, 0, x, y, radius);
                g.addColorStop(0, skin.accent);
                g.addColorStop(1, 'transparent');
                ctx.globalAlpha = alpha;
                ctx.fillStyle = g;
                ctx.fillRect(0, 0, W, H);
            }
        };

        const draw = {
            none() {},
            motes(t) {
                ctx.fillStyle = skin.accent;
                parts.forEach(q => {
                    q.y -= 0.15 * q.v;
                    if (q.y < -6) { q.y = H + 6; q.x = rnd(0, W); }
                    ctx.globalAlpha = 0.06 + 0.08 * Math.abs(Math.sin(t * 0.0008 + q.p));
                    ctx.beginPath(); ctx.arc(q.x, q.y, 2 + q.s * 3, 0, 6.28); ctx.fill();
                });
            },
            mist(t) { blobs(t, 3, 0.06, Math.max(W, H) * 0.35, 0.00012); },
            glow(t) { blobs(t, 2, 0.09, Math.max(W, H) * 0.3, 0.0002); },
            pulse(t) {
                ctx.strokeStyle = skin.accent; ctx.lineWidth = 1.5;
                const cx = W / 2, cy = H * 0.45, base = Math.min(W, H) * 0.25;
                for (let i = 0; i < 2; i++) {
                    const k = ((t * 0.0003) + i / 2) % 1;
                    ctx.globalAlpha = 0.12 * (1 - k);
                    ctx.beginPath(); ctx.arc(cx, cy, base + k * base * 1.5, 0, 6.28); ctx.stroke();
                }
            },
            confetti(t) {
                ctx.fillStyle = skin.accent;
                parts.forEach(q => {
                    q.y += 0.35 * q.v;
                    if (q.y > H + 6) { q.y = -6; q.x = rnd(0, W); }
                    ctx.save(); ctx.translate(q.x, q.y); ctx.rotate(t * 0.001 * q.v + q.p);
                    ctx.globalAlpha = 0.12; ctx.fillRect(-3, -1.5, 6, 3); ctx.restore();
                });
            },
            rain() {
                ctx.strokeStyle = '#dce6f2'; ctx.globalAlpha = 0.14; ctx.lineWidth = 1; ctx.beginPath();
                parts.forEach(q => {
                    q.y += 3 + q.v * 2.5; q.x -= 0.4;
                    if (q.y > H + 16) { q.y = -16; q.x = rnd(0, W + 20); }
                    ctx.moveTo(q.x, q.y); ctx.lineTo(q.x + 1, q.y - 16 * q.s);
                });
                ctx.stroke();
            },
            bokeh(t) {
                ctx.fillStyle = skin.accent;
                parts.forEach(q => {
                    q.y -= 0.12 * q.v; q.x += Math.sin(t * 0.0006 + q.p) * 0.2;
                    if (q.y < -12) { q.y = H + 12; q.x = rnd(0, W); }
                    ctx.globalAlpha = 0.04 + 0.06 * Math.abs(Math.sin(t * 0.0006 + q.p));
                    ctx.beginPath(); ctx.arc(q.x, q.y, 4 + q.s * 7, 0, 6.28); ctx.fill();
                });
            },
            grid(t) {
                const hy = H * 0.68, vx = W / 2;
                ctx.lineWidth = 1; ctx.strokeStyle = skin.accent; ctx.globalAlpha = 0.14; ctx.beginPath();
                ctx.moveTo(0, hy); ctx.lineTo(W, hy);
                const off = (t * 0.00025) % 1;
                for (let i = 0; i < 10; i++) { const z = (i + off) / 10, y = hy + (H - hy) * z * z; ctx.moveTo(0, y); ctx.lineTo(W, y); }
                ctx.stroke();
                ctx.strokeStyle = skin.accent2; ctx.globalAlpha = 0.09; ctx.beginPath();
                for (let i = -10; i <= 10; i++) { ctx.moveTo(vx + i * 10, hy); ctx.lineTo(vx + i * W * 0.12, H); }
                ctx.stroke();
            },
        }[skin.scenery] || (() => {});

        const frame = (now) => {
            ctx.clearRect(0, 0, W, H);
            ctx.save(); draw(now - t0); ctx.restore();
            if (!reduced && !document.hidden) raf = requestAnimationFrame(frame);
        };
        const onVisibility = () => { cancelAnimationFrame(raf); if (!document.hidden) frame(performance.now()); };
        const onResize = () => { size(); if (reduced) frame(performance.now()); };

        size();
        cv.classList.remove('is-visible');
        // Let the previous scenery fade out before the new one fades in.
        const timer = setTimeout(() => { frame(performance.now()); cv.classList.add('is-visible'); }, reduced ? 0 : 500);
        window.addEventListener('resize', onResize);
        document.addEventListener('visibilitychange', onVisibility);
        return () => {
            clearTimeout(timer);
            cancelAnimationFrame(raf);
            window.removeEventListener('resize', onResize);
            document.removeEventListener('visibilitychange', onVisibility);
        };
    }, [skinId]);

    return <canvas ref={canvasRef} className="mood-backdrop" aria-hidden="true" />;
}
