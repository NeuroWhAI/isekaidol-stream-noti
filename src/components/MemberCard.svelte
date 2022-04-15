<script lang="ts">
    import { createEventDispatcher } from 'svelte';
    import { Card, Switch, Badge, Loading } from 'attractions';

    import members from '../data/members';

    export let id: string;
    export let title: string = "제목 없음";
    export let category: string = "";
    export let online: boolean = false;
    export let subscribed: boolean = false;
    export let configAvailable: boolean;
    export let loading: boolean = false;

    const data = members[id];

    const dispatch = createEventDispatcher();

    function setNoti(event: CustomEvent) {
        dispatch('config', {
            id: id,
            subscribed: event.detail.value,
        });
    }
</script>

<Card tight style="margin: 0 0 10px 0">
    <div class="box">
        <a href="https://www.twitch.tv/{data.twitchId}" class="twitch-link">
            <Badge hidden={!online}>
                <img src="image/{id}.png" alt="{data.name}" class="profile" style="outline: 4px solid {online ? data.color : 'gray'};" />
            </Badge>
        </a>
        <div class="info-box">
            <a href="https://www.twitch.tv/{data.twitchId}" class="twitch-link">
                <span class="content-text" {title}>{title === '' ? "제목 없음" : title}</span>
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

<style>
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

    img.profile {
        height: 80px;
        width: 80px;
        border: 2px solid black;
        border-radius: 50%;
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
        }
    }

    .content-text {
        display: block;
        text-align: start;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .category {
        font-size: 0.85em;
        color: gray;
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

    a.twitch-link {
        color: inherit;
        text-decoration: none;
    }

    a:hover.twitch-link {
        color: inherit;
        text-decoration: underline;
    }

    a:visited.twitch-link {
        color: inherit;
    }
</style>
