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

export default members;
