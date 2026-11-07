import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Extracts release notes for a specified tag from RELEASE_MANAGEMENT.md.
 * Usage:
 *   node scripts/extract-release-notes.js [tag]
 * Example:
 *   node scripts/extract-release-notes.js v0.7.2a
 */
export function getReleaseNotes(targetTag) {
    const filePath = path.resolve(__dirname, '../RELEASE_MANAGEMENT.md');
    const content = fs.readFileSync(filePath, 'utf8');

    // Default to the first tag found in RELEASE_MANAGEMENT.md if none provided
    let tag = targetTag;
    if (!tag) {
        const firstMatch = content.match(/###\s+`([^`]+)`/);
        if (firstMatch) {
            tag = firstMatch[1];
        } else {
            throw new Error('No release tags found in RELEASE_MANAGEMENT.md');
        }
    }

    // Escape regex characters in tag name
    const escapedTag = tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Pattern matches ### `vX.Y.Za` — YYYY-MM-DD\n ... until next ### ` or end of file
    const regex = new RegExp(`###\\s+\`${escapedTag}\`[^\n]*\n([\\s\\S]*?)(?=\\n###\\s+\`|$)`);
    const match = content.match(regex);

    if (!match) {
        return `Release ${tag}`;
    }

    let notes = match[1].trim();
    // Strip trailing markdown horizontal dividers
    notes = notes.replace(/\n\s*---\s*$/, '').trim();
    return notes;
}

// If run directly from CLI
if (process.argv[1] === fileURLToPath(import.meta.url)) {
    const requestedTag = process.argv[2];
    const notes = getReleaseNotes(requestedTag);
    console.log(notes);
}
