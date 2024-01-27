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
    afreecaId: string,
    color: HexColorString,
}
const members: MemberData[] = [
    { id: 'jururu', name: '주르르', twitchId: '203667951', twitchName: 'cotton__123', afreecaId: 'cotton1217', color: '#ffacac' },
    { id: 'jingburger', name: '징버거', twitchId: '237570548', twitchName: 'jingburger', afreecaId: 'jingburger1', color: '#f0a957' },
    { id: 'viichan', name: '비챤', twitchId: '195641865', twitchName: 'viichan6', afreecaId: 'viichan6', color: '#85ac20' },
    { id: 'gosegu', name: '고세구', twitchId: '707328484', twitchName: 'gosegugosegu', afreecaId: 'gosegu2', color: '#467ec6' },
    { id: 'lilpa', name: '릴파', twitchId: '169700336', twitchName: 'lilpaaaaaa', afreecaId: 'lilpa0309', color: '#3e52d9' },
    { id: 'ine', name: '아이네', twitchId: '702754423', twitchName: 'vo_ine', afreecaId: 'inehine', color: '#8a2be2' },
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
        await client.v2.tweet({ text: msg, media: { media_ids: [imageId] } });
    } else {
        await client.v2.tweet({ text: msg });
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

async function getLatestPreview(member: MemberData, stage: number): Promise<Buffer | null> {
    let abortCtrl = new AbortController();
    let timeoutId = setTimeout(() => abortCtrl.abort(), 4 * 1000);

    let imgBuff = null;

    try {
        let sizeList = [[1920, 1080], [1280, 720], [640, 360]];
        for (let origSize of sizeList) {
            let size = `${origSize[0] + stage * 2}x${origSize[1] + stage}`;
            let imgUrl = `https://static-cdn.jtvnw.net/previews-ttv/live_user_${member.twitchName}-${size}.jpg?tt=${Date.now()}`;
            let res = await fetch(imgUrl, { signal: abortCtrl.signal });

            // max-age 값이 일정 값 이상이면 썸네일이 없는 것으로 보고 다른 해상도의 썸네일 얻기 시도.
            let cacheCtrl = res.headers.get('cache-control');
            let maxCacheAge = cacheCtrl?.includes('max-age=') ? parseInt(cacheCtrl.split('=')[1]) : -1;
            if (maxCacheAge > 400) {
                functions.logger.info("Ignore a default preview.", size, maxCacheAge);
                continue;
            }

            imgBuff = await res.buffer();

            functions.logger.info("Getting a preview success.", size);
            break;
        }

        if (imgBuff === null) {
            functions.logger.error("Fail to get a preview image.");
        }
    } catch (err) {
        functions.logger.error("Fail to get a preview image.", err);
    }

    clearTimeout(timeoutId);

    return imgBuff;
}

async function getAfreecaPreview(broadNo: string): Promise<Buffer | null> {
    let abortCtrl = new AbortController();
    let timeoutId = setTimeout(() => abortCtrl.abort(), 4 * 1000);

    let imgBuff = null;

    try {
        let imgUrl = `https://liveimg.afreecatv.com/${broadNo}?tt=${Date.now()}`;
        let res = await fetch(imgUrl, { signal: abortCtrl.signal });
        imgBuff = await res.buffer();

        functions.logger.info("Getting a preview success.");
    } catch (err) {
        functions.logger.error("Fail to get a preview image.", err);
    }

    clearTimeout(timeoutId);

    return imgBuff;
}

// TODO: 트위치 제거.
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
                .then(() => functions.logger.info("Stream data updated.", newData))
                .catch((err) => functions.logger.error("Fail to update the stream data.", err));
            jobs.push(dbJob);
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

        // 뱅온 알림이 울릴 조건일 때 이전 뱅종 시간 대비 충분한 시간이 지나지 않았으면 알림을 울리지 않도록 함.
        // 또는 뱅종 상태인데 제목, 카테고리가 변경된 경우 뱅종 이후 일정 시간이 지나지 않았다면 뱅온 상태인 것으로 봄.
        if((onlineChanged && newData.online) || (!newData.online && (titleChanged || categoryChanged))) {
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
                newData.online = true;
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
                    type: 'twitch',
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

            // 최신 썸네일을 얻기 위한 오프셋 값 얻고 갱신.
            //

            let stage = 1;
            if (newData.online) {
                let refStage = admin.database().ref('preview/' + member.id);
                stage = (await refStage.get()).val();

                let nextStage = 0;
                if (stage === 1) {
                    nextStage = 2;
                } else if (stage === 2) {
                    nextStage = -2;
                } else if (stage === -2) {
                    nextStage = -1;
                } else {
                    nextStage = 1;
                }

                let stageJob = refStage.set(nextStage);
                jobs.push(stageJob);
            }

            // 텔레그램 전송.
            //

            let telgMsg = (newData.online ? "🔴 " : "⚫ ") + msg;
            if (newData.online) {
                telgMsg += `\ntinyurl.com/${member.id}-twpre${stage}?t=${Date.now()}`;
            }

            let msgJob: Promise<any> = sendTelegram(bot, member.id, telgMsg)
                .catch((err) => functions.logger.error("Fail to send telegram.", err));
            jobs.push(msgJob);

            // 썸네일 얻고 나머지 플랫폼에 전송.
            let imgJob: Promise<Buffer | null> = Promise.resolve(null);
            if (newData.online) {
                imgJob = getLatestPreview(member, stage);
            }
            msgJob = imgJob.then((imgBuff) => {
                let subJobs = [];

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

                    let msgTitle = (newData.online ? "🔴 " : "⚫ ") + titleInfo.join(", ") + " 알림";
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

type AfreecaLiveOn = { online: true, title: string, category: string, broadNo: string };
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
        };
    }

    return { online: false };
}

async function afreecaJob() {
    if (bot === null || twitterClient === null) {
        functions.logger.warn("Telegram or Twitter are not prepared!");
        return;
    }

    // TODO: 테스트용 멤버이며 추후 삭제하여 전역 members 참조.
    const members: MemberData[] = [
        { id: 'roent', name: '뢴트게늄', twitchId: '', twitchName: '', afreecaId: 'jey422', color: '#ff69b4' },
        { id: 'mawang', name: '마왕', twitchId: '', twitchName: '', afreecaId: 'mawang0216', color: '#2eccfa' },
    ];

    let jobs: Promise<any>[] = [];
    let prevFcmJob: Promise<void> | null = null;

    for (const member of members) {
        const live = await fetchAfreecaLive(member.afreecaId);
        let newData = {
            online: live.online,
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

        if (!newData.online) {
            newData.title = dbData.title ?? '';
            newData.category = dbData.category ?? '';
        }

        let onlineChanged = (dbData.online !== newData.online);
        let titleChanged = (newData.online && dbData.title !== newData.title);
        let categoryChanged = (newData.online && dbData.category !== newData.category);

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

        // 알림 전송.
        // 단, 방종 상태에선 전부 알리지 않음.
        if (newData.online && (onlineChanged || titleChanged || categoryChanged)) {
            // FCM 메시지 전송.
            //

            // TODO: 주석 삭제.
            // let message = {
            //     data: {
            //         type: 'afreeca',
            //         id: member.id,
            //         online: String(newData.online),
            //         title: newData.title,
            //         category: newData.category,
            //         onlineChanged: String(onlineChanged),
            //         titleChanged: String(titleChanged),
            //         categoryChanged: String(categoryChanged),
            //     },
            //     topic: member.id,
            //     webpush: {
            //         headers: {
            //             "TTL": "1200",
            //             "Urgency": "high",
            //         }
            //     }
            // };

            // FCM 전송은 동시 실행되면 오류날 가능성이 높다고 함.
            if (prevFcmJob !== null) {
                await prevFcmJob;
            }

            // TODO: 주석 제거하여 FCM 전송.
            // prevFcmJob = admin.messaging().send(message)
            //     .then((res) => functions.logger.info("Messaging success.", message, res))
            //     .catch(async (err) => {
            //         functions.logger.info("Messaging fail and will retry.", message, err);
            //         const maxRetry = 2;
            //         for (let retry = 1; retry <= maxRetry; retry++) {
            //             try {
            //                 await new Promise((resolve) => setTimeout(resolve, 1000 * Math.pow(2, retry) + Math.random() * 500));
            //                 const res = await admin.messaging().send(message);
            //                 functions.logger.info("Messaging success.", message, res);
            //                 break;
            //             } catch (err) {
            //                 if (retry >= maxRetry) {
            //                     functions.logger.warn("Messaging maybe fail.", message, err);
            //                 } else {
            //                     functions.logger.info("Messaging fail again and will retry.", message, err);
            //                 }
            //             }
            //         }
            //     });

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

            let telgMsg = (newData.online ? "🔴 " : "⚫ ") + msg;
            if (live.online) {
                telgMsg += `\nhttps://liveimg.afreecatv.com/${live.broadNo}?t=${Date.now()}`;
            }

            let msgJob: Promise<any> = sendTelegram(bot, member.id, telgMsg)
                .catch((err) => functions.logger.error("Fail to send telegram.", err));
            jobs.push(msgJob);

            // 썸네일 얻고 나머지 플랫폼에 전송.
            let imgJob: Promise<Buffer | null> = Promise.resolve(null);
            if (live.online) {
                imgJob = getAfreecaPreview(live.broadNo);
            }
            msgJob = imgJob.then((imgBuff) => {
                let subJobs = [];

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

                // TODO: 주석 제거하여 트윗 전송되도록 함.
                let subJob/* = sendTweet(twitterClient!, msg, imgBuff)
                    .catch((err) => functions.logger.error("Fail to send tweet.", err));
                subJobs.push(subJob);*/

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

    await Promise.allSettled([streamJob(), afreecaJob()]);

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

    await Promise.allSettled([streamJob(), afreecaJob()]);

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
