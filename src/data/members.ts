export type Anniversary = `${number}.${number}`;

class MemberData {
    constructor(public name: string, public twitchId: string, public color: string, public anniversaries: Anniversary[]) {}
}

const members: { [id: string]: MemberData } = {
    'jururu': new MemberData('주르르', 'cotton__123', '#800080', ['6.10', '3.14']),
    'jingburger': new MemberData('징버거', 'jingburger', '#f0a957', ['10.8', '7.24']),
    'viichan': new MemberData('비챤', 'viichan6', '#85ac20', ['1.16', '5.30']),
    'gosegu': new MemberData('고세구', 'gosegugosegu', '#467ec6', ['0.0', '7.27']), // 생일 비공개.
    'lilpa': new MemberData('릴파', 'lilpaaaaaa', '#000080', ['3.9', '7.24']),
    'ine': new MemberData('아이네', 'vo_ine', '#8a2be2', ['0.0', '7.26']), // 생일 비공개.
};

export default members;
