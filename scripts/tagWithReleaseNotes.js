import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { getReleaseNotes } from './extract-release-notes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const targetTag = process.argv[2];
if (!targetTag) {
    console.error('Usage: node scripts/tagWithReleaseNotes.js <tag>');
    process.exit(1);
}

try {
    const notes = getReleaseNotes(targetTag);
    const tagMessage = `Release ${targetTag}\n\n${notes}\n`;

    const tempFilePath = path.resolve(__dirname, `../.tag_message_${targetTag}.tmp`);
    fs.writeFileSync(tempFilePath, tagMessage, 'utf8');

    console.log(`Applying release notes to annotated git tag "${targetTag}"...`);
    execSync(`git tag -a ${targetTag} -f -F "${tempFilePath}"`, { stdio: 'inherit' });

    fs.unlinkSync(tempFilePath);
    console.log(`✓ Tag "${targetTag}" successfully annotated with release notes!`);
    console.log(`Run "git push origin ${targetTag} --force" to update the remote tag.`);
} catch (error) {
    console.error('Error applying tag notes:', error.message);
    process.exit(1);
}
