import React, { useState } from 'react';
import { moods, contextualMoods, nuanceMoods, modernMoods, cinematicMoods, allMoods } from '../services/moods.js';
export { moods, contextualMoods, nuanceMoods, modernMoods, cinematicMoods, allMoods };

function MoodBar({ selectedMood, onSelectMood }) {
    const isCustomMoodSelected = contextualMoods.some(m => m.id === selectedMood) ||
        nuanceMoods.some(m => m.id === selectedMood) ||
        modernMoods.some(m => m.id === selectedMood) ||
        cinematicMoods.some(m => m.id === selectedMood);

    // Hidden by default to keep the UI clean and uncluttered
    const [showMoreVibes, setShowMoreVibes] = useState(isCustomMoodSelected);

    const renderMoodGroup = (moodList) => (
        <div className="mood-bar">
            {moodList.map((mood) => (
                <button
                    key={mood.id}
                    className={`mood-chip ${selectedMood === mood.id ? 'active' : ''}`}
                    onClick={() => onSelectMood(mood.id)}
                >
                    <span className="mood-emoji">{mood.emoji}</span>
                    <span className="mood-label">{mood.label}</span>
                </button>
            ))}
        </div>
    );

    return (
        <div className="mood-bar-container">
            <h3 className="section-subtitle" style={{ textAlign: 'center', marginBottom: '1rem', color: '#a8a8b3' }}>Emotions</h3>
            {renderMoodGroup(moods)}

            {/* Optional Collapsible Button for Situations & Nuances */}
            <div style={{ textAlign: 'center', marginTop: '1.25rem' }}>
                <button
                    type="button"
                    onClick={() => setShowMoreVibes(!showMoreVibes)}
                    style={{
                        background: 'rgba(255, 255, 255, 0.05)',
                        border: '1px solid rgba(255, 255, 255, 0.12)',
                        color: isCustomMoodSelected ? '#60a5fa' : '#a8a8b3',
                        borderRadius: '20px',
                        padding: '0.4rem 1.1rem',
                        fontSize: '0.8rem',
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.45rem',
                        transition: 'all 0.2s ease'
                    }}
                >
                    <span>{showMoreVibes ? '▲ Hide Extra Vibes' : '✨ More Situations & Nuances ▾'}</span>
                    {isCustomMoodSelected && !showMoreVibes && (
                        <span style={{ background: '#3b82f6', color: '#fff', padding: '0.1rem 0.45rem', borderRadius: '10px', fontSize: '0.7rem' }}>
                            Active
                        </span>
                    )}
                </button>
            </div>

            {/* Collapsible Dropdowns: Hidden by default so they don't crowd the UI */}
            {showMoreVibes && (
                <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap', marginTop: '1.5rem' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                        <h3 className="section-subtitle" style={{ marginBottom: '0.5rem', color: '#a8a8b3', fontSize: '0.85rem' }}>Situations</h3>
                        <select
                            className={`mood-dropdown ${contextualMoods.some(m => m.id === selectedMood) ? 'active' : ''}`}
                            value={contextualMoods.some(m => m.id === selectedMood) ? selectedMood : ""}
                            onChange={(e) => {
                                if (e.target.value) onSelectMood(e.target.value);
                            }}
                        >
                            <option value="" disabled>🏕️ Select a Situation...</option>
                            {contextualMoods.map((mood) => (
                                <option key={mood.id} value={mood.id}>
                                    {mood.emoji} {mood.label}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                        <h3 className="section-subtitle" style={{ marginBottom: '0.5rem', color: '#a8a8b3', fontSize: '0.85rem' }}>Nuances</h3>
                        <select
                            className={`mood-dropdown ${nuanceMoods.some(m => m.id === selectedMood) ? 'active' : ''}`}
                            value={nuanceMoods.some(m => m.id === selectedMood) ? selectedMood : ""}
                            onChange={(e) => {
                                if (e.target.value) onSelectMood(e.target.value);
                            }}
                        >
                            <option value="" disabled>🎨 Select a Nuance...</option>
                            {nuanceMoods.map((mood) => (
                                <option key={mood.id} value={mood.id}>
                                    {mood.emoji} {mood.label}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                        <h3 className="section-subtitle" style={{ marginBottom: '0.5rem', color: '#a8a8b3', fontSize: '0.85rem' }}>Aesthetics</h3>
                        <select
                            className={`mood-dropdown ${modernMoods.some(m => m.id === selectedMood) ? 'active' : ''}`}
                            value={modernMoods.some(m => m.id === selectedMood) ? selectedMood : ""}
                            onChange={(e) => {
                                if (e.target.value) onSelectMood(e.target.value);
                            }}
                        >
                            <option value="" disabled>📱 Select an Aesthetic...</option>
                            {modernMoods.map((mood) => (
                                <option key={mood.id} value={mood.id}>
                                    {mood.emoji} {mood.label}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                        <h3 className="section-subtitle" style={{ marginBottom: '0.5rem', color: '#a8a8b3', fontSize: '0.85rem' }}>Cinematic</h3>
                        <select
                            className={`mood-dropdown ${cinematicMoods.some(m => m.id === selectedMood) ? 'active' : ''}`}
                            value={cinematicMoods.some(m => m.id === selectedMood) ? selectedMood : ""}
                            onChange={(e) => {
                                if (e.target.value) onSelectMood(e.target.value);
                            }}
                        >
                            <option value="" disabled>🎬 Select a Vibe...</option>
                            {cinematicMoods.map((mood) => (
                                <option key={mood.id} value={mood.id}>
                                    {mood.emoji} {mood.label}
                                </option>
                            ))}
                        </select>
                    </div>
                </div>
            )}
        </div>
    );
}

export default MoodBar;
