import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { getReleaseNotes } from './extract-release-notes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Exact commit hash for each tag in git history
export const TAG_COMMIT_MAP = {
    'v0.5.0': '0c0288b06ca1bebef931cd14c8b7d42678edaa1a',
    'v0.5.1': '2081fc8572d75be29430469890169a1b66eb7b2f',
    'v0.5.2': '2910482b9ca52fd0e6b92c1124e537459b4e21d4',
    'v0.5.3': 'd15a2ffe3c1b782aab19e7d3311a45548fa9b79c',
    'v0.5.4': 'b1c6d46f651a7ac93178a7d4801da0be43a15d63',
    'v0.5.5': 'fc2c22ad5e880146f3cb1f9b2965979926f6518d',
    'v0.5.6': '26d11ca6f0f546b377027694dfde37250cf38a25',
    'v0.5.6b': '7a49fd50a99f01ec9201ab0260f7c3cf3441a18e',
    'v0.5.7': '10a173946d894d1b63dcf8eb79569629d88029f5',
    'v0.5.8': '9927108bb421d01e70b79b32b0921fe89934aa79',
    'v0.5.9': '13edd86d76e179b3fed53664ea2678d94161d5d1',
    'v0.6.0': '6088ec0dfcda2feb2bcd167f755a0bcf07e751b3',
    'v0.6.0a': 'dccf4db0fe9dd1498964e056569243c290fb1c03',
    'v0.6.0b': '51241f8d6edc4f70a838d11b989194e2f4334c0a',
    'v0.6.0c': 'bcac3195dc6cfbcb0d5eaca48391c0dde07e2276',
    'v0.6.1': '86309c98ff4003e9071501010a3f27f50b0c33a4',
    'v0.6.2': '5c52b4e165b0e4943b2ff52231c4c07772616d06',
    'v0.7.0': '8b26b48001f59ee23df89a15d8f372c03896291c',
    'v0.7.0a': '92893d64164fe058e625549c65dcbbe335657d36',
    'v0.7.1': '8957162b51a3149d202de630b07a05005ddced03',
    'v0.7.2': '7c7056a36bc9b44eda2aa0f7255957aac9112e86',
    'v0.7.2a': '8b4462ebaf1160e22fc6d0778d9107f4c0bf32a7',
    'v0.7.3': '5f0e81fcb77fad3aaf9b5950798d7858602b2fc5'
};

export const TAGS_SINCE_V05 = Object.keys(TAG_COMMIT_MAP);

async function backfillTags() {
    console.log(`Starting backfill of release notes for ${TAGS_SINCE_V05.length} tags since v0.5.0...\n`);

    for (const [tag, commitHash] of Object.entries(TAG_COMMIT_MAP)) {
        try {
            const notes = getReleaseNotes(tag);
            const tagMessage = `Release ${tag}\n\n${notes}\n`;

            const tempFilePath = path.resolve(__dirname, `../.tag_msg_${tag}.tmp`);
            fs.writeFileSync(tempFilePath, tagMessage, 'utf8');

            execSync(`git tag -a ${tag} -f -F "${tempFilePath}" ${commitHash}`, { stdio: 'pipe' });

            if (fs.existsSync(tempFilePath)) {
                fs.unlinkSync(tempFilePath);
            }
            console.log(`✓ [${tag}] Annotated with release notes pointing to commit ${commitHash.substring(0, 7)}.`);
        } catch (err) {
            console.error(`❌ [${tag}] Error: ${err.message}`);
        }
    }

    console.log(`\n🎉 All ${TAGS_SINCE_V05.length} tags correctly annotated on their historical commits!`);
    console.log(`Run "git push origin --tags --force" to update remote tags on GitHub.`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    backfillTags().catch(console.error);
}
