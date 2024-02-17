process.env.NTBA_FIX_319 = '1';

import fetch from 'node-fetch';
import { AbortController } from "node-abort-controller";
import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { EUploadMimeType, TwitterApi } from 'twitter-api-v2';
import { HexColorString, MessageEmbed, WebhookClient, Constants } from 'discord.js';

import TelegramBot = require('node-telegram-bot-api');

admin.initializeApp();

const cloudRegion = 'asia-northeast3';

const botToken = process.env.BOT_TOKEN;
const httpKey = process.env.HTTP_JOB_KEY;
const twitterAppKey = process.env.TWITTER_APP_KEY;
const twitterAppSecret = process.env.TWITTER_APP_SECRET;
const twitterAccessToken = process.env.TWITTER_ACCESS_TOKEN;
const twitterAccessSecret = process.env.TWITTER_ACCESS_SECRET;

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
    afreecaId: string,
    color: HexColorString,
}
const members: MemberData[] = [
    { id: 'jururu', name: '주르르', afreecaId: 'cotton1217', color: '#ffacac' },
    { id: 'jingburger', name: '징버거', afreecaId: 'jingburger1', color: '#f0a957' },
    { id: 'viichan', name: '비챤', afreecaId: 'viichan6', color: '#85ac20' },
    { id: 'gosegu', name: '고세구', afreecaId: 'gosegu2', color: '#467ec6' },
    { id: 'lilpa', name: '릴파', afreecaId: 'lilpa0309', color: '#3e52d9' },
    { id: 'ine', name: '아이네', afreecaId: 'inehine', color: '#8a2be2' },
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
        let response = await admin.messaging().sendEachForMulticast(msg, true);
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

async function sendTelegram(bot: TelegramBot, id: string, msg: string, imgBuff: Buffer | null): Promise<void> {
    const chatId = '@' + id + '_stream_noti';
    if (imgBuff) {
        try {
            await bot.sendPhoto(chatId, imgBuff, { caption: msg });
        } catch (err) {
            functions.logger.error("Fail to send a telegram photo message.", err);
            await bot.sendMessage(chatId, msg);
        }
    } else {
        await bot.sendMessage(chatId, msg);
    }
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

    if (imageId) {
        await client.v2.tweet({ text: msg, media: { media_ids: [imageId] } });
    } else {
        await client.v2.tweet({ text: msg });
    }
}

async function sendDiscord(urlKey: string, member: MemberData, msgTitle: string, msgContent: string, msgUrl: string, msgImg: string, timestamp: Date): Promise<void> {
    let webhookClient = new WebhookClient({ url: 'https://discord.com/api/webhooks/' + urlKey });

    let embed = new MessageEmbed()
        .setTitle(msgTitle)
        .setColor(member.color)
        .setDescription(msgContent)
        .setTimestamp(timestamp);
    
    if (msgUrl) {
        embed = embed.setURL(msgUrl);
    }
    if (msgImg) {
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

async function getAfreecaPreview(broadNo: string): Promise<Buffer | null> {
    let imgBuff = null;

    let now = Date.now();
    let imgUrls = [
        `https://liveimg.afreecatv.com/${broadNo}.jpg?${now}`,
        `https://liveimg.afreecatv.com/m/${broadNo}.jpg?${now}`,
        `https://liveimg.afreecatv.com/h/${broadNo}.jpg?${now}`,
        `https://liveimg.afreecatv.com/${broadNo}?${now}`,
    ];

    let abortCtrl = new AbortController();
    let timeoutId = setTimeout(() => abortCtrl.abort(), imgUrls.length * 1000);

    try {
        for (let i = 0; i < imgUrls.length; i++) {
            let imgUrl = imgUrls[i];
            let res = await fetch(imgUrl, { signal: abortCtrl.signal });

            if (res.ok) {
                imgBuff = await res.buffer();
                functions.logger.info("Getting a preview success.");
                break;
            } else {
                functions.logger.error("Fail to get a preview image.", res.status);
                if (i < imgUrls.length - 1) {
                    await new Promise((resolve) => setTimeout(resolve, 800));
                }
            }
        }
    } catch (err) {
        functions.logger.error("Fail to get a preview image.", err);
    }

    clearTimeout(timeoutId);

    return imgBuff;
}

let broadCategoryCache: string;

async function getAfreecaCategoryName(categoryNo: string): Promise<string> {
    let data = broadCategoryCache;
    if (!data) {
        const res = await fetch('https://live.afreecatv.com/script/locale/ko_KR/broad_category.js');
        data = await res.text();
    }
    
    let endIdx = data.indexOf(`"${categoryNo}"`);
    if (endIdx < 0) {
        return '';
    }
    const startWord = `"cate_name"`;
    let startIdx = data.lastIndexOf(startWord, endIdx);
    if (startIdx < 0) {
        return '';
    }

    startIdx = data.indexOf('"', startIdx + startWord.length);
    if (startIdx < 0) {
        return '';
    }

    endIdx = data.indexOf('"', startIdx + 1);
    if (endIdx < 0) {
        return '';
    }

    const name = data.substring(startIdx + 1, endIdx);
    // 이름이 너무 길면 비정상 상태로 판단.
    if (name.length > 50) {
        return '';
    }
    return name;
}

type AfreecaLiveOn = { online: true, title: string, category: string, broadNo: string, locked: boolean, copyrighted: boolean };
type AfreecaLiveOff = { online: false };

async function fetchAfreecaLive(afreecaId: string): Promise<AfreecaLiveOn | AfreecaLiveOff> {
    const res = await fetch('https://live.afreecatv.com/afreeca/player_live_api.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'bid=' + afreecaId,
    });
    const data = await res.json();
    const chan = data.CHANNEL;
    if (!chan) {
        throw new Error('No channel for ' + afreecaId);
    }

    if (chan.RESULT < 0) {
        const res = await fetch(`https://bjapi.afreecatv.com/api/${afreecaId}/station`, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36' },
        });
        const data = await res.json();
        const broad = data.broad;
        if (broad) {
            return {
                online: true,
                title: broad.broad_title ?? '',
                category: '알수없음',
                broadNo: (broad.broad_no != null) ? `${broad.broad_no}` : '',
                locked: !!broad.is_password,
                copyrighted: true,
            };
        }
    }

    let category = '';
    if (chan.CATE) {
        try {
            category = await getAfreecaCategoryName(chan.CATE);
        } catch (err) {
            functions.logger.error("Fail to get category name.", chan.CATE, err);
        }
    }

    if (chan.RESULT === 1) {
        return {
            online: true,
            title: chan.TITLE ?? '',
            category: category,
            broadNo: chan.BNO ?? '',
            locked: chan.BPWD === 'Y',
            copyrighted: false,
        };
    }

    return { online: false };
}

async function afreecaJob() {
    if (bot === null || twitterClient === null) {
        functions.logger.warn("Telegram or Twitter are not prepared!");
        return;
    }

    let jobs: Promise<any>[] = [];
    let prevFcmJob: Promise<void> | null = null;

    for (const member of members) {
        const live = await fetchAfreecaLive(member.afreecaId);
        let newData = {
            online: live.online && !live.locked,
            title: live.online ? live.title : '',
            category: live.online ? live.category : '',
        };

        let refStream = admin.database().ref('afreeca/' + member.id);
        let dbData = (await refStream.get()).val();

        if (!dbData) {
            let dbJob = refStream.set(newData)
                .then(() => functions.logger.info("Stream data updated.", newData))
                .catch((err) => functions.logger.error("Fail to update the stream data.", err));
            jobs.push(dbJob);
            continue;
        }

        if (!live.online) {
            newData.title = dbData.title ?? '';
            newData.category = dbData.category ?? '';
        }

        let onlineChanged = (dbData.online !== newData.online);
        let titleChanged = (dbData.title !== newData.title);
        let categoryChanged = (dbData.category !== newData.category);

        // 뱅종일 경우 뱅종 시간 저장.
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
                .then(() => functions.logger.info("Stream data updated.", newData))
                .catch((err) => functions.logger.error("Fail to update the stream data.", err));
            jobs.push(dbJob);
        }

        // 이전 방제, 카테고리 및 변경 시간 기록.
        if (titleChanged || categoryChanged) {
            let refPrev = admin.database().ref('afreeca-prev/' + member.id);
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
                .then(() => functions.logger.info("Previous afreeca data updated."))
                .catch((err) => functions.logger.error("Fail to update the previous afreeca data.", err));
            jobs.push(dbJob);
        }

        // 뱅온 알림이 울릴 조건일 때 이전 뱅종 시간 대비 충분한 시간이 지나지 않았으면 알림을 울리지 않도록 함.
        if (onlineChanged && newData.online) {
            if (offTime <= 0) {
                try {
                    let refOffTime = admin.database().ref('offtime/' + member.id);
                    offTime = (await refOffTime.get()).val();
                } catch (err) {
                    functions.logger.error("Fail to get offline time.", member.id, err);
                }
            }

            const maxOffIgnoreTime = 90 * 1000;
            if (Date.now() - offTime < maxOffIgnoreTime) {
                onlineChanged = false;
                functions.logger.info("Keep stream status online.")
            }
        }

        // 알림 전송.
        // 단, 방종 및 방종 상태의 카테고리 변경은 알리지 않음.
        if ((onlineChanged && newData.online) || titleChanged || (categoryChanged && newData.online)) {
            // FCM 메시지 전송.
            //

            let message = {
                data: {
                    type: 'afreeca',
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

            // 썸네일 얻고 나머지 플랫폼에 전송.
            let imgJob: Promise<Buffer | null> = Promise.resolve(null);
            if (live.online && !live.copyrighted) {
                imgJob = getAfreecaPreview(live.broadNo);
            }
            let msgJob = imgJob.then((imgBuff) => {
                let subJobs = [];

                // 텔레그램 전송.
                //

                let telgMsg = (newData.online ? "🔴 " : "⚫ ") + msg;
                let subJob = sendTelegram(bot!, member.id, telgMsg, imgBuff)
                    .catch((err) => functions.logger.error("Fail to send telegram.", err));
                subJobs.push(subJob);

                // 트윗 전송.
                //

                // 중복 트윗 방지를 위해 시간 포함.
                let now = new Date();
                let utc = now.getTime() + (now.getTimezoneOffset() * 60000);
                now = new Date(utc + (3600000 * 9));

                let tweetHead = (newData.online ? "🔴 " : "⚫ ") + member.name + ' ';
                let tweetTail = "\n#이세돌 #이세계아이돌 #" + member.name + ' ' + now.toLocaleTimeString('ko-KR');
                let tweetOverLen = tweetHead.length + tweetTail.length + msg.length - 140;
                if (tweetOverLen > 0) {
                    msg = msg.substring(0, Math.max(msg.length - tweetOverLen - 1, 0)) + '…';
                }
                msg = tweetHead + msg + tweetTail;

                subJob = sendTweet(twitterClient!, msg, imgBuff)
                    .catch((err) => functions.logger.error("Fail to send tweet.", err));
                subJobs.push(subJob);

                // 디스코드 웹훅 실행.
                //

                now = new Date();
                let refDiscord = admin.database().ref('discord/' + member.id);
                subJob = refDiscord.get().then(async (snapshot) => {
                    let previewImg = '';
                    if (live.online && imgBuff) {
                        let defaultUrl = `https://liveimg.afreecatv.com/${live.broadNo}?t=${Date.now()}`;
                        previewImg = await uploadImage(imgBuff, `${member.id}-${Date.now()}.jpg`) ?? defaultUrl;
                    }

                    let msgTitle = (newData.online ? "🔴 " : "⚫ ") + titleInfo.join(", ") + " 알림";
                    let msgContent = newData.title + '\n' + newData.category;
                    let msgUrl = 'https://play.afreecatv.com/' + member.afreecaId;

                    let discordJobs = [];
                    for (let key in snapshot.val()) {
                        let urlKey = key.replace('|', '/');
                        let discoJob = sendDiscord(urlKey, member, msgTitle, msgContent, msgUrl, previewImg, now)
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

                                    return sendDiscord(urlKey, member, msgTitle, msgContent, msgUrl, previewImg, now)
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

    await afreecaJob();

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

    await afreecaJob();

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
        await sendDiscord(webhookKey.replace('|', '/'), member, msgTitle, msgContent, '', '', new Date());
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
