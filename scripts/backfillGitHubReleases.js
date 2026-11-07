import { getReleaseNotes } from './extract-release-notes.js';
import { TAGS_SINCE_V05 } from './backfillAllTags.js';

const REPO_OWNER = 'corneliunitoi';
const REPO_NAME = 'MusicMood';
const token = process.env.GITHUB_TOKEN;

if (!token) {
    console.error('Error: GITHUB_TOKEN environment variable is required to create GitHub Releases.');
    console.error('You can run this via GitHub Actions or set GITHUB_TOKEN in your environment.');
    process.exit(1);
}

const headers = {
    'Accept': 'application/vnd.github+json',
    'Authorization': `Bearer ${token}`,
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'MusicMood-Release-Automation'
};

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function backfillGitHubReleases() {
    console.log(`Starting GitHub Releases publication for ${TAGS_SINCE_V05.length} releases...`);

    for (const tag of TAGS_SINCE_V05) {
        try {
            const body = getReleaseNotes(tag);
            const releaseName = `MusicMood ${tag}`;

            // Check if release already exists for this tag
            const checkUrl = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/releases/tags/${tag}`;
            const checkRes = await fetch(checkUrl, { headers });

            if (checkRes.ok) {
                const existing = await checkRes.json();
                console.log(`   [Update] Release ${tag} already exists (id: ${existing.id}). Updating body...`);
                const updateUrl = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/releases/${existing.id}`;
                const updateRes = await fetch(updateUrl, {
                    method: 'PATCH',
                    headers,
                    body: JSON.stringify({
                        name: releaseName,
                        body: body,
                        draft: false,
                        prerelease: false
                    })
                });

                if (updateRes.ok) {
                    console.log(`   ✓ Successfully updated GitHub Release for ${tag}`);
                } else {
                    const err = await updateRes.text();
                    console.warn(`   ⚠️ Failed to update ${tag}: ${err}`);
                }
            } else if (checkRes.status === 404) {
                console.log(`   [Create] Creating new GitHub Release for ${tag}...`);
                const createUrl = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/releases`;
                const createRes = await fetch(createUrl, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify({
                        tag_name: tag,
                        name: releaseName,
                        body: body,
                        draft: false,
                        prerelease: false
                    })
                });

                if (createRes.ok) {
                    console.log(`   ✓ Successfully created GitHub Release for ${tag}`);
                } else {
                    const err = await createRes.text();
                    console.warn(`   ⚠️ Failed to create ${tag}: ${err}`);
                }
            } else {
                console.warn(`   ⚠️ HTTP ${checkRes.status} checking release for ${tag}`);
            }

            await sleep(500); // 500ms pacing between API calls
        } catch (err) {
            console.error(`   ❌ Error on ${tag}:`, err.message);
        }
    }

    console.log(`\n🎉 All releases processed!`);
}

backfillGitHubReleases().catch(console.error);
