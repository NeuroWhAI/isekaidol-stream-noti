import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { ClientCredentialsAuthProvider } from '@twurple/auth';
import { ApiClient } from '@twurple/api';

admin.initializeApp();

//export const watchStreams = functions.https.onRequest(async (request, response) => {
exports.watchStreams = functions.pubsub.schedule('every 1 minutes').onRun(async (context) => {
    const clientId = process.env.TWITCH_ID;
    const clientSecret = process.env.TWITCH_SEC;
    if (clientId === undefined || clientSecret === undefined) {
        functions.logger.error("Can't find twitch app token.");
        return null;
    }

    const authProvider = new ClientCredentialsAuthProvider(clientId, clientSecret);
    const apiClient = new ApiClient({ authProvider });

    const members = [
        { id: 'jururu', name: 'cotton__123' },
        { id: 'jingburger', name: 'jingburger' },
        { id: 'viichan', name: 'viichan6' },
        { id: 'gosegu', name: 'gosegugosegu' },
        { id: 'lilpa', name: 'lilpaaaaaa' },
        { id: 'ine', name: 'vo_ine' },
    ];

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
            refStream.set(newData)
                .then(() => functions.logger.info("Stream data updated."))
                .catch((err) => functions.logger.error("Fail to update the stream data. " + err));
        }
    }

    //response.send("Hello from Firebase!");
    return null;
});
