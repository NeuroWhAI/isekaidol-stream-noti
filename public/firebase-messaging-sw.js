importScripts('https://www.gstatic.com/firebasejs/9.8.4/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.8.4/firebase-messaging-compat.js');

self.addEventListener('notificationclick', function(e) {
    const members = {
        'jururu': 'cotton__123',
        'jingburger': 'jingburger',
        'viichan': 'viichan6',
        'gosegu': 'gosegugosegu',
        'lilpa': 'lilpaaaaaa',
        'ine': 'vo_ine',
        //'wak': 'woowakgood',
    };
    const id = e.notification.tag;
    if (!(id in members)) {
        e.notification.close();
        return;
    }
    const url = "https://www.twitch.tv/" + members[id];

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
        titleInfo.push(data.online ? "뱅온" : "뱅종");
    }
    if (data.titleChanged) {
        titleInfo.push("방제");
    }
    if (data.categoryChanged) {
        titleInfo.push("카테고리");
    }
    let notiTitle = (data.online ? "🔴 " : "⚫ ");
    notiTitle += members[data.id] + " " + titleInfo.join(", ") + " 알림";

    const notiOptions = {
        body: data.title + "\n" + data.category,
        icon: '/image/' + data.id + '.png',
        badge: '/image/badge.png',
        tag: data.id,
    };

    return self.registration.showNotification(notiTitle, notiOptions);
});
