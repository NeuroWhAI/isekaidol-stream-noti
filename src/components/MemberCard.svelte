<script lang="ts">
    import { Card, Switch, Badge } from 'attractions';

    export let id: string;
    export let title: string = "제목 없음";
    export let category: string = "";
    export let online: boolean = false;

    class MemberData {
        constructor(public name: string, public twitchId: string, public color: string) {}
    }

    const members: { [id: string]: MemberData } = {
        'jururu': new MemberData('주르르', 'cotton__123', '#800080'),
        'jingburger': new MemberData('징버거', 'jingburger', '#f0a957'),
        'viichan': new MemberData('비챤', 'viichan6', '#85ac20'),
        'gosegu': new MemberData('고세구', 'gosegugosegu', '#467ec6'),
        'lilpa': new MemberData('릴파', 'lilpaaaaaa', '#000080'),
        'ine': new MemberData('아이네', 'vo_ine', '#8a2be2'),
    };
    const data = members[id];
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
                <span class="content-text" title="{title}">{title}</span>
            </a>
            <span class="content-text category">{category}</span>
        </div>
        <Switch />
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
    
    .info-box {
        flex: 1;
        margin: 0 20px 0 20px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    img.profile {
        height: 80px;
        width: 80px;
        border: 2px solid black;
        border-radius: 50%;
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
