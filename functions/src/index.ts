import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { ClientCredentialsAuthProvider } from '@twurple/auth';
import { ApiClient } from '@twurple/api';

admin.initializeApp();

const members = [
    { id: 'jururu', name: 'cotton__123' },
    { id: 'jingburger', name: 'jingburger' },
    { id: 'viichan', name: 'viichan6' },
    { id: 'gosegu', name: 'gosegugosegu' },
    { id: 'lilpa', name: 'lilpaaaaaa' },
    { id: 'ine', name: 'vo_ine' },
];

//export const watchStreams = functions.https.onRequest(async (request, response) => {
exports.watchStreams = functions.pubsub.schedule('every 1 minutes').onRun(async (context) => {
    const clientId = process.env.TWITCH_ID;
    const clientSecret = process.env.TWITCH_SEC;
    if (clientId === undefined || clientSecret === undefined) {
        functions.logger.error("Can't find twitch app token.");
        return null;
    }

    let jobs = [];

    const authProvider = new ClientCredentialsAuthProvider(clientId, clientSecret);
    const apiClient = new ApiClient({ authProvider });

    for (let member of members) {
        let user = await apiClient.users.getUserByName(member.name);
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

            let message = {
                data: {
                    online: newData.online ? 'true' : 'false',
                    title: newData.title,
                    category: newData.category,
                },
                topic: member.id,
            };
            let msgJob = admin.messaging().send(message)
                .then((res) => functions.logger.info("Messaging success.", message, res))
                .catch((err) => functions.logger.error("Messaging fail.", message, err));
            jobs.push(msgJob);
        }
    }

    await Promise.allSettled(jobs);

    //response.send("Hello from Firebase!");
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
    let subs = snapshot.after.val();

    functions.logger.info("Update subs.", subs, user);

    let jobs = [];

    subs = subs.split(',');
    for (let id of subs) {
        let job = admin.messaging().subscribeToTopic(user, id)
            .then((res) => functions.logger.info("Subscribe success.", id, res))
            .catch((err) => functions.logger.error("Subscribe fail.", id, err));
        jobs.push(job);
    }
    for (let member of members) {
        if (subs.indexOf(member.id) < 0) {
            let job = admin.messaging().unsubscribeFromTopic(user, member.id)
                .then((res) => functions.logger.info("Unsubscribe success.", member.id, res))
                .catch((err) => functions.logger.error("Unsubscribe fail.", member.id, err));
            jobs.push(job);
        }
    }

    await Promise.allSettled(jobs);

    return null;
});
