importScripts('https://www.gstatic.com/firebasejs/9.6.10/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.6.10/firebase-messaging-compat.js');

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
    };

    let data = payload.data;
    if (!('id' in data)) {
        return;
    }
    data.online = JSON.parse(data.online);
    data.onlineChanged = JSON.parse(data.onlineChanged);
    data.titleChanged = JSON.parse(data.titleChanged);
    data.categoryChanged = JSON.parse(data.categoryChanged);

    let notiTitle = members[data.id];
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
    notiTitle += " " + titleInfo.join(", ") + " 알림";

    const notiOptions = {
        body: data.title + "\n" + data.category,
        icon: '/image/' + data.id + '.png',
    };

    self.registration.showNotification(notiTitle, notiOptions);
});
