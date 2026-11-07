import React, { useState, useEffect } from 'react';
import { submitUserFeedback } from '../services/supabaseService';

export default function FeedbackModal({ isOpen, onClose, currentUser }) {
    const [name, setName] = useState('');
    const [comment, setComment] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isSubmitted, setIsSubmitted] = useState(false);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (isOpen) {
            // Auto-populate name from active user profile if available
            const initialName = currentUser?.name || currentUser?.username || '';
            setName(initialName);
            setComment('');
            setError(null);
            setIsSubmitted(false);
        }
    }, [isOpen, currentUser]);

    if (!isOpen) return null;

    const isGuest = currentUser?.isGuest || currentUser?.role === 'guest' || !currentUser?.id;

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!comment.trim()) {
            setError('Please enter a comment or suggestion before submitting.');
            return;
        }

        setIsSubmitting(true);
        setError(null);

        try {
            // As requested: user id will not be conclusive on guest
            const resolvedUserId = isGuest ? (currentUser?.id || 'guest') : currentUser.id;
            const resolvedName = name.trim() || (isGuest ? 'Guest User' : 'Anonymous');

            await submitUserFeedback({
                name: resolvedName,
                comment: comment.trim(),
                userId: resolvedUserId
            });

            setIsSubmitted(true);
            setTimeout(() => {
                onClose();
                setIsSubmitted(false);
                setComment('');
            }, 2000);
        } catch (err) {
            console.error('[FeedbackModal] Error submitting feedback:', err);
            setError(err.message || 'Failed to send feedback. Please check your network and try again.');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div
            className="modal-backdrop"
            onClick={onClose}
            style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                background: 'rgba(0, 0, 0, 0.75)',
                backdropFilter: 'blur(8px)',
                WebkitBackdropFilter: 'blur(8px)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 1100,
                padding: '1rem'
            }}
        >
            <div
                className="modal-card fade-in"
                onClick={(e) => e.stopPropagation()}
                style={{
                    background: '#0f172a',
                    border: '1px solid rgba(168, 85, 247, 0.35)',
                    borderRadius: '16px',
                    width: '100%',
                    maxWidth: '520px',
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: 'hidden',
                    boxShadow: '0 25px 60px rgba(0, 0, 0, 0.7)',
                    textAlign: 'left'
                }}
            >
                {/* Header */}
                <div
                    style={{
                        padding: '1.25rem 1.5rem',
                        borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        background: 'rgba(168, 85, 247, 0.08)'
                    }}
                >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                        <span style={{ fontSize: '1.35rem' }}>💬</span>
                        <div>
                            <h2 style={{ margin: 0, fontSize: '1.2rem', color: '#f8fafc', fontWeight: '700' }}>
                                Send Feedback
                            </h2>
                            <p style={{ margin: '0.15rem 0 0 0', fontSize: '0.8rem', color: '#94a3b8' }}>
                                Help us make MusicMood better
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        style={{
                            background: 'none',
                            border: 'none',
                            color: '#94a3b8',
                            fontSize: '1.4rem',
                            cursor: 'pointer',
                            padding: '0.2rem 0.5rem',
                            borderRadius: '6px',
                            lineHeight: 1
                        }}
                        title="Close modal"
                    >
                        ✕
                    </button>
                </div>

                {/* Content */}
                <form onSubmit={handleSubmit} style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
                    {/* User Context Banner */}
                    <div
                        style={{
                            padding: '0.6rem 0.85rem',
                            borderRadius: '8px',
                            background: isGuest ? 'rgba(148, 163, 184, 0.1)' : 'rgba(99, 102, 241, 0.12)',
                            border: isGuest ? '1px dashed rgba(148, 163, 184, 0.3)' : '1px solid rgba(99, 102, 241, 0.3)',
                            fontSize: '0.78rem',
                            color: isGuest ? '#cbd5e1' : '#c7d2fe',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.45rem'
                        }}
                    >
                        <span>{isGuest ? '👻' : '👤'}</span>
                        <span>
                            {isGuest
                                ? 'Submitting as Guest listener (ID is anonymous and not linked to a permanent account)'
                                : `Submitting as ${currentUser?.name || currentUser?.username || 'Authenticated Listener'}`}
                        </span>
                    </div>

                    {/* Success Notice */}
                    {isSubmitted && (
                        <div
                            style={{
                                padding: '0.85rem',
                                borderRadius: '8px',
                                background: 'rgba(16, 185, 129, 0.15)',
                                border: '1px solid #10b981',
                                color: '#34d399',
                                fontSize: '0.9rem',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.5rem',
                                fontWeight: '600'
                            }}
                        >
                            <span>🎉</span>
                            <span>Thank you! Your feedback has been received.</span>
                        </div>
                    )}

                    {/* Error Notice */}
                    {error && (
                        <div
                            style={{
                                padding: '0.75rem',
                                borderRadius: '8px',
                                background: 'rgba(239, 68, 68, 0.15)',
                                border: '1px solid #ef4444',
                                color: '#fca5a5',
                                fontSize: '0.85rem'
                            }}
                        >
                            ⚠️ {error}
                        </div>
                    )}

                    {/* Name Input */}
                    <div>
                        <label
                            htmlFor="feedback-name"
                            style={{
                                display: 'block',
                                marginBottom: '0.4rem',
                                fontSize: '0.82rem',
                                fontWeight: '600',
                                color: '#e2e8f0'
                            }}
                        >
                            Your Name
                        </label>
                        <input
                            id="feedback-name"
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="e.g. Alex"
                            disabled={isSubmitting || isSubmitted}
                            style={{
                                width: '100%',
                                boxSizing: 'border-box',
                                background: 'rgba(15, 23, 42, 0.8)',
                                border: '1px solid rgba(255, 255, 255, 0.15)',
                                borderRadius: '8px',
                                padding: '0.65rem 0.85rem',
                                color: '#f8fafc',
                                fontSize: '0.9rem',
                                outline: 'none'
                            }}
                        />
                    </div>

                    {/* Comment Input */}
                    <div>
                        <label
                            htmlFor="feedback-comment"
                            style={{
                                display: 'block',
                                marginBottom: '0.4rem',
                                fontSize: '0.82rem',
                                fontWeight: '600',
                                color: '#e2e8f0'
                            }}
                        >
                            Comment / Suggestions <span style={{ color: '#f87171' }}>*</span>
                        </label>
                        <textarea
                            id="feedback-comment"
                            rows={4}
                            value={comment}
                            onChange={(e) => setComment(e.target.value)}
                            placeholder="Share what you love, ideas for new features, or any issue you encountered..."
                            disabled={isSubmitting || isSubmitted}
                            required
                            style={{
                                width: '100%',
                                boxSizing: 'border-box',
                                background: 'rgba(15, 23, 42, 0.8)',
                                border: '1px solid rgba(255, 255, 255, 0.15)',
                                borderRadius: '8px',
                                padding: '0.65rem 0.85rem',
                                color: '#f8fafc',
                                fontSize: '0.9rem',
                                outline: 'none',
                                resize: 'vertical',
                                minHeight: '90px'
                            }}
                        />
                    </div>

                    {/* Actions */}
                    <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
                        <button
                            type="button"
                            onClick={onClose}
                            disabled={isSubmitting}
                            style={{
                                background: 'rgba(255, 255, 255, 0.08)',
                                color: '#94a3b8',
                                border: '1px solid rgba(255, 255, 255, 0.15)',
                                borderRadius: '8px',
                                padding: '0.55rem 1.1rem',
                                fontSize: '0.85rem',
                                fontWeight: '600',
                                cursor: 'pointer'
                            }}
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={isSubmitting || isSubmitted || !comment.trim()}
                            style={{
                                background: 'linear-gradient(135deg, #a855f7, #6366f1)',
                                color: '#ffffff',
                                border: 'none',
                                borderRadius: '8px',
                                padding: '0.55rem 1.35rem',
                                fontSize: '0.85rem',
                                fontWeight: '600',
                                cursor: isSubmitting || !comment.trim() ? 'not-allowed' : 'pointer',
                                opacity: isSubmitting || !comment.trim() ? 0.6 : 1,
                                boxShadow: '0 4px 14px rgba(168, 85, 247, 0.35)',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '0.4rem'
                            }}
                        >
                            {isSubmitting ? (
                                <>
                                    <span className="animate-pulse">Submitting...</span>
                                </>
                            ) : (
                                <>
                                    <span>Send Feedback</span>
                                    <span>↗</span>
                                </>
                            )}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
