import { useState, useEffect, useRef } from 'react';

/**
 * GuidedTour.jsx
 * Option A: Interactive Guided Spotlight Tour across the live interface.
 * Highlights the 6 core components in real-time with an illuminated spotlight ring
 * and floating guided card.
 */
const TOUR_STEPS = [
    {
        id: 'calibrate',
        targetSelector: '[data-tour="calibrate"]',
        badge: 'Step 1 of 6',
        icon: '🎛️',
        title: 'Sculpt Your Sound Baseline',
        description: 'Most streaming apps lock you into a hidden profile you cannot see or change. The Calibrate tool lets you visibly drag a 6-point sound polygon and filter out hard dealbreakers like harsh screaming or mumble autotune so they never play.'
    },
    {
        id: 'playlists',
        targetSelector: '[data-tour="playlists"]',
        badge: 'Step 2 of 6',
        icon: '📥',
        title: 'Bring Your Music Library In',
        description: 'You do not have to start from scratch. Connect your YouTube library to import existing playlists directly into MusicMood. The engine indexes your favorite tracks across our 115-genre harmonic taxonomy with zero Google API quota usage.'
    },
    {
        id: 'mood-bar',
        targetSelector: '[data-tour="mood-bar"]',
        badge: 'Step 3 of 6',
        icon: '🧠',
        title: 'Listen by Emotion, Not Rigid Genres',
        description: 'Choose how you want to feel right now across Focus, Chill, Energetic, Happy, Sad, or Party. Each mood is anchored to your calibrated Home genre—so clicking "Focus" instantly delivers your concentration flow state (e.g. Baroque or Lo-Fi Beats).'
    },
    {
        id: 'player',
        targetSelector: '[data-tour="player"]',
        badge: 'Step 4 of 6',
        icon: '🎧',
        title: 'Music That Never Gets Stale',
        description: 'We built MusicMood to eliminate streaming fatigue. The player constantly rotates artists and styles in the background so you never get trapped hearing the same five songs on repeat.'
    },
    {
        id: 'surprise-me',
        targetSelector: '[data-tour="surprise-me"]',
        badge: 'Step 5 of 6',
        icon: '🎲',
        title: 'Instant Variety on Demand',
        description: 'Ready for something different? Hit "Surprise Me" to leap to a new genre that naturally fits your flow—no jarring tempo drops, no mood killers.'
    },
    {
        id: 'discovery',
        targetSelector: '[data-tour="discovery"]',
        badge: 'Step 6 of 6',
        icon: '🧭',
        title: 'You Control the Exploration Horizon',
        description: 'You set the leash on how adventurous playback is allowed to be: Familiar keeps jumps to 1-hop sister genres, Balanced bridges adjacent styles within 2 hops, and Deep Cuts explores the outer edges of the graph.'
    }
];

export default function GuidedTour({ onFinish, onOpenCalibrate }) {
    const [stepIndex, setStepIndex] = useState(0);
    const [targetRect, setTargetRect] = useState(null);
    const cardRef = useRef(null);

    const currentStep = TOUR_STEPS[stepIndex];
    const isFirst = stepIndex === 0;
    const isLast = stepIndex === TOUR_STEPS.length - 1;

    // Update target element bounding rect whenever step changes or on resize
    useEffect(() => {
        const updateRect = () => {
            const el = document.querySelector(currentStep.targetSelector);
            if (el) {
                // Scroll into view if needed
                el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
                const rect = el.getBoundingClientRect();
                setTargetRect({
                    top: rect.top,
                    left: rect.left,
                    width: rect.width,
                    height: rect.height,
                    bottom: rect.bottom,
                    right: rect.right
                });
            } else {
                setTargetRect(null);
            }
        };

        updateRect();
        const timer = setTimeout(updateRect, 300); // re-check after smooth scrolling
        window.addEventListener('resize', updateRect);
        window.addEventListener('scroll', updateRect, true);

        return () => {
            clearTimeout(timer);
            window.removeEventListener('resize', updateRect);
            window.removeEventListener('scroll', updateRect, true);
        };
    }, [stepIndex, currentStep.targetSelector]);

    const handleNext = () => {
        if (isLast) {
            onFinish();
        } else {
            setStepIndex(prev => prev + 1);
        }
    };

    const handleBack = () => {
        if (!isFirst) {
            setStepIndex(prev => prev - 1);
        }
    };

    // Calculate tooltip position relative to target
    const getCardStyle = () => {
        const cardWidth = 360;
        const padding = 16;
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;

        if (!targetRect) {
            return {
                position: 'fixed',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                width: `${cardWidth}px`,
                zIndex: 2500
            };
        }

        // Determine if tooltip should be above or below target
        const spaceBelow = viewportHeight - targetRect.bottom;
        const placeBelow = spaceBelow >= 260 || targetRect.top < 240;

        let top = placeBelow ? targetRect.bottom + 14 : targetRect.top - 250;
        top = Math.max(padding, Math.min(viewportHeight - 270, top));

        // Center horizontally on target, clamped to viewport
        let left = targetRect.left + (targetRect.width / 2) - (cardWidth / 2);
        left = Math.max(padding, Math.min(viewportWidth - cardWidth - padding, left));

        return {
            position: 'fixed',
            top: `${top}px`,
            left: `${left}px`,
            width: `${cardWidth}px`,
            zIndex: 2500,
            transition: 'all 0.25s cubic-bezier(0.16, 1, 0.3, 1)'
        };
    };

    return (
        <div className="guided-tour-overlay fade-in" style={{ position: 'fixed', inset: 0, zIndex: 2400, pointerEvents: 'auto' }}>
            {/* Dark Backdrop */}
            <div
                style={{
                    position: 'fixed',
                    inset: 0,
                    background: 'rgba(5, 7, 15, 0.75)',
                    backdropFilter: 'blur(3px)',
                    transition: 'opacity 0.25s ease'
                }}
                onClick={onFinish}
            />

            {/* Spotlight Ring around target */}
            {targetRect && (
                <div
                    style={{
                        position: 'fixed',
                        top: `${targetRect.top - 6}px`,
                        left: `${targetRect.left - 6}px`,
                        width: `${targetRect.width + 12}px`,
                        height: `${targetRect.height + 12}px`,
                        borderRadius: '14px',
                        border: '2px solid #a855f7',
                        boxShadow: '0 0 0 9999px rgba(5, 7, 15, 0.72), 0 0 25px rgba(168, 85, 247, 0.65)',
                        pointerEvents: 'none',
                        zIndex: 2450,
                        transition: 'all 0.25s cubic-bezier(0.16, 1, 0.3, 1)'
                    }}
                />
            )}

            {/* Floating Tooltip Card */}
            <div
                ref={cardRef}
                style={getCardStyle()}
                className="tour-card"
                onClick={(e) => e.stopPropagation()}
            >
                <div
                    style={{
                        background: 'linear-gradient(145deg, rgba(24, 20, 60, 0.98), rgba(15, 23, 42, 0.98))',
                        border: '1px solid rgba(168, 85, 247, 0.45)',
                        borderRadius: '18px',
                        padding: '1.25rem',
                        boxShadow: '0 20px 45px -10px rgba(0, 0, 0, 0.8), 0 0 30px rgba(168, 85, 247, 0.35)',
                        color: '#f8fafc',
                        textAlign: 'left'
                    }}
                >
                    {/* Top Step Header */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.65rem' }}>
                        <span
                            style={{
                                fontSize: '0.72rem',
                                fontWeight: '700',
                                textTransform: 'uppercase',
                                color: '#d8b4fe',
                                background: 'rgba(168, 85, 247, 0.18)',
                                border: '1px solid rgba(168, 85, 247, 0.35)',
                                borderRadius: '999px',
                                padding: '0.2rem 0.55rem'
                            }}
                        >
                            {currentStep.badge}
                        </span>
                        <button
                            type="button"
                            onClick={onFinish}
                            style={{
                                background: 'none',
                                border: 'none',
                                color: '#64748b',
                                fontSize: '0.75rem',
                                cursor: 'pointer',
                                padding: '0.2rem'
                            }}
                            onMouseEnter={(e) => { e.currentTarget.style.color = '#cbd5e1'; }}
                            onMouseLeave={(e) => { e.currentTarget.style.color = '#64748b'; }}
                        >
                            Skip tour ✕
                        </button>
                    </div>

                    {/* Step Title */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', marginBottom: '0.45rem' }}>
                        <span style={{ fontSize: '1.25rem' }}>{currentStep.icon}</span>
                        <h2 style={{ fontSize: '1rem', fontWeight: '700', color: '#ffffff', margin: 0 }}>
                            {currentStep.title}
                        </h2>
                    </div>

                    {/* Step Description */}
                    <p style={{ fontSize: '0.8rem', color: '#cbd5e1', lineHeight: '1.5', margin: '0 0 1.1rem 0' }}>
                        {currentStep.description}
                    </p>

                    {/* Navigation Buttons & Progress Dots */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '0.75rem' }}>
                        {/* Progress Dots */}
                        <div style={{ display: 'flex', gap: '4px' }}>
                            {TOUR_STEPS.map((_, i) => (
                                <div
                                    key={i}
                                    style={{
                                        width: i === stepIndex ? '14px' : '6px',
                                        height: '6px',
                                        borderRadius: '3px',
                                        background: i === stepIndex ? '#a855f7' : 'rgba(255,255,255,0.18)',
                                        transition: 'all 0.2s ease'
                                    }}
                                />
                            ))}
                        </div>

                        {/* Action Buttons */}
                        <div style={{ display: 'flex', gap: '0.4rem' }}>
                            {!isFirst && (
                                <button
                                    type="button"
                                    onClick={handleBack}
                                    style={{
                                        background: 'rgba(255, 255, 255, 0.08)',
                                        border: '1px solid rgba(255, 255, 255, 0.15)',
                                        borderRadius: '8px',
                                        padding: '0.35rem 0.75rem',
                                        color: '#cbd5e1',
                                        fontSize: '0.76rem',
                                        fontWeight: '600',
                                        cursor: 'pointer'
                                    }}
                                >
                                    ← Back
                                </button>
                            )}
                            <button
                                type="button"
                                onClick={handleNext}
                                style={{
                                    background: isLast ? 'linear-gradient(135deg, #10b981, #6366f1)' : 'linear-gradient(135deg, #a855f7, #6366f1)',
                                    border: 'none',
                                    borderRadius: '8px',
                                    padding: '0.35rem 0.95rem',
                                    color: '#ffffff',
                                    fontSize: '0.78rem',
                                    fontWeight: '700',
                                    cursor: 'pointer',
                                    boxShadow: '0 4px 12px rgba(168, 85, 247, 0.4)'
                                }}
                            >
                                {isLast ? 'Finish Tour ✓' : 'Next →'}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
