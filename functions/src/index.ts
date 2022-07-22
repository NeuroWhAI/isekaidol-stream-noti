process.env.NTBA_FIX_319 = '1';

import fetch from 'node-fetch';
import { AbortController } from "node-abort-controller";
import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { ClientCredentialsAuthProvider } from '@twurple/auth';
import { ApiClient } from '@twurple/api';
import { EUploadMimeType, TwitterApi } from 'twitter-api-v2';
import { HexColorString, MessageEmbed, WebhookClient, Constants } from 'discord.js';

import TelegramBot = require('node-telegram-bot-api');

admin.initializeApp();

const cloudRegion = 'asia-southeast1';
const subRegions = ['us-west2', 'asia-northeast1', 'asia-east2', 'asia-northeast3', 'europe-west1']
const previewFuncName = 'getPreviewFrom';

const clientId = process.env.TWITCH_ID;
const clientSecret = process.env.TWITCH_SEC;
const botToken = process.env.BOT_TOKEN;
const httpKey = process.env.HTTP_JOB_KEY;
const twitterAppKey = process.env.TWITTER_APP_KEY;
const twitterAppSecret = process.env.TWITTER_APP_SECRET;
const twitterAccessToken = process.env.TWITTER_ACCESS_TOKEN;
const twitterAccessSecret = process.env.TWITTER_ACCESS_SECRET;

let authProvider: ClientCredentialsAuthProvider | null = null;
let apiClient: ApiClient | null = null;
if (clientId && clientSecret) {
    authProvider = new ClientCredentialsAuthProvider(clientId, clientSecret);
    apiClient = new ApiClient({ authProvider });
}

let bot: TelegramBot | null = null;
if (botToken) {
    bot = new TelegramBot(botToken);
}

let twitterClient: TwitterApi | null = null;
if (twitterAppKey && twitterAppSecret && twitterAccessToken && twitterAccessSecret) {
    twitterClient = new TwitterApi({
        appKey: twitterAppKey,
        appSecret: twitterAppSecret,
        accessToken: twitterAccessToken,
        accessSecret: twitterAccessSecret,
    });
}

interface MemberData {
    id: string,
    name: string,
    twitchId: string,
    twitchName: string,
    color: HexColorString,
}
const members: MemberData[] = [
    { id: 'jururu', name: '주르르', twitchId: '203667951', twitchName: 'cotton__123', color: '#800080' },
    { id: 'jingburger', name: '징버거', twitchId: '237570548', twitchName: 'jingburger', color: '#f0a957' },
    { id: 'viichan', name: '비챤', twitchId: '195641865', twitchName: 'viichan6', color: '#85ac20' },
    { id: 'gosegu', name: '고세구', twitchId: '707328484', twitchName: 'gosegugosegu', color: '#467ec6' },
    { id: 'lilpa', name: '릴파', twitchId: '169700336', twitchName: 'lilpaaaaaa', color: '#000080' },
    { id: 'ine', name: '아이네', twitchId: '702754423', twitchName: 'vo_ine', color: '#8a2be2' },
];

function encodeFcmToken(token: string): string {
    return token
        .replace(/\//g, "!!!1!!!")
        .replace(/\./g, "!!!2!!!")
        .replace(/\#/g, "!!!3!!!")
        .replace(/\$/g, "!!!4!!!")
        .replace(/\[/g, "!!!5!!!")
        .replace(/\]/g, "!!!6!!!");
}

function decodeFcmToken(token: string): string {
    return token
        .replace(/!!!1!!!/g, '/')
        .replace(/!!!2!!!/g, '.')
        .replace(/!!!3!!!/g, '#')
        .replace(/!!!4!!!/g, '$')
        .replace(/!!!5!!!/g, '[')
        .replace(/!!!6!!!/g, ']');
}

async function removeUnregisteredTokens(tokens: string[]) {
    let msg = {
        data: {},
        tokens: tokens,
    }

    const maxDbJobs = 4;
    let dbJobs = [];

    try {
        // 실제로 메시지 보내진 않고 토큰 검증만 함.
        let response = await admin.messaging().sendMulticast(msg, true);
        if (response.failureCount <= 0) {
            return;
        }

        let results = response.responses;
        let cnt = Math.min(tokens.length, results.length);

        for (let i=0; i<cnt; i++) {
            if (!results[i].success && results[i].error?.code === 'messaging/registration-token-not-registered') {
                let refUser = admin.database().ref('users/' + encodeFcmToken(tokens[i]));
                let job = refUser.remove()
                    .then(() => functions.logger.info("Remove unregistered token.", tokens[i]))
                    .catch((err) => functions.logger.error("Fail to remove unregistered token.", err));
                dbJobs.push(job);

                if (dbJobs.length >= maxDbJobs) {
                    await Promise.allSettled(dbJobs);
                    dbJobs = [];
                }
            }
            else if (results[i].error) {
                functions.logger.warn("Unknown dry-run result.", results[i].error);
            }
        }
    } catch (err) {
        functions.logger.error("Fail to remove unregistered tokens.", err);
    }

    if (dbJobs.length > 0) {
        await Promise.allSettled(dbJobs);
    }
}

async function sendTelegram(bot: TelegramBot, id: string, msg: string): Promise<void> {
    await bot.sendMessage('@' + id + '_stream_noti', msg);
}

async function sendTweet(client: TwitterApi, msg: string, jpgImg: Buffer | null): Promise<void> {
    let imageId = '';
    if (jpgImg) {
        try {
            imageId = await client.v1.uploadMedia(jpgImg, { mimeType: EUploadMimeType.Jpeg });
        } catch (err) {
            functions.logger.error("Fail to upload a tweet image.", err);
        }
    }

    if (imageId && imageId !== '') {
        await client.v1.tweet(msg, { media_ids: imageId });
    } else {
        await client.v1.tweet(msg);
    }
}

async function sendDiscord(urlKey: string, member: MemberData, msgTitle: string, msgContent: string, msgImg: string, timestamp: Date): Promise<void> {
    let webhookClient = new WebhookClient({ url: 'https://discord.com/api/webhooks/' + urlKey });

    let embed = new MessageEmbed()
        .setTitle(msgTitle)
        .setColor(member.color)
        .setURL('https://www.twitch.tv/' + member.twitchName)
        .setDescription(msgContent)
        .setTimestamp(timestamp);
    
    if (msgImg && msgImg !== '') {
        embed = embed.setImage(msgImg);
    }

    await webhookClient.send({
        username: member.name + ' 방송',
        avatarURL: `https://isekaidol-stream-noti.web.app/image/${member.id}.png`,
        embeds: [embed],
    });
}

async function uploadImage(jpgBuff: Buffer, fileName: string): Promise<string | null> {
    let bucket = admin.storage().bucket('isekaidol-stream-noti.appspot.com');

    try {
        let job = new Promise<string>((resolve, reject) => {
            let file = bucket.file(fileName);
            let stream = file.createWriteStream({
                resumable: false,
                public: true,
                timeout: 8 * 1000,
            });

            stream.on('error', reject);

            stream.on('finish', () => {
                file.getMetadata()
                    .then(([metadata]) => resolve(metadata.mediaLink ?? null))
                    .catch(reject);
            });

            stream.end(jpgBuff);
        });

        return await job;
    } catch (err) {
        functions.logger.error("Fail to upload an image.", err);
    }

    return null;
}

async function getOnePreview(member: MemberData, region: string): Promise<{ time: number, img: string, region: string } | null> {
    let func = region.replace('-', '');
    func = previewFuncName + func.substring(0, 1).toUpperCase() + func.substring(1);
    let imgUrl = `https://${region}-isekaidol-stream-noti.cloudfunctions.net/${func}`;

    let abortCtrl = new AbortController();
    let timeoutId = setTimeout(() => abortCtrl.abort(), 3 * 1000);

    try {
        let res = await fetch(`${imgUrl}?key=${httpKey}&name=${member.twitchName}`, { signal: abortCtrl.signal });
        let data: any = await res.json();

        clearTimeout(timeoutId);

        if (data && data.img) {
            return {
                time: data.time,
                img: data.img,
                region: region,
            };
        }

        functions.logger.error("Fail to get an image.", region, data);
    } catch (err) {
        functions.logger.warn("Fail to get an image.", region, err);
    }

    clearTimeout(timeoutId);

    return null;
}

async function getLatestPreview(member: MemberData): Promise<Buffer | null> {
    let jobs = [];
    for (let region of subRegions) {
        jobs.push(getOnePreview(member, region));
    }

    // 썸네일 없을 때의 기본 base64.
    const noPreview = '/9j/2wCEAAUDBAQEAwUEBAQFBQUGBwwIBwcHBw8LCwkMEQ8SEhEPERETFhwXExQaFRERGCEYGh0dHx8fExciJCIeJBweHx4BBQUFBwYHDggIDh4UERQeHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHv/AABEIAWgCgAMBIgACEQEDEQH/xAGiAAABBQEBAQEBAQAAAAAAAAAAAQIDBAUGBwgJCgsQAAIBAwMCBAMFBQQEAAABfQECAwAEEQUSITFBBhNRYQcicRQygZGhCCNCscEVUtHwJDNicoIJChYXGBkaJSYnKCkqNDU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6g4SFhoeIiYqSk5SVlpeYmZqio6Slpqeoqaqys7S1tre4ubrCw8TFxsfIycrS09TV1tfY2drh4uPk5ebn6Onq8fLz9PX29/j5+gEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoLEQACAQIEBAMEBwUEBAABAncAAQIDEQQFITEGEkFRB2FxEyIygQgUQpGhscEJIzNS8BVictEKFiQ04SXxFxgZGiYnKCkqNTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqCg4SFhoeIiYqSk5SVlpeYmZqio6Slpqeoqaqys7S1tre4ubrCw8TFxsfIycrS09TV1tfY2dri4+Tl5ufo6ery8/T19vf4+fr/2gAMAwEAAhEDEQA/APOaKKK6iQooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACkzS0JG8sqxxoXdjhVA5JoATIoyPWttfCXiBlBGnSDPYsKX/AIRHxB/0D3/76FAGHketGR61uf8ACI+IP+ge/wD30KP+ER8Qf9A9/wDvoUAYeR60ZHrW5/wiPiD/AKB7/wDfQo/4RHxB/wBA9/8AvoUAYeR60ZHrW5/wiPiD/oHv/wB9Cj/hEfEH/QPf/voUAYeR60ZHrW5/wiPiD/oHv/30KP8AhEfEH/QPf/voUAYeR60ZHrW5/wAIj4g/6B7/APfQo/4RHxB/0D3/AO+hQBh5HrRketbn/CI+IP8AoHv/AN9CkPhHxB/0D3P/AAIUAYmaWn3VtcWly1vdQvFKnVXHIplABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRSZozQAtdH8N0VvFMRZQSsTlc9jiubzXTfDT/kaF/64v/KgD1Qd+vWijuarajfW2n2xubuURRAgFjQBZorD/wCEs8P5/wCQlHn6Gj/hLPD/AP0EYvyP+FAG5RWH/wAJZ4f/AOgjF+R/wo/4Szw//wBBGL8j/hQBuUVh/wDCWeH/APoIxfkf8KP+Es8P/wDQRi/I/wCFAG5RWH/wlnh//oIxfkf8KP8AhLPD/wD0EYvyP+FAG5RWH/wlnh//AKCMX5Gj/hLPD/8A0EovyNAG5QetUtL1Sw1RHewnEyxkBiOxq73FAHnPxYVRqdi+PmaFgT64I/xrjK7X4tf8hDT/APrk/wDMVxVABRSHijI9aAFopMj1oyOPegBaKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKAGSMqqWY4VRkmsxtdsw5AWVsdwKt6vxplyeRiM1xy98VLYHS/29af885vy/8Ar11vwn1S3u/F6Qxo4JgkPzD2ry+u4+CH/I9R/wDXvJ/KhMD3uuU+K9ylp4OlmkDECZB8v411hriPjZ/yIU3/AF8R/wBaoDyUa9af3Jvy/wDr0f29af8APOb8v/r1zf8AEaWouB0f9vWn/POb8v8A69H9vWn/ADzm/L/69c5RRcDo/wC3rT/nnN+X/wBej+3rT/nnN+X/ANeucoouB0f9vWn/ADzm/L/69H9vWn/POb8v/r1zlFFwOibXbPH+rm/KrljewXqFoicjqGHIrka1vC3/AB9TDn7gppgezfCP/kHah/12T/0E12/cVxHwj/5B2of9dk/9BNdvVAed/Fr/AJCGn/8AXJ/5iuJrtfi0cajp+f8Ank/8xXK6bp19qc/k2Nu8zD7xA4X3J6CgCoenFW9J0rUNUn8qyt3k9W6AfU9q7nQfAVtCFm1aT7RJ18pPlQfU9TXZW8ENtCsNvFHFGBgIigAUAcjoPgWztgsuqSfapRz5a8ID/M1xPiuNIvE2oxRIqIs7BVUYAFe0dxXjXjD/AJGvUv8Ar4agDLooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAqax/yC7n/AK5muOXqa7HWP+QXc/8AXM1xy9TUyAdXcfBD/keo/wDr3k/lXD13HwQ/5HqP/r3k/lSQHvhriPjZ/wAiFN/18R/1rtzXEfGz/kQpv+viP+tWwPAf4jS0n8RpazAKKKKACiiigAooooAK1/C//H1L/uCsitfwv/x9S/7gpoD2X4R/8g7UP+uyf+gmu3P4/hXEfCP/AJB2of8AXZP/AEE129WBj634estYvoLm9aR0hQqI1OA2cHmtK0tre0gWC1gjhiX7qouAKmooAKKKKADuK8a8Yf8AI16l/wBfDV7L3FeNeMP+Rr1L/r4agDLooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAqax/yC7n/rma45eprsdY/wCQXc/9czXHL1NTIB1dx8EP+R6j/wCveT+VcPXcfBD/AJHqP/r3k/lSQHvhriPjZ/yIU3/XxH/Wu3NcR8bP+RCm/wCviP8ArVsDwH+I0tJ/EaWswCiiigAooooAKKKKADvWv4X5upcf3BWOaltLma23GFyhYYJFNAe8fCMj+z9RGeRMmfb5TXb15h+z4zNpOsFiSTcx8k5z8pr0+rAKKKKACiiigA7ivGvGH/I16l/18NXsvcV414w/5GvUv+vhqAMuiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigCprH/ILuf+uZrjl6mux1j/kF3P8A1zNccvU1MgHV3HwQ/wCR6j/695P5Vw9dx8EP+R6j/wCveT+VJAe+GuI+Nn/IhTf9fEf9a7c1xHxs/wCRCm/6+I/61bA8B/iNLSfxGlrMAooooAKKKKACiiigApDS0hoA9k/Z6/5A+sf9fMf/AKCa9Qry/wDZ6/5A+sf9fMf/AKCa9QNWgCisjVvEekaTqdtp+o3S20t0paJpBhDg469utaqsrorIysp6MpyDTAdRRRQAdxXjXjD/AJGvUv8Ar4avZe4rxrxh/wAjXqX/AF8NQBl0UUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAVNY/5Bdz/wBczXHL1NdjrH/ILuf+uZrjl6mpkA6u4+CH/I9R/wDXvJ/KuHruPgh/yPUf/XvJ/KkgPfDXEfGz/kQpv+viP+tdua4j42f8iFN/18R/1q2B4D/EaWk/iNLWYBRRRQAUUUUAFFFFABSGlpDQB7J+z1/yB9Y/6+Y//QTXqFeX/s9f8gfWP+vmP/0E16hWiA8a/aFGdW0of9MJP5rXJeFPGmu+HnVbW4M1twDbzZZce3cV137Qn/IX0r/rjJ/Na8wqXuB9CeEfHml67bI04NhcMcGOQ/KT7N0/lXXAjbkcgnsa+c/Dv/ILXP8Afaus0HxPqmkFUjl86Af8sZDkD6elUB7D3FeNeMP+Rr1L/r4avRNB8X6VqZWJ5DaXB/5Zy8A/Q9/88V514w58U6njGPtDd80AZlFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFAFTWP8AkF3P/XM1xy9TXY6x/wAgu5/65muOXqamQDq7j4If8j1H/wBe8n8q4eu3+CTY8dxLnBa3kC/XFJAe+msrxRodp4i0l9MvZJo4WdXLRMA3H1BrU/woq2B57/wqLwz/AM/mrfhNH/8AEUf8Ki8Mf8/mr/8Af6P/AON16FRSA89/4VF4Y/5/NX/7/R//ABuj/hUXhj/n81f/AL/R/wDxuvQqKLAee/8ACovDH/P5q/8A3+j/APjdH/CovDH/AD+av/3+j/8AjdehUUWA89/4VF4Y/wCfzV/+/wBH/wDG6P8AhUXhj/n81f8A7/R//G69CoosB57/AMKi8Mf8/mr/APf6P/43SH4ReGP+fzV/+/sf/wAbr0OigDB8HeFtO8LW1xBp0tzItw6u/nsrEEDHGFFb1FBpgeN/tCf8hfSv+uMn81rzCvTv2hP+QxpX/XGT+a15jUvcDp/Dn/IMX/fatOszw5/yDF/32rTpgIRkU0nc24nJ65p9JTAWiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigCprH/ILuf+uZrjl6mux1j/kF3P8A1zNccvU1MgHVY0y/u9L1GG/sZjDcQtuRh/Kq9FID0BPi34kVQDb6e5xyTGef1p3/AAt3xJ/z6ad/37b/AOKrz2ii7A9C/wCFu+JP+fTTv+/bf/FUf8Ld8Sf8+mnf9+2/+Krz2ii4HoX/AAt3xJ/z6ad/37b/AOKo/wCFu+JP+fTTv+/bf/FV57RRcD0L/hbviT/n007/AL9t/wDFUf8AC3fEn/Ppp3/ftv8A4qvPaKLgehf8Ld8Sf8+mnf8Aftv/AIqj/hbviT/n007/AL9t/wDFV57RRcD0L/hbviP/AJ9NP/79t/8AFVe0X4oa9ezyJJa2ACrkYjb/AOKry/vWv4W/4+5f9wU0wPT/APhP9Y/597T/AL4P+NB8f6x/z72n/fB/xrk6KoCXX7ybXboz6ntmbaABtwFHoPSuZvtCIBezbP8AsOeR9DXQUUrAZ2gRyRWCxyIUYM2QRWlSUtMAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKAKmrKW064UDJMZwK45O9d0wB6jPtVL+y7B2LG3XJ5ODipaA5Sius/snT/8An3H5mj+ydP8A+fcfmaVgOTorrP7J0/8A59x+Zo/snT/+fcfmaLAcnRXWf2Tp/wDz7j8zR/ZOn/8APuPzNFgOTorrP7J0/wD59x+Zo/snT/8An3H5miwHJ0V1n9k6f/z7j8zR/ZOn/wDPuPzNFgOTorrP7J0//n3H5mj+ydP/AOfcfmaLAcma1/CoP2qY7fl2DmtQ6Tp//PuB+NWLeCG3XZCioD6U0gJ6KKKoAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooASloooAKKKKACiiigAooooAKKKKACiiigAooooASilooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooA//2Q==';

    let latestTime = 0;
    let latestImg = noPreview;
    let latestRegion = cloudRegion;

    let abortCtrl = new AbortController();
    let timeoutId = setTimeout(() => abortCtrl.abort(), 3 * 1000);

    try {
        let imgUrl = `https://static-cdn.jtvnw.net/previews-ttv/live_user_${member.twitchName}-640x360.jpg?tt=${Date.now()}`;
        let res = await fetch(imgUrl, { signal: abortCtrl.signal });
        latestImg = (await res.buffer()).toString('base64');

        clearTimeout(timeoutId);

        let dateHeader = res.headers.get('date');
        latestTime = dateHeader ? Date.parse(dateHeader) : 0;
    } catch (err) {
        clearTimeout(timeoutId);
        functions.logger.warn("Fail to get the latest image.", err);
    }

    // 가장 최근 또는 유효한 썸네일 얻기.
    let results = await Promise.allSettled(jobs);
    for (let res of results) {
        if (res.status !== 'fulfilled' || !res.value) {
            continue;
        }

        let data = res.value;
        if ((data.time > latestTime || latestImg === noPreview) && data.img !== noPreview) {
            latestTime = data.time;
            latestImg = data.img;
            latestRegion = data.region;
        }
    }

    functions.logger.info("Getting latest preview success.", latestRegion, latestTime);

    return Buffer.from(latestImg, 'base64');
}

async function streamJob() {
    if (apiClient === null || bot === null || twitterClient === null) {
        functions.logger.warn("Twitch or Telegram or Twitter are not prepared!");
        return;
    }

    let jobs: Promise<any>[] = [];
    let prevFcmJob: Promise<void> | null = null;

    for (let member of members) {
        let stream = await apiClient.streams.getStreamByUserId(member.twitchId);
        let newData = {
            online: stream !== null,
            title: stream?.title ?? '',
            category: stream?.gameName ?? '',
        };
        if (stream === null) {
            let channel = await apiClient.channels.getChannelInfoById(member.twitchId);
            newData.title = channel?.title ?? '';
            newData.category = channel?.gameName ?? '';
        }

        let refStream = admin.database().ref('stream/' + member.id);
        let dbData = (await refStream.get()).val();

        let onlineChanged = (dbData.online !== newData.online);
        let titleChanged = (dbData.title !== newData.title);
        let categoryChanged = (dbData.category !== newData.category);

        // 뱅종인데 서버 오류일 수 있으니 시간 저장하여 추후 확인.
        let offTime = 0;
        if (onlineChanged && !newData.online) {
            try {
                let refOffTime = admin.database().ref('offtime/' + member.id);
                offTime = Date.now();
                await refOffTime.set(offTime);
            } catch (err) {
                functions.logger.error("Fail to set offline time.", member.id, err);
            }
        }

        // 사이트 표시용 DB 갱신.
        if (onlineChanged || titleChanged || categoryChanged) {
            let dbJob = refStream.set(newData)
                .then(() => functions.logger.info("Stream data updated."))
                .catch((err) => functions.logger.error("Fail to update the stream data.", err));
            jobs.push(dbJob);
        }

        // 뱅온 알림이 울릴 조건일 때 이전 뱅종 시간 대비 충분한 시간이 지나지 않았으면 알림을 울리지 않도록 함.
        const maxOffIgnoreTime = 90 * 1000;
        if (onlineChanged && newData.online) {
            try {
                let refOffTime = admin.database().ref('offtime/' + member.id);
                offTime = (await refOffTime.get()).val();
            } catch (err) {
                functions.logger.error("Fail to get offline time.", member.id, err);
            }

            let now = Date.now();
            if (now - offTime < maxOffIgnoreTime) {
                onlineChanged = false;
                functions.logger.info("Online notification is ignored.")
            }
        }

        // 방제, 카테고리가 짧은 시간 안에 이전 것으로 원복되었다 다시 원래대로 돌아오는 경우 알림 방지.
        if (titleChanged || categoryChanged) {
            let refPrev = admin.database().ref('prev/' + member.id);
            let prev = (await refPrev.get()).val();

            let now = Date.now();

            // 현재 DB의 정보를 이전 데이터로 저장.
            let newPrev = Object.assign({}, prev);
            newPrev.time = Object.assign({}, prev.time);
            if (titleChanged) {
                newPrev.title = dbData.title;
                newPrev.time.title = now;
            }
            if (categoryChanged) {
                newPrev.category = dbData.category;
                newPrev.time.category = now;
            }

            let dbJob = refPrev.set(newPrev)
                .then(() => functions.logger.info("Previous data updated."))
                .catch((err) => functions.logger.error("Fail to update the previous data.", err));
            jobs.push(dbJob);

            // 새로 받은 정보가 이전에 바뀌기 전과 같고 그렇게 바뀐지 얼마되지 않았으면 무시.
            const maxIgnoreTime = 12 * 1000;
            if (prev.title === newData.title && now - prev.time.title < maxIgnoreTime) {
                titleChanged = false;
                functions.logger.info("Title notification is ignored.");
            }
            if (prev.category === newData.category && now - prev.time.category < maxIgnoreTime) {
                categoryChanged = false;
                functions.logger.info("Category notification is ignored.");
            }
        }

        // 카테고리 변경의 경우 방종 상태에선 알리지 않을건데
        // 일시적 오류로 방종 인식된 경우 대응을 위해 마지막 방종 시간 얻어 확인.
        if (categoryChanged && !newData.online && offTime <= 0) {
            try {
                let refOffTime = admin.database().ref('offtime/' + member.id);
                offTime = (await refOffTime.get()).val();
            } catch (err) {
                functions.logger.error("Fail to get offline time.", member.id, err);
            }
        }

        // 알림 전송.
        // 단, 방종 및 방종 상태의 카테고리 변경은 알리지 않음.
        if ((onlineChanged && newData.online)
            || titleChanged
            || (categoryChanged && (newData.online || (Date.now() - offTime < maxOffIgnoreTime)))
        ) {
            // FCM 메시지 전송.
            //

            let message = {
                data: {
                    id: member.id,
                    online: String(newData.online),
                    title: newData.title,
                    category: newData.category,
                    onlineChanged: String(onlineChanged),
                    titleChanged: String(titleChanged),
                    categoryChanged: String(categoryChanged),
                },
                topic: member.id,
                webpush: {
                    headers: {
                        "TTL": "1200",
                        "Urgency": "high",
                    }
                }
            };

            // FCM 전송은 동시 실행되면 오류날 가능성이 높다고 함.
            if (prevFcmJob !== null) {
                await prevFcmJob;
            }

            prevFcmJob = admin.messaging().send(message)
                .then((res) => functions.logger.info("Messaging success.", message, res))
                .catch(async (err) => {
                    functions.logger.info("Messaging fail and will retry.", message, err);
                    const maxRetry = 2;
                    for (let retry = 1; retry <= maxRetry; retry++) {
                        try {
                            await new Promise((resolve) => setTimeout(resolve, 1000 * Math.pow(2, retry) + Math.random() * 500));
                            const res = await admin.messaging().send(message);
                            functions.logger.info("Messaging success.", message, res);
                            break;
                        } catch (err) {
                            if (retry >= maxRetry) {
                                functions.logger.warn("Messaging maybe fail.", message, err);
                            } else {
                                functions.logger.info("Messaging fail again and will retry.", message, err);
                            }
                        }
                    }
                });

            // 메시지 조합.
            //

            let titleInfo: string[] = [];
            if (onlineChanged) {
                titleInfo.push(newData.online ? "뱅온" : "뱅종");
            }
            if (titleChanged) {
                titleInfo.push("방제");
            }
            if (categoryChanged) {
                titleInfo.push("카테고리");
            }

            let msg = titleInfo.join(", ") + " 알림";
            if (titleChanged) {
                msg += '\n' + newData.title;
            }
            if (categoryChanged) {
                msg += '\n' + newData.category;
            }

            // 텔레그램 전송.
            //

            let telgMsg = msg;
            if (newData.online) {
                telgMsg += `\ntinyurl.com/${member.id}-twpre?t=${Date.now()}`;
            }

            let msgJob: Promise<any>= sendTelegram(bot, member.id, telgMsg)
                .catch((err) => functions.logger.error("Fail to send telegram.", err));
            jobs.push(msgJob);

            // 썸네일 얻고 나머지 플랫폼에 전송.
            let imgJob: Promise<Buffer | null> = Promise.resolve(null);
            if (newData.online) {
                imgJob = getLatestPreview(member)
            }
            msgJob = imgJob.then((imgBuff) => {
                let subJobs = [];

                // 트윗 전송.
                //

                // 중복 트윗 방지를 위해 시간 포함.
                let now = new Date();
                let utc = now.getTime() + (now.getTimezoneOffset() * 60000);
                now = new Date(utc + (3600000 * 9));

                msg = member.name + " " + msg + "\n#이세돌 #이세계아이돌 #" + member.name + " " + now.toLocaleTimeString('ko-KR');

                let subJob = sendTweet(twitterClient!, msg, imgBuff)
                    .catch((err) => functions.logger.error("Fail to send tweet.", err));
                subJobs.push(subJob);

                // 디스코드 웹훅 실행.
                //

                now = new Date();
                let refDiscord = admin.database().ref('discord/' + member.id);
                subJob = refDiscord.get().then(async (snapshot) => {
                    let previewImg = '';
                    if (newData.online && imgBuff) {
                        let defaultUrl = `https://static-cdn.jtvnw.net/previews-ttv/live_user_${member.twitchName}-640x360.jpg?tt=${Date.now()}`;
                        previewImg = await uploadImage(imgBuff, `${member.id}-${Date.now()}.jpg`) ?? defaultUrl;
                    }

                    let msgTitle = titleInfo.join(", ") + " 알림";
                    let msgContent = newData.title + '\n' + newData.category;

                    let discordJobs = [];
                    for (let key in snapshot.val()) {
                        let urlKey = key.replace('|', '/');
                        let discoJob = sendDiscord(urlKey, member, msgTitle, msgContent, previewImg, now)
                            .catch((err) => {
                                // 등록된 웹훅 호출에 특정 오류로 실패할 경우 DB에서 삭제.
                                if (err.code === Constants.APIErrors.UNKNOWN_WEBHOOK
                                    || err.code === Constants.APIErrors.INVALID_WEBHOOK_TOKEN
                                ) {
                                    let refHook = admin.database().ref('discord/' + member.id + '/' + key);
                                    return refHook.remove()
                                        .then(() => functions.logger.info("Remove an invalid webhook.", key))
                                        .catch((err) => functions.logger.error("Fail to remove an invalid webhook.", key, err));
                                } else {
                                    functions.logger.info("Fail to send discord and will retry.", key, err);

                                    return sendDiscord(urlKey, member, msgTitle, msgContent, previewImg, now)
                                        .catch((err) => functions.logger.error("Fail to send discord.", key, err));
                                }
                            });
                        discordJobs.push(discoJob);
                    }

                    await Promise.allSettled(discordJobs);
                });
                subJobs.push(subJob);

                return Promise.allSettled(subJobs);
            });
            jobs.push(msgJob);
        }
    }

    if (prevFcmJob !== null) {
        await prevFcmJob;
    }

    await Promise.allSettled(jobs);
}

exports.watchStreams = functions.region(cloudRegion).pubsub.schedule('every 1 minutes').onRun(async (context) => {
    let refTime = admin.database().ref('lasttime');
    let time = (await refTime.get()).val();
    let now = Date.now();

    // HTTP 함수인 updateStreams이 잘 해주고 있었을 경우엔 갱신 작업을 수행하지 않음.
    if (now - time < 30000) {
        return null;
    }

    await streamJob();

    await refTime.set(Date.now());

    return null;
});

exports.updateStreams = functions.region(cloudRegion).https.onRequest(async (req, res) => {
    // 뜻하지 않은 곳에서 요청이 올 경우 작업 방지.
    if (req.query.key !== httpKey) {
        functions.logger.info("Invalid query.", req.query);
        res.status(403).end();
        return;
    }

    await streamJob();

    let now = Date.now();
    let refTime = admin.database().ref('lasttime');
    await refTime.set(now);

    res.status(200).send('time:' + now);
});

exports.updateSub = functions.region(cloudRegion).database.ref('/users/{user}').onWrite(async (snapshot, context) => {
    let user = decodeFcmToken(context.params.user);

    let prevSubs = snapshot.before.val() ?? '';
    if (prevSubs === '') {
        prevSubs = [];
    } else {
        prevSubs = prevSubs.split(',');
    }

    let currSubs = snapshot.after.val() ?? '';
    if (currSubs === '') {
        currSubs = [];
    } else {
        currSubs = currSubs.split(',');
    }

    let subs = currSubs.filter((x: string) => !prevSubs.includes(x));
    let unsubs = prevSubs.filter((x: string) => !currSubs.includes(x));

    functions.logger.info("Update subs.", currSubs, user);

    let jobs = [];

    for (let id of subs) {
        let job = admin.messaging().subscribeToTopic(user, id)
            .then((res) => functions.logger.info("Subscribe success.", id, res))
            .catch((err) => functions.logger.error("Subscribe fail.", id, err));
        jobs.push(job);
    }
    for (let id of unsubs) {
        let job = admin.messaging().unsubscribeFromTopic(user, id)
            .then((res) => functions.logger.info("Unsubscribe success.", id, res))
            .catch((err) => functions.logger.error("Unsubscribe fail.", id, err));
        jobs.push(job);
    }

    await Promise.allSettled(jobs);

    return null;
});

exports.checkWebhook = functions.region(cloudRegion).database.ref('/discord/{member}/{webhook}').onCreate(async (snapshot, context) => {
    let memberId = context.params.member;
    let webhookKey = context.params.webhook;

    let member = members.find((data) => data.id === memberId);
    if (!member) {
        return null;
    }

    let msgTitle = "등록 알림";
    let msgContent = "정상적으로 등록되었습니다.";

    try {
        await sendDiscord(webhookKey.replace('|', '/'), member, msgTitle, msgContent, '', new Date());
        functions.logger.info("Webhook checked.", memberId, webhookKey);
    } catch (err: any) {
        // 등록된 웹훅 호출에 특정 오류로 실패할 경우 DB에서 삭제.
        if (err.code === Constants.APIErrors.UNKNOWN_WEBHOOK
            || err.code === Constants.APIErrors.INVALID_WEBHOOK_TOKEN
        ) {
            let refHook = admin.database().ref('discord/' + memberId + '/' + webhookKey);
            await refHook.remove()
                .then(() => functions.logger.info("Remove an invalid webhook.", memberId, webhookKey))
                .catch((err) => functions.logger.error("Fail to remove an invalid webhook.", memberId, webhookKey, err));
        } else {
            functions.logger.error("Fail to send welcome discord.", memberId, webhookKey, err);
        }
    }

    return null;
});

exports.checkTokens = functions.region(cloudRegion).pubsub.schedule('every monday 09:00').timeZone('Asia/Seoul').onRun(async (context) => {
    let refUsers = admin.database().ref('users');
    let users = (await refUsers.get()).val();
    
    let tokens = [];
    const maxTokens = 200;

    for (let userToken in users) {
        tokens.push(decodeFcmToken(userToken));
        if (tokens.length >= maxTokens) {
            await removeUnregisteredTokens(tokens);
            tokens = [];
        }
    }

    if (tokens.length > 0) {
        await removeUnregisteredTokens(tokens);
    }
});

for (let region of subRegions) {
    let suffix = region.replace('-', '');
    suffix = suffix.substring(0, 1).toUpperCase() + suffix.substring(1);

    exports[previewFuncName + suffix] = functions.region(region).https.onRequest(async (req, res) => {
        // 뜻하지 않은 곳에서 요청이 올 경우 작업 방지.
        if (req.query.key !== httpKey) {
            functions.logger.info("Invalid query.", req.query);
            res.status(403).end();
            return;
        }

        // 인스턴스 유지를 위한 핑 기능.
        if (req.query.ping) {
            res.status(200).end()
            return;
        }

        if (!req.query.name) {
            functions.logger.info("Invalid query.", req.query);
            res.status(403).end();
            return;
        }

        const name = req.query.name;

        let abortCtrl = new AbortController();
        let timeoutId = setTimeout(() => abortCtrl.abort(), 3 * 1000);

        try {
            let imgUrl = `https://static-cdn.jtvnw.net/previews-ttv/live_user_${name}-640x360.jpg?tt=${Date.now()}`;
            let imgRes = await fetch(imgUrl, { signal: abortCtrl.signal });
            let img = await imgRes.buffer();

            clearTimeout(timeoutId);

            let dateHeader = imgRes.headers.get('date');
            let time = dateHeader ? Date.parse(dateHeader) : 0;

            res.status(200).send({
                img: img.toString('base64'),
                time: time,
            });
        } catch (err) {
            functions.logger.warn("Fail to get an image.", err);
            res.status(200).send({});
        }

        clearTimeout(timeoutId);
    });
}
