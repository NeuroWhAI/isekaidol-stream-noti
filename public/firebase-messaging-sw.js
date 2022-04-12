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

    const notificationTitle = 'Background Message Title';
    const notificationOptions = {
        body: 'Background Message body.',
        icon: '/favicon.png'
    };

    self.registration.showNotification(notificationTitle, notificationOptions);
});
