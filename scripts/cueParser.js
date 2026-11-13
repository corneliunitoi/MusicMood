import fs from 'fs';
import path from 'path';

/**
 * Detects encoding and reads CUE file safely (UTF-8, UTF-8 BOM, CP1251 Cyrillic, CP1252 Latin).
 */
export function readCueFile(filePath) {
    const buf = fs.readFileSync(filePath);

    // 1. Check for UTF-8 BOM
    if (buf.length >= 3 && buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF) {
        return new TextDecoder('utf-8').decode(buf.subarray(3));
    }

    // 2. Try UTF-8 first
    try {
        const utf8Decoder = new TextDecoder('utf-8', { fatal: true });
        return utf8Decoder.decode(buf);
    } catch {
        // Not valid UTF-8, test CP1251 vs CP1252
    }

    // Check high-byte frequency for Cyrillic (0xC0 - 0xFF in CP1251)
    let cyrillicBytes = 0;
    let latinExtBytes = 0;
    for (let i = 0; i < buf.length; i++) {
        const b = buf[i];
        if (b >= 0xC0 && b <= 0xFF) cyrillicBytes++;
        if ((b >= 0xC0 && b <= 0xD6) || (b >= 0xD8 && b <= 0xF6)) latinExtBytes++;
    }

    if (cyrillicBytes > 5) {
        try {
            return new TextDecoder('windows-1251').decode(buf);
        } catch {}
    }

    try {
        return new TextDecoder('windows-1252').decode(buf);
    } catch {
        return buf.toString('latin1');
    }
}

/**
 * Strips enclosing quotes and trims whitespace
 */
function cleanVal(str) {
    if (!str) return '';
    return str.replace(/^["']|["']$/g, '').trim();
}

/**
 * Parse timestamp mm:ss:ff (frames = 1/75th sec) into total seconds
 */
export function parseCueIndexTime(indexStr) {
    if (!indexStr) return null;
    const parts = indexStr.trim().split(':');
    if (parts.length === 3) {
        const mins = parseInt(parts[0], 10) || 0;
        const secs = parseInt(parts[1], 10) || 0;
        const frames = parseInt(parts[2], 10) || 0;
        return mins * 60 + secs + (frames / 75);
    }
    return null;
}

/**
 * Parses raw CUE sheet text into a structured album and tracks object.
 *
 * @param {string} cueContent Raw string of the .cue file
 * @param {string} cueDirectory Absolute directory where the .cue resides
 * @returns {object} { albumArtist, albumTitle, albumGenre, albumYear, audioFiles, tracks }
 */
export function parseCueContent(cueContent, cueDirectory = null) {
    const lines = cueContent.split(/\r?\n/);

    let albumArtist = '';
    let albumTitle = '';
    let albumGenre = '';
    let albumYear = '';
    let currentFile = null;
    const referencedFiles = new Set();
    const tracks = [];
    let currentTrack = null;

    for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line) continue;

        // REM comments
        const remGenreMatch = line.match(/^REM\s+GENRE\s+(.+)$/i);
        if (remGenreMatch) {
            albumGenre = cleanVal(remGenreMatch[1]);
            continue;
        }

        const remDateMatch = line.match(/^REM\s+(?:DATE|YEAR)\s+(.+)$/i);
        if (remDateMatch) {
            albumYear = cleanVal(remDateMatch[1]);
            continue;
        }

        // FILE reference
        const fileMatch = line.match(/^FILE\s+(.+?)\s+(?:WAVE|MP3|AIFF|BINARY|MOTOROLA|APE|FLAC)$/i);
        if (fileMatch) {
            currentFile = cleanVal(fileMatch[1]);
            referencedFiles.add(currentFile);
            continue;
        }

        // TRACK declaration
        const trackMatch = line.match(/^TRACK\s+(\d+)\s+AUDIO/i);
        if (trackMatch) {
            if (currentTrack) {
                tracks.push(currentTrack);
            }
            const trackNum = parseInt(trackMatch[1], 10);
            currentTrack = {
                trackNumber: trackNum,
                title: '',
                artist: '',
                album: '',
                genre: '',
                file: currentFile,
                index01: null,
                index01Sec: null
            };
            continue;
        }

        // Inside TRACK or Album header
        const titleMatch = line.match(/^TITLE\s+(.+)$/i);
        if (titleMatch) {
            const val = cleanVal(titleMatch[1]);
            if (currentTrack) {
                currentTrack.title = val;
            } else {
                albumTitle = val;
            }
            continue;
        }

        const perfMatch = line.match(/^PERFORMER\s+(.+)$/i);
        if (perfMatch) {
            const val = cleanVal(perfMatch[1]);
            if (currentTrack) {
                currentTrack.artist = val;
            } else {
                albumArtist = val;
            }
            continue;
        }

        const indexMatch = line.match(/^INDEX\s+01\s+(\d{2}:\d{2}:\d{2})/i);
        if (indexMatch && currentTrack) {
            currentTrack.index01 = indexMatch[1];
            currentTrack.index01Sec = parseCueIndexTime(indexMatch[1]);
            continue;
        }
    }

    if (currentTrack) {
        tracks.push(currentTrack);
    }

    // Finalize track defaults (inherit album artist, album title, genre)
    for (const t of tracks) {
        if (!t.artist) t.artist = albumArtist;
        if (!t.album) t.album = albumTitle;
        if (!t.genre) t.genre = albumGenre;
    }

    // Resolve audio file on disk if cueDirectory is provided
    let resolvedAudioPath = null;
    if (cueDirectory && fs.existsSync(cueDirectory)) {
        resolvedAudioPath = resolveCueAudioFile(cueDirectory, Array.from(referencedFiles));
    }

    return {
        albumArtist,
        albumTitle,
        albumGenre,
        albumYear,
        referencedFiles: Array.from(referencedFiles),
        resolvedAudioPath,
        tracks
    };
}

/**
 * Locates the actual audio file on disk corresponding to the CUE references.
 * Handles cases where cue references .wav but file is .ape or .flac on disk.
 */
export function resolveCueAudioFile(cueDir, referencedFiles) {
    const AUDIO_EXTS = ['.ape', '.flac', '.wv', '.wav', '.mp3', '.m4a', '.ogg'];

    // 1. Try exact referenced file
    for (const ref of referencedFiles) {
        const full = path.resolve(cueDir, ref);
        if (fs.existsSync(full)) return full;
    }

    // 2. Try same basename with audio extensions
    for (const ref of referencedFiles) {
        const baseName = path.basename(ref, path.extname(ref));
        for (const ext of AUDIO_EXTS) {
            const candidate = path.resolve(cueDir, baseName + ext);
            if (fs.existsSync(candidate)) return candidate;
        }
    }

    // 3. Fallback: Check if there is a single large audio container file in the directory
    try {
        const entries = fs.readdirSync(cueDir, { withFileTypes: true });
        const audioFiles = entries
            .filter(e => e.isFile() && AUDIO_EXTS.includes(path.extname(e.name).toLowerCase()))
            .map(e => path.resolve(cueDir, e.name));

        if (audioFiles.length === 1) {
            return audioFiles[0];
        }
        // If multiple, prefer .ape, .flac, .wv with matching or largest size
        if (audioFiles.length > 1) {
            const sortedBySize = audioFiles
                .map(f => ({ path: f, size: fs.statSync(f).size }))
                .sort((a, b) => b.size - a.size);
            // If largest is > 50MB (likely an album image)
            if (sortedBySize[0].size > 50 * 1024 * 1024) {
                return sortedBySize[0].path;
            }
        }
    } catch {}

    return null;
}
