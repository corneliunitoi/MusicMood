import { useState } from 'react';
import pkg from '../../package.json';

export default function AboutModal({ isOpen, onClose }) {
    const [copied, setCopied] = useState(false);

    if (!isOpen) return null;

    const version = pkg.version || '0.7.6';
    const authorName = 'Corneliu Nițoi';
    const authorHandle = 'corneliunitoi';
    const authorEmail = 'corneliunitoi@gmail.com';
    const repoUrl = 'https://github.com/corneliunitoi/MusicMood';

    const handleCopyEmail = () => {
        navigator.clipboard.writeText(authorEmail).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        });
    };

    return (
        <div
            className="modal-backdrop fade-in"
            onClick={onClose}
            style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                background: 'rgba(0, 0, 0, 0.75)',
                backdropFilter: 'blur(8px)',
                zIndex: 1100,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '1rem'
            }}
        >
            <div
                className="modal-card"
                onClick={(e) => e.stopPropagation()}
                style={{
                    background: '#0f172a',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    borderRadius: '16px',
                    width: '100%',
                    maxWidth: '460px',
                    padding: '1.75rem',
                    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)',
                    position: 'relative'
                }}
            >
                {/* Close Button */}
                <button
                    onClick={onClose}
                    aria-label="Close About Modal"
                    style={{
                        position: 'absolute',
                        top: '1rem',
                        right: '1rem',
                        background: 'none',
                        border: 'none',
                        color: '#94a3b8',
                        fontSize: '1.25rem',
                        cursor: 'pointer',
                        padding: '0.25rem'
                    }}
                >
                    ✕
                </button>

                {/* Header with Logo, Title & Version */}
                <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
                    <div style={{ fontSize: '2.5rem', marginBottom: '0.25rem' }}>🎵</div>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', justifyContent: 'center' }}>
                        <h2 style={{ margin: 0, fontSize: '1.45rem', color: '#f8fafc', fontWeight: '700' }}>MusicMood</h2>
                        <span style={{
                            background: 'rgba(99, 102, 241, 0.2)',
                            border: '1px solid #6366f1',
                            color: '#c7d2fe',
                            borderRadius: '9999px',
                            padding: '0.15rem 0.6rem',
                            fontSize: '0.75rem',
                            fontWeight: '600'
                        }}>
                            v{version}
                        </span>
                    </div>
                    <p style={{ margin: '0.35rem 0 0 0', fontSize: '0.82rem', color: '#94a3b8' }}>
                        Adaptive Emotional Music Streaming & Taste Discovery Engine
                    </p>
                </div>

                {/* Author Card */}
                <div style={{
                    background: 'rgba(30, 41, 59, 0.6)',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    borderRadius: '12px',
                    padding: '1rem',
                    marginBottom: '1.25rem'
                }}>
                    <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.5px', color: '#94a3b8', fontWeight: '700', marginBottom: '0.5rem' }}>
                        Author & Creator
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.65rem' }}>
                        <div style={{
                            width: '42px',
                            height: '42px',
                            borderRadius: '50%',
                            background: 'linear-gradient(135deg, #6366f1, #a855f7)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '1.15rem',
                            color: '#ffffff',
                            fontWeight: 'bold',
                            flexShrink: 0
                        }}>
                            CN
                        </div>
                        <div>
                            <div style={{ color: '#f8fafc', fontWeight: '600', fontSize: '0.95rem' }}>
                                {authorName}
                            </div>
                            <div style={{ color: '#64748b', fontSize: '0.78rem' }}>
                                @{authorHandle}
                            </div>
                        </div>
                    </div>

                    {/* Email Row */}
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        background: 'rgba(15, 23, 42, 0.5)',
                        border: '1px solid rgba(255, 255, 255, 0.05)',
                        borderRadius: '8px',
                        padding: '0.45rem 0.75rem'
                    }}>
                        <a
                            href={`mailto:${authorEmail}`}
                            style={{ color: '#38bdf8', fontSize: '0.85rem', textDecoration: 'none' }}
                            title="Send email"
                        >
                            ✉️ {authorEmail}
                        </a>
                        <button
                            type="button"
                            onClick={handleCopyEmail}
                            style={{
                                background: copied ? 'rgba(52, 211, 153, 0.2)' : 'rgba(255, 255, 255, 0.08)',
                                border: copied ? '1px solid #34d399' : '1px solid rgba(255, 255, 255, 0.1)',
                                color: copied ? '#34d399' : '#cbd5e1',
                                borderRadius: '6px',
                                padding: '0.2rem 0.5rem',
                                fontSize: '0.72rem',
                                cursor: 'pointer',
                                transition: 'all 0.15s'
                            }}
                        >
                            {copied ? '✓ Copied' : 'Copy'}
                        </button>
                    </div>
                </div>

                {/* Platform Highlights */}
                <div style={{
                    fontSize: '0.78rem',
                    color: '#94a3b8',
                    lineHeight: '1.5',
                    marginBottom: '1.25rem',
                    background: 'rgba(30, 41, 59, 0.3)',
                    border: '1px solid rgba(255, 255, 255, 0.05)',
                    borderRadius: '8px',
                    padding: '0.75rem'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.25rem' }}>
                        <span>🌐</span>
                        <a
                            href={repoUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ color: '#818cf8', textDecoration: 'none', fontWeight: '500' }}
                        >
                            github.com/corneliunitoi/MusicMood ↗
                        </a>
                    </div>
                    <div style={{ fontSize: '0.74rem', color: '#64748b', marginTop: '0.35rem' }}>
                        Autonomous Disambiguation • 14 Parent Genre Families • Zero-Quota Audio Streaming
                    </div>
                </div>

                {/* Close Button */}
                <button
                    type="button"
                    onClick={onClose}
                    style={{
                        width: '100%',
                        padding: '0.6rem',
                        background: 'rgba(255, 255, 255, 0.08)',
                        border: '1px solid rgba(255, 255, 255, 0.15)',
                        color: '#f8fafc',
                        borderRadius: '8px',
                        fontSize: '0.85rem',
                        fontWeight: '600',
                        cursor: 'pointer',
                        transition: 'background 0.15s'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.15)'}
                    onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)'}
                >
                    Close
                </button>
            </div>
        </div>
    );
}
