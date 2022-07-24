export type Anniversary = `${number}.${number}`;

class MemberData {
    constructor(public name: string, public twitchId: string, public color: string, public anniversary: Anniversary) {}
}

const members: { [id: string]: MemberData } = {
    'jururu': new MemberData('주르르', 'cotton__123', '#800080', '6.10'),
    'jingburger': new MemberData('징버거', 'jingburger', '#f0a957', '10.8'),
    'viichan': new MemberData('비챤', 'viichan6', '#85ac20', '1.16'),
    'gosegu': new MemberData('고세구', 'gosegugosegu', '#467ec6', '7.27'), // 생일 대신 첫 방송일.
    'lilpa': new MemberData('릴파', 'lilpaaaaaa', '#000080', '3.9'),
    'ine': new MemberData('아이네', 'vo_ine', '#8a2be2', '7.26'), // 생일 대신 첫 방송일.
};

export default members;
