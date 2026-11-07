import React, { useState, useEffect } from 'react';
import { moods, contextualMoods, nuanceMoods, modernMoods, cinematicMoods, allMoods } from '../services/moods.js';
import { sessionEngine } from '../services/sessionStateMachine.js';
import { GENRE_NODES } from '../services/tasteGraph.js';
export { moods, contextualMoods, nuanceMoods, modernMoods, cinematicMoods, allMoods };

const CATEGORIES = [
    { id: 'core', label: 'Core', icon: '✨', list: moods },
    { id: 'activities', label: 'Activities', icon: '🏃', list: contextualMoods },
    { id: 'nuances', label: 'Nuances', icon: '🎨', list: nuanceMoods },
    { id: 'aesthetics', label: 'Aesthetics', icon: '🔮', list: modernMoods },
    { id: 'cinematic', label: 'Cinematic', icon: '🎬', list: cinematicMoods },
];

function MoodBar({ selectedMood, onSelectMood }) {
    // Find the category containing a given mood id
    const getCategoryForMood = (moodId) => {
        for (const cat of CATEGORIES) {
            if (cat.list.some(m => m.id === moodId)) return cat.id;
        }
        return 'core';
    };

    const [activeTab, setActiveTab] = useState(() => getCategoryForMood(selectedMood));

    // Keep active tab synced if selectedMood changes externally and is not in current tab
    useEffect(() => {
        if (selectedMood) {
            const currentCat = CATEGORIES.find(c => c.id === activeTab);
            if (!currentCat || !currentCat.list.some(m => m.id === selectedMood)) {
                setActiveTab(getCategoryForMood(selectedMood));
            }
        }
    }, [selectedMood]);

    const currentCategory = CATEGORIES.find(c => c.id === activeTab) || CATEGORIES[0];

    return (
        <div className="mood-bar-container">
            {/* Elegant Segmented Category Switcher */}
            <nav className="mood-category-tabs" role="tablist" aria-label="Mood categories">
                {CATEGORIES.map((cat) => {
                    const isTabActive = activeTab === cat.id;
                    const hasSelectedMood = cat.list.some(m => m.id === selectedMood);

                    return (
                        <button
                            key={cat.id}
                            role="tab"
                            aria-selected={isTabActive}
                            type="button"
                            className={`mood-tab-btn ${isTabActive ? 'active' : ''}`}
                            onClick={() => setActiveTab(cat.id)}
                        >
                            <span className="mood-tab-icon">{cat.icon}</span>
                            <span className="mood-tab-label">{cat.label}</span>
                            {hasSelectedMood && (
                                <span className="mood-tab-indicator" title="Current active headspace is in this category" />
                            )}
                        </button>
                    );
                })}
            </nav>

            {/* Airy Mood Chips Shelf */}
            <div className="mood-chips-shelf fade-in" key={activeTab}>
                {currentCategory.list.map((mood) => {
                    const isSelected = selectedMood === mood.id;
                    const homeGenreId = sessionEngine.getHomeGenreForMood ? sessionEngine.getHomeGenreForMood(mood.id) : null;
                    const homeGenreName = homeGenreId && GENRE_NODES[homeGenreId] ? GENRE_NODES[homeGenreId].label : (homeGenreId || 'Auto-Steered');

                    let tooltip = `${mood.label} • Home: ${homeGenreName}`;
                    if (isSelected && sessionEngine.state) {
                        const activeId = sessionEngine.state.activeGenre;
                        if (activeId && activeId !== homeGenreId) {
                            const activeName = GENRE_NODES[activeId]?.label || activeId;
                            const dev = sessionEngine.getCurrentDeviation ? sessionEngine.getCurrentDeviation() : null;
                            const hopsText = dev && dev.hops < 999 ? ` (${dev.hops} hops from Home)` : '';
                            tooltip = `${mood.label} • Active: ${activeName}${hopsText} • Home: ${homeGenreName}`;
                        }
                    }

                    return (
                        <button
                            key={mood.id}
                            type="button"
                            className={`mood-chip-modern ${isSelected ? 'active' : ''}`}
                            onClick={() => onSelectMood(mood.id)}
                            aria-pressed={isSelected}
                            title={tooltip}
                        >
                            <span className="mood-chip-emoji">{mood.emoji}</span>
                            <span className="mood-chip-label">{mood.label}</span>
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

export default MoodBar;
