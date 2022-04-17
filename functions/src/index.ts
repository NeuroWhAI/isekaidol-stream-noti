process.env.NTBA_FIX_319 = '1';

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { ClientCredentialsAuthProvider } from '@twurple/auth';
import { ApiClient } from '@twurple/api';

import TelegramBot = require('node-telegram-bot-api');

admin.initializeApp();

const clientId = process.env.TWITCH_ID;
const clientSecret = process.env.TWITCH_SEC;
const botToken = process.env.BOT_TOKEN;
const httpKey = process.env.HTTP_JOB_KEY;

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

const members = [
    { id: 'jururu', twitchId: 'cotton__123',  },
    { id: 'jingburger', twitchId: 'jingburger' },
    { id: 'viichan', twitchId: 'viichan6' },
    { id: 'gosegu', twitchId: 'gosegugosegu' },
    { id: 'lilpa', twitchId: 'lilpaaaaaa' },
    { id: 'ine', twitchId: 'vo_ine' },
    //{ id: 'wak', twitchId: 'woowakgood' },
];

async function sendTelegram(bot: TelegramBot, id: string, msg: string): Promise<void> {
    await bot.sendMessage('@' + id + '_stream_noti', msg, {
        disable_web_page_preview: true,
    });
}

async function streamJob() {
    if (apiClient === null || bot === null) {
        functions.logger.warn("Twitch or Telegram are not prepared!");
        return;
    }

    let jobs = [];

    for (let member of members) {
        let user = await apiClient.users.getUserByName(member.twitchId);
        if (user === null) continue;
        functions.logger.info("User : " + user.id);

        let stream = await apiClient.streams.getStreamByUserId(user.id);
        let newData = {
            online: stream !== null,
            title: stream?.title ?? '',
            category: stream?.gameName ?? '',
        };
        if (stream === null) {
            let channel = await apiClient.channels.getChannelInfo(user);
            newData.title = channel?.title ?? '';
            newData.category = channel?.gameName ?? '';
        }

        let refStream = admin.database().ref('stream/' + member.id);
        let dbData = (await refStream.get()).val();

        if (dbData.online !== newData.online
            || dbData.title !== newData.title
            || dbData.category !== newData.category
        ) {
            let dbJob = refStream.set(newData)
                .then(() => functions.logger.info("Stream data updated."))
                .catch((err) => functions.logger.error("Fail to update the stream data.", err));
            jobs.push(dbJob);

            // 방종은 알리지 않음.
            if (newData.online
                || dbData.title !== newData.title
                || dbData.category !== newData.category
            ) {
                let message = {
                    data: {
                        id: member.id,
                        online: String(newData.online),
                        title: newData.title,
                        category: newData.category,
                        onlineChanged: String(dbData.online !== newData.online),
                        titleChanged: String(dbData.title !== newData.title),
                        categoryChanged: String(dbData.category !== newData.category),
                    },
                    topic: member.id,
                    webpush: {
                        headers: {
                            TTL: '1200',
                        }
                    }
                };
                let msgJob = admin.messaging().send(message)
                    .then((res) => functions.logger.info("Messaging success.", message, res))
                    .catch((err) => functions.logger.error("Messaging fail.", message, err));
                jobs.push(msgJob);

                let titleInfo = [];
                if (dbData.online !== newData.online) {
                    titleInfo.push(newData.online ? "뱅온" : "뱅종");
                }
                if (dbData.title !== newData.title) {
                    titleInfo.push("방제");
                }
                if (dbData.category !== newData.category) {
                    titleInfo.push("카테고리");
                }
                let msg = titleInfo.join(", ") + " 알림";
                if (dbData.title !== newData.title) {
                    msg += '\n' + newData.title;
                }
                if (dbData.category !== newData.category) {
                    msg += '\n' + newData.category;
                }
                msgJob = sendTelegram(bot, member.id, msg);
                jobs.push(msgJob);
            }
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
