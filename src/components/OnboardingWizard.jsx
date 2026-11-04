import { useState } from 'react';
import { GENRE_NODES, DEALBREAKER_PRESETS } from '../services/tasteGraph';
import { sessionEngine } from '../services/sessionStateMachine';
import { saveTasteGraphToSupabase } from '../services/supabaseService';

function OnboardingWizard({ onComplete }) {
    const [step, setStep] = useState(1);
    const existingCalib = sessionEngine.getCalibration();

    const [selectedAnchors, setSelectedAnchors] = useState(existingCalib.anchors || []);
    const [selectedDealbreakers, setSelectedDealbreakers] = useState(existingCalib.dealbreakers || []);
    const [discoveryLevel, setDiscoveryLevel] = useState(existingCalib.discoveryLevel || 0.5);

    const toggleAnchor = (genreId) => {
        setSelectedAnchors(prev => {
            if (prev.includes(genreId)) {
                return prev.filter(id => id !== genreId);
            }
            if (prev.length >= 5) return prev; // Max 5 anchors
            return [...prev, genreId];
        });
    };

    const toggleDealbreaker = (dbId) => {
        setSelectedDealbreakers(prev => {
            if (prev.includes(dbId)) {
                return prev.filter(id => id !== dbId);
            }
            return [...prev, dbId];
        });
    };

    const handleFinish = async () => {
        const calibration = {
            anchors: selectedAnchors.length > 0 ? selectedAnchors : ['lofi_hiphop', 'post_rock'],
            dealbreakers: selectedDealbreakers,
            discoveryLevel,
            weights: selectedAnchors.reduce((acc, curr) => {
                acc[curr] = 1.0;
                return acc;
            }, {})
        };

        sessionEngine.saveCalibration(calibration);

        // Sync to Supabase in the background if possible
        try {
            await saveTasteGraphToSupabase({
                ...calibration,
                topGenres: selectedAnchors.map(id => GENRE_NODES[id]?.label || id),
            });
        } catch (e) {
            console.warn("Could not sync calibration to Supabase:", e);
        }

        if (onComplete) onComplete(calibration);
    };

    return (
        <div className="glass-card fade-in" style={{ maxWidth: '750px', margin: '2rem auto', textAlign: 'left', padding: '2.5rem' }}>
            {/* Header with Step Indicator */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '1rem' }}>
                <div>
                    <h2 style={{ margin: 0, fontSize: '1.8rem' }}>Sonic Calibration Wizard</h2>
                    <p style={{ margin: '0.25rem 0 0 0', color: '#94a3b8', fontSize: '0.9rem' }}>
                        Telling MusicMood exactly what you want to hear so the algorithm never drifts.
                    </p>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                    {[1, 2, 3].map(s => (
                        <div
                            key={s}
                            style={{
                                width: '32px',
                                height: '32px',
                                borderRadius: '50%',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontWeight: 'bold',
                                fontSize: '0.85rem',
                                background: step === s ? 'linear-gradient(135deg, #6366f1, #a855f7)' : step > s ? '#10b981' : 'rgba(255,255,255,0.1)',
                                color: 'white'
                            }}
                        >
                            {step > s ? '✓' : s}
                        </div>
                    ))}
                </div>
            </div>

            {/* STEP 1: ANCHOR SOUNDS */}
            {step === 1 && (
                <div className="fade-in">
                    <h3 style={{ margin: '0 0 0.5rem 0' }}>Step 1: Your Anchor Sounds ⚓</h3>
                    <p style={{ color: '#94a3b8', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
                        Select <strong>2 to 4 core styles</strong> that represent what you actually love. These form your positive taste graph roots.
                    </p>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '0.75rem', maxHeight: '350px', overflowY: 'auto', paddingRight: '0.5rem' }}>
                        {Object.values(GENRE_NODES).map(node => {
                            const isSelected = selectedAnchors.includes(node.id);
                            return (
                                <button
                                    key={node.id}
                                    type="button"
                                    onClick={() => toggleAnchor(node.id)}
                                    style={{
                                        padding: '0.75rem 1rem',
                                        borderRadius: '12px',
                                        textAlign: 'center',
                                        background: isSelected ? 'linear-gradient(135deg, rgba(99, 102, 241, 0.4), rgba(168, 85, 247, 0.4))' : 'rgba(255,255,255,0.03)',
                                        border: isSelected ? '2px solid #a855f7' : '1px solid rgba(255,255,255,0.1)',
                                        color: isSelected ? '#f8fafc' : '#94a3b8',
                                        fontWeight: isSelected ? 'bold' : 'normal',
                                        cursor: 'pointer',
                                        transition: 'all 0.15s ease',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        gap: '0.25rem'
                                    }}
                                >
                                    <span style={{ fontSize: '0.95rem' }}>{node.label}</span>
                                    <span style={{ fontSize: '0.75rem', opacity: 0.6 }}>{node.group}</span>
                                </button>
                            );
                        })}
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '2rem' }}>
                        <span style={{ fontSize: '0.85rem', color: selectedAnchors.length >= 2 ? '#10b981' : '#f59e0b' }}>
                            {selectedAnchors.length} selected (Pick at least 2)
                        </span>
                        <button
                            className="btn-primary"
                            disabled={selectedAnchors.length < 2}
                            onClick={() => setStep(2)}
                            style={{ opacity: selectedAnchors.length < 2 ? 0.5 : 1 }}
                        >
                            Continue to Dealbreakers →
                        </button>
                    </div>
                </div>
            )}

            {/* STEP 2: HARD DEALBREAKERS */}
            {step === 2 && (
                <div className="fade-in">
                    <h3 style={{ margin: '0 0 0.5rem 0' }}>Step 2: Hard Dealbreakers 🚫</h3>
                    <p style={{ color: '#94a3b8', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
                        What ruins a music session for you? The Anti-Drift Engine will <strong>strictly block</strong> these from ever playing.
                    </p>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                        {DEALBREAKER_PRESETS.map(preset => {
                            const isExcluded = selectedDealbreakers.includes(preset.id);
                            return (
                                <div
                                    key={preset.id}
                                    onClick={() => toggleDealbreaker(preset.id)}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        padding: '1rem 1.25rem',
                                        borderRadius: '12px',
                                        background: isExcluded ? 'rgba(239, 68, 68, 0.15)' : 'rgba(255,255,255,0.03)',
                                        border: isExcluded ? '1px solid #ef4444' : '1px solid rgba(255,255,255,0.08)',
                                        cursor: 'pointer',
                                        transition: 'all 0.15s ease'
                                    }}
                                >
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                        <span style={{ fontSize: '1.4rem' }}>{preset.emoji}</span>
                                        <div>
                                            <div style={{ fontWeight: '600', color: isExcluded ? '#fca5a5' : '#f8fafc' }}>
                                                {preset.label}
                                            </div>
                                            <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '0.2rem' }}>
                                                Excludes: {preset.excludeTerms.slice(0, 3).join(', ')}...
                                            </div>
                                        </div>
                                    </div>
                                    <span style={{
                                        padding: '0.25rem 0.75rem',
                                        borderRadius: '20px',
                                        fontSize: '0.8rem',
                                        fontWeight: 'bold',
                                        background: isExcluded ? '#ef4444' : 'rgba(255,255,255,0.1)',
                                        color: 'white'
                                    }}>
                                        {isExcluded ? 'BLOCKED' : 'Allow'}
                                    </span>
                                </div>
                            );
                        })}
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '2rem' }}>
                        <button
                            className="btn-text"
                            onClick={() => setStep(1)}
                        >
                            ← Back
                        </button>
                        <button
                            className="btn-primary"
                            onClick={() => setStep(3)}
                        >
                            Continue to Discovery Dial →
                        </button>
                    </div>
                </div>
            )}

            {/* STEP 3: DISCOVERY APPETITE */}
            {step === 3 && (
                <div className="fade-in">
                    <h3 style={{ margin: '0 0 0.5rem 0' }}>Step 3: Discovery Appetite 🧭</h3>
                    <p style={{ color: '#94a3b8', fontSize: '0.9rem', marginBottom: '2rem' }}>
                        How adventurous do you want your sessions to be?
                    </p>

                    <div style={{ background: 'rgba(255,255,255,0.03)', padding: '2rem', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.1)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem', fontWeight: 'bold' }}>
                            <span style={{ color: discoveryLevel < 0.4 ? '#60a5fa' : '#94a3b8' }}>🎧 Familiar Comfort Zone</span>
                            <span style={{ color: discoveryLevel >= 0.4 && discoveryLevel <= 0.7 ? '#a855f7' : '#94a3b8' }}>⚖️ Balanced Flow</span>
                            <span style={{ color: discoveryLevel > 0.7 ? '#ec4899' : '#94a3b8' }}>🚀 Deep Cuts & Obscure Gems</span>
                        </div>

                        <input
                            type="range"
                            min="0"
                            max="1"
                            step="0.05"
                            value={discoveryLevel}
                            onChange={(e) => setDiscoveryLevel(parseFloat(e.target.value))}
                            style={{ width: '100%', accentColor: '#a855f7', cursor: 'pointer', height: '8px' }}
                        />

                        <p style={{ color: '#cbd5e1', fontSize: '0.85rem', marginTop: '1.25rem', textAlign: 'center' }}>
                            {discoveryLevel < 0.4 && "Prioritizes your local library tracks and direct anchor subgenres."}
                            {discoveryLevel >= 0.4 && discoveryLevel <= 0.7 && "Plays 70% core favorites, and carefully introduces harmonic neighbors in the graph."}
                            {discoveryLevel > 0.7 && "Dives deep into uncommercialized audio, underground artists, and distant graph bridges."}
                        </p>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '2.5rem' }}>
                        <button
                            className="btn-text"
                            onClick={() => setStep(2)}
                        >
                            ← Back
                        </button>
                        <button
                            className="btn-primary"
                            onClick={handleFinish}
                            style={{ padding: '1rem 2rem' }}
                        >
                            Save Calibration & Start Listening 🚀
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

export default OnboardingWizard;
