<script lang="ts">
    import { Headline, Subhead } from 'attractions';
    import MemberCard from './components/MemberCard.svelte';

    import { ref, onValue, set } from "firebase/database";
    import { getToken, onMessage, isSupported as isMsgSupported } from "firebase/messaging";

    import { database, messaging } from './server';

    const members = ['jururu', 'jingburger', 'viichan', 'gosegu', 'lilpa', 'ine'];

    const local_db_key_prefix = 'isekaidol-stream-noti-neurowhai-';
    const local_db_keys = {
        prevToken: local_db_key_prefix + 'prev-token',
    };
    for (let id of members) {
        local_db_keys[id] = local_db_key_prefix + 'member-' + id;
    }

    let streamData = {};
    for (let id of members) {
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
            } else {
                console.log('No registration token available. Request permission to generate one.');
            }
        }).catch((err) => {
            console.log('An error occurred while retrieving token. ', err);
        });

        onMessage(messaging, (payload) => {
            console.log('Message received: ', payload);
        });
    } else {
        alert("브라우저가 알림 기능을 지원하지 않습니다.");
    }

    function handleConfig(event: CustomEvent) {
        const memberId = event.detail.id;
        const subscribed = event.detail.subscribed;

        sendSubscription(msgToken)
            .then(() => {
                if (window.localStorage) {
                    localStorage.setItem(local_db_keys[memberId], subscribed);
                }
            })
            .catch(() => {
                alert("구독 설정 변경에 실패하였습니다.");
                notiConfigs[memberId] = !subscribed;
            });
    }

    function sendSubscription(token: string): Promise<void> {
        let subscribedMembers = [];
        for (let id of members) {
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

    let notiConfigs = {};
    if (window.localStorage) {
        // 저장된 구독 정보 불러오기.
        for (let id of members) {
            let config = localStorage.getItem(local_db_keys[id]);
            notiConfigs[id] = config === null ? false : JSON.parse(config); // Local DB는 무조건 문자열로 저장되는 것 주의.
        }
    } else {
        for (let id of members) {
            notiConfigs[id] = false;
        }
        alert("로컬 저장소를 지원하지 않아 동작이 제한됩니다.");
    }
</script>

<main>
    <div class="header">
        <Headline>이세계 아이돌 방송 알림</Headline>
        <Subhead>뱅온 및 방제, 카테고리 변경을 알려드려요.</Subhead>
    </div>
    {#each members as id}
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