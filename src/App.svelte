<script lang="ts">
    import * as Sentry from '@sentry/browser';
    import { Headline, Subhead, Button, Modal, Dialog } from 'attractions';
    import { HelpCircleIcon } from 'svelte-feather-icons';

    import * as FireDb from "firebase/database";
    import * as FireMsg from "firebase/messaging";

    import MemberCard from './components/MemberCard.svelte';
    import HelpContent from './components/HelpContent.svelte';

    import { messaging, database } from './server';
    import members from './data/members';

    const memberIds = Object.keys(members);

    const localDbKeyPrefix = 'isekaidol-stream-noti-neurowhai-';
    const localDbKeys = {
        prevToken: localDbKeyPrefix + 'prev-token',
    };
    for (let id in members) {
        localDbKeys[id] = localDbKeyPrefix + 'member-' + id;
    }

    // Local Storage 사용 가능한지 확인.
    let storageAvailable = true;
    try {
        if (window.localStorage) {
            const testKey = localDbKeyPrefix + "db-test";
            localStorage.setItem(testKey, "test");
            localStorage.removeItem(testKey);
        } else {
            storageAvailable = false;
        }
    } catch (e) {
        storageAvailable = false;
    }

    let streamData = {};
    for (let id in members) {
        streamData[id] = {
            category: "",
            online: false,
            title: "불러오는 중..."
        };
    }

    let configLoadings = [];
    for (let id in members) {
        configLoadings[id] = false;
    }

    // 방송 정보가 바뀌면 받아서 갱신.
    FireDb.onValue(FireDb.ref(database, 'stream'), (snapshot) => {
        streamData = snapshot.val();
        console.log(streamData);
    });

    let configAvailable = true;
    let msgToken = '';

    if (storageAvailable) {
        let prevToken = localStorage.getItem(localDbKeys.prevToken);
        if (prevToken) {
            Sentry.setUser({ id: prevToken });
        }
    }

    if ('Notification' in window && messaging !== null) {
        // 이미 알림 권한이 있을 경우에만 즉시 토큰 확인.
        if (Notification.permission === 'granted') {
            for (let id in members) {
                configLoadings[id] = true;
            }
            checkAndRequestNotiToken()
                .finally(() => {
                    for (let id in members) {
                        configLoadings[id] = false;
                    }
                })
        } else if (Notification.permission === 'denied') {
            configAvailable = false;
        }
    } else {
        configAvailable = false;
    }

    async function checkAndRequestNotiToken(): Promise<boolean> {
        // 메시징 지원 여부 확인.
        if (messaging === null) {
            configAvailable = false;
            return false;
        }
        // 유저가 권한을 아예 거부했으면 요청하지 않음.
        if (Notification.permission === 'denied') {
            configAvailable = false;
            return false;
        }
        // 이미 토큰을 받았으면 요청 불필요.
        if (msgToken !== '') {
            configAvailable = true;
            return true;
        }

        if (Notification.permission !== 'granted') {
            let result = await Notification.requestPermission();
            if (result === 'granted') {
                return await checkAndRequestNotiToken();
            } else {
                configAvailable = false;
                return false;
            }
        } else {
            // 중복 요청 방지.
            if (!configAvailable) {
                return false;
            }
            configAvailable = false;

            let currentToken = null;
            const vapidKey = 'BET0ZjPDIvaVd0PN76845lHEujw5_18DgtyNMyKiw3TkSWtMtSqR4ohORWsrlX-DrmWCRy3rAloywV_i_RZJtzs';
            try {
                currentToken = await FireMsg.getToken(messaging, { vapidKey: vapidKey });
            } catch (e) {
                console.log("Fail to get the FCM token and will retry.");
                try {
                    currentToken = await FireMsg.getToken(messaging, { vapidKey: vapidKey });
                } catch (e) {
                    Sentry.captureException(e);
                }
            }
            if (currentToken) {
                // 토큰 발급됨.
                if (storageAvailable) {
                    let prevToken = localStorage.getItem(localDbKeys.prevToken);

                    msgToken = currentToken;
                    localStorage.setItem(localDbKeys.prevToken, currentToken);

                    if (prevToken !== null && prevToken !== currentToken) {
                        // 이전 토큰이 있고 비교해서 다르면 로컬 구독 정보를 다시 전송.
                        console.log("Update registration token.")
                        sendSubscription(currentToken)
                            .catch(() => {
                                Sentry.captureMessage("Fail to update registration token");
                                alert("구독 갱신에 실패하였습니다.");
                            });
                    } else if (prevToken === null) {
                        // 이전 토큰이 없다는 건 캐시가 날아갔을 가능성이 있으니 DB에서 구독 정보 찾아보기.
                        FireDb.get(FireDb.ref(database, 'users/' + encodeToken(currentToken)))
                            .then((snapshot) => {
                                let subs = snapshot.val();
                                if (subs !== null && subs !== '') {
                                    console.log("Restore subs.", subs);
                                    subs = subs.split(',');
                                    for (let id of subs) {
                                        notiConfigs[id] = true;
                                        localStorage.setItem(localDbKeys[id], notiConfigs[id]);
                                    }
                                }
                            })
                    }
                }
                console.log(currentToken);

                FireMsg.onMessage(messaging, (payload) => {
                    console.log('Message received: ', payload);
                    notifyMessage(payload.data);
                });

                Sentry.setUser({ id: currentToken });

                configAvailable = true;
                return true;
            } else {
                console.log('No registration token available.');
                Sentry.setUser(null);
                configAvailable = false;
                return false;
            }
        }
    }

    function notifyMessage(data) {
        if (!('id' in data) || Notification.permission !== 'granted') {
            return;
        }
        data.online = JSON.parse(data.online);
        data.onlineChanged = JSON.parse(data.onlineChanged);
        data.titleChanged = JSON.parse(data.titleChanged);
        data.categoryChanged = JSON.parse(data.categoryChanged);

        let notiTitle = members[data.id].name;
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

        console.log(notiTitle);
        console.log(notiOptions);

        const url = "https://www.twitch.tv/" + members[data.id].twitchId;

        // new Notification()은 모바일에서 동작하지 않음.
        // crbug.com/481856
        try {
            let noti = new Notification(notiTitle, notiOptions);
            noti.onclick = function(e) {
                e.preventDefault();
                noti.close();
                noti = null;
                window.open(url, '_blank');
            };
        } catch (e) {
            navigator.serviceWorker.getRegistrations().then((reg) => {
                if (reg.length > 0) {
                    reg[0].showNotification(notiTitle, notiOptions);
                } else {
                    Sentry.captureMessage("Fail to get a service worker's registration");
                    alert(notiTitle + '\n' + notiOptions.body);
                }
            });
        }
    }

    let notiConfigsBackup = null;
    let delayedSendingSubs = null;

    async function handleConfig(event: CustomEvent) {
        const memberId = event.detail.id;
        const subscribed = event.detail.subscribed;

        configLoadings[memberId] = true;

        let tokenResult = await checkAndRequestNotiToken();
        if (!tokenResult) {
            configLoadings[memberId] = false;
            notiConfigs[memberId] = !subscribed;
            return;
        }

        if (notiConfigsBackup === null) {
            notiConfigsBackup = Object.assign({}, notiConfigs);
            notiConfigsBackup[memberId] = !subscribed;
        }

        if (delayedSendingSubs !== null) {
            clearTimeout(delayedSendingSubs);
            console.log("Sending subscription is canceled and reserved again.");
        }
        delayedSendingSubs = setTimeout(() => {
            sendSubscription(msgToken)
                .then(() => {
                    if (storageAvailable) {
                        for (let id in members) {
                            localStorage.setItem(localDbKeys[id], notiConfigs[id]);
                        }
                    }
                    console.log("Sending subscription is completed.");
                })
                .catch(() => {
                    Sentry.captureMessage("Fail to send subscription data");
                    alert("구독 설정 변경에 실패하였습니다.");
                    notiConfigs = Object.assign({}, notiConfigsBackup);
                })
                .finally(() => {
                    notiConfigsBackup = null;
                    delayedSendingSubs = null;

                    for (let id in members) {
                        configLoadings[id] = false;
                    }
                });
        }, 2000);
    }

    function sendSubscription(token: string): Promise<void> {
        let subscribedMembers = [];
        for (let id in members) {
            if (notiConfigs[id]) {
                subscribedMembers.push(id);
            }
        }

        // DB Key로 사용 불가능한 문자가 올 경우를 대비해서 자체 규칙으로 인코딩.
        let escapedToken = encodeToken(token);

        return FireDb.set(FireDb.ref(database, 'users/' + escapedToken), subscribedMembers.join(','));
    }

    function encodeToken(token) {
        return token
            .replace(/\//g, "!!!1!!!")
            .replace(/\./g, "!!!2!!!")
            .replace(/\#/g, "!!!3!!!")
            .replace(/\$/g, "!!!4!!!")
            .replace(/\[/g, "!!!5!!!")
            .replace(/\]/g, "!!!6!!!");
    }

    // 멤버별 알림 구독 여부.
    let notiConfigs = {};
    if (storageAvailable) {
        // 저장된 구독 정보 불러오기.
        for (let id in members) {
            let config = localStorage.getItem(localDbKeys[id]);
            notiConfigs[id] = config === null ? false : JSON.parse(config); // Local DB는 무조건 문자열로 저장되는 것 주의.
        }
    } else {
        for (let id in members) {
            notiConfigs[id] = false;
        }
    }

    // 제목, 카테고리 최근 변경 여부.
    let newTitles = {}, newCategories = {};
    for (let id in members) {
        newTitles[id] = false;
        newCategories[id] = false;
    }

    // 제목, 카테고리 최근 변경 여부 갱신.
    let prevData = null;
    function updateNewTitleAndCategory() {
        if (!prevData) {
            return;
        }
        const maxRecentTime = 30 * 60 * 1000;
        const now = Date.now();
        for (let id in members) {
            let time = prevData[id].time;
            newTitles[id] = (now - time.title) < maxRecentTime;
            newCategories[id] = (now - time.category) < maxRecentTime;
        }
    }

    FireDb.onValue(FireDb.ref(database, 'prev'), (snapshot) => {
        prevData = snapshot.val();
        updateNewTitleAndCategory();
    });

    setInterval(updateNewTitleAndCategory, 60 * 1000);

    // 구독 정보가 아직 전송 대기중이면 좀 봐달라고 함.
    // 아래 메시지는 모던 브라우저에서 실제로 표시되진 않음.
    window.onbeforeunload = function(e: BeforeUnloadEvent) {
        e = e || window.event;

        if (delayedSendingSubs !== null) {
            const msg = "아직 구독 정보가 서버로 전송되지 않았습니다.\n잠시 후 종료해주세요.";
            if (e) {
                e.returnValue = msg;
            }
            return msg;
        }
    }

    let helpDlgOpen = false;
</script>

<main>
    <div class="header">
        <Headline>이세계 아이돌 방송 알림</Headline>
        <div class="subheader">
            <Button round small class="help-btn" style="visibility: hidden;"><HelpCircleIcon size="20" /></Button>
            <Subhead class="big-scr">뱅온 및 방제, 카테고리 변경을 알려드려요.</Subhead>
            <Subhead class="small-scr">뱅온 및 방제, 카테고리 변경 알림.</Subhead>
            <Button round small class="help-btn" on:click={() => helpDlgOpen = true}><HelpCircleIcon size="20" /></Button>
        </div>
    </div>
    {#each memberIds as id}
        <MemberCard
            {id}
            on:config={handleConfig}
            bind:subscribed={notiConfigs[id]}
            {configAvailable}
            title={streamData[id].title}
            category={streamData[id].category}
            online={streamData[id].online}
            loading={configLoadings[id]}
            newTitle={newTitles[id]}
            newCategory={newCategories[id]}
        />
    {/each}
    <div class="channel-title">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-telegram" viewBox="0 0 16 16">
            <path d="M16 8A8 8 0 1 1 0 8a8 8 0 0 1 16 0zM8.287 5.906c-.778.324-2.334.994-4.666 2.01-.378.15-.577.298-.595.442-.03.243.275.339.69.47l.175.055c.408.133.958.288 1.243.294.26.006.549-.1.868-.32 2.179-1.471 3.304-2.214 3.374-2.23.05-.012.12-.026.166.016.047.041.042.12.037.141-.03.129-1.227 1.241-1.846 1.817-.193.18-.33.307-.358.336a8.154 8.154 0 0 1-.188.186c-.38.366-.664.64.015 1.088.327.216.589.393.85.571.284.194.568.387.936.629.093.06.183.125.27.187.331.236.63.448.997.414.214-.02.435-.22.547-.82.265-1.417.786-4.486.906-5.751a1.426 1.426 0 0 0-.013-.315.337.337 0 0 0-.114-.217.526.526 0 0 0-.31-.093c-.3.005-.763.166-2.984 1.09z"/>
        </svg>
        <span>&nbsp;텔레그램 채널에서도 알려드려요.</span>
    </div>
    <div class="channel-box">
        {#each memberIds as id}
            <Button round small href="https://t.me/{id}_stream_noti" target="_blank">
                <img class="channel-img" alt="{id}" src="image/{id}.png" />
            </Button>
        {/each}
    </div>
</main>

<div class="modal-box">
    <Modal bind:open={helpDlgOpen} let:closeCallback>
        <Dialog title="도움말" {closeCallback}>
            <HelpContent />
        </Dialog>
    </Modal>
</div>

<hr />
<footer>
    <p>NeuroWhAI</p>
    <a href="https://github.com/NeuroWhAI/isekaidol-stream-noti" target="_blank">GitHub Repo</a>
</footer>

<style>
    main {
        text-align: center;
        padding: 1em;
        max-width: 600px;
        margin: 0 auto;
    }
    @media (max-width: 600px) {
        main {
            padding: 0.7em;
        }
    }
    @media (max-width: 520px) {
        main {
            padding: 0.35em;
        }
    }

    hr {
        display: block;
        height: 1px;
        border: 0;
        border-top: 1px solid #ccc;
        margin: 1em 0;
        padding: 0;
    }

    .header {
        margin-bottom: 20px;
    }
    
    .subheader {
        position: relative;
        display: flex;
        flex-direction: row;
        justify-content: center;
        align-items: center;
    }

    .subheader > :global(.small-scr) {
        display: none;
    }
    @media (max-width: 410px) {
        .subheader > :global(.small-scr) {
            display: block;
        }
        .subheader > :global(.big-scr) {
            display: none;
        }
    }

    :global(.help-btn) {
        margin: 0;
        transform: scale(1.2);
    }
    @media (max-width: 1024px) {
        :global(.help-btn) {
            transform: scale(1.1);
        }
    }
    @media (max-width: 840px) {
        :global(.help-btn) {
            transform: scale(1.0);
        }
    }
    @media (max-width: 640px) {
        :global(.help-btn) {
            transform: scale(0.95);
        }
    }
    @media (max-width: 440px) {
        :global(.help-btn) {
            transform: scale(0.85);
        }
    }

    .channel-title {
        display: flex;
        flex-direction: row;
        justify-content: center;
        align-items: baseline;
        margin: 24px 0 0 0;
    }
    @media (max-width: 600px) {
        .channel-title {
            font-size: 0.9em;
        }
    }
    @media (max-width: 520px) {
        .channel-title {
            font-size: 0.8em;
        }
    }

    .channel-box {
        display: flex;
        flex-direction: row;
        justify-content: center;
    }
    
    .channel-img {
        width: 24px;
        height: 24px;
        background-color: white;
        border-radius: 50%;
        box-shadow: rgba(0, 0, 0, 0.16) 0px 1px 4px;
    }

    @media (max-width: 600px) {
        .modal-box {
            font-size: 0.9em;
        }
    }
    @media (max-width: 520px) {
        .modal-box {
            font-size: 0.8em;
        }
    }

    footer {
        text-align: center;
        font-size: 0.6em;
        color: gray;
        padding-bottom: 8px;
    }

    footer p {
        margin: 0;
    }
</style>
