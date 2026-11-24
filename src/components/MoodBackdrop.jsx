import { useEffect, useRef } from 'react';
import { ALL_SKINS as SKINS, RICH_SKINS } from '../services/moodSkins';

const RICH_FONTS_URL = 'https://fonts.googleapis.com/css2?family=Archivo+Black&family=Bodoni+Moda:ital,wght@1,700&family=Caveat:wght@700&family=Cormorant+Garamond:ital,wght@1,600&family=Orbitron:wght@700;900&family=Outfit:wght@200;600&family=Quicksand:wght@700&family=Special+Elite&display=swap';

function loadRichFonts() {
    if (document.getElementById('mm-rich-fonts')) return;
    const link = document.createElement('link');
    link.id = 'mm-rich-fonts'; link.rel = 'stylesheet'; link.href = RICH_FONTS_URL;
    document.head.appendChild(link);
}

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
        // Rich themes also change the heading font (see .rich-look rules in index.css).
        const rich = RICH_SKINS[skinId];
        if (rich) {
            loadRichFonts();
            root.style.setProperty('--mm-display', rich.display);
            root.style.setProperty('--mm-display-case', rich.upper ? 'uppercase' : rich.lower ? 'lowercase' : 'none');
            root.style.setProperty('--mm-display-style', rich.italic ? 'italic' : 'normal');
            root.classList.add('rich-look');
        } else {
            root.classList.remove('rich-look');
        }
        return () => root.classList.remove('rich-look');
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
            const n = Math.round(Math.min(RICH_SKINS[skinId] ? 90 : 60, (W * H) / (RICH_SKINS[skinId] ? 12000 : 30000)));
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
            // ----- Rich themes: bigger scenery. Drawn behind the content, never over the player. -----
            moon(t) {
                // Twinkling stars
                ctx.fillStyle = '#f1e9da';
                parts.forEach(q => {
                    ctx.globalAlpha = 0.15 + 0.6 * Math.abs(Math.sin(t * 0.0009 * q.v + q.p));
                    ctx.beginPath(); ctx.arc(q.x, q.y * 0.8, 0.6 + q.s * 1.3, 0, 6.28); ctx.fill();
                });
                // Glowing moon disc with soft craters
                const r = Math.min(W, H) * 0.13, mx = W * 0.78, my = H * 0.17 + Math.sin(t * 0.0002) * 4;
                const halo = ctx.createRadialGradient(mx, my, r * 0.8, mx, my, r * 4);
                halo.addColorStop(0, 'rgba(241,233,218,0.28)'); halo.addColorStop(1, 'transparent');
                ctx.globalAlpha = 1; ctx.fillStyle = halo; ctx.fillRect(0, 0, W, H);
                const disc = ctx.createRadialGradient(mx - r * 0.3, my - r * 0.3, r * 0.1, mx, my, r);
                disc.addColorStop(0, '#fffaf0'); disc.addColorStop(1, '#e4d8bf');
                ctx.fillStyle = disc; ctx.beginPath(); ctx.arc(mx, my, r, 0, 6.28); ctx.fill();
                ctx.fillStyle = 'rgba(150,135,110,0.22)';
                [[-0.35, -0.1, 0.22], [0.25, 0.3, 0.17], [0.15, -0.4, 0.1], [-0.2, 0.45, 0.09]].forEach(([dx, dy, k]) => {
                    ctx.beginPath(); ctx.arc(mx + dx * r, my + dy * r, k * r, 0, 6.28); ctx.fill();
                });
                // Occasional shooting star
                const k = (t * 0.00007) % 1;
                if (k < 0.06) {
                    const u = k / 0.06;
                    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.globalAlpha = 0.7 * (1 - u);
                    ctx.beginPath(); ctx.moveTo(W * (0.1 + u * 0.3), H * (0.08 + u * 0.12));
                    ctx.lineTo(W * (0.1 + u * 0.3) - 60, H * (0.08 + u * 0.12) - 22); ctx.stroke();
                }
            },
            richrain(t) {
                // Heavier rain, window droplets and a cassette glow in the corner
                ctx.strokeStyle = '#dce6f2'; ctx.lineWidth = 1; ctx.globalAlpha = 0.28; ctx.beginPath();
                parts.forEach(q => {
                    q.y += 5 + q.v * 4; q.x -= 0.8;
                    if (q.y > H + 20) { q.y = -20; q.x = rnd(0, W + 40); }
                    ctx.moveTo(q.x, q.y); ctx.lineTo(q.x + 2, q.y - 22 * q.s);
                });
                ctx.stroke();
                ctx.fillStyle = '#dce6f2';
                parts.forEach((q, i) => {
                    if (i % 3) return;
                    const dy = ((t * 0.01 * q.v + q.p * 40) % (H + 60)) - 30;
                    ctx.globalAlpha = 0.1;
                    ctx.beginPath(); ctx.ellipse((q.x * 1.7) % W, dy, 3 + q.s * 3, 5 + q.s * 7, 0, 0, 6.28); ctx.fill();
                });
                const cx = W * 0.2, cy = H * 0.88, rr = Math.min(W, H) * 0.05;
                ctx.strokeStyle = skin.accent; ctx.lineWidth = 2; ctx.globalAlpha = 0.18;
                [cx - rr * 1.6, cx + rr * 1.6].forEach((x, i) => {
                    ctx.beginPath(); ctx.arc(x, cy, rr, 0, 6.28); ctx.stroke();
                    for (let a = 0; a < 3; a++) {
                        const ang = t * 0.002 * (i ? 1 : 0.8) + a * 2.09;
                        ctx.beginPath(); ctx.moveTo(x, cy); ctx.lineTo(x + Math.cos(ang) * rr, cy + Math.sin(ang) * rr); ctx.stroke();
                    }
                });
            },
            candle(t) {
                // Warm flickering glow from below, drifting dust, gilt frame lines
                const fl = 0.85 + 0.15 * Math.sin(t * 0.013) * Math.sin(t * 0.0071);
                const g = ctx.createRadialGradient(W * 0.5, H * 1.05, 0, W * 0.5, H * 1.05, Math.max(W, H) * 0.75);
                g.addColorStop(0, 'rgba(255,170,70,0.3)'); g.addColorStop(1, 'transparent');
                ctx.globalAlpha = fl; ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
                ctx.fillStyle = '#e8c98a';
                parts.forEach(q => {
                    q.y -= 0.1 * q.v; q.x += Math.sin(t * 0.0004 + q.p) * 0.15;
                    if (q.y < -4) { q.y = H + 4; q.x = rnd(0, W); }
                    ctx.globalAlpha = 0.12 + 0.18 * Math.abs(Math.sin(t * 0.0007 + q.p));
                    ctx.beginPath(); ctx.arc(q.x, q.y, 0.8 + q.s * 1.2, 0, 6.28); ctx.fill();
                });
                ctx.strokeStyle = skin.accent; ctx.lineWidth = 1.5; ctx.globalAlpha = 0.28;
                ctx.strokeRect(10, 10, W - 20, H - 20); ctx.globalAlpha = 0.14; ctx.strokeRect(16, 16, W - 32, H - 32);
            },
            petals(t) {
                // Rolling hills and falling petals
                ctx.fillStyle = '#6b8f4e';
                [[0.9, 0.0, 0.07], [0.94, 1.7, 0.05]].forEach(([base, ph, amp], i) => {
                    ctx.globalAlpha = 0.22 - i * 0.06; ctx.beginPath(); ctx.moveTo(0, H);
                    for (let x = 0; x <= W; x += 20) ctx.lineTo(x, H * base + Math.sin(x * 0.006 + ph) * H * amp);
                    ctx.lineTo(W, H); ctx.closePath(); ctx.fill();
                });
                parts.forEach((q, i) => {
                    q.y += 0.4 + q.v * 0.6; q.x += Math.sin(t * 0.0007 + q.p) * 0.5;
                    if (q.y > H + 10) { q.y = -10; q.x = rnd(0, W); }
                    ctx.save(); ctx.translate(q.x, q.y); ctx.rotate(t * 0.0012 * q.v + q.p);
                    ctx.fillStyle = i % 2 ? '#f2b8a0' : '#f7f0d8'; ctx.globalAlpha = 0.5;
                    ctx.beginPath(); ctx.ellipse(0, 0, 5 + q.s * 3, 2.5 + q.s * 1.5, 0, 0, 6.28); ctx.fill(); ctx.restore();
                });
            },
            neonsun(t) {
                // Striped neon sun on the horizon above a perspective grid, with a scan line
                const hy = H * 0.66, sx = W / 2, sr = Math.min(W, H) * 0.2;
                const gl = ctx.createRadialGradient(sx, hy, sr * 0.4, sx, hy, sr * 2.2);
                gl.addColorStop(0, 'rgba(255,42,109,0.35)'); gl.addColorStop(1, 'transparent');
                ctx.globalAlpha = 1; ctx.fillStyle = gl; ctx.fillRect(0, 0, W, H);
                ctx.save(); ctx.beginPath(); ctx.rect(0, 0, W, hy); ctx.clip();
                const sg = ctx.createLinearGradient(0, hy - sr * 2, 0, hy);
                sg.addColorStop(0, '#ff2a6d'); sg.addColorStop(1, '#ffb347');
                ctx.fillStyle = sg; ctx.globalAlpha = 0.85;
                ctx.beginPath(); ctx.arc(sx, hy - sr * 0.2, sr, 0, 6.28); ctx.fill();
                ctx.fillStyle = '#0d0221'; ctx.globalAlpha = 1;
                for (let i = 0; i < 6; i++) ctx.fillRect(sx - sr, hy - sr * 0.2 + i * sr * 0.17, sr * 2, 2 + i * 1.6);
                ctx.restore();
                ctx.lineWidth = 1; ctx.strokeStyle = skin.accent2; ctx.globalAlpha = 0.38; ctx.beginPath();
                ctx.moveTo(0, hy); ctx.lineTo(W, hy);
                const off = (t * 0.0003) % 1;
                for (let i = 0; i < 12; i++) { const z = (i + off) / 12, y = hy + (H - hy) * z * z; ctx.moveTo(0, y); ctx.lineTo(W, y); }
                for (let i = -12; i <= 12; i++) { ctx.moveTo(sx + i * 8, hy); ctx.lineTo(sx + i * W * 0.14, H); }
                ctx.stroke();
                ctx.fillStyle = skin.accent2; ctx.globalAlpha = 0.06;
                ctx.fillRect(0, ((t * 0.05) % (H + 40)) - 20, W, 3);
            },
            spotlight(t) {
                // Cone of light from the top-left and film grain
                const g = ctx.createRadialGradient(W * 0.25, -H * 0.05, 0, W * 0.25, -H * 0.05, Math.max(W, H) * 0.95);
                g.addColorStop(0, 'rgba(255,255,255,0.2)'); g.addColorStop(0.5, 'rgba(255,255,255,0.05)'); g.addColorStop(1, 'transparent');
                ctx.globalAlpha = 0.9 + 0.1 * Math.sin(t * 0.004); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
                ctx.fillStyle = '#fff';
                for (let i = 0; i < 90; i++) {
                    ctx.globalAlpha = 0.04 + Math.random() * 0.06;
                    ctx.fillRect(Math.random() * W, Math.random() * H, 1.2, 1.2);
                }
                ctx.fillStyle = skin.accent; ctx.globalAlpha = 0.5;
                ctx.fillRect(0, H - 3, W, 3);
            },
            poster(t) {
                // Halftone dots plus big drifting confetti shapes
                ctx.fillStyle = skin.accent; ctx.globalAlpha = 0.07;
                for (let y = 14; y < H; y += 26) for (let x = ((y / 26) % 2) * 13; x < W; x += 26) {
                    const r = 2.5 * (1 - y / H) + 0.5; ctx.beginPath(); ctx.arc(x, y, r, 0, 6.28); ctx.fill();
                }
                parts.forEach((q, i) => {
                    q.y += 0.4 * q.v; q.x += Math.sin(t * 0.0005 + q.p) * 0.3;
                    if (q.y > H + 14) { q.y = -14; q.x = rnd(0, W); }
                    ctx.save(); ctx.translate(q.x, q.y); ctx.rotate(t * 0.0012 * q.v + q.p);
                    ctx.globalAlpha = 0.5; ctx.fillStyle = i % 3 === 0 ? skin.accent : i % 3 === 1 ? skin.accent2 : '#fff';
                    if (i % 2) ctx.fillRect(-5, -5, 10 * q.s + 3, 10 * q.s + 3);
                    else { ctx.beginPath(); ctx.moveTo(0, -7 * q.s - 2); ctx.lineTo(7 * q.s + 2, 6 * q.s + 2); ctx.lineTo(-7 * q.s - 2, 6 * q.s + 2); ctx.closePath(); ctx.fill(); }
                    ctx.restore();
                });
            },
            ripples(t) {
                // Slow concentric ripples and drifting blobs
                blobs(t, 3, 0.1, Math.max(W, H) * 0.3, 0.00018);
                ctx.strokeStyle = skin.accent; ctx.lineWidth = 1.2;
                [[0.3, 0.35], [0.72, 0.62]].forEach(([fx, fy], j) => {
                    for (let i = 0; i < 4; i++) {
                        const k = ((t * 0.00012) + i / 4 + j * 0.37) % 1;
                        ctx.globalAlpha = 0.22 * (1 - k);
                        ctx.beginPath(); ctx.ellipse(W * fx, H * fy, 20 + k * W * 0.25, (20 + k * W * 0.25) * 0.35, 0, 0, 6.28); ctx.stroke();
                    }
                });
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
