process.env.NTBA_FIX_319 = '1';

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { ClientCredentialsAuthProvider } from '@twurple/auth';
import { ApiClient } from '@twurple/api';

import TelegramBot = require('node-telegram-bot-api');

admin.initializeApp();

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

exports.watchStreams = functions.pubsub.schedule('every 1 minutes').onRun(async (context) => {
    const clientId = process.env.TWITCH_ID;
    const clientSecret = process.env.TWITCH_SEC;
    const botToken = process.env.BOT_TOKEN;
    if (clientId === undefined || clientSecret === undefined || botToken === undefined) {
        functions.logger.error("Can't find required envs.");
        return null;
    }

    let jobs = [];

    const authProvider = new ClientCredentialsAuthProvider(clientId, clientSecret);
    const apiClient = new ApiClient({ authProvider });

    const bot = new TelegramBot(botToken);

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

    return null;
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
