import { useEffect } from 'react';
import { SKINS, SKIN_MOODS } from '../services/moodSkins';
import { allMoods } from '../services/moods';

const moodLabel = (id) => allMoods.find(m => m.id === id)?.label || id;
const swatchStyle = (id) => ({
    background: `radial-gradient(circle at 30% 0%, ${SKINS[id].c1}, ${SKINS[id].c2} 90%)`,
    boxShadow: `inset -14px 0 0 ${SKINS[id].accent}`,
});

/** Settings › Look: follow the mood (with per-skin switches) or lock one look. */
export default function LookSettings({ isOpen, onClose, look, onChange }) {
    useEffect(() => {
        if (!isOpen) return undefined;
        const onKey = (e) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    const toggleSkin = (id) => {
        const off = look.off.includes(id) ? look.off.filter(x => x !== id) : [...look.off, id];
        onChange({ ...look, off });
    };

    return (
        <div className="modal-backdrop look-backdrop fade-in" onClick={onClose}>
            <div className="look-card" role="dialog" aria-modal="true" aria-labelledby="look-title" onClick={(e) => e.stopPropagation()}>
                <button type="button" className="look-close" onClick={onClose} aria-label="Close Look settings">✕</button>
                <h2 id="look-title" className="look-title">Look</h2>
                <p className="look-hint">Some moods tint the app and add a faint moving background. The layout never changes.</p>

                <div className="look-modes" role="radiogroup" aria-label="Look mode">
                    <button type="button" role="radio" aria-checked={look.mode === 'auto'} className="look-mode" onClick={() => onChange({ ...look, mode: 'auto' })}>
                        <span className="look-radio" />
                        <span><b>Match my mood</b><span className="look-mode-desc">The look changes with the moods listed below. Other moods keep the current look.</span></span>
                    </button>
                    <button type="button" role="radio" aria-checked={look.mode === 'fixed'} className="look-mode" onClick={() => onChange({ ...look, mode: 'fixed' })}>
                        <span className="look-radio" />
                        <span><b>Always use one look</b><span className="look-mode-desc">Pick one look and keep it for every mood.</span></span>
                    </button>
                </div>

                {look.mode === 'auto' ? (
                    <>
                        <p className="look-hint">Switch off any look you don't like. That mood then uses Classic, the original look.</p>
                        <div className="look-list">
                            {SKIN_MOODS.map(id => {
                                const on = !look.off.includes(id);
                                return (
                                    <div key={id} className={`look-row ${on ? '' : 'is-off'}`}>
                                        <span className="look-swatch" style={swatchStyle(id)} />
                                        <span className="look-row-text"><b>{SKINS[id].name}</b><span>{moodLabel(id)}</span></span>
                                        <button type="button" role="switch" aria-checked={on} aria-label={`Use ${SKINS[id].name} for ${moodLabel(id)}`} className="look-switch" onClick={() => toggleSkin(id)} />
                                    </div>
                                );
                            })}
                        </div>
                    </>
                ) : (
                    <div className="look-grid" role="radiogroup" aria-label="Look">
                        {['classic', ...SKIN_MOODS].map(id => (
                            <button key={id} type="button" role="radio" aria-checked={look.fixed === id} className="look-tile" onClick={() => onChange({ ...look, fixed: id })}>
                                <span className="look-swatch" style={swatchStyle(id)} />
                                <span>{SKINS[id].name}</span>
                            </button>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
