import pkg from 'whatsapp-web.js';
const { Client, LocalAuth, MessageMedia } = pkg;

import qrcode from 'qrcode-terminal';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';

const execPromise = promisify(exec);

const client = new Client({
    authStrategy: new LocalAuth({
        dataPath: './session'
    }),
    puppeteer: {
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu'
        ]
    }
});

const state = new Map();

client.on('qr', qr => {
    console.log('SCAN QR');
    qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
    console.log('BOT READY');
});

function detectPlatform(url) {
    if (url.includes('tiktok')) return 'TikTok';
    if (url.includes('instagram')) return 'Instagram';
    if (url.includes('youtu')) return 'YouTube';
    return 'Unknown';
}

client.on('message', async msg => {
    const id = msg.from;
    const text = msg.body.trim();

    if (text === '/start') {
        state.delete(id);

        await msg.reply(
            '🎬 أهلاً بك في بوت فيديوهات 🤖\n\n' +
            'ارسل رابط من (YouTube - TikTok - Instagram)'
        );
        return;
    }

    const urlMatch = text.match(/https?:\/\/\S+/);

    if (urlMatch) {
        const url = urlMatch[0];
        const platform = detectPlatform(url);

        state.set(id, { url, platform });

        await msg.reply(
            `تم اكتشاف رابط من ${platform} 🎯\n\n` +
            'اكتب:\n1️⃣ فيديو\n2️⃣ صوت'
        );
        return;
    }

    const user = state.get(id);

    if (user && (text === '1' || text === '2')) {
        const isVideo = text === '1';

        const dir = path.join(process.cwd(), 'downloads');
        if (!fs.existsSync(dir)) fs.mkdirSync(dir);

        const name = `file_${Date.now()}`;
        const output = path.join(dir, `${name}.%(ext)s`);

        await msg.reply('جاري التحميل... ⏳');

        let cmd;

        if (isVideo) {
            cmd = `yt-dlp -f "bestvideo+bestaudio/best" --merge-output-format mp4 -o "${output}" "${user.url}"`;
        } else {
            cmd = `yt-dlp -x --audio-format mp3 -o "${output}" "${user.url}"`;
        }

        try {
            await execPromise(cmd);

            const files = fs.readdirSync(dir).filter(f => f.includes(name));
            const file = files[0];

            if (!file) {
                await msg.reply('فشل التحميل');
                state.delete(id);
                return;
            }

            const filePath = path.join(dir, file);

            const sizeMB = fs.statSync(filePath).size / (1024 * 1024);

            if (sizeMB > 64) {
                await msg.reply('الملف كبير على واتساب');
                fs.unlinkSync(filePath);
                state.delete(id);
                return;
            }

            const media = MessageMedia.fromFilePath(filePath);

            await client.sendMessage(id, media, {
                sendMediaAsDocument: !isVideo,
                caption: '🎬 بوت فيديوهات'
            });

            fs.unlinkSync(filePath);

        } catch (e) {
            await msg.reply('حدث خطأ في التحميل');
        }

        state.delete(id);
        return;
    }

    if (user) {
        await msg.reply('ارسل 1 أو 2 فقط');
    }
});

client.initialize();
