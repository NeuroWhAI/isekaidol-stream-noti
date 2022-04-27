import * as Sentry from '@sentry/browser';
import { initializeApp } from "firebase/app";
import { getMessaging } from "firebase/messaging";
import { getDatabase } from "firebase/database";
import { getAnalytics } from "firebase/analytics";

const firebaseConfig = {
    apiKey: "AIzaSyDbKOeYwK8qAynN6oJxPinJP5_-z3Nqkp0",
    authDomain: "isekaidol-stream-noti.firebaseapp.com",
    projectId: "isekaidol-stream-noti",
    storageBucket: "isekaidol-stream-noti.appspot.com",
    messagingSenderId: "532310069194",
    appId: "1:532310069194:web:50a30481a66c0f0ca6c933",
    measurementId: "G-X5K1S90S8G"
};

function tryOrNull<T>(job: () => T): T | null {
    try {
        return job();
    } catch (e) {
        console.log(e);
        return null;
    }
}

const app = initializeApp(firebaseConfig);

const messaging = tryOrNull(() => getMessaging(app));
const database = tryOrNull(() => getDatabase(app, "https://isekaidol-stream-noti-default-rtdb.asia-southeast1.firebasedatabase.app/"));
const analytics = tryOrNull(() => getAnalytics(app));

export { messaging, database, analytics };
