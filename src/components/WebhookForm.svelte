<script lang="ts">
    import { createEventDispatcher } from 'svelte';
    import { Divider, H3, TextField, Button, Loading } from 'attractions';
    import { CheckIcon, AlertTriangleIcon } from 'svelte-feather-icons';

    import members from '../data/members';

    export let memberId: string;
    export let state: 'ready' | 'loading' | 'complete' | 'error' = 'ready';

    let webhookUrl = '';
    let errorMsg = '';

    const dispatch = createEventDispatcher();

    function registerWebhook() {
        if (memberId === '') {
            return;
        }

        if (webhookUrl === '') {
            errorMsg = "웹훅 주소를 입력해주세요.";
            return;
        }

        const prefix = "https://discord.com/api/webhooks/";
        if (!webhookUrl.startsWith(prefix)) {
            errorMsg = "올바른 디스코드 웹훅 주소가 아닙니다.";
            return;
        }

        let key = webhookUrl.substring(prefix.length);
        let parts = key.split('/');
        if (parts.length !== 2) {
            errorMsg = "올바른 디스코드 웹훅 주소가 아닙니다.";
            return;
        }

        key = parts.join('|');
        if (key.length > 512) {
            errorMsg = "주소가 너무 깁니다.";
            return;
        }

        dispatch('register', { id: memberId, webhook: key });

        errorMsg = "";
    }
</script>

<div class="webhook-form">
    <H3>{members[memberId].name} 알림</H3>
    <TextField
        placeholder="URL (ex: https://discord.com/api/webhooks/...)"
        type="url"
        bind:value={webhookUrl}
        error={errorMsg}
    />
    <Button outline disabled={state === 'loading'} on:click={registerWebhook}>
        등록하기
        <div class="btn-icon" hidden={state !== 'loading'}>
            <Loading />
        </div>
        <div class="btn-icon" hidden={state !== 'complete'}>
            <CheckIcon size="16" />
        </div>
        <div class="btn-icon" hidden={state !== 'error'}>
            <AlertTriangleIcon size="16" />
        </div>
    </Button>

    <Divider />

    <H3>등록 방법</H3>
    <ol>
        <li>PC 디스코드에서 웹훅 주소를 만들고 복사합니다.<br/>(채널 편집 - 연동 - 웹후크 만들기 - URL 복사)</li>
        <li>위 주소 입력란에 붙혀넣습니다.</li>
        <li>등록 버튼을 클릭하고 완료 표시를 기다립니다.</li>
    </ol>
</div>

<style>
    .btn-icon {
        margin-left: 4px;
    }
</style>
