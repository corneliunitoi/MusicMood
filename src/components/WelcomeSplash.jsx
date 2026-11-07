import React from 'react';

/**
 * WelcomeSplash.jsx
 * Option 1: Modern Glassmorphic Hero Welcome Screen.
 * Clearly articulates user intent, anti-drift architecture, and launches
 * the 6-Stop Guided Spotlight Tour across the live interface.
 */
export default function WelcomeSplash({ onStartTour, onClose }) {
    return (
        <div
            className="welcome-splash-backdrop fade-in"
            onClick={onClose}
            style={{
                position: 'fixed',
                inset: 0,
                background: 'rgba(5, 7, 15, 0.82)',
                backdropFilter: 'blur(16px)',
                WebkitBackdropFilter: 'blur(16px)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 2000,
                padding: '1.25rem',
                overflowY: 'auto'
            }}
        >
            <div
                className="welcome-splash-card"
                onClick={(e) => e.stopPropagation()}
                style={{
                    position: 'relative',
                    width: '100%',
                    maxWidth: '780px',
                    background: 'linear-gradient(145deg, rgba(30, 27, 75, 0.9) 0%, rgba(15, 23, 42, 0.95) 100%)',
                    border: '1px solid rgba(168, 85, 247, 0.35)',
                    borderRadius: '24px',
                    padding: '2.5rem 2rem',
                    boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.8), 0 0 50px rgba(168, 85, 247, 0.2)',
                    color: '#f8fafc',
                    textAlign: 'center'
                }}
            >
                {/* Dismiss Button */}
                <button
                    type="button"
                    onClick={onClose}
                    aria-label="Close welcome screen"
                    style={{
                        position: 'absolute',
                        top: '1.25rem',
                        right: '1.25rem',
                        background: 'rgba(255, 255, 255, 0.08)',
                        border: '1px solid rgba(255, 255, 255, 0.12)',
                        borderRadius: '50%',
                        width: '32px',
                        height: '32px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#94a3b8',
                        cursor: 'pointer',
                        fontSize: '1rem',
                        transition: 'all 0.15s ease'
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.color = '#ffffff'; e.currentTarget.style.background = 'rgba(255, 255, 255, 0.16)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = '#94a3b8'; e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)'; }}
                >
                    ✕
                </button>

                {/* Top Pill Badge */}
                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1.25rem' }}>
                    <span
                        style={{
                            fontSize: '0.75rem',
                            fontWeight: '700',
                            letterSpacing: '0.05em',
                            textTransform: 'uppercase',
                            color: '#d8b4fe',
                            background: 'rgba(168, 85, 247, 0.18)',
                            border: '1px solid rgba(168, 85, 247, 0.4)',
                            borderRadius: '999px',
                            padding: '0.35rem 0.9rem',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.4rem'
                        }}
                    >
                        <span>✨</span> A Different Way to Listen
                    </span>
                </div>

                {/* Main Headline */}
                <h1
                    style={{
                        fontSize: '1.85rem',
                        fontWeight: '800',
                        letterSpacing: '-0.025em',
                        lineHeight: '1.25',
                        color: '#ffffff',
                        margin: '0 auto 1rem auto',
                        maxWidth: '680px'
                    }}
                >
                    Are you tired of AI algorithms telling you what you should listen to?
                </h1>

                {/* Narrative Subtitle */}
                <p
                    style={{
                        fontSize: '0.92rem',
                        lineHeight: '1.6',
                        color: '#cbd5e1',
                        margin: '0 auto 2rem auto',
                        maxWidth: '640px'
                    }}
                >
                    Most streaming platforms trap you in a predictable loop after three songs. <strong style={{ color: '#ffffff' }}>MusicMood</strong> asks a few quick questions about your tastes, then learns and evolves with you—curating authentic music for each headspace without algorithmic drift.
                </p>

                {/* 3 Value Pillar Cards */}
                <div
                    style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
                        gap: '1rem',
                        marginBottom: '2rem',
                        textAlign: 'left'
                    }}
                >
                    {/* Pillar 1 */}
                    <div
                        style={{
                            background: 'rgba(255, 255, 255, 0.04)',
                            border: '1px solid rgba(255, 255, 255, 0.08)',
                            borderRadius: '16px',
                            padding: '1.1rem 1rem',
                            transition: 'all 0.2s ease'
                        }}
                    >
                        <div style={{ fontSize: '1.4rem', marginBottom: '0.4rem' }}>🎯</div>
                        <div style={{ fontSize: '0.85rem', fontWeight: '700', color: '#f8fafc', marginBottom: '0.25rem' }}>
                            You Steer, Not the Black Box
                        </div>
                        <div style={{ fontSize: '0.74rem', color: '#94a3b8', lineHeight: '1.45' }}>
                            A 2-track node cap and 15-artist cooldown ensure you never get stuck in repetitive autoplay loops.
                        </div>
                    </div>

                    {/* Pillar 2 */}
                    <div
                        style={{
                            background: 'rgba(255, 255, 255, 0.04)',
                            border: '1px solid rgba(255, 255, 255, 0.08)',
                            borderRadius: '16px',
                            padding: '1.1rem 1rem',
                            transition: 'all 0.2s ease'
                        }}
                    >
                        <div style={{ fontSize: '1.4rem', marginBottom: '0.4rem' }}>🏠</div>
                        <div style={{ fontSize: '0.85rem', fontWeight: '700', color: '#f8fafc', marginBottom: '0.25rem' }}>
                            Calibrated Mood Homes
                        </div>
                        <div style={{ fontSize: '0.74rem', color: '#94a3b8', lineHeight: '1.45' }}>
                            Set your exact baseline for Focus, Chill, Energetic, Sad, and Party. Jumping moods always returns to your home genre.
                        </div>
                    </div>

                    {/* Pillar 3 */}
                    <div
                        style={{
                            background: 'rgba(255, 255, 255, 0.04)',
                            border: '1px solid rgba(255, 255, 255, 0.08)',
                            borderRadius: '16px',
                            padding: '1.1rem 1rem',
                            transition: 'all 0.2s ease'
                        }}
                    >
                        <div style={{ fontSize: '1.4rem', marginBottom: '0.4rem' }}>🧭</div>
                        <div style={{ fontSize: '0.85rem', fontWeight: '700', color: '#f8fafc', marginBottom: '0.25rem' }}>
                            Leashed Discovery
                        </div>
                        <div style={{ fontSize: '0.74rem', color: '#94a3b8', lineHeight: '1.45' }}>
                            Choose Familiar (1 hop), Balanced (2 hops), or Deep Cuts to govern exactly how far the engine wanders.
                        </div>
                    </div>
                </div>

                {/* Call to Action Footer */}
                <div
                    style={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '0.75rem',
                        paddingTop: '0.75rem',
                        borderTop: '1px solid rgba(255, 255, 255, 0.08)'
                    }}
                >
                    <button
                        type="button"
                        onClick={onStartTour}
                        className="btn-primary"
                        style={{
                            width: 'auto',
                            padding: '0.8rem 1.85rem',
                            fontSize: '0.92rem',
                            fontWeight: '700',
                            background: 'linear-gradient(135deg, #a855f7 0%, #6366f1 50%, #10b981 100%)',
                            borderRadius: '12px',
                            boxShadow: '0 8px 25px -5px rgba(168, 85, 247, 0.5)',
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.5rem',
                            border: 'none',
                            color: '#ffffff',
                            transition: 'transform 0.15s ease'
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.02)'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1.0)'; }}
                    >
                        <span>🚀</span> Take the 60-Second Guided Tour →
                    </button>
                    <button
                        type="button"
                        onClick={onClose}
                        style={{
                            background: 'rgba(255, 255, 255, 0.06)',
                            border: '1px solid rgba(255, 255, 255, 0.12)',
                            borderRadius: '12px',
                            padding: '0.8rem 1.4rem',
                            color: '#94a3b8',
                            fontSize: '0.88rem',
                            fontWeight: '600',
                            cursor: 'pointer',
                            transition: 'all 0.15s ease'
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.color = '#ffffff'; e.currentTarget.style.background = 'rgba(255, 255, 255, 0.12)'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.color = '#94a3b8'; e.currentTarget.style.background = 'rgba(255, 255, 255, 0.06)'; }}
                    >
                        Jump Straight to Player
                    </button>
                </div>
            </div>
        </div>
    );
}
