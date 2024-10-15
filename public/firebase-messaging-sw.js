importScripts('https://www.gstatic.com/firebasejs/9.8.4/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.8.4/firebase-messaging-compat.js');

self.addEventListener('notificationclick', function(e) {
    const members = {
        'jururu': { tw: 'cotton__123', af: 'cotton1217', x: 'jururu_twitch' },
        'jingburger': { tw: 'jingburger', af: 'jingburger1', x: 'jing_burger' },
        'viichan': { tw: 'viichan6', af: 'viichan6', x: 'VIichan6' },
        'gosegu': { tw: 'gosegugosegu', af: 'gosegu2', x: 'gosegu486385' },
        'lilpa': { tw: 'lilpaaaaaa', af: 'lilpa0309', x: 'lilpa_official' },
        'ine': { tw: 'vo_ine', af: 'inehine', x: '' },
    };
    const tags = e.notification.tag.split(',');
    const id = tags[0];
    const type = tags.length > 1 ? tags[1] : null;
    if (!(id in members)) {
        e.notification.close();
        return;
    }
    let url = "https://www.twitch.tv/" + members[id].tw;
    if (type === 'space') {
        url = "https://twitter.com/" + members[id].x;
    } else if (type === 'afreeca') {
        url = "https://play.sooplive.co.kr/" + members[id].af;
    }

    e.notification.close();
    e.waitUntil(clients.matchAll({type: 'window'}).then((windowClients) => {
        for (var i = 0; i < windowClients.length; i++) {
            var client = windowClients[i];
            if (client.url === url && 'focus' in client) {
                return client.focus();
            }
        }
        if (clients.openWindow) {
            return clients.openWindow(url);
        }
    }));
});

const firebaseConfig = {
    apiKey: "AIzaSyDbKOeYwK8qAynN6oJxPinJP5_-z3Nqkp0",
    authDomain: "isekaidol-stream-noti.firebaseapp.com",
    projectId: "isekaidol-stream-noti",
    storageBucket: "isekaidol-stream-noti.appspot.com",
    messagingSenderId: "532310069194",
    appId: "1:532310069194:web:50a30481a66c0f0ca6c933",
    measurementId: "G-X5K1S90S8G"
};

const app = firebase.initializeApp(firebaseConfig);

const messaging = firebase.messaging(app);

messaging.onBackgroundMessage((payload) => {
    console.log('[firebase-messaging-sw.js] Received background message ', payload);

    const members = {
        'jururu': '주르르',
        'jingburger': '징버거',
        'viichan': '비챤',
        'gosegu': '고세구',
        'lilpa': '릴파',
        'ine': '아이네',
        //'wak': '우왁굳',
    };

    let data = payload.data;
    if (!('id' in data)) {
        return;
    }
    data.online = JSON.parse(data.online);
    data.onlineChanged = JSON.parse(data.onlineChanged);
    data.titleChanged = JSON.parse(data.titleChanged);
    data.categoryChanged = JSON.parse(data.categoryChanged);

    let titleInfo = [];
    if (data.onlineChanged) {
        if (data.type === 'space') {
            titleInfo.push(data.online ? "스페온" : "스페끝");
        } else {
            titleInfo.push(data.online ? "뱅온" : "뱅종");
        }
    }
    if (data.titleChanged) {
        titleInfo.push("방제");
    }
    if (data.categoryChanged) {
        titleInfo.push("카테고리");
    }
    let notiTitle = (data.online ? "🔴 " : "⚫ ");
    notiTitle += members[data.id] + " " + titleInfo.join(", ") + " 알림";

    let tag = data.id;
    if (data.type) {
        tag += "," + data.type;
    }

    const notiOptions = {
        body: data.title + "\n" + data.category,
        icon: '/image/' + data.id + '.png',
        badge: '/image/badge.png',
        tag,
    };

    return self.registration.showNotification(notiTitle, notiOptions);
});
