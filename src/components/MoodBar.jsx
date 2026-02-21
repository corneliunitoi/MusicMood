export const moods = [
    { id: 'happy', label: 'Happy', emoji: '😊', searchContext: 'upbeat feel good positive', compatibleGenres: ['Pop', 'Latin', 'Electronic/Dance', 'Hip-Hop/Rap'], defaultGenre: 'Pop' },
    { id: 'sad', label: 'Sad', emoji: '😢', searchContext: 'sad emotional melancholy heartbreak', compatibleGenres: ['Lofi/Chill', 'Country/Folk', 'Pop', 'Rock'], defaultGenre: 'Lofi/Chill' },
    { id: 'chill', label: 'Chill', emoji: '🧘', searchContext: 'relaxing chillout study', compatibleGenres: ['Lofi/Chill', 'Classical/Instrumental', 'Jazz/Blues', 'Country/Folk'], defaultGenre: 'Lofi/Chill' },
    { id: 'energetic', label: 'Energetic', emoji: '⚡', searchContext: 'workout intense high energy pump', compatibleGenres: ['Electronic/Dance', 'Rock', 'Hip-Hop/Rap', 'Pop', 'Latin'], defaultGenre: 'Electronic/Dance' },
    { id: 'focus', label: 'Focus', emoji: '🧠', searchContext: 'deep focus concentration instrumental', compatibleGenres: ['Classical/Instrumental', 'Lofi/Chill', 'Electronic/Dance', 'Jazz/Blues'], defaultGenre: 'Classical/Instrumental' },
    { id: 'party', label: 'Party', emoji: '🎉', searchContext: 'party club dance hype', compatibleGenres: ['Hip-Hop/Rap', 'Pop', 'Latin', 'Electronic/Dance'], defaultGenre: 'Hip-Hop/Rap' },
];

function MoodBar({ selectedMood, onSelectMood }) {
    return (
        <div className="mood-bar-container">
            <div className="mood-bar">
                {moods.map((mood) => (
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
        </div>
    );
}

export default MoodBar;
