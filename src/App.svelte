<script lang="ts">
    import { Headline, Subhead } from 'attractions';
    import MemberCard from './components/MemberCard.svelte';

    import { ref, onValue, set } from "firebase/database";
    import { getToken, onMessage, isSupported as isMsgSupported } from "firebase/messaging";

    import { database, messaging } from './server';
    import members from './data/members';

    const memberIds = Object.keys(members);

    const local_db_key_prefix = 'isekaidol-stream-noti-neurowhai-';
    const local_db_keys = {
        prevToken: local_db_key_prefix + 'prev-token',
    };
    for (let id in members) {
        local_db_keys[id] = local_db_key_prefix + 'member-' + id;
    }

    let streamData = {};
    for (let id in members) {
        streamData[id] = {
            category: "",
            online: false,
            title: "불러오는 중..."
        };
    }

    // 방송 정보가 바뀌면 받아서 갱신.
    onValue(ref(database, 'stream'), (snapshot) => {
        streamData = snapshot.val();
        console.log(streamData);
    });

    let msgToken = '';

    if (isMsgSupported()) {
        getToken(messaging, { vapidKey: 'BET0ZjPDIvaVd0PN76845lHEujw5_18DgtyNMyKiw3TkSWtMtSqR4ohORWsrlX-DrmWCRy3rAloywV_i_RZJtzs' }).then((currentToken) => {
            if (currentToken) {
                // 토큰 발급됨.
                if (window.localStorage) {
                    let prevToken = localStorage.getItem(local_db_keys.prevToken);

                    msgToken = currentToken;
                    localStorage.setItem(local_db_keys.prevToken, currentToken);

                    // 이전 토큰이 있고 비교해서 다르면 로컬 구독 정보를 다시 전송.
                    if (prevToken !== null && prevToken !== currentToken) {
                        console.log("Update registration token.")
                        sendSubscription(currentToken)
                            .catch(() => alert("구독 갱신에 실패하였습니다."));
                    }
                }
                console.log(currentToken);

                onMessage(messaging, (payload) => {
                    console.log('Message received: ', payload);
                    notifyMessage(payload.data);
                });
            } else {
                console.log('No registration token available. Request permission to generate one.');
            }
        }).catch((err) => {
            console.log('An error occurred while retrieving token. ', err);
        });
    } else {
        alert("브라우저가 알림 기능을 지원하지 않습니다.");
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

        new Notification(notiTitle, notiOptions);
    }

    let notiConfigsBackup = null;
    let delayedSendingSubs = null;

    function handleConfig(event: CustomEvent) {
        const memberId = event.detail.id;
        const subscribed = event.detail.subscribed;

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
                    if (window.localStorage) {
                        for (let id in members) {
                            localStorage.setItem(local_db_keys[id], notiConfigs[id]);
                        }
                    }
                    console.log("Sending subscription is completed.");
                })
                .catch(() => {
                    alert("구독 설정 변경에 실패하였습니다.");
                    notiConfigs = Object.assign({}, notiConfigsBackup);
                })
                .finally(() => {
                    notiConfigsBackup = null;
                    delayedSendingSubs = null;
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
        let escapedToken = token
            .replace(/\//g, "!!!1!!!")
            .replace(/\./g, "!!!2!!!")
            .replace(/\#/g, "!!!3!!!")
            .replace(/\$/g, "!!!4!!!")
            .replace(/\[/g, "!!!5!!!")
            .replace(/\]/g, "!!!6!!!");

        return set(ref(database, 'users/' + escapedToken), subscribedMembers.join(','));
    }

    // 멤버별 알림 구독 여부.
    let notiConfigs = {};
    if (window.localStorage) {
        // 저장된 구독 정보 불러오기.
        for (let id in members) {
            let config = localStorage.getItem(local_db_keys[id]);
            notiConfigs[id] = config === null ? false : JSON.parse(config); // Local DB는 무조건 문자열로 저장되는 것 주의.
        }
    } else {
        for (let id in members) {
            notiConfigs[id] = false;
        }
        alert("로컬 저장소를 지원하지 않아 동작이 제한됩니다.");
    }

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
</script>

<main>
    <div class="header">
        <Headline>이세계 아이돌 방송 알림</Headline>
        <Subhead>뱅온 및 방제, 카테고리 변경을 알려드려요.</Subhead>
    </div>
    {#each memberIds as id}
        <MemberCard
            {id}
            on:config={handleConfig}
            bind:subscribed={notiConfigs[id]}
            configAvailable={msgToken !== ''}
            title={streamData[id].title}
            category={streamData[id].category}
            online={streamData[id].online}
        />
    {/each}
</main>

<hr />
<footer>
    <p>NeuroWhAI</p>
    <address>tlsehdgus321@naver.com</address>
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

    footer {
        text-align: center;
        font-size: 0.6em;
        color: gray;
        padding-bottom: 8px;
    }

    footer p {
        margin: 0;
    }

    .header {
        margin-bottom: 20px;
    }
</style>