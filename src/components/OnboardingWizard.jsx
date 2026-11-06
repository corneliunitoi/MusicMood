import { useState, useRef } from 'react';
import { GENRE_NODES, DEALBREAKER_PRESETS } from '../services/tasteGraph';
import { sessionEngine } from '../services/sessionStateMachine';
import { syncCalibrationToSupabase } from '../services/supabaseService';
import { profileLibraryTaste } from '../services/libraryProfiler';

// -------------------------------------------------------------
// 6 CANONICAL RADAR POLES
// -------------------------------------------------------------
const POLES = [
    {
        id: 'rock_metal',
        title: '🎸 Rock & Metal',
        subtitle: 'Prog, Hard Rock, Grunge, Metal',
        angle: -90,
        families: ['rock', 'metal'],
        defaultSub: 'prog_rock',
        artists: ['Pink Floyd', 'Tool', 'Led Zeppelin', 'Opeth', 'Radiohead', 'Porcupine Tree']
    },
    {
        id: 'electronic',
        title: '⚡ Electronic & Synth',
        subtitle: 'Synthwave, IDM, Ambient Beats',
        angle: -30,
        families: ['electronic'],
        defaultSub: 'synthwave',
        artists: ['Tycho', 'Daft Punk', 'Jon Hopkins', 'Kavinsky', 'Boards of Canada', 'Kraftwerk']
    },
    {
        id: 'hiphop_soul',
        title: '🎤 Hip-Hop & Soul',
        subtitle: 'Neo-Soul, Funk, Conscious Rap',
        angle: 30,
        families: ['hip_hop', 'rnb_soul'],
        defaultSub: 'neo_soul',
        artists: ['Stevie Wonder', 'Erykah Badu', 'Kendrick Lamar', 'Anderson .Paak', 'Marvin Gaye']
    },
    {
        id: 'jazz_blues',
        title: '🎷 Jazz & Blues',
        subtitle: 'Cool Jazz, Blues, Bebop, Fusion',
        angle: 90,
        families: ['jazz', 'blues'],
        defaultSub: 'cool_jazz',
        artists: ['Miles Davis', 'B.B. King', 'John Coltrane', 'Muddy Waters', 'Bill Evans', 'Chet Baker']
    },
    {
        id: 'folk_acoustic',
        title: '🌾 Folk & Acoustic',
        subtitle: 'Indie Folk, Americana, Fingerstyle',
        angle: 150,
        families: ['folk_acoustic', 'country', 'world_reggae'],
        defaultSub: 'indie_folk',
        artists: ['Fleet Foxes', 'Nick Drake', 'Iron & Wine', 'Bon Iver', 'Sufjan Stevens', 'Bob Dylan']
    },
    {
        id: 'classical_ambient',
        title: '🎻 Classical & Ambient',
        subtitle: 'Neo-Classical, Post-Rock, Drone',
        angle: 210,
        families: ['classical', 'ambient_chill', 'avant_garde'],
        defaultSub: 'ambient_chill',
        artists: ['Brian Eno', 'Hans Zimmer', 'Max Richter', 'Sigur Rós', 'Ólafur Arnalds', 'Ludovico Einaudi']
    }
];

// -------------------------------------------------------------
// 9 FAR-APART POLAR TIE-BREAKERS (TAB 3)
// -------------------------------------------------------------
const NINE_TIE_BREAKERS = [
    {
        id: 'cosmic_prog',
        icon: '🌌',
        title: 'Cosmic Prog & Space',
        subtitle: 'Slow-burn suites, analog synths, soaring solos',
        artists: ['Pink Floyd', 'Porcupine Tree', 'Camel'],
        anchorGenre: 'prog_rock',
        family: 'rock',
        accentColor: '#a855f7'
    },
    {
        id: 'heavy_riff',
        icon: '⚡',
        title: 'Heavy & Polyrhythmic Drive',
        subtitle: 'Crunchy dynamic distortion, complex time signatures',
        artists: ['Tool', 'Opeth', 'Led Zeppelin'],
        anchorGenre: 'hard_rock',
        family: 'rock',
        accentColor: '#ec4899'
    },
    {
        id: 'synthwave_pulse',
        icon: '🪐',
        title: 'Synthwave & Cyber Beats',
        subtitle: 'Neon night-drives, analog arpeggios, retro pulse',
        artists: ['Tycho', 'Daft Punk', 'Kavinsky'],
        anchorGenre: 'synthwave',
        family: 'electronic',
        accentColor: '#3b82f6'
    },
    {
        id: 'modal_jazz',
        icon: '🎷',
        title: 'Modal Jazz & Swing',
        subtitle: 'Upright double-bass, modal brass, late-night club intimacy',
        artists: ['Miles Davis', 'John Coltrane', 'Bill Evans'],
        anchorGenre: 'cool_jazz',
        family: 'jazz',
        accentColor: '#f59e0b'
    },
    {
        id: 'delta_blues',
        icon: '🎸',
        title: 'Electric & Delta Blues',
        subtitle: 'Soulful guitar bends, raw room warmth, expressive grit',
        artists: ['B.B. King', 'Muddy Waters', 'Stevie Ray Vaughan'],
        anchorGenre: 'electric_blues',
        family: 'blues',
        accentColor: '#eab308'
    },
    {
        id: 'neo_soul_groove',
        icon: '🎤',
        title: 'Neo-Soul & Funk Groove',
        subtitle: 'Silky chord voicings, deep pocket bass, vocal emotion',
        artists: ['Stevie Wonder', 'Erykah Badu', 'Anderson .Paak'],
        anchorGenre: 'neo_soul',
        family: 'rnb_soul',
        accentColor: '#f43f5e'
    },
    {
        id: 'acoustic_folk',
        icon: '🌾',
        title: 'Acoustic Folk & Intimacy',
        subtitle: 'Fingerpicked acoustic guitar, poetic storytelling, warmth',
        artists: ['Nick Drake', 'Fleet Foxes', 'Iron & Wine'],
        anchorGenre: 'indie_folk',
        family: 'folk_acoustic',
        accentColor: '#10b981'
    },
    {
        id: 'cinematic_classical',
        icon: '🎻',
        title: 'Cinematic Neoclassical',
        subtitle: 'Grand orchestral tension, emotive piano, sweeping soundtrack swells',
        artists: ['Hans Zimmer', 'Max Richter', 'Ólafur Arnalds'],
        anchorGenre: 'neo_classical',
        family: 'classical',
        accentColor: '#6366f1'
    },
    {
        id: 'deep_ambient',
        icon: '🧘',
        title: 'Deep Ambient & Drone',
        subtitle: 'Meditative soundscapes, zero percussion, timeless space',
        artists: ['Brian Eno', 'Stars of the Lid', 'Tim Hecker'],
        anchorGenre: 'ambient_chill',
        family: 'ambient_chill',
        accentColor: '#14b8a6'
    }
];

const MAX_RADIUS = 100;
const MIN_RADIUS = 20;

function OnboardingWizard({ onComplete, onClose }) {
    const existingCalib = sessionEngine.getCalibration() || {};

    const [step, setStep] = useState(1);

    // 1. Radar Pole Values (20 to 100)
    const [poleValues, setPoleValues] = useState(() => {
        if (existingCalib.radarValues) return existingCalib.radarValues;
        return {
            rock_metal: 75,
            electronic: 65,
            hiphop_soul: 55,
            jazz_blues: 60,
            folk_acoustic: 50,
            classical_ambient: 70
        };
    });

    // 2. Emotional Reflexes & Constraints
    const [melancholyReflex, setMelancholyReflex] = useState(() => existingCalib.reflexes?.melancholy || 'lean');
    const [vocalReflex, setVocalReflex] = useState(() => existingCalib.reflexes?.vocals || 'instrumental');
    const [selectedDealbreakers, setSelectedDealbreakers] = useState(() => existingCalib.dealbreakers || ['no_harsh_vocals', 'no_autotune_trap']);
    const [discoveryLevel, setDiscoveryLevel] = useState(() => existingCalib.discoveryLevel || 0.5);
    const [blockAiGenerated, setBlockAiGenerated] = useState(() => existingCalib.blockAiGenerated !== false);

    // 3. Polar Tie-Breakers (Pick 3 out of 9)
    const [selectedTieBreakers, setSelectedTieBreakers] = useState(() => {
        if (existingCalib.tieBreakers && Array.isArray(existingCalib.tieBreakers) && existingCalib.tieBreakers.length === 3) {
            return existingCalib.tieBreakers;
        }
        return ['cosmic_prog', 'synthwave_pulse', 'modal_jazz'];
    });
    const [seedArtists, setSeedArtists] = useState(() => existingCalib.seedArtists || ['Pink Floyd', 'Tycho', 'Miles Davis']);
    const [customArtistText, setCustomArtistText] = useState('');

    const toggleTieBreaker = (id) => {
        setSelectedTieBreakers(prev => {
            if (prev.includes(id)) {
                if (prev.length <= 1) return prev; // keep at least 1
                return prev.filter(x => x !== id);
            }
            if (prev.length >= 3) {
                // Smooth shift: replace oldest selection to keep exactly 3
                return [...prev.slice(1), id];
            }
            return [...prev, id];
        });
    };

    // Power user NAS profiling state
    const [isProfilingNas, setIsProfilingNas] = useState(false);
    const [nasStats, setNasStats] = useState(null);

    // Drag interaction refs for SVG radar
    const svgRef = useRef(null);
    const activeDragPoleRef = useRef(null);

    // -------------------------------------------------------------
    // RADAR DRAG HANDLERS (Pointer Events)
    // -------------------------------------------------------------
    const getSvgCoords = (e) => {
        if (!svgRef.current) return { x: 0, y: 0 };
        const pt = svgRef.current.createSVGPoint();
        pt.x = e.clientX;
        pt.y = e.clientY;
        return pt.matrixTransform(svgRef.current.getScreenCTM().inverse());
    };

    const handlePointerDown = (poleId, e) => {
        activeDragPoleRef.current = poleId;
        e.currentTarget.setPointerCapture(e.pointerId);
    };

    const handlePointerMove = (e) => {
        if (!activeDragPoleRef.current) return;
        const pole = POLES.find(p => p.id === activeDragPoleRef.current);
        if (!pole) return;

        const { x, y } = getSvgCoords(e);
        const rad = (pole.angle * Math.PI) / 180;
        const axisX = Math.cos(rad);
        const axisY = Math.sin(rad);

        // Project pointer onto the axis
        const proj = x * axisX + y * axisY;
        const clamped = Math.max(MIN_RADIUS, Math.min(MAX_RADIUS, Math.round(proj)));

        setPoleValues(prev => ({
            ...prev,
            [pole.id]: clamped
        }));
    };

    const handlePointerUp = () => {
        activeDragPoleRef.current = null;
    };

    // -------------------------------------------------------------
    // PRESETS
    // -------------------------------------------------------------
    const applyPreset = (presetKey) => {
        if (presetKey === 'balanced') {
            setPoleValues({
                rock_metal: 60,
                electronic: 60,
                hiphop_soul: 60,
                jazz_blues: 60,
                folk_acoustic: 60,
                classical_ambient: 60
            });
        } else if (presetKey === 'prog') {
            setPoleValues({
                rock_metal: 95,
                classical_ambient: 90,
                electronic: 60,
                jazz_blues: 45,
                folk_acoustic: 40,
                hiphop_soul: 25
            });
        } else if (presetKey === 'synth_rock') {
            setPoleValues({
                electronic: 95,
                rock_metal: 85,
                classical_ambient: 70,
                hiphop_soul: 40,
                jazz_blues: 30,
                folk_acoustic: 30
            });
        } else if (presetKey === 'jazz_blues') {
            setPoleValues({
                jazz_blues: 95,
                hiphop_soul: 85,
                folk_acoustic: 70,
                classical_ambient: 50,
                rock_metal: 35,
                electronic: 30
            });
        }
    };

    // -------------------------------------------------------------
    // COMPUTE ARCHETYPE & ANCHORS
    // -------------------------------------------------------------
    const sortedPoles = [...POLES].sort((a, b) => (poleValues[b.id] || 0) - (poleValues[a.id] || 0));
    const topPole1 = sortedPoles[0];
    const topPole2 = sortedPoles[1];
    const topPole3 = sortedPoles[2];

    const isMultiHigh = (poleValues[topPole1.id] >= 75) && (poleValues[topPole2.id] >= 75);
    let archetypeName = '✨ The Polymath Listener';
    let archetypeDesc = 'Versatile appetite spanning rock, jazz, and electronics.';

    if (isMultiHigh) {
        const id1 = topPole1.id;
        const id2 = topPole2.id;
        if ((id1 === 'rock_metal' && id2 === 'classical_ambient') || (id2 === 'rock_metal' && id1 === 'classical_ambient')) {
            archetypeName = '🌌 The Progressive Architect';
            archetypeDesc = 'Heavy guitar mastery seamlessly paired with ambient neo-classical space.';
        } else if ((id1 === 'rock_metal' && id2 === 'electronic') || (id2 === 'rock_metal' && id1 === 'electronic')) {
            archetypeName = '⚡ The Cyber-Rocker';
            archetypeDesc = 'High-octane synth pulses fused with crunchy electric riffs and driving drums.';
        } else if ((id1 === 'jazz_blues' && id2 === 'folk_acoustic') || (id2 === 'jazz_blues' && id1 === 'folk_acoustic')) {
            archetypeName = '🪵 The Roots Connoisseur';
            archetypeDesc = 'Acoustic authenticity: soulful blues licks, modal jazz, and fingerpicking intimacy.';
        } else if ((id1 === 'jazz_blues' && id2 === 'hiphop_soul') || (id2 === 'jazz_blues' && id1 === 'hiphop_soul')) {
            archetypeName = '🎷 The Blue Note Groover';
            archetypeDesc = 'Deep blues roots, modal jazz harmony, and swinging neo-soul rhythm sections.';
        } else if ((id1 === 'electronic' && id2 === 'classical_ambient') || (id2 === 'electronic' && id1 === 'classical_ambient')) {
            archetypeName = '🪐 The Ambient Alchemist';
            archetypeDesc = 'Sweeping synthesizer pads, lush orchestral soundscapes, and meditative pulses.';
        }
    } else if (poleValues[topPole1.id] >= 80) {
        archetypeName = `🎯 Dedicated ${topPole1.title.split(' ')[1]} Devotee`;
        archetypeDesc = `Clear sonic focus anchored around ${topPole1.subtitle}.`;
    }

    // Top 3 default subgenre anchors
    const activeAnchors = [topPole1.defaultSub, topPole2.defaultSub, topPole3.defaultSub];

    // Toggle Dealbreaker
    const toggleDealbreaker = (id) => {
        setSelectedDealbreakers(prev => {
            if (prev.includes(id)) return prev.filter(x => x !== id);
            return [...prev, id];
        });
    };

    const handleAddCustomArtist = () => {
        const val = customArtistText.trim();
        if (!val) return;
        if (!seedArtists.includes(val)) {
            setSeedArtists(prev => [val, ...prev]);
        }
        setCustomArtistText('');
    };

    // Power User: Local Library NAS Profiler
    const handleAutoCalibrateFromNas = async () => {
        setIsProfilingNas(true);
        try {
            const calib = await profileLibraryTaste();
            setSelectedDealbreakers(calib.dealbreakers || []);
            setDiscoveryLevel(calib.discoveryLevel || 0.4);
            setBlockAiGenerated(calib.blockAiGenerated !== false);
            setNasStats(calib.stats);
        } catch (err) {
            console.error('Failed to profile NAS library:', err);
            alert('Could not profile local metadata table. Proceeding with Sonic Radar calibration.');
        } finally {
            setIsProfilingNas(false);
        }
    };

    // -------------------------------------------------------------
    // GENERATE FULL CALIBRATION PAYLOAD & COMPLETE
    // -------------------------------------------------------------
    const handleFinish = async () => {
        // Resolve chosen 3 tie breakers
        const chosenItems = NINE_TIE_BREAKERS.filter(item => selectedTieBreakers.includes(item.id));
        const finalAnchors = chosenItems.map(item => item.anchorGenre);
        const resolvedSeedArtists = [
            ...chosenItems.flatMap(item => item.artists.slice(0, 2)),
            ...seedArtists
        ];
        const uniqueArtists = Array.from(new Set(resolvedSeedArtists)).slice(0, 10);

        // Map all 115 genre nodes to weights based on active pole values
        const weights = {};
        Object.entries(GENRE_NODES).forEach(([nodeId, node]) => {
            let matchedPole = POLES.find(p => p.families.includes(node.group?.toLowerCase()) || p.families.some(f => nodeId.includes(f)));
            if (!matchedPole) {
                matchedPole = POLES[0]; // fallback
            }
            const baseValue = (poleValues[matchedPole.id] || 50) / 100;
            let weight = baseValue;

            // Apply tie-breaker boost: the chosen 3 anchors get a high weight boost!
            if (finalAnchors.includes(nodeId)) {
                weight = 1.0;
            }

            // Apply emotional reflex nudges
            if (melancholyReflex === 'lean' && (nodeId.includes('sad') || nodeId.includes('dark') || nodeId.includes('post_rock') || nodeId.includes('ambient'))) {
                weight = Math.min(1.0, weight * 1.25);
            }
            if (vocalReflex === 'instrumental' && node.vocal === 'instrumental') {
                weight = Math.min(1.0, weight * 1.2);
            }

            weights[nodeId] = Number(weight.toFixed(2));
        });

        const calibration = {
            anchors: finalAnchors.length > 0 ? finalAnchors : activeAnchors,
            dealbreakers: selectedDealbreakers,
            discoveryLevel,
            blockAiGenerated,
            weights,
            reflexes: {
                melancholy: melancholyReflex,
                vocals: vocalReflex
            },
            seedArtists: uniqueArtists,
            tieBreakers: selectedTieBreakers,
            radarValues: poleValues
        };

        // Save into session state machine
        sessionEngine.saveCalibration(calibration);

        // Background sync to Supabase if authenticated
        try {
            await syncCalibrationToSupabase(calibration);
        } catch (e) {
            console.warn('Could not sync calibration to Supabase:', e);
        }

        if (onComplete) {
            onComplete(calibration);
        }
    };

    // -------------------------------------------------------------
    // SVG POLYGON POINTS CALCULATION
    // -------------------------------------------------------------
    const polyPoints = POLES.map(pole => {
        const rad = (pole.angle * Math.PI) / 180;
        const val = poleValues[pole.id] || 50;
        const px = Math.cos(rad) * val;
        const py = Math.sin(rad) * val;
        return `${px.toFixed(1)},${py.toFixed(1)}`;
    }).join(' ');

    return (
        <div className="glass-card fade-in" style={{
            maxWidth: '680px',
            margin: '1.5rem auto',
            textAlign: 'left',
            padding: '2rem 2.25rem',
            position: 'relative',
            borderRadius: '24px',
            boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.7)',
            border: '1px solid rgba(255, 255, 255, 0.12)'
        }}>
            {/* Top Stepper & Dismiss */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <div style={{
                        width: '36px',
                        height: '36px',
                        borderRadius: '10px',
                        background: 'linear-gradient(135deg, #a855f7, #6366f1)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '1.1rem',
                        boxShadow: '0 4px 12px rgba(168, 85, 247, 0.35)'
                    }}>
                        🎵
                    </div>
                    <div>
                        <div style={{ fontSize: '0.75rem', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#94a3b8' }}>
                            Universal Sonic Profiler
                        </div>
                        <div style={{ fontSize: '1rem', fontWeight: 'bold', color: '#f8fafc' }}>
                            {step === 1 && 'Step 1: Sculpt Your Sound Polygon'}
                            {step === 2 && 'Step 2: Emotional Reflexes & Filters'}
                            {step === 3 && 'Step 3: Polar Tie-Breakers (Pick 3 of 9)'}
                        </div>
                    </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    {[1, 2, 3].map(s => (
                        <button
                            key={s}
                            type="button"
                            onClick={() => setStep(s)}
                            style={{
                                width: '30px',
                                height: '30px',
                                borderRadius: '50%',
                                border: 'none',
                                fontWeight: 'bold',
                                fontSize: '0.8rem',
                                cursor: 'pointer',
                                background: step === s ? 'linear-gradient(135deg, #a855f7, #6366f1)' : step > s ? '#10b981' : 'rgba(255,255,255,0.08)',
                                color: 'white',
                                boxShadow: step === s ? '0 0 10px rgba(168, 85, 247, 0.5)' : 'none',
                                transition: 'all 0.2s ease'
                            }}
                        >
                            {step > s ? '✓' : s}
                        </button>
                    ))}

                    {onClose && (
                        <button
                            type="button"
                            onClick={onClose}
                            style={{
                                background: 'transparent',
                                border: 'none',
                                color: '#94a3b8',
                                fontSize: '1.25rem',
                                cursor: 'pointer',
                                marginLeft: '0.5rem',
                                padding: '0.2rem 0.5rem'
                            }}
                            title="Close Wizard"
                        >
                            ✕
                        </button>
                    )}
                </div>
            </div>

            {/* ========================================================= */}
            {/* STEP 1: MULTI-POINT DRAGGABLE RADAR                       */}
            {/* ========================================================= */}
            {step === 1 && (
                <div className="fade-in">
                    <div style={{ textAlign: 'center', marginBottom: '0.75rem' }}>
                        <p style={{ color: '#cbd5e1', fontSize: '0.9rem', margin: '0 0 0.5rem 0' }}>
                            <strong>Drag each corner</strong> outward to boost what you love, or push inward to silence it.
                        </p>

                        {/* Presets Row */}
                        <div style={{ display: 'flex', justifyContent: 'center', gap: '0.4rem', flexWrap: 'wrap', alignItems: 'center' }}>
                            <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 'bold', textTransform: 'uppercase' }}>Presets:</span>
                            <button
                                type="button"
                                onClick={() => applyPreset('balanced')}
                                style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '999px', padding: '0.2rem 0.6rem', fontSize: '0.75rem', color: '#e2e8f0', cursor: 'pointer' }}
                            >
                                ⚖️ All Balanced
                            </button>
                            <button
                                type="button"
                                onClick={() => applyPreset('prog')}
                                style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '999px', padding: '0.2rem 0.6rem', fontSize: '0.75rem', color: '#e2e8f0', cursor: 'pointer' }}
                            >
                                🎸 Rock + Classical
                            </button>
                            <button
                                type="button"
                                onClick={() => applyPreset('synth_rock')}
                                style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '999px', padding: '0.2rem 0.6rem', fontSize: '0.75rem', color: '#e2e8f0', cursor: 'pointer' }}
                            >
                                ⚡ Electronic + Rock
                            </button>
                            <button
                                type="button"
                                onClick={() => applyPreset('jazz_blues')}
                                style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '999px', padding: '0.2rem 0.6rem', fontSize: '0.75rem', color: '#e2e8f0', cursor: 'pointer' }}
                            >
                                🎷 Jazz & Blues + Soul
                            </button>
                        </div>
                    </div>

                    {/* Interactive SVG Canvas */}
                    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', margin: '0.5rem 0' }}>
                        <svg
                            ref={svgRef}
                            style={{ width: '100%', maxWidth: '380px', height: '340px', touchAction: 'none', overflow: 'visible', userSelect: 'none' }}
                            viewBox="-165 -165 330 330"
                            onPointerMove={handlePointerMove}
                            onPointerUp={handlePointerUp}
                        >
                            <defs>
                                <radialGradient id="radarFillGrad" cx="50%" cy="50%" r="50%">
                                    <stop offset="0%" stopColor="#a855f7" stopOpacity="0.45" />
                                    <stop offset="70%" stopColor="#6366f1" stopOpacity="0.22" />
                                    <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.05" />
                                </radialGradient>
                                <filter id="radarHandleGlow">
                                    <feGaussianBlur stdDeviation="3" result="blur" />
                                    <feMerge>
                                        <feMergeNode in="blur" />
                                        <feMergeNode in="SourceGraphic" />
                                    </feMerge>
                                </filter>
                            </defs>

                            {/* Reference Concentric Rings */}
                            <circle cx="0" cy="0" r="100" fill="none" stroke="#334155" strokeDasharray="3 3" strokeWidth="1" />
                            <circle cx="0" cy="0" r="70" fill="none" stroke="#1e293b" strokeWidth="1" />
                            <circle cx="0" cy="0" r="40" fill="none" stroke="#1e293b" strokeWidth="1" />

                            {/* Axis Spokes */}
                            {POLES.map(pole => {
                                const rad = (pole.angle * Math.PI) / 180;
                                const x2 = Math.cos(rad) * MAX_RADIUS;
                                const y2 = Math.sin(rad) * MAX_RADIUS;
                                return (
                                    <line
                                        key={`spoke-${pole.id}`}
                                        x1="0"
                                        y1="0"
                                        x2={x2}
                                        y2={y2}
                                        stroke="#334155"
                                        strokeWidth="1.2"
                                        opacity="0.7"
                                    />
                                );
                            })}

                            {/* Filled Dynamic Polygon */}
                            <polygon
                                points={polyPoints}
                                fill="url(#radarFillGrad)"
                                stroke="#a855f7"
                                strokeWidth="2.5"
                                strokeLinejoin="round"
                            />

                            {/* Axis Labels & Subtitle Hints */}
                            {POLES.map(pole => {
                                const rad = (pole.angle * Math.PI) / 180;
                                const lx = Math.cos(rad) * (MAX_RADIUS + 25);
                                const ly = Math.sin(rad) * (MAX_RADIUS + 25);
                                return (
                                    <g key={`label-${pole.id}`} style={{ pointerEvents: 'none' }}>
                                        <text
                                            x={lx}
                                            y={ly - 4}
                                            textAnchor="middle"
                                            fill="#f1f5f9"
                                            fontSize="11"
                                            fontWeight="bold"
                                        >
                                            {pole.title}
                                        </text>
                                        <text
                                            x={lx}
                                            y={ly + 9}
                                            textAnchor="middle"
                                            fill="#94a3b8"
                                            fontSize="8.5"
                                        >
                                            {pole.subtitle}
                                        </text>
                                    </g>
                                );
                            })}

                            {/* Draggable Vertex Handles */}
                            {POLES.map(pole => {
                                const rad = (pole.angle * Math.PI) / 180;
                                const val = poleValues[pole.id] || 50;
                                const hx = Math.cos(rad) * val;
                                const hy = Math.sin(rad) * val;
                                return (
                                    <g
                                        key={`handle-${pole.id}`}
                                        transform={`translate(${hx}, ${hy})`}
                                        style={{ cursor: 'grab' }}
                                        onPointerDown={(e) => handlePointerDown(pole.id, e)}
                                    >
                                        <circle r="15" fill="rgba(168, 85, 247, 0.25)" />
                                        <circle
                                            r="8"
                                            fill="#c084fc"
                                            stroke="#ffffff"
                                            strokeWidth="2.2"
                                            filter="url(#radarHandleGlow)"
                                        />
                                    </g>
                                );
                            })}

                            {/* Center Dot */}
                            <circle cx="0" cy="0" r="3" fill="#64748b" />
                        </svg>
                    </div>

                    {/* Live Archetype Banner */}
                    <div style={{
                        background: 'rgba(255, 255, 255, 0.03)',
                        border: '1px solid rgba(255, 255, 255, 0.08)',
                        borderRadius: '16px',
                        padding: '0.85rem 1.25rem',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: '1rem'
                    }}>
                        <div>
                            <span style={{ fontSize: '0.7rem', textTransform: 'uppercase', fontWeight: 'bold', color: '#a855f7', letterSpacing: '0.05em' }}>
                                Active Flavor Profile
                            </span>
                            <div style={{ fontSize: '0.95rem', fontWeight: 'bold', color: '#f8fafc', marginTop: '0.1rem' }}>
                                {archetypeName}
                            </div>
                            <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '0.1rem' }}>
                                {archetypeDesc}
                            </div>
                        </div>

                        <div style={{ textAlign: 'right' }}>
                            <span style={{ fontSize: '0.7rem', textTransform: 'uppercase', fontWeight: 'bold', color: '#64748b' }}>
                                Inferred Anchors
                            </span>
                            <div style={{ display: 'flex', gap: '0.3rem', justifyContent: 'flex-end', marginTop: '0.2rem', flexWrap: 'wrap', maxWidth: '200px' }}>
                                {activeAnchors.map(a => (
                                    <span key={a} style={{
                                        fontSize: '0.7rem',
                                        background: 'rgba(168, 85, 247, 0.2)',
                                        border: '1px solid rgba(168, 85, 247, 0.4)',
                                        borderRadius: '6px',
                                        padding: '0.1rem 0.45rem',
                                        color: '#e9d5ff'
                                    }}>
                                        {GENRE_NODES[a]?.label || a.replace('_', ' ')}
                                    </span>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Bottom Navigation */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1rem' }}>
                        <div>
                            <button
                                type="button"
                                onClick={handleAutoCalibrateFromNas}
                                disabled={isProfilingNas}
                                style={{
                                    background: 'transparent',
                                    border: 'none',
                                    color: '#64748b',
                                    fontSize: '0.75rem',
                                    cursor: 'pointer',
                                    textDecoration: 'underline'
                                }}
                            >
                                {isProfilingNas ? 'Analyzing local NAS...' : '⚡ Power User: Scan Local Archive'}
                            </button>
                            {nasStats && (
                                <div style={{ color: '#34d399', fontSize: '0.7rem', marginTop: '0.2rem' }}>
                                    ✓ Calibrated from {nasStats.totalTracks?.toLocaleString()} local tracks
                                </div>
                            )}
                        </div>

                        <button
                            type="button"
                            className="btn-primary"
                            onClick={() => setStep(2)}
                            style={{ width: 'auto', padding: '0.65rem 1.75rem', fontSize: '0.9rem' }}
                        >
                            Next: Emotional Reflexes →
                        </button>
                    </div>
                </div>
            )}

            {/* ========================================================= */}
            {/* STEP 2: EMOTIONAL REFLEXES & GUARDS                       */}
            {/* ========================================================= */}
            {step === 2 && (
                <div className="fade-in">
                    <p style={{ color: '#cbd5e1', fontSize: '0.9rem', marginBottom: '1.25rem' }}>
                        Music is emotional medicine. How do you instinctively want the algorithm to react?
                    </p>

                    {/* Melancholy Question */}
                    <div style={{ marginBottom: '1.25rem' }}>
                        <label style={{ fontSize: '0.85rem', fontWeight: 'bold', color: '#f8fafc', display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.5rem' }}>
                            <span>🌧️</span> When feeling down or introspective:
                        </label>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                            <button
                                type="button"
                                onClick={() => setMelancholyReflex('lean')}
                                style={{
                                    padding: '0.85rem 1rem',
                                    borderRadius: '14px',
                                    textAlign: 'left',
                                    background: melancholyReflex === 'lean' ? 'linear-gradient(135deg, rgba(168, 85, 247, 0.25), rgba(99, 102, 241, 0.25))' : 'rgba(255,255,255,0.03)',
                                    border: melancholyReflex === 'lean' ? '2px solid #a855f7' : '1px solid rgba(255,255,255,0.08)',
                                    cursor: 'pointer',
                                    transition: 'all 0.15s ease'
                                }}
                            >
                                <div style={{ fontWeight: 'bold', color: '#f8fafc', fontSize: '0.85rem' }}>🖤 Lean Into It</div>
                                <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '0.2rem' }}>Deep, minor-key, atmospheric catharsis</div>
                            </button>
                            <button
                                type="button"
                                onClick={() => setMelancholyReflex('lift')}
                                style={{
                                    padding: '0.85rem 1rem',
                                    borderRadius: '14px',
                                    textAlign: 'left',
                                    background: melancholyReflex === 'lift' ? 'linear-gradient(135deg, rgba(168, 85, 247, 0.25), rgba(99, 102, 241, 0.25))' : 'rgba(255,255,255,0.03)',
                                    border: melancholyReflex === 'lift' ? '2px solid #a855f7' : '1px solid rgba(255,255,255,0.08)',
                                    cursor: 'pointer',
                                    transition: 'all 0.15s ease'
                                }}
                            >
                                <div style={{ fontWeight: 'bold', color: '#f8fafc', fontSize: '0.85rem' }}>☀️ Lift My Spirits</div>
                                <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '0.2rem' }}>Warm, uplifting, encouraging chords</div>
                            </button>
                        </div>
                    </div>

                    {/* Vocals vs Instrumental */}
                    <div style={{ marginBottom: '1.25rem' }}>
                        <label style={{ fontSize: '0.85rem', fontWeight: 'bold', color: '#f8fafc', display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.5rem' }}>
                            <span>🎯</span> Deep Focus & Study Mode:
                        </label>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                            <button
                                type="button"
                                onClick={() => setVocalReflex('instrumental')}
                                style={{
                                    padding: '0.85rem 1rem',
                                    borderRadius: '14px',
                                    textAlign: 'left',
                                    background: vocalReflex === 'instrumental' ? 'linear-gradient(135deg, rgba(168, 85, 247, 0.25), rgba(99, 102, 241, 0.25))' : 'rgba(255,255,255,0.03)',
                                    border: vocalReflex === 'instrumental' ? '2px solid #a855f7' : '1px solid rgba(255,255,255,0.08)',
                                    cursor: 'pointer',
                                    transition: 'all 0.15s ease'
                                }}
                            >
                                <div style={{ fontWeight: 'bold', color: '#f8fafc', fontSize: '0.85rem' }}>🔇 100% Instrumental</div>
                                <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '0.2rem' }}>Zero lyrics to distract your cognitive flow</div>
                            </button>
                            <button
                                type="button"
                                onClick={() => setVocalReflex('any')}
                                style={{
                                    padding: '0.85rem 1rem',
                                    borderRadius: '14px',
                                    textAlign: 'left',
                                    background: vocalReflex === 'any' ? 'linear-gradient(135deg, rgba(168, 85, 247, 0.25), rgba(99, 102, 241, 0.25))' : 'rgba(255,255,255,0.03)',
                                    border: vocalReflex === 'any' ? '2px solid #a855f7' : '1px solid rgba(255,255,255,0.08)',
                                    cursor: 'pointer',
                                    transition: 'all 0.15s ease'
                                }}
                            >
                                <div style={{ fontWeight: 'bold', color: '#f8fafc', fontSize: '0.85rem' }}>🎙️ Vocals Welcome</div>
                                <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '0.2rem' }}>Gentle or ambient singing is fine</div>
                            </button>
                        </div>
                    </div>

                    {/* Instant Dealbreaker Shield */}
                    <div style={{ marginBottom: '1.25rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                            <label style={{ fontSize: '0.85rem', fontWeight: 'bold', color: '#f8fafc', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                <span>🛡️</span> Instant Dealbreaker Shield:
                            </label>
                            <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Tap to block permanently</span>
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                            {DEALBREAKER_PRESETS.slice(0, 5).map(preset => {
                                const isBlocked = selectedDealbreakers.includes(preset.id);
                                return (
                                    <button
                                        key={preset.id}
                                        type="button"
                                        onClick={() => toggleDealbreaker(preset.id)}
                                        style={{
                                            padding: '0.4rem 0.8rem',
                                            borderRadius: '10px',
                                            fontSize: '0.75rem',
                                            fontWeight: '600',
                                            cursor: 'pointer',
                                            border: isBlocked ? '1px solid #ef4444' : '1px solid rgba(255,255,255,0.1)',
                                            background: isBlocked ? 'rgba(239, 68, 68, 0.2)' : 'rgba(255,255,255,0.04)',
                                            color: isBlocked ? '#fca5a5' : '#cbd5e1',
                                            transition: 'all 0.15s ease'
                                        }}
                                    >
                                        {isBlocked ? '🚫 ' : ''}{preset.label}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Anti-AI Gatekeeper Toggle */}
                    <div style={{
                        padding: '0.85rem 1.25rem',
                        background: blockAiGenerated ? 'rgba(16, 185, 129, 0.08)' : 'rgba(255,255,255,0.03)',
                        borderRadius: '14px',
                        border: blockAiGenerated ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid rgba(255,255,255,0.08)',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: '1.25rem'
                    }}>
                        <div>
                            <div style={{ fontWeight: '600', color: '#f8fafc', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                🛡️ Anti-AI Music Gatekeeper
                                <span style={{
                                    fontSize: '0.7rem',
                                    background: blockAiGenerated ? '#10b981' : 'rgba(255,255,255,0.1)',
                                    color: 'white',
                                    padding: '0.1rem 0.5rem',
                                    borderRadius: '999px',
                                    fontWeight: 'bold'
                                }}>
                                    {blockAiGenerated ? 'ACTIVE' : 'OFF'}
                                </span>
                            </div>
                            <div style={{ color: '#94a3b8', fontSize: '0.75rem', marginTop: '0.15rem' }}>
                                Drops synthetic AI generator farms (Suno, Udio) to preserve authentic human artistry.
                            </div>
                        </div>
                        <input
                            type="checkbox"
                            checked={blockAiGenerated}
                            onChange={(e) => setBlockAiGenerated(e.target.checked)}
                            style={{ width: '20px', height: '20px', accentColor: '#10b981', cursor: 'pointer' }}
                        />
                    </div>

                    {/* Step Navigation */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <button
                            type="button"
                            className="btn-text"
                            onClick={() => setStep(1)}
                            style={{ color: '#94a3b8' }}
                        >
                            ← Back to Radar
                        </button>
                        <button
                            type="button"
                            className="btn-primary"
                            onClick={() => setStep(3)}
                            style={{ width: 'auto', padding: '0.65rem 1.75rem', fontSize: '0.9rem' }}
                        >
                            Next: Polar Tie-Breakers →
                        </button>
                    </div>
                </div>
            )}

            {/* ========================================================= */}
            {/* STEP 3: POLAR TIE-BREAKERS (PICK 3 OUT OF 9)              */}
            {/* ========================================================= */}
            {step === 3 && (
                <div className="fade-in">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.85rem' }}>
                        <div>
                            <p style={{ color: '#cbd5e1', fontSize: '0.85rem', margin: 0 }}>
                                Select your <strong>Top 3 Far-Apart Anchors</strong> to break ties and anchor your sessions:
                            </p>
                        </div>
                        <span style={{
                            fontSize: '0.75rem',
                            fontWeight: 'bold',
                            color: selectedTieBreakers.length === 3 ? '#34d399' : '#a855f7',
                            background: selectedTieBreakers.length === 3 ? 'rgba(16, 185, 129, 0.15)' : 'rgba(168, 85, 247, 0.15)',
                            border: selectedTieBreakers.length === 3 ? '1px solid rgba(16, 185, 129, 0.35)' : '1px solid rgba(168, 85, 247, 0.35)',
                            borderRadius: '999px',
                            padding: '0.2rem 0.65rem',
                            whiteSpace: 'nowrap'
                        }}>
                            🎯 {selectedTieBreakers.length}/3 Selected
                        </span>
                    </div>

                    {/* 3x3 Polar Tie-Breakers Grid */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: '0.65rem', marginBottom: '1.25rem' }}>
                        {NINE_TIE_BREAKERS.map(item => {
                            const isSelected = selectedTieBreakers.includes(item.id);
                            const selectionOrder = selectedTieBreakers.indexOf(item.id);
                            return (
                                <div
                                    key={item.id}
                                    onClick={() => toggleTieBreaker(item.id)}
                                    style={{
                                        padding: '0.75rem 0.85rem',
                                        borderRadius: '14px',
                                        textAlign: 'left',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        justifyContent: 'space-between',
                                        cursor: 'pointer',
                                        border: isSelected ? '2px solid #a855f7' : '1px solid rgba(255,255,255,0.08)',
                                        background: isSelected ? 'linear-gradient(135deg, rgba(168, 85, 247, 0.28), rgba(99, 102, 241, 0.18))' : 'rgba(255,255,255,0.03)',
                                        boxShadow: isSelected ? '0 0 16px rgba(168, 85, 247, 0.25)' : 'none',
                                        transition: 'all 0.18s ease',
                                        position: 'relative'
                                    }}
                                >
                                    <div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                                                <span style={{ fontSize: '1.1rem' }}>{item.icon}</span>
                                                <strong style={{ fontSize: '0.85rem', color: isSelected ? '#f8fafc' : '#e2e8f0', lineHeight: 1.2 }}>
                                                    {item.title}
                                                </strong>
                                            </div>
                                            <span style={{
                                                fontSize: '0.7rem',
                                                fontWeight: 'bold',
                                                padding: '0.1rem 0.45rem',
                                                borderRadius: '999px',
                                                background: isSelected ? '#a855f7' : 'rgba(255,255,255,0.08)',
                                                color: isSelected ? 'white' : '#64748b'
                                            }}>
                                                {isSelected ? `#${selectionOrder + 1}` : '+'}
                                            </span>
                                        </div>
                                        <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: '0.35rem', lineHeight: 1.35 }}>
                                            {item.subtitle}
                                        </div>
                                    </div>

                                    <div style={{ fontSize: '0.7rem', color: isSelected ? '#e9d5ff' : '#64748b', marginTop: '0.5rem', fontWeight: '500' }}>
                                        {item.artists.join(' • ')}
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {/* Custom Artist Search / Add */}
                    <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem' }}>
                        <input
                            type="text"
                            placeholder="Add your own holy-grail artist (e.g. Chopin, Tool, Daft Punk)..."
                            value={customArtistText}
                            onChange={(e) => setCustomArtistText(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') handleAddCustomArtist(); }}
                            style={{
                                flex: 1,
                                background: 'rgba(255,255,255,0.05)',
                                border: '1px solid rgba(255,255,255,0.12)',
                                borderRadius: '12px',
                                padding: '0.65rem 1rem',
                                color: '#f8fafc',
                                fontSize: '0.85rem',
                                outline: 'none'
                            }}
                        />
                        <button
                            type="button"
                            onClick={handleAddCustomArtist}
                            style={{
                                background: '#a855f7',
                                color: 'white',
                                border: 'none',
                                borderRadius: '12px',
                                padding: '0.65rem 1.25rem',
                                fontWeight: 'bold',
                                fontSize: '0.85rem',
                                cursor: 'pointer'
                            }}
                        >
                            + Add
                        </button>
                    </div>

                    {/* Engine Configuration Summary Card */}
                    <div style={{
                        background: 'linear-gradient(135deg, rgba(168, 85, 247, 0.12), rgba(99, 102, 241, 0.12))',
                        border: '1px solid rgba(168, 85, 247, 0.35)',
                        borderRadius: '16px',
                        padding: '1rem 1.25rem',
                        marginBottom: '1.5rem',
                        fontSize: '0.8rem'
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', color: '#e9d5ff', fontWeight: 'bold', marginBottom: '0.35rem' }}>
                            <span>⚡ Live Engine Configuration</span>
                            <span>{selectedTieBreakers.length} Anchors • {selectedDealbreakers.length} Dealbreakers</span>
                        </div>
                        <div style={{ color: '#cbd5e1', fontSize: '0.75rem', lineHeight: 1.4 }}>
                            <strong>Selected Session Anchors:</strong> {
                                selectedTieBreakers.map(id => NINE_TIE_BREAKERS.find(t => t.id === id)?.title).filter(Boolean).join('  |  ')
                            }
                        </div>
                        <div style={{ color: '#94a3b8', fontSize: '0.7rem', marginTop: '0.25rem' }}>
                            Your taste DNA will strictly steer along harmonic edges without drifting.
                        </div>
                    </div>

                    {/* Bottom Actions */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <button
                            type="button"
                            className="btn-text"
                            onClick={() => setStep(2)}
                            style={{ color: '#94a3b8' }}
                        >
                            ← Back
                        </button>
                        <button
                            type="button"
                            className="btn-primary"
                            onClick={handleFinish}
                            style={{
                                width: 'auto',
                                padding: '0.85rem 2.25rem',
                                fontSize: '1rem',
                                background: 'linear-gradient(135deg, #10b981 0%, #6366f1 100%)',
                                boxShadow: '0 10px 25px -5px rgba(16, 185, 129, 0.4)'
                            }}
                        >
                            🚀 Complete Calibration & Play
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

export default OnboardingWizard;
