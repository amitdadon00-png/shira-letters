#!/usr/bin/env node
/**
 * new_letter.js — מחולל מכתבי אהבה לשירה
 *
 * שימוש: node new_letter.js
 *
 * תומך ב:
 *   • טקסט חופשי עם פסקאות (שורה ריקה כפולה = פסקה חדשה)
 *   • תמונה מקומית (jpg, png, webp)
 *   • שיר — קישור YouTube / Spotify, או קובץ MP3 מקומי
 */

import { createInterface }   from 'node:readline/promises';
import { stdin, stdout }     from 'node:process';
import {
    readFileSync, writeFileSync,
    mkdirSync, copyFileSync,
    existsSync, readdirSync,
} from 'node:fs';
import { join, dirname, basename, extname } from 'node:path';
import { fileURLToPath }    from 'node:url';
import { exec }             from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT      = __dirname;
const TEMPLATE  = join(ROOT, 'letter_template.html');
const LETTERS   = join(ROOT, 'letters');
const PHOTOS    = join(ROOT, 'assets', 'photos');
const AUDIO_DIR = join(ROOT, 'assets', 'audio');

const HEB_MONTHS = [
    'ינואר','פברואר','מרץ','אפריל','מאי','יוני',
    'יולי','אוגוסט','ספטמבר','אוקטובר','נובמבר','דצמבר',
];

// ── helpers ──────────────────────────────────────────────────────────────────

function fmtDate(d) {
    return `${d.getDate()} ב${HEB_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

function toParagraphsHtml(text) {
    return text
        .split(/\n{2,}/)
        .map(b => b.replace(/\n/g, '<br>').trim())
        .filter(Boolean)
        .map(b => `<p>${b}</p>`)
        .join('\n            ');
}

// ── audio builder ─────────────────────────────────────────────────────────────

function buildAudio(raw) {
    const s = raw.trim();
    if (!s) return '';

    // YouTube
    for (const pat of [
        /youtu\.be\/([A-Za-z0-9_-]+)/,
        /youtube\.com\/watch\?v=([A-Za-z0-9_-]+)/,
        /youtube\.com\/shorts\/([A-Za-z0-9_-]+)/,
    ]) {
        const m = s.match(pat);
        if (m) {
            const vid = m[1];
            const url = `https://youtu.be/${vid}`;
            return `
    <div class="audio-section">
        <div class="audio-label">♪ שיר במיוחד בשבילך</div>
        <a href="${url}" target="_blank" rel="noopener" class="play-btn">
            <span class="play-icon">▶</span>
            <span>לחץ לנגן</span>
        </a>
    </div>`;
        }
    }

    // Spotify
    const spM = s.match(/open\.spotify\.com\/(track|album|playlist)\/([A-Za-z0-9]+)/);
    if (spM) {
        const [, kind, sid] = spM;
        return `
    <div class="audio-section">
        <div class="audio-label">♪ שיר במיוחד בשבילך</div>
        <iframe class="spotify-embed"
                src="https://open.spotify.com/embed/${kind}/${sid}"
                frameborder="0" allowtransparency="true"
                allow="encrypted-media"></iframe>
    </div>`;
    }

    // Local audio file
    const ext = extname(s).toLowerCase();
    if (['.mp3', '.wav', '.ogg', '.m4a'].includes(ext)) {
        if (!existsSync(s)) {
            console.log(`  ⚠️  לא מצאתי קובץ שמע: ${s}`);
            return '';
        }
        const today    = new Date().toISOString().slice(0, 10);
        const destName = `${today}_${basename(s)}`;
        mkdirSync(AUDIO_DIR, { recursive: true });
        copyFileSync(s, join(AUDIO_DIR, destName));
        const mimeMap = { '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.m4a': 'audio/mp4' };
        return `
    <div class="audio-section">
        <div class="audio-label">♪ שיר במיוחד בשבילך</div>
        <audio controls class="audio-player">
            <source src="../assets/audio/${destName}" type="${mimeMap[ext] || 'audio/mpeg'}">
        </audio>
    </div>`;
    }

    console.log(`  ⚠️  לא זיהיתי את הקישור/קובץ: ${s}`);
    return '';
}

// ── featured phrase builder ───────────────────────────────────────────────────

function buildFeaturedPhrase(raw) {
    const s = raw.trim();
    if (!s) return '';
    return `
    <div class="featured">
        <div class="featured-text">${s} ❤️</div>
    </div>`;
}

// ── photo builder ─────────────────────────────────────────────────────────────

function buildPhoto(raw) {
    const s = raw.trim();
    if (!s) return { html: '', ogImg: '' };
    if (!existsSync(s)) {
        console.log(`  ⚠️  לא מצאתי תמונה: ${s}`);
        return { html: '', ogImg: '' };
    }
    const today    = new Date().toISOString().slice(0, 10);
    const destName = `${today}_${basename(s)}`;
    mkdirSync(PHOTOS, { recursive: true });
    copyFileSync(s, join(PHOTOS, destName));
    const rel = `../assets/photos/${destName}`;
    return {
        html: `
    <div class="photo-wrapper">
        <img src="${rel}" alt="אנחנו">
    </div>`,
        ogImg: rel,
    };
}

// ── index builder ─────────────────────────────────────────────────────────────

function updateIndex() {
    if (!existsSync(LETTERS)) return;
    const files = readdirSync(LETTERS)
        .filter(f => f.endsWith('.html'))
        .sort()
        .reverse();
    if (!files.length) return;

    const items = files.map(f => {
        const stem = f.replace('.html', '');
        let label  = stem;
        try { label = fmtDate(new Date(`${stem}T12:00:00`)); } catch {}
        return `        <li><a href="letters/${f}">${label}</a></li>`;
    }).join('\n');

    const html = `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>מכתבי אהבה לשירה ♥</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link href="https://fonts.googleapis.com/css2?family=Frank+Ruhl+Libre:wght@400;700;900&family=Cormorant+Garamond:ital@1&display=swap" rel="stylesheet">
    <style>
        body { min-height:100vh; display:flex; flex-direction:column; align-items:center;
               justify-content:center; background:#f4ece0; font-family:'Frank Ruhl Libre',serif;
               color:#1e0d06; padding:40px 20px; }
        h1   { font-size:clamp(2rem,7vw,3rem); color:#7a2d42; font-weight:900; margin-bottom:.3em; }
        .sub { font-family:'Cormorant Garamond',serif; font-style:italic; color:#7d5540;
               font-size:1rem; letter-spacing:.15em; margin-bottom:2.5em; }
        ul   { list-style:none; padding:0; display:flex; flex-direction:column;
               gap:14px; width:100%; max-width:380px; }
        li a { display:block; padding:14px 24px; background:#fffdf9;
               border:1px solid rgba(184,137,44,.28); border-radius:6px;
               color:#4a2e1e; text-decoration:none; font-size:1.08rem;
               transition:box-shadow .2s,border-color .2s; }
        li a:hover { border-color:#b8892c; box-shadow:0 4px 14px rgba(122,45,66,.14); color:#7a2d42; }
    </style>
</head>
<body>
    <h1>לשירה ♥</h1>
    <div class="sub">מכתבי אהבה מעמית</div>
    <ul>
${items}
    </ul>
</body>
</html>`;

    writeFileSync(join(ROOT, 'index.html'), html, 'utf8');
}

// ── main ──────────────────────────────────────────────────────────────────────

async function main() {
    const rl = createInterface({ input: stdin, output: stdout, terminal: true });

    console.log('\n  ✦  מחולל מכתבי אהבה לשירה  ✦');
    console.log('  ──────────────────────────────\n');

    mkdirSync(LETTERS, { recursive: true });

    const today   = new Date();
    const dateStr = today.toISOString().slice(0, 10);
    const outName = `${dateStr}.html`;
    const outPath = join(LETTERS, outName);

    if (existsSync(outPath)) {
        const ans = await rl.question(`  ⚠️  כבר קיים מכתב להיום (${outName}). לדרוס? (y/n): `);
        console.log();
        if (ans.trim().toLowerCase() !== 'y') {
            rl.close();
            return;
        }
    }

    // ── Read letter text ──
    console.log('📝 כתוב את המכתב לשירה.');
    console.log('   כשתסיים — כתוב שורה עם  ---  בלבד ולחץ Enter:\n');
    const lines = [];
    while (true) {
        const line = await rl.question('');
        if (line.trim() === '---') break;
        lines.push(line);
    }
    const text = lines.join('\n').trim();

    if (!text) {
        console.log('\n  המכתב ריק — ביטול.');
        rl.close();
        return;
    }

    console.log();
    const featuredRaw = await rl.question('💬 משפט מרכזי מוארת בתחתית (לדוגמה: שרוף עלייך לב ליבי) — ריק לדילוג:\n  > ');
    console.log();
    const photoRaw = await rl.question('📸 נתיב לתמונה שלכם (ריק לדילוג):\n  > ');
    console.log();
    const audioRaw = await rl.question('♪  קישור YouTube / Spotify, או נתיב לקובץ MP3 (ריק לדילוג):\n  > ');
    console.log();

    // ── Build pieces ──
    const { html: photoHtml, ogImg } = buildPhoto(photoRaw);
    const audioSnippet  = buildAudio(audioRaw);
    const featuredSnippet = buildFeaturedPhrase(featuredRaw);
    const paragraphs   = toParagraphsHtml(text);
    const dStr         = fmtDate(today);

    // ── Fill template ──
    const tpl  = readFileSync(TEMPLATE, 'utf8');
    const html = tpl
        .replace('__OG_TITLE__',          'מכתב לשירה ♥')
        .replace('__OG_DESCRIPTION__',    `מכתב אהבה מעמית · ${dStr}`)
        .replace('__OG_IMAGE__',          ogImg)
        .replace('__PAGE_TITLE__',        'מכתב לשירה ♥')
        .replace('__PHOTO_SECTION__',          photoHtml)
        .replace('__LETTER_PARAGRAPHS__',     paragraphs)
        .replace('__FEATURED_PHRASE_SECTION__', featuredSnippet)
        .replace('__AUDIO_SECTION__',          audioSnippet)
        .replace('__LETTER_DATE__',            dStr);

    writeFileSync(outPath, html, 'utf8');
    console.log(`  ✅ נשמר: letters/${outName}`);

    updateIndex();
    console.log('  ✅ עודכן: index.html\n');

    // ── Next steps ──
    let addCmd = `  git add letters/${outName} index.html`;
    if (photoRaw.trim())                                            addCmd += ' assets/photos/';
    if (audioRaw.trim() && !audioRaw.trim().startsWith('http'))    addCmd += ' assets/audio/';

    console.log('  ─── הצעדים הבאים ───────────────────────────────────────');
    console.log(addCmd);
    console.log("  git commit -m 'מכתב חדש לשירה'");
    console.log('  git push\n');
    console.log('  📎 הקישור לשליחה בוואטסאפ:');
    console.log(`  https://YOUR-USERNAME.github.io/YOUR-REPO/letters/${outName}`);
    console.log('  ────────────────────────────────────────────────────────\n');

    // ── Preview ──
    const openAns = await rl.question('  לפתוח תצוגה מקדימה בדפדפן? (y/n): ');
    rl.close();
    if (openAns.trim().toLowerCase() === 'y') {
        exec(`start "" "${outPath}"`);
    }
}

main().catch(err => { console.error(err); process.exit(1); });
