import { useState } from 'react';

const graphData = {
    nodes: [
        // Core Rock / Metal Hub (Top Left / Center)
        { id: 'rock', label: 'Rock', group: 'Rock', x: 250, y: 100 },
        { id: 'metal', label: 'Metal', group: 'Rock', x: 250, y: 200 },

        // Alternative / Experimental (Top Right)
        { id: 'alternative', label: 'Alternative', group: 'Rock', x: 450, y: 100 },
        { id: 'post_hardcore', label: 'Post-Hardcore', group: 'Rock', x: 550, y: 150 },
        { id: 'experimental', label: 'Experimental', group: 'Rock', x: 550, y: 50 },
        { id: 'mathcore', label: 'Mathcore', group: 'Rock', x: 650, y: 100 },

        // Progressive Sub-Network (Center Left)
        { id: 'prog', label: 'Progressive', group: 'Rock', x: 100, y: 150 },
        { id: 'prog_rock', label: 'Prog Rock', group: 'Rock', x: 50, y: 50 },
        { id: 'prog_metal', label: 'Prog Metal', group: 'Rock', x: 100, y: 250 },
        { id: 'djent', label: 'Djent', group: 'Rock', x: 150, y: 350 },

        // Extreme Metal Branches (Bottom Left)
        { id: 'death_metal', label: 'Death Metal', group: 'Rock', x: 200, y: 300 },
        { id: 'technical_death', label: 'Tech Death', group: 'Rock', x: 100, y: 400 },
        { id: 'melodic_death', label: 'Melodic Death', group: 'Rock', x: 250, y: 400 },
        { id: 'sludge', label: 'Sludge / Doom', group: 'Rock', x: 350, y: 300 },
        { id: 'atmospheric', label: 'Atmospheric Metal', group: 'Rock', x: 350, y: 400 },

        // Classical / Symphonic Hub (Right Center)
        { id: 'classical', label: 'Classical', group: 'Classical/Instrumental', x: 600, y: 300 },
        { id: 'symphonic', label: 'Symphony', group: 'Classical/Instrumental', x: 500, y: 350 },
        { id: 'piano', label: 'Piano', group: 'Classical/Instrumental', x: 700, y: 400 },
        { id: 'neoclassical', label: 'Neoclassic Metal', group: 'Rock', x: 450, y: 250 },

        // Instrumental Bridges (Bottom Center)
        { id: 'instrumental', label: 'Instrumental', group: 'Classical/Instrumental', x: 400, y: 500 },
        { id: 'instrumental_rock', label: 'Instr. Rock', group: 'Rock', x: 250, y: 500 },
        { id: 'instrumental_prog', label: 'Instr. Prog', group: 'Rock', x: 100, y: 500 },

        // Others (Edges)
        { id: 'electronic', label: 'Electronic', group: 'Electronic/Dance', x: 700, y: 150 },
        { id: 'industrial', label: 'Industrial', group: 'Rock', x: 650, y: 220 },
        { id: 'jrock', label: 'J-Rock', group: 'Rock', x: 400, y: 50 },
    ],
    edges: [
        // Core Connections
        { from: 'rock', to: 'metal' },
        { from: 'rock', to: 'alternative' },
        { from: 'rock', to: 'prog' },
        { from: 'rock', to: 'jrock' },

        // Alternative Hub
        { from: 'alternative', to: 'post_hardcore' },
        { from: 'alternative', to: 'experimental' },
        { from: 'post_hardcore', to: 'mathcore' },
        { from: 'experimental', to: 'mathcore' },
        { from: 'experimental', to: 'electronic' },

        // Progressive Hub
        { from: 'prog', to: 'prog_rock' },
        { from: 'prog', to: 'prog_metal' },
        { from: 'prog_metal', to: 'djent' },
        { from: 'prog_metal', to: 'death_metal' },

        // Extreme Hub
        { from: 'metal', to: 'death_metal' },
        { from: 'metal', to: 'sludge' },
        { from: 'death_metal', to: 'technical_death' },
        { from: 'death_metal', to: 'melodic_death' },
        { from: 'sludge', to: 'atmospheric' },

        // Classical to Metal Crossovers
        { from: 'classical', to: 'symphonic' },
        { from: 'classical', to: 'piano' },
        { from: 'classical', to: 'neoclassical' },
        { from: 'metal', to: 'neoclassical' },
        { from: 'symphonic', to: 'atmospheric' },
        { from: 'neoclassical', to: 'symphonic' },

        // Instrumental Bridges
        { from: 'classical', to: 'instrumental' },
        { from: 'instrumental', to: 'instrumental_rock' },
        { from: 'instrumental_rock', to: 'instrumental_prog' },
        { from: 'instrumental_prog', to: 'prog_rock' },
        { from: 'instrumental_rock', to: 'rock' },

        // Offshoots
        { from: 'industrial', to: 'electronic' },
        { from: 'industrial', to: 'metal' }
    ]
};

function TasteGraphSetup({ onSave }) {
    const [selectedNodes, setSelectedNodes] = useState([]);

    const toggleNode = (node) => {
        setSelectedNodes(prev => {
            if (prev.find(n => n.id === node.id)) {
                return prev.filter(n => n.id !== node.id);
            }
            return [...prev, node];
        });
    };

    const handleSave = () => {
        // Map selected nodes to main music engine buckets
        const selectedBuckets = [...new Set(selectedNodes.map(n => n.group))];

        // Setup weights or simple top genres that discovery expects
        // Fallback to "Pop" if empty to ensure valid taste
        onSave({
            topGenres: selectedBuckets.length > 0 ? selectedBuckets : ["Pop"],
            statsText: "Manually Picked Graph Vibes 📊",
            nodesPicked: selectedNodes.map(n => n.label)
        });
    };

    return (
        <div className="taste-graph-setup fade-in" style={{ padding: '2rem', background: 'rgba(255,255,255,0.05)', borderRadius: '12px', margin: '2rem 0' }}>
            <h2 style={{ marginBottom: '1rem' }}>Personalize Your Taste Graph</h2>
            <p className="subtitle" style={{ marginBottom: '2rem', fontSize: '0.9rem' }}>
                Since you are visiting as a Guest, tap the genres below that you enjoy to tailor your auto-discovered mixes.
                <br />These act as weights to filter mood discoveries perfectly to your taste!
            </p>

            <div className="interactive-graph-container" style={{ position: 'relative', width: '100%', height: '700px', background: '#0f172a', borderRadius: '16px', overflow: 'auto', margin: '0 auto', maxWidth: '100%', border: '1px solid rgba(255,255,255,0.1)' }}>
                <div style={{ position: 'relative', minWidth: '950px', height: '650px', margin: '0 auto' }}>
                    {/* Draw connecting lines (Edges) */}
                    <svg width="100%" height="100%" style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none' }}>
                        {graphData.edges.map((edge, i) => {
                            const fromNode = graphData.nodes.find(n => n.id === edge.from);
                            const toNode = graphData.nodes.find(n => n.id === edge.to);
                            if (!fromNode || !toNode) return null;
                            return (
                                <line
                                    key={i}
                                    x1={`${fromNode.x + 50}`}
                                    y1={`${fromNode.y + 20}`}
                                    x2={`${toNode.x + 50}`}
                                    y2={`${toNode.y + 20}`}
                                    stroke="rgba(255,255,255,0.2)"
                                    strokeWidth="3"
                                    strokeDasharray="5,5"
                                />
                            );
                        })}
                    </svg>

                    {/* Draw Nodes */}
                    {graphData.nodes.map(node => {
                        const isSelected = selectedNodes.some(n => n.id === node.id);
                        return (
                            <button
                                key={node.id}
                                className={`graph-node ${isSelected ? 'selected' : ''}`}
                                onClick={() => toggleNode(node)}
                                style={{
                                    position: 'absolute',
                                    left: `${node.x}px`,
                                    top: `${node.y}px`,
                                    padding: '0.75rem 1.5rem',
                                    borderRadius: '30px',
                                    border: isSelected ? '2px solid #a855f7' : '2px solid rgba(255,255,255,0.2)',
                                    background: isSelected ? 'linear-gradient(135deg, #a855f7, #6366f1)' : '#1e293b',
                                    color: 'white',
                                    fontWeight: 'bold',
                                    cursor: 'pointer',
                                    transition: 'all 0.2s',
                                    boxShadow: isSelected ? '0 0 15px rgba(168, 85, 247, 0.5)' : 'none',
                                    zIndex: 10
                                }}
                            >
                                {node.label}
                            </button>
                        )
                    })}
                </div>
            </div>

            <button className="btn-primary" style={{ marginTop: '2rem' }} onClick={handleSave}>
                Save Profile Connections
            </button>
        </div>
    );
}

export default TasteGraphSetup;
