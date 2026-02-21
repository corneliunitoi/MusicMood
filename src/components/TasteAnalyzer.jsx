import { useState } from 'react';
import { buildTasteProfile } from '../services/musicEngine';

function TasteAnalyzer({ playlists, setPlaylists, tasteProfile, setTasteProfile, token }) {
    const [isAnalyzing, setIsAnalyzing] = useState(false);

    const handleAnalyze = async () => {
        setIsAnalyzing(true);
        try {
            const profile = await buildTasteProfile(playlists, token);
            setTasteProfile(profile);
            if (profile && profile.enrichedPlaylists) {
                setPlaylists(profile.enrichedPlaylists);
            }
        } catch (error) {
            console.error("Failed to analyze taste:", error);
        } finally {
            setIsAnalyzing(false);
        }
    };

    if (tasteProfile && tasteProfile.topGenres && tasteProfile.topGenres.length > 0) {
        return (
            <div className="taste-profile-container fade-in">
                <span className="taste-label">Your Taste Profile:</span>
                <div className="taste-tags">
                    {tasteProfile.topGenres.map((genre, index) => (
                        <span key={index} className="taste-tag fade-in-up" style={{ animationDelay: `${index * 0.1}s` }}>
                            {genre}
                        </span>
                    ))}
                </div>
                {tasteProfile.statsText && (
                    <div className="taste-stats fade-in-up" style={{ animationDelay: '0.4s', marginTop: '1rem', color: '#94a3b8', fontSize: '0.9rem', fontWeight: 500 }}>
                        {tasteProfile.statsText}
                    </div>
                )}
            </div>
        );
    }

    if (tasteProfile && (!tasteProfile.topGenres || tasteProfile.topGenres.length === 0)) {
        return (
            <div className="taste-profile-container fade-in">
                <span className="taste-label">Your Taste Profile:</span>
                <span className="taste-tag empty-tag fade-in">Eclectic / Undefined</span>
            </div>
        );
    }

    return (
        <div className="taste-analyzer-prompt">
            <button
                className={`btn-secondary analyze-btn ${isAnalyzing ? 'analyzing' : ''}`}
                onClick={handleAnalyze}
                disabled={isAnalyzing || !playlists || playlists.length === 0}
            >
                {isAnalyzing ? (
                    <>
                        <span className="spinner"></span>
                        Scanning songs in playlists...
                    </>
                ) : (
                    <>
                        <svg className="analyze-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                        </svg>
                        Analyze My Taste
                    </>
                )}
            </button>
        </div>
    );
}

export default TasteAnalyzer;
