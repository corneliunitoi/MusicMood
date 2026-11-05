/**
 * moods.js
 * 
 * Canonical Moods, Nuances, and Contextual States data definitions.
 */

export const moods = [
    { id: 'happy', label: 'Happy', emoji: '😊', searchContext: 'upbeat feel good positive', compatibleGenres: ['Pop', 'Latin', 'Electronic/Dance', 'Hip-Hop/Rap', 'Gospel/Religious'], defaultGenre: 'Pop' },
    { id: 'sad', label: 'Sad', emoji: '😢', searchContext: 'sad emotional melancholy heartbreak', compatibleGenres: ['Lofi/Chill', 'Country/Folk', 'Pop', 'Rock', 'Jazz/Blues'], defaultGenre: 'Lofi/Chill' },
    { id: 'chill', label: 'Chill', emoji: '🧘', searchContext: 'relaxing chillout study smooth calm', compatibleGenres: ['Lofi/Chill', 'Classical/Instrumental', 'Jazz/Blues', 'Country/Folk', 'Gospel/Religious'], defaultGenre: 'Lofi/Chill' },
    { id: 'energetic', label: 'Energetic', emoji: '⚡', searchContext: 'workout intense high energy pump', compatibleGenres: ['Electronic/Dance', 'Rock', 'Hip-Hop/Rap', 'Pop', 'Latin'], defaultGenre: 'Electronic/Dance' },
    { id: 'focus', label: 'Focus', emoji: '🧠', searchContext: 'deep focus concentration instrumental', compatibleGenres: ['Classical/Instrumental', 'Lofi/Chill', 'Electronic/Dance', 'Jazz/Blues'], defaultGenre: 'Classical/Instrumental' },
    { id: 'party', label: 'Party', emoji: '🎉', searchContext: 'party club dance hype', compatibleGenres: ['Hip-Hop/Rap', 'Pop', 'Latin', 'Electronic/Dance', 'Rock'], defaultGenre: 'Hip-Hop/Rap' },
];

export const contextualMoods = [
    { id: 'late_night', label: 'Late Night', emoji: '🌃', searchContext: 'late night vibes dark chill', compatibleGenres: ['Lofi/Chill', 'Jazz/Blues', 'Electronic/Dance', 'Hip-Hop/Rap'], defaultGenre: 'Lofi/Chill' },
    { id: 'driving', label: 'Roadtrip', emoji: '🚗', searchContext: 'driving road trip singalong cruising', compatibleGenres: ['Rock', 'Pop', 'Country/Folk', 'Hip-Hop/Rap', 'Electronic/Dance'], defaultGenre: 'Rock' },
    { id: 'workout', label: 'Workout', emoji: '💪', searchContext: 'gym workout pump hard cardio', compatibleGenres: ['Electronic/Dance', 'Hip-Hop/Rap', 'Rock', 'Metal', 'Pop'], defaultGenre: 'Electronic/Dance' },
    { id: 'study', label: 'Study', emoji: '📚', searchContext: 'study lo-fi beats background reading', compatibleGenres: ['Lofi/Chill', 'Classical/Instrumental', 'Jazz/Blues'], defaultGenre: 'Lofi/Chill' },
    { id: 'rainy', label: 'Rainy Day', emoji: '🌧️', searchContext: 'rainy day acoustic moody chill', compatibleGenres: ['Country/Folk', 'Lofi/Chill', 'Jazz/Blues', 'Rock', 'Pop'], defaultGenre: 'Country/Folk' },
    { id: 'morning', label: 'Morning Boost', emoji: '🌅', searchContext: 'morning coffee sunrise uplifting fresh', compatibleGenres: ['Pop', 'Jazz/Blues', 'Country/Folk', 'Classical/Instrumental'], defaultGenre: 'Pop' },
    { id: 'sleep', label: 'Wind Down', emoji: '🌙', searchContext: 'sleep ambient deep sleep relaxation', compatibleGenres: ['Classical/Instrumental', 'Lofi/Chill'], defaultGenre: 'Classical/Instrumental' },
];

export const nuanceMoods = [
    { id: 'nostalgic', label: 'Nostalgic', emoji: '📼', searchContext: 'nostalgic throwback memories', compatibleGenres: ['Pop', 'Rock', 'Hip-Hop/Rap', 'Country/Folk'], defaultGenre: 'Pop' },
    { id: 'romantic', label: 'Romantic', emoji: '💖', searchContext: 'romantic love songs slow', compatibleGenres: ['Hip-Hop/Rap', 'Pop', 'Jazz/Blues'], defaultGenre: 'Pop' },
    { id: 'melancholic', label: 'Melancholic', emoji: '🥀', searchContext: 'melancholic sadness deep thoughts', compatibleGenres: ['Lofi/Chill', 'Classical/Instrumental', 'Rock'], defaultGenre: 'Lofi/Chill' },
    { id: 'hopeful', label: 'Hopeful', emoji: '🌱', searchContext: 'hopeful uplifting bright', compatibleGenres: ['Pop', 'Classical/Instrumental', 'Country/Folk'], defaultGenre: 'Pop' },
    { id: 'dark_intense', label: 'Dark/Intense', emoji: '🌑', searchContext: 'dark intense epic heavy', compatibleGenres: ['Rock', 'Electronic/Dance', 'Hip-Hop/Rap'], defaultGenre: 'Rock' },
    { id: 'dreamy', label: 'Dreamy', emoji: '☁️', searchContext: 'dreamy ethereal ambient', compatibleGenres: ['Lofi/Chill', 'Electronic/Dance', 'Classical/Instrumental'], defaultGenre: 'Lofi/Chill' },
];

export const modernMoods = [
    { id: 'main_character', label: 'Main Character', emoji: '✨', searchContext: 'main character energy epic pop', compatibleGenres: ['Pop', 'Electronic/Dance', 'Rock'], defaultGenre: 'Pop' },
    { id: 'villain_mode', label: 'Villain Mode', emoji: '😈', searchContext: 'villain mode dark trap bass', compatibleGenres: ['Hip-Hop/Rap', 'Electronic/Dance', 'Rock'], defaultGenre: 'Hip-Hop/Rap' },
    { id: 'soft_vibes', label: 'Soft Vibes', emoji: '🧸', searchContext: 'soft vibes aesthetic gentle', compatibleGenres: ['Lofi/Chill', 'Pop'], defaultGenre: 'Lofi/Chill' },
    { id: 'dark_academia', label: 'Dark Academia', emoji: '🏛️', searchContext: 'dark academia classical instrumental', compatibleGenres: ['Classical/Instrumental', 'Jazz/Blues'], defaultGenre: 'Classical/Instrumental' },
    { id: 'cottagecore', label: 'Cottagecore', emoji: '🍄', searchContext: 'cottagecore folk acoustic indie', compatibleGenres: ['Country/Folk', 'Lofi/Chill'], defaultGenre: 'Country/Folk' },
    { id: 'cyberpunk', label: 'Cyberpunk', emoji: '🤖', searchContext: 'cyberpunk synthwave darksynth', compatibleGenres: ['Electronic/Dance', 'Rock'], defaultGenre: 'Electronic/Dance' },
];

export const cinematicMoods = [
    { id: 'cinematic_epic', label: 'Epic', emoji: '⚔️', searchContext: 'epic cinematic orchestral trailer', compatibleGenres: ['Classical/Instrumental', 'Rock', 'Electronic/Dance'], defaultGenre: 'Classical/Instrumental' },
    { id: 'cinematic_mystery', label: 'Mystery / Noir', emoji: '🕵️', searchContext: 'mystery noir jazz dark ambient', compatibleGenres: ['Jazz/Blues', 'Classical/Instrumental', 'Lofi/Chill'], defaultGenre: 'Jazz/Blues' },
    { id: 'cinematic_fantasy', label: 'Fantasy', emoji: '🧝', searchContext: 'fantasy tavern ambient magical', compatibleGenres: ['Classical/Instrumental', 'Country/Folk'], defaultGenre: 'Classical/Instrumental' },
    { id: 'cinematic_scifi', label: 'Sci-Fi', emoji: '🛸', searchContext: 'sci-fi space ambient electronic', compatibleGenres: ['Electronic/Dance', 'Classical/Instrumental', 'Lofi/Chill'], defaultGenre: 'Electronic/Dance' },
    { id: 'cinematic_ambient', label: 'Ambient', emoji: '🌫️', searchContext: 'ambient soundscape drone relaxing', compatibleGenres: ['Lofi/Chill', 'Classical/Instrumental'], defaultGenre: 'Lofi/Chill' },
];

export const allMoods = [...moods, ...contextualMoods, ...nuanceMoods, ...modernMoods, ...cinematicMoods];
