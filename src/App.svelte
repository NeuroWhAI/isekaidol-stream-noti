<script lang="ts">
    import * as Sentry from '@sentry/browser';
    import { Headline, Subhead, Button, Modal, Dialog } from 'attractions';
    import { HelpCircleIcon, ExternalLinkIcon } from 'svelte-feather-icons';
    import { Confetti } from 'svelte-confetti';

    import * as FireDb from "firebase/database";
    import * as FireMsg from "firebase/messaging";

    import MemberCard from './components/MemberCard.svelte';
    import HelpContent from './components/HelpContent.svelte';
    import WebhookForm from './components/WebhookForm.svelte';

    import { messaging, database } from './server';
    import members from './data/members';

    const memberIds = Object.keys(members);

    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register("/pwa-sw.js")
            .catch((err) => console.log("Fail to register a service worker for the PWA.\n" + err));
    }

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
    FireDb.onValue(FireDb.ref(database, 'afreeca'), (snapshot) => {
        streamData = snapshot.val();
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
            badge: '/image/badge.png',
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
            navigator.serviceWorker.getRegistrations().then((regs) => {
                let reg = regs.find((reg) => reg.scope.endsWith('firebase-cloud-messaging-push-scope'));
                if (!reg && regs.length > 0) {
                    reg = regs[0];
                }

                if (reg) {
                    reg.showNotification(notiTitle, notiOptions);
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

    FireDb.onValue(FireDb.ref(database, 'afreeca-prev'), (snapshot) => {
        prevData = snapshot.val();
        updateNewTitleAndCategory();
    });

    setInterval(updateNewTitleAndCategory, 60 * 1000);

    // 뱅종 후 며칠 지났는지.
    let ddays = {};
    for (let id in members) {
        ddays[id] = 0;
    }

    let offtime = null;
    function updateDday() {
        if (!offtime) {
            return;
        }
        const now = Date.now();
        for (let id in members) {
            let elapsed = now - offtime[id];
            ddays[id] = Math.floor(elapsed / 86400000); // Day 단위로 변환.
        }
    }

    FireDb.onValue(FireDb.ref(database, 'offtime'), (snapshot) => {
        offtime = snapshot.val();
        updateDday();
    });

    setInterval(updateDday, 5 * 60 * 1000);

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
    let webhookDlgOpen = false;
    let currentWebhookMember = memberIds[0];
    let webhookState: 'ready' | 'loading' | 'complete' | 'error' = 'ready';

    $: if (!helpDlgOpen && !webhookDlgOpen && window.location.hash !== '') {
        window.history.back();
    }

    function openHelpDlg() {
        helpDlgOpen = true;

        window.location.hash = '/help';
    }

    function openWebhookDlg(id: string) {
        currentWebhookMember = id;
        if (webhookState !== 'loading') {
            webhookState = 'ready';
        }
        webhookDlgOpen = true;

        window.location.hash = '/hook-' + id;
    }

    function handleHashRoute() {
        let hash = window.location.hash;
        if (hash === '#/help') {
            openHelpDlg();
        } else if (hash.startsWith('#/hook-')) {
            let id = hash.split('-')[1];
            if (id in members) {
                openWebhookDlg(id);
            }
        } else {
            helpDlgOpen = false;
            webhookDlgOpen = false;
        }
    }
    handleHashRoute();

    function registerWebhook(event: CustomEvent) {
        const memberId = event.detail.id;
        const webhookKey = event.detail.webhook;

        webhookState = 'loading';

        let key = 'discord/' + memberId + '/' + webhookKey;
        FireDb.set(FireDb.ref(database, key), 1)
            .then(() => new Promise((resolve) => setTimeout(resolve, 500)))
            .then(() => webhookState = 'complete')
            .catch(() => webhookState = 'error');
    }

    // 결성일 축하.
    let celebration = null;
    let anniversary = 0;
    function updateFormation() {
        let now = new Date();
        if (now.getMonth() + 1 === 8 && now.getDate() === 26) {
            celebration = "결성";
        } else if (now.getMonth() + 1 === 12 && now.getDate() === 17) {
            celebration = "데뷔";
        } else {
            celebration = null;
        }
        anniversary = now.getFullYear() - 2021;
    }
    updateFormation();
    setInterval(updateFormation, 5 * 60 * 1000);
</script>

<main>
    <div class="header">
        {#if celebration}
            <Headline>이세계아이돌 {celebration} {anniversary}주년</Headline>
        {:else}
            <Headline>이세계아이돌 방송 알림</Headline>
        {/if}
        <div class="subheader">
            {#if celebration}
                <Confetti cone x={[-0.8, 0.4]} y={[0.25, 1]} delay={[0, 1000]} iterationCount=infinite />
            {/if}
            <Button round small class="help-btn" style="visibility: hidden;"><HelpCircleIcon size="20" /></Button>
            <Subhead class="big-scr">뱅온 및 방제, 카테고리 변경을 알려드려요.</Subhead>
            <Subhead class="small-scr">뱅온 및 방제, 카테고리 변경 알림.</Subhead>
            <Button round small class="help-btn" on:click={openHelpDlg}><HelpCircleIcon size="20" /></Button>
            {#if celebration}
                <Confetti cone x={[-0.4, 0.8]} y={[0.25, 1]} delay={[0, 1000]} iterationCount=infinite />
            {/if}
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
            dday={ddays[id]}
        />
    {/each}
    <div class="channel-title">
        <svg width="16" height="16" role="img" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><title>Telegram</title><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>
        <span>&nbsp;텔레그램 채널에서도 알려드려요.</span>
    </div>
    <div class="channel-box">
        {#each memberIds as id}
            <Button round small href="https://t.me/{id}_stream_noti" target="_blank">
                <img class="channel-img" alt="{id}" src="image/sm_{id}.png" />
            </Button>
        {/each}
    </div>
    <div class="webhook-title">
        <svg width="16" height="16" role="img" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><title>Discord</title><path d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189Z"/></svg>
        <span>&nbsp;디스코드 웹훅도 지원해요.</span>
    </div>
    <div class="webhook-box">
        {#each memberIds as id}
            <Button round small on:click={() => openWebhookDlg(id)}>
                <img class="channel-img" alt="{id}" src="image/sm_{id}.png" />
            </Button>
        {/each}
    </div>
</main>

<svelte:window on:hashchange={handleHashRoute} />

<div class="modal-box">
    <Modal bind:open={helpDlgOpen} let:closeCallback>
        <Dialog title="도움말" {closeCallback}>
            <HelpContent />
        </Dialog>
    </Modal>
</div>
<div class="modal-box">
    <Modal bind:open={webhookDlgOpen} let:closeCallback>
        <Dialog title="디스코드 웹훅" {closeCallback}>
            <WebhookForm
                memberId={currentWebhookMember}
                state={webhookState}
                on:register={registerWebhook}
            />
        </Dialog>
    </Modal>
</div>

<hr />
<footer>
    <p>NeuroWhAI</p>
    <a href="https://github.com/NeuroWhAI/isekaidol-stream-noti" target="_blank">GitHub Repo</a><br>
    <a href="https://cafe.naver.com/steamindiegame/4861856" target="_blank">팬덤 그림 by 전투개구리</a>
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
        margin: 24px 0 0 0;
    }
    .webhook-title {
        margin: 16px 0 0 0;
    }
    .channel-title, .webhook-title {
        display: flex;
        flex-direction: row;
        justify-content: center;
        align-items: baseline;
    }
    @media (max-width: 600px) {
        .channel-title, .webhook-title {
            font-size: 0.9em;
        }
    }
    @media (max-width: 520px) {
        .channel-title, .webhook-title {
            font-size: 0.8em;
        }
    }

    .channel-box, .webhook-box {
        display: flex;
        flex-direction: row;
        justify-content: center;
    }
    
    .channel-img {
        width: 28px;
        height: 28px;
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
