<script lang="ts">
    import { createEventDispatcher } from 'svelte';
    import { Card, Switch, Badge, Loading } from 'attractions';

    import members from '../data/members';
    import type { Anniversary } from '../data/members';

    export let id: string;
    export let title: string = "제목 없음";
    export let category: string = "";
    export let online: boolean = false;
    export let subscribed: boolean = false;
    export let configAvailable: boolean;
    export let loading: boolean = false;
    export let newTitle: boolean = false;
    export let newCategory: boolean = false;
    export let dday: number = 0;

    const data = members[id];

    const dispatch = createEventDispatcher();

    function setNoti(event: CustomEvent) {
        dispatch('config', {
            id: id,
            subscribed: event.detail.value,
        });
    }

    const fanImgUrl = `url("/image/fan_${id}.png")`;

    let isAnniversary = false;
    function updateBirthday() {
        let now = new Date();
        let today = ((now.getMonth() + 1) + '.' + now.getDate()) as Anniversary;
        isAnniversary = (data.anniversary === today);
    }
    updateBirthday();
    setInterval(updateBirthday, 60 * 1000);

    let titleObserver = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            if (mutation.type === 'attributes' && mutation.attributeName === 'title') {
                titleBox.scrollLeft = 0;
                startScrollHint();
            }
        });
    });
    let titleBox: HTMLElement = null;
    function observeTitleBox() {
        if (titleBox) {
            titleObserver.observe(titleBox, { attributes: true });
        } else {
            setTimeout(observeTitleBox, 100);
        }
    }
    observeTitleBox();

    function startScrollHint() {
        if (!titleBox
            || titleBox.scrollWidth < titleBox.clientWidth + 0.5 // 스크롤 불필요.
            || window.getComputedStyle(titleBox).overflowX !== 'auto' // 스크롤바 없음.
        ) {
            return;
        }

        let targetScroll = Math.min(titleBox.scrollWidth - titleBox.clientWidth, 60);
        titleBox.scrollLeft += Math.max((targetScroll - titleBox.scrollLeft) * 0.1, 1);
        if (titleBox.scrollLeft > targetScroll - 1) {
            endScrollHint();
        } else {
            setTimeout(startScrollHint, 16);
        }
    }
    function endScrollHint() {
        if (!titleBox) {
            return;
        }

        titleBox.scrollLeft -= Math.max(titleBox.scrollLeft * 0.1, 1);
        if (titleBox.scrollLeft < 1) {
            titleBox.scrollLeft = 0;
        } else {
            setTimeout(endScrollHint, 16);
        }
    }
</script>

<div class="outer-box" style="--light-profile-color: {data.color + '16'}; --transparent-profile-color: {data.color + '00'}; --fan-img: {fanImgUrl}">
    <Card tight class="{online ? 'card-highlight' : ''} {!online && dday >= 2 ? 'card-cold-fan' : ''}">
        <div class="box">
            <div class="profile-box">
                <a href="https://play.sooplive.co.kr/{data.afreecaId}" class="live-link">
                    <Badge hidden={!online} style="display: flex">
                        <img src="image/{id}.png" title="{data.name}" alt="{data.name}" class="profile" style="--profile-color: {online ? data.color : 'gray'}" />
                    </Badge>
                </a>
                <img src="image/cone.png" alt="congrats" class="congrats" hidden={!isAnniversary} />
                <div class="dday" hidden={dday < 2 || online}>D+{dday}</div>
            </div>
            <div class="info-box" style="--new-title: {newTitle ? 'inline' : 'none'}; --new-category: {newCategory ? 'inline' : 'none'}">
                <a href="https://play.sooplive.co.kr/{data.afreecaId}" class="live-link">
                    <span bind:this={titleBox} class="content-text title" {title}>{title === '' ? "제목 없음" : title}</span>
                </a>
                <span class="content-text category">{category}</span>
            </div>
            <div class="right-side">
                <Switch bind:value={subscribed} on:change={setNoti} disabled={!configAvailable} />
                <div class="loading-spinner" hidden={!loading}>
                    <Loading />
                </div>
            </div>
        </div>
    </Card>
</div>

<style>
    .outer-box {
        margin: 0 0 10px 0;
    }
    .outer-box > :global(.card-highlight) {
        background-image: linear-gradient(90deg, var(--light-profile-color) 0%, var(--transparent-profile-color) 95%);
    }
    .outer-box > :global(.card-cold-fan) {
        background-image: var(--fan-img);
        background-repeat: no-repeat;
        background-position-x: 82%;
        background-size: contain;
    }

    .box {
        display: flex;
        flex-direction: row;
        justify-content: space-between;
        align-items: center;
        margin: 20px 24px;
    }
    @media (max-width: 600px) {
        .box {
            margin: 16px 20px;
            font-size: 0.9em;
        }
    }
    @media (max-width: 520px) {
        .box {
            margin: 10px 14px;
            font-size: 0.8em;
        }
    }
    
    .info-box {
        flex: 1;
        margin: 0 20px 0 20px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
    @media (max-width: 600px) {
        .info-box {
            margin: 0 16px 0 16px;
        }
    }
    @media (max-width: 520px) {
        .info-box {
            margin: 0 12px 0 12px;
        }
    }

    .profile-box {
        display: grid;
        align-items: end;
        justify-items: center;
    }

    .profile-box > * {
        grid-column-start: 1;
        grid-row-start: 1;
    }

    img.profile {
        height: 80px;
        width: 80px;
        background-color: white;
        border: 2px solid black;
        border-radius: 50%;
        box-shadow: 0 0 0 4px var(--profile-color);
        transition: box-shadow 0.2s;
    }
    @media (max-width: 600px) {
        img.profile {
            height: 64px;
            width: 64px;
        }
    }
    @media (max-width: 520px) {
        img.profile {
            height: 52px;
            width: 52px;
            box-shadow: 0 0 0 3px var(--profile-color);
        }
    }

    img.profile:hover {
        box-shadow: 0 0 0 5px var(--profile-color);
    }
    @media (max-width: 520px) {
        img.profile:hover {
            box-shadow: 0 0 0 4px var(--profile-color);
        }
    }

    .congrats {
        position: absolute;
        height: 1em;
        align-self: start;
        transform: translateY(-0.8em);
        pointer-events: none;
    }

    .dday {
        z-index: 1;
        font-size: 0.85em;
        background-color: rgba(234, 234, 234, 0.9);
        color: #333333;
        border-radius: 1.5em;
        padding: 0.05em 0.4em;
        transform: translateY(0.4em);
        min-width: 2em;
    }

    .content-text {
        display: block;
        text-align: start;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
    @media (pointer: coarse) {
        .content-text {
            overflow: auto hidden;
            text-overflow: initial;
            scrollbar-width: none;
        }
        .content-text::-webkit-scrollbar {
            display: none;
        }
    }

    .title::before {
        display: var(--new-title);
        content: "*";
        color: #ff5757;
    }

    .category {
        font-size: 0.85em;
        color: gray;
    }

    .category::before {
        display: var(--new-category);
        content: "*";
        color: #ff5757;
    }

    :global(.right-side) {
        display: grid;
        justify-items: center;
        align-items: center;
    }
    :global(.right-side > *) {
        grid-column-start: 1;
        grid-row-start: 1;
    }

    .loading-spinner {
        z-index: 1;
        pointer-events: none;
        background-color: rgba(255, 255, 255, 50%);
        border-radius: 6px;
        padding: 2px 4px;
    }

    a.live-link {
        color: inherit;
        text-decoration: none;
    }

    a:hover.live-link {
        color: inherit;
        text-decoration: underline;
    }

    a:visited.live-link {
        color: inherit;
    }
</style>
