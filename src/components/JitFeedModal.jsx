import React, { useState, useEffect } from 'react';
import { supabase } from '../services/supabaseService';
import { sessionEngine } from '../services/sessionStateMachine';
import { GENRE_NODES } from '../services/tasteGraph';

function JitFeedModal({ isOpen, onClose }) {
    const [jitTracks, setJitTracks] = useState([]);
    const [loading, setLoading] = useState(true);
    const [purgingId, setPurgingId] = useState(null);

    const loadJitTracks = async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('tracks')
                .select('*')
                .ilike('source', '%jit%')
                .order('created_at', { ascending: false })
                .limit(50);

            if (!error && data) {
                setJitTracks(data);
            }
        } catch (e) {
            console.error('Failed to load JIT tracks:', e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (isOpen) {
            loadJitTracks();
        }
    }, [isOpen]);

    const handlePurge = async (track) => {
        if (!confirm(`Purge "${track.artist} - ${track.title}" from catalog?`)) return;
        setPurgingId(track.id);
        try {
            const { error } = await supabase.from('tracks').delete().eq('id', track.id);
            if (!error) {
                setJitTracks(prev => prev.filter(t => t.id !== track.id));
            }
        } catch (e) {
            console.error('Purge error:', e);
        } finally {
            setPurgingId(null);
        }
    };

    const handlePlay = (track) => {
        sessionEngine.playCustomTrack({
            id: track.youtube_video_id,
            dbId: track.id,
            title: track.title,
            artist: track.artist,
            genre: track.primary_genre_id,
            source: track.source
        });
        onClose();
    };

    if (!isOpen) return null;

    const archiveCount = jitTracks.filter(t => t.source === 'jit_local_archive').length;
    const mbCount = jitTracks.filter(t => t.source === 'jit_musicbrainz').length;

    return (
        <div className="modal-backdrop" onClick={onClose} style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0, 0, 0, 0.75)', backdropFilter: 'blur(8px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
            padding: '1rem'
        }}>
            <div className="modal-card fade-in" onClick={e => e.stopPropagation()} style={{
                background: '#0f172a', border: '1px solid rgba(52, 211, 153, 0.35)',
                borderRadius: '16px', width: '100%', maxWidth: '800px', maxHeight: '85vh',
                display: 'flex', flexDirection: 'column', overflow: 'hidden',
                boxShadow: '0 20px 50px rgba(0, 0, 0, 0.6)'
            }}>
                {/* Header */}
                <div style={{
                    padding: '1.25rem 1.5rem', borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    background: 'rgba(16, 185, 129, 0.08)'
                }}>
                    <div>
                        <h2 style={{ margin: 0, fontSize: '1.25rem', color: '#f1f5f9', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <span>🌱 JIT Organic Growth Monitor</span>
                            <span style={{
                                fontSize: '0.75rem', background: 'rgba(16, 185, 129, 0.2)',
                                border: '1px solid #10b981', color: '#34d399', borderRadius: '9999px',
                                padding: '0.15rem 0.55rem'
                            }}>
                                {jitTracks.length} Ingested
                            </span>
                        </h2>
                        <p style={{ margin: '0.3rem 0 0 0', fontSize: '0.82rem', color: '#94a3b8' }}>
                            Inspect, audit, test-play, or purge tracks organically discovered while you listen.
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        className="btn-text"
                        style={{ color: '#94a3b8', fontSize: '1.3rem', cursor: 'pointer', padding: '0.2rem 0.5rem' }}
                    >
                        ✕
                    </button>
                </div>

                {/* Sub-bar stats */}
                <div style={{
                    padding: '0.6rem 1.5rem', background: 'rgba(255, 255, 255, 0.02)',
                    borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.8rem'
                }}>
                    <div style={{ display: 'flex', gap: '1rem', color: '#94a3b8' }}>
                        <span>📁 Local Archive: <strong style={{ color: '#e2e8f0' }}>{archiveCount}</strong></span>
                        <span>🏛️ MusicBrainz: <strong style={{ color: '#e2e8f0' }}>{mbCount}</strong></span>
                    </div>
                    <button
                        onClick={loadJitTracks}
                        className="btn-text"
                        style={{ color: '#34d399', fontSize: '0.78rem', cursor: 'pointer' }}
                    >
                        🔄 Refresh Feed
                    </button>
                </div>

                {/* List Container */}
                <div style={{ padding: '1rem 1.5rem', overflowY: 'auto', flex: 1 }}>
                    {loading ? (
                        <div style={{ textAlign: 'center', padding: '3rem', color: '#94a3b8' }}>
                            <span className="spinner" style={{ width: '1.5rem', height: '1.5rem' }}></span>
                            <p style={{ marginTop: '0.75rem' }}>Loading organic discoveries...</p>
                        </div>
                    ) : jitTracks.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '3rem', color: '#94a3b8' }}>
                            <p>No JIT discoveries recorded yet.</p>
                            <p style={{ fontSize: '0.85rem' }}>Start listening to music to watch your catalog expand organically!</p>
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                            {jitTracks.map((t, idx) => {
                                const youtubeUrl = t.youtube_video_id ? `https://www.youtube.com/watch?v=${t.youtube_video_id}` : null;
                                const genreNode = GENRE_NODES[t.primary_genre_id];
                                const isPurging = purgingId === t.id;

                                return (
                                    <div
                                        key={t.id || idx}
                                        style={{
                                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                            background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.06)',
                                            borderRadius: '10px', padding: '0.6rem 0.85rem', gap: '0.85rem',
                                            transition: 'background 0.15s ease'
                                        }}
                                    >
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', overflow: 'hidden' }}>
                                            <span style={{ color: '#64748b', fontSize: '0.75rem', minWidth: '1.5rem' }}>#{idx + 1}</span>
                                            {t.youtube_video_id && (
                                                <img
                                                    src={`https://i.ytimg.com/vi/${t.youtube_video_id}/default.jpg`}
                                                    alt={t.title}
                                                    style={{ width: '42px', height: '32px', objectFit: 'cover', borderRadius: '4px', flexShrink: 0 }}
                                                    referrerPolicy="no-referrer"
                                                />
                                            )}
                                            <div style={{ overflow: 'hidden' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                                    <span style={{ color: '#f8fafc', fontSize: '0.88rem', fontWeight: '500', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                                                        {t.title}
                                                    </span>
                                                    {youtubeUrl && (
                                                        <a
                                                            href={youtubeUrl}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            style={{ color: '#94a3b8', fontSize: '0.7rem', textDecoration: 'none' }}
                                                            title="Inspect on YouTube"
                                                        >
                                                            ↗
                                                        </a>
                                                    )}
                                                </div>
                                                <div style={{ color: '#94a3b8', fontSize: '0.78rem', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                                                    {t.artist}
                                                </div>
                                            </div>
                                        </div>

                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
                                            <span style={{
                                                fontSize: '0.72rem', background: 'rgba(168, 85, 247, 0.15)',
                                                border: '1px solid rgba(168, 85, 247, 0.3)', color: '#d8b4fe',
                                                borderRadius: '6px', padding: '0.15rem 0.5rem'
                                            }}>
                                                {genreNode?.label || t.primary_genre_id}
                                            </span>
                                            <span style={{
                                                fontSize: '0.7rem', color: t.source === 'jit_local_archive' ? '#60a5fa' : '#34d399',
                                                background: t.source === 'jit_local_archive' ? 'rgba(59, 130, 246, 0.1)' : 'rgba(16, 185, 129, 0.1)',
                                                borderRadius: '6px', padding: '0.15rem 0.45rem'
                                            }}>
                                                {t.source === 'jit_local_archive' ? '📁 Local' : '🏛️ Brainz'}
                                            </span>
                                            <button
                                                onClick={() => handlePlay(t)}
                                                style={{
                                                    background: 'rgba(255, 255, 255, 0.08)', border: '1px solid rgba(255, 255, 255, 0.15)',
                                                    borderRadius: '6px', color: '#e2e8f0', fontSize: '0.75rem',
                                                    padding: '0.25rem 0.55rem', cursor: 'pointer'
                                                }}
                                                title="Play this track now"
                                            >
                                                ▶ Play
                                            </button>
                                            <button
                                                onClick={() => handlePurge(t)}
                                                disabled={isPurging}
                                                style={{
                                                    background: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.3)',
                                                    borderRadius: '6px', color: '#f87171', fontSize: '0.75rem',
                                                    padding: '0.25rem 0.55rem', cursor: 'pointer'
                                                }}
                                                title="Purge bad mapping from catalog"
                                            >
                                                {isPurging ? '...' : '🗑️'}
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

export default JitFeedModal;
