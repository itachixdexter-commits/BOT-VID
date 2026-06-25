import pkg from 'whatsapp-web.js';
const { Client, LocalAuth, MessageMedia, Buttons } = pkg;

import qrcode from 'qrcode-terminal';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';

const execPromise = promisify(exec);

const client = new Client({
    authStrategy: new LocalAuth({ dataPath: './session' }),
    puppeteer: {
        executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome',
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
    }
});

const state = new Map();

function getPlatform(url) {
    if (url.includes('tiktok')) return 'TikTok';
    if (url.includes('instagram')) return 'Instagram';
    if (url.includes('youtu')) return 'YouTube';
    return 'Unknown';
}

client.on('qr', qr => {
    console.log('QR:');
    qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
    console.log('Bot Ready');
});

client.on('message', async msg => {
    const id = msg.from;
    const text = msg.body.trim();

    if (text === '/start') {
        state.delete(id);

        const buttons = new Buttons(
            'أهلاً بك في بوت فيديوهات 🤖🎬\nأرسل رابط الفيديو',
            [
                { body: 'مساعدة' },
                { body: 'عن البوت' }
            ],
            'بوت فيديوهات',
            'اختر خيار'
        );

        await client.sendMessage(id, buttons);
        return;
    }

    if (text === 'مساعدة') {
        await msg.reply('ارسل رابط من YouTube أو TikTok أو Instagram وسأقوم بتحميله لك');
        return;
    }

    if (text === 'عن البوت') {
        await msg.reply('بوت فيديوهات يقوم بتحميل الفيديوهات والصوتيات من الروابط');
        return;
    }

    const urlMatch = text.match(/https?:\/\/\S+/);

    if (urlMatch) {
        const url = urlMatch[0];
        const platform = getPlatform(url);

        state.set(id, { url, platform });

        const buttons = new Buttons(
            `تم اكتشاف الرابط من ${platform} 🎬\nاختر نوع التحميل`,
            [
                { body: '🎥 فيديو' },
                { body: '🎵 صوت' }
            ],
            'اختيار التحميل',
            'حدد العملية'
        );

        await client.sendMessage(id, buttons);
        return;
    }

    const user = state.get(id);

    if (user && (text === '🎥 فيديو' || text === '🎵 صوت')) {
        const isVideo = text === '🎥 فيديو';
        const dir = path.join(process.cwd(), 'downloads');
        if (!fs.existsSync(dir)) fs.mkdirSync(dir);

        const name = `file_${Date.now()}`;
        const output = path.join(dir, `${name}.%(ext)s`);

        await msg.reply('جاري التحميل... ⏳');

        let cmd = '';

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
                await msg.reply('فشل العثور على الملف');
                state.delete(id);
                return;
            }

            const filePath = path.join(dir, file);
            const size = fs.statSync(filePath).size / (1024 * 1024);

            if (size > 64) {
                await msg.reply('الملف كبير جداً للواتساب');
                fs.unlinkSync(filePath);
                state.delete(id);
                return;
            }

            const media = MessageMedia.fromFilePath(filePath);

            await client.sendMessage(id, media, {
                sendMediaAsDocument: !isVideo,
                caption: 'تم التحميل بواسطة بوت فيديوهات 🎬'
            });

            fs.unlinkSync(filePath);
        } catch (e) {
            await msg.reply('حدث خطأ أثناء التحميل');
        }

        state.delete(id);
        return;
    }

    if (user) {
        await msg.reply('اختر زر أو أرسل رابط جديد');
    }
});

client.initialize();
