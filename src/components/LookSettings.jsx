import { useEffect, useState } from 'react';
import { SKINS, SKIN_MOODS, RICH_SKINS, RICH_SKIN_IDS, RICH_MOOD_MAP, ALL_SKINS } from '../services/moodSkins';
import { allMoods } from '../services/moods';

const moodLabel = (id) => allMoods.find(m => m.id === id)?.label || id;
const swatchStyle = (id) => ({
    background: `radial-gradient(circle at 30% 0%, ${ALL_SKINS[id].c1}, ${ALL_SKINS[id].c2} 90%)`,
    boxShadow: `inset -14px 0 0 ${ALL_SKINS[id].accent}`,
});
const richMoodsLabel = (id) => Object.entries(RICH_MOOD_MAP).filter(([, v]) => v === id).map(([m]) => moodLabel(m)).join(', ');

/** Settings › Look: follow the mood (with per-skin switches) or lock one look. */
export default function LookSettings({ isOpen, onClose, look, onChange }) {
    // Which tab is showing. Starts on the style that is active now.
    const [tab, setTab] = useState(() => (look.rich || RICH_SKINS[look.fixed] ? 'rich' : 'basic'));
    useEffect(() => {
        if (!isOpen) return undefined;
        const onKey = (e) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    const isRich = tab === 'rich';

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

                <div className="look-tabs" role="tablist" aria-label="Look style">
                    <button type="button" role="tab" aria-selected={tab === 'basic'} className="look-tab" onClick={() => setTab('basic')}>Mood looks</button>
                    <button type="button" role="tab" aria-selected={tab === 'rich'} className="look-tab" onClick={() => setTab('rich')}>Rich themes</button>
                </div>
                {tab === 'rich' && <p className="look-hint">Bolder looks with their own fonts and big scenery: a moon, a neon sun, falling petals. Choose one below to use them.</p>}

                <div className="look-modes" role="radiogroup" aria-label="Look mode">
                    <button type="button" role="radio" aria-checked={look.mode === 'auto' && look.rich === isRich} className="look-mode" onClick={() => onChange({ ...look, mode: 'auto', rich: isRich })}>
                        <span className="look-radio" />
                        <span><b>Match my mood</b><span className="look-mode-desc">{isRich ? 'The theme changes with your mood. Moods without a rich theme keep the current look.' : 'The look changes with the moods listed below. Other moods keep the current look.'}</span></span>
                    </button>
                    <button type="button" role="radio" aria-checked={look.mode === 'fixed' && (RICH_SKINS[look.fixed] ? true : false) === isRich} className="look-mode" onClick={() => onChange({ ...look, mode: 'fixed', rich: isRich && look.rich, fixed: isRich ? (RICH_SKINS[look.fixed] ? look.fixed : RICH_SKIN_IDS[0]) : (SKINS[look.fixed] ? look.fixed : 'classic') })}>
                        <span className="look-radio" />
                        <span><b>Always use one look</b><span className="look-mode-desc">Pick one look and keep it for every mood.</span></span>
                    </button>
                </div>

                {look.mode === 'auto' ? (
                    <>
                        <p className="look-hint">Switch off any look you don't like. That mood then uses Classic, the original look.</p>
                        <div className="look-list">
                            {(isRich ? RICH_SKIN_IDS : SKIN_MOODS).map(id => {
                                const on = !look.off.includes(id);
                                const skin = ALL_SKINS[id];
                                const moods = isRich ? richMoodsLabel(id) : moodLabel(id);
                                return (
                                    <div key={id} className={`look-row ${on ? '' : 'is-off'}`}>
                                        <span className="look-swatch" style={swatchStyle(id)} />
                                        <span className="look-row-text"><b>{skin.name}</b><span>{moods}</span></span>
                                        <button type="button" role="switch" aria-checked={on} aria-label={`Use ${skin.name} for ${moods}`} className="look-switch" onClick={() => toggleSkin(id)} />
                                    </div>
                                );
                            })}
                        </div>
                    </>
                ) : (
                    <div className="look-grid" role="radiogroup" aria-label="Look">
                        {(isRich ? RICH_SKIN_IDS : ['classic', ...SKIN_MOODS]).map(id => (
                            <button key={id} type="button" role="radio" aria-checked={look.fixed === id} className="look-tile" onClick={() => onChange({ ...look, fixed: id })}>
                                <span className="look-swatch" style={swatchStyle(id)} />
                                <span>{ALL_SKINS[id].name}</span>
                            </button>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
