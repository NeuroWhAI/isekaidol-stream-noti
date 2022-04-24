<script lang="ts">
    import { Divider, H3 } from 'attractions';
</script>

<div class="help-content">
    <H3>사용 방법</H3>
    <ol>
        <li>PC나 모바일(안드로이드만)에서 모던 웹브라우저로 접속.</li>
        <li>알림을 받을 멤버 카드 우측의 스위치를 켠다.</li>
        <li>처음이라면 알림 권한을 허용할 것인지 팝업이 뜨니 허용.</li>
        <li>로딩 표시가 사라지면 사이트를 닫아둬도 알림 수신 가능.<br/>(PC에선 브라우저 실행은 필요하며 모바일은 상관 없음.)</li>
    </ol>

    <Divider />

    <H3>참고 사항</H3>
    <ul>
        <li><a href="https://caniuse.com/push-api" target="_blank">웹 푸시</a>가 지원되지 않는 환경에선 텔레그램(사이트 하단 참고) 이용.</li>
        <li>권한을 거부하거나 운영체제의 알림 센터에서 브라우저를 제외하면 알림 수신 불가.</li>
        <li>실수로 권한을 거부했거나 뭔가 잘 안 되면 권한 재설정 및 캐시 삭제, 새로고침 후 재시도.</li>
    </ul>
</div>

<style>
</style>
