import React from 'react';

function MoodHistory({ history }) {
    if (!history || history.length === 0) return null;

    const formatTime = (isoString) => {
        const date = new Date(isoString);
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    };

    return (
        <div className="mood-history-container fade-in-up">
            <h3 className="history-title">Your Vibe Journey</h3>
            <div className="history-scroll">
                {history.map((item) => (
                    <div key={item.id} className="history-card">
                        <span className="history-time">{formatTime(item.timestamp)}</span>
                        <div className="history-pill">
                            <span className="history-emoji">{item.moodEmoji}</span>
                            <span className="history-mood">{item.moodName}</span>
                            <span className="history-arrow">→</span>
                            <span className="history-genre">{item.matchedGenre}</span>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

export default MoodHistory;
