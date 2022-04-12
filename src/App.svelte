<script lang="ts">
	import { Headline, Subhead } from 'attractions';
	import MemberCard from './components/MemberCard.svelte';

	import { ref, onValue} from "firebase/database";
	import { db } from './server';

	const members = ['jururu', 'jingburger', 'viichan', 'gosegu', 'lilpa', 'ine'];
	let streamData = {};
	for (let id of members) {
		streamData[id] = {
			category: "",
			online: false,
			title: "불러오는 중..."
		};
	}

	const streamRef = ref(db, 'stream');
	onValue(streamRef, (snapshot) => {
		streamData = snapshot.val();
		console.log(streamData);
	});
</script>

<main>
	<div class="header">
		<Headline>이세계 아이돌 방송 알림</Headline>
		<Subhead>트위치 뱅온 및 방제, 카테고리 변경을 알려드려요.</Subhead>
	</div>
	{#each members as id}
		<MemberCard {id} title={streamData[id].title} category={streamData[id].category} online={streamData[id].online} />
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