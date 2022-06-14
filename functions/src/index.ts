process.env.NTBA_FIX_319 = '1';

import fetch from 'node-fetch';
import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { ClientCredentialsAuthProvider } from '@twurple/auth';
import { ApiClient } from '@twurple/api';
import { TwitterApi } from 'twitter-api-v2';
import { HexColorString, MessageEmbed, WebhookClient, Constants } from 'discord.js';

import TelegramBot = require('node-telegram-bot-api');

admin.initializeApp();

const clientId = process.env.TWITCH_ID;
const clientSecret = process.env.TWITCH_SEC;
const botToken = process.env.BOT_TOKEN;
const httpKey = process.env.HTTP_JOB_KEY;
const twitterAppKey = process.env.TWITTER_APP_KEY;
const twitterAppSecret = process.env.TWITTER_APP_SECRET;
const twitterAccessToken = process.env.TWITTER_ACCESS_TOKEN;
const twitterAccessSecret = process.env.TWITTER_ACCESS_SECRET;
const imgUploadKey = process.env.IMG_UPLOAD_KEY;

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

async function sendTelegram(bot: TelegramBot, id: string, msg: string): Promise<void> {
    await bot.sendMessage('@' + id + '_stream_noti', msg, {
        disable_web_page_preview: true,
    });
}

async function sendTweet(client: TwitterApi, msg: string): Promise<void> {
    await client.v1.tweet(msg);
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

async function uploadImage(url: string): Promise<string> {
    try {
        const api = 'https://api.imgbb.com/1/upload';

        let res = await fetch(`${api}?key=${imgUploadKey}&image=${url}&expiration=15552000`);
        let data: any = await res.json();
        let imgUrl = data?.data?.url;

        if (imgUrl) {
            return imgUrl;
        }

        functions.logger.error("Fail to upload an image.", data);
    } catch (err) {
        functions.logger.error("Fail to upload an image.", err);
    }

    return url;
}

async function streamJob() {
    if (apiClient === null || bot === null || twitterClient === null) {
        functions.logger.warn("Twitch or Telegram or Twitter are not prepared!");
        return;
    }

    let jobs: Promise<any>[] = [];

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

            let msgJob: Promise<any> = admin.messaging().send(message)
                .then((res) => functions.logger.info("Messaging success.", message, res))
                .catch(async (err) => {
                    functions.logger.info("Messaging fail and will retry.", message, err);
                    const maxRetry = 3;
                    for (let retry = 1; retry <= maxRetry; retry++) {
                        try {
                            await new Promise((resolve) => setTimeout(resolve, 1000 * Math.pow(2, retry)));
                            const res = await admin.messaging().send(message);
                            functions.logger.info("Messaging success.", message, res);
                            break;
                        } catch (err) {
                            if (retry >= maxRetry) {
                                functions.logger.error("Messaging fail.", message, err);
                            } else {
                                functions.logger.info("Messaging fail again and will retry.", message, err);
                            }
                        }
                    }
                });
            jobs.push(msgJob);

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
            msgJob = sendTelegram(bot, member.id, msg)
                .catch((err) => functions.logger.error("Fail to send telegram.", err));
            jobs.push(msgJob);

            // 중복 트윗 방지를 위해 시간 포함.
            let now = new Date();
            let utc = now.getTime() + (now.getTimezoneOffset() * 60000);
            now = new Date(utc + (3600000 * 9));

            msg = member.name + " " + msg + "\n#이세돌 #이세계아이돌 #" + member.name + " " + now.toLocaleTimeString('ko-KR');
            msgJob = sendTweet(twitterClient, msg)
                .catch((err) => functions.logger.error("Fail to send tweet.", err));
            jobs.push(msgJob);

            // 디스코드 웹훅 실행.
            now = new Date();
            let refDiscord = admin.database().ref('discord/' + member.id);
            msgJob = refDiscord.get().then(async (snapshot) => {
                let previewImg = `https://static-cdn.jtvnw.net/previews-ttv/live_user_${member.twitchName}-640x360.jpg?tt=${Date.now()}`;
                previewImg = await uploadImage(previewImg);

                let msgTitle = titleInfo.join(", ") + " 알림";
                let msgContent = newData.title + '\n' + newData.category;

                let discordJobs = [];
                for (let key in snapshot.val()) {
                    let discoJob = sendDiscord(key.replace('|', '/'), member, msgTitle, msgContent, previewImg, now)
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
                                functions.logger.error("Fail to send discord.", key, err);
                            }
                            return Promise.resolve();
                        });
                    discordJobs.push(discoJob);
                }

                await Promise.allSettled(discordJobs);
            });
            jobs.push(msgJob);
        }
    }

    await Promise.allSettled(jobs);
}

exports.watchStreams = functions.pubsub.schedule('every 1 minutes').onRun(async (context) => {
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

exports.updateStreams = functions.https.onRequest(async (req, res) => {
    functions.logger.info("Query.", req.query);

    // 뜻하지 않은 곳에서 요청이 올 경우 작업 방지.
    if (req.query.key !== httpKey) {
        res.status(403).end();
        return;
    }

    await streamJob();

    let now = Date.now();
    let refTime = admin.database().ref('lasttime');
    await refTime.set(now);

    res.status(200).send('time:' + now);
});

exports.updateSub = functions.database.ref('/users/{user}').onWrite(async (snapshot, context) => {
    let user = context.params.user
        .replace(/!!!1!!!/g, '/')
        .replace(/!!!2!!!/g, '.')
        .replace(/!!!3!!!/g, '#')
        .replace(/!!!4!!!/g, '$')
        .replace(/!!!5!!!/g, '[')
        .replace(/!!!6!!!/g, ']');

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

exports.checkWebhook = functions.database.ref('/discord/{member}/{webhook}').onCreate(async (snapshot, context) => {
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
