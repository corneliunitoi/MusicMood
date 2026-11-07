import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Extracts release notes for a specified tag:
 * 1. From RELEASE_MANAGEMENT.md if available on disk.
 * 2. Fallback to reading the annotated git tag message directly via git CLI.
 */
export function getReleaseNotes(targetTag) {
    const filePath = path.resolve(__dirname, '../RELEASE_MANAGEMENT.md');
    let tag = targetTag;

    if (fs.existsSync(filePath)) {
        try {
            const content = fs.readFileSync(filePath, 'utf8');
            if (!tag) {
                const firstMatch = content.match(/###\s+`([^`]+)`/);
                if (firstMatch) tag = firstMatch[1];
            }

            if (tag) {
                const escapedTag = tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const regex = new RegExp(`###\\s+\`${escapedTag}\`[^\n]*\n([\\s\\S]*?)(?=\\n###\\s+\`|$)`);
                const match = content.match(regex);
                if (match) {
                    let notes = match[1].trim();
                    notes = notes.replace(/\n\s*---\s*$/, '').trim();
                    return notes;
                }
            }
        } catch (e) {
            console.warn(`[ExtractNotes] Error reading RELEASE_MANAGEMENT.md:`, e.message);
        }
    }

    // Fallback: Read directly from git tag annotation
    if (tag) {
        try {
            const tagMsg = execSync(`git tag -l --format="%(contents)" ${tag}`, { encoding: 'utf8' }).trim();
            if (tagMsg) {
                // If the tag message starts with "Release <tag>\n\n", strip the header
                const stripped = tagMsg.replace(new RegExp(`^Release\\s+${tag}\\s*\\n*`, 'i'), '').trim();
                return stripped || tagMsg;
            }
        } catch (e) {}
    }

    return `Release ${tag || 'v0.0.0'}`;
}

// If run directly from CLI
if (process.argv[1] === fileURLToPath(import.meta.url)) {
    const requestedTag = process.argv[2];
    const notes = getReleaseNotes(requestedTag);
    console.log(notes);
}
