<script lang="ts">
	import { Headline, Subhead } from 'attractions';
	import MemberCard from './components/MemberCard.svelte';
</script>

<main>
	<div class="header">
		<Headline>이세계 아이돌 방송 알림</Headline>
		<Subhead>트위치 뱅온 및 방제, 카테고리 변경을 알려드려요.</Subhead>
	</div>
	<MemberCard id="jururu" title="긴제목테스트이건정말긴제목입니다가나다라마바사아자아자파이팅" category="긴설명테스트이건정말긴테스트입니다사실다람쥐는하늘을날수있다!!" />
	<MemberCard id="jingburger" title="일많아서 결국 휴뱅 ㅠㅠ 담에 꼭 오께잉" category="Just Chatting" />
	<MemberCard id="viichan" />
	<MemberCard id="gosegu" title="[V] 데친 숙주나물 x 무친 실외기 세구땅ㅇ" category="Just Chatting" online />
	<MemberCard id="lilpa" />
	<MemberCard id="ine" />
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
		font-size: 0.8em;
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