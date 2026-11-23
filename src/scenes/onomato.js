// 말풍선용 의성어·의태어: 동물마다 때릴 때, 기술 쓸 때, 맞을 때.
export const SOUND = {
  bear: { hit: ['퍽!', '쿵!', '우왕!'], skill: ['우워어어!', '쾅쾅!!', '으르렁!'], hurt: ['끙!', '으릉?!'] },
  tiger: { hit: ['콱!', '촥!', '휙!'], skill: ['어흥!!', '크아앙!!'], hurt: ['캬웅!', '크릉…'] },
  fox: { hit: ['쏙!', '캥!', '날름~'], skill: ['살랑살랑~', '캐갱캥!'], hurt: ['깽!', '캥?!'] },
  rabbit: { hit: ['콩!', '탁!', '폴짝!'], skill: ['쿵쿵쿵!', '깡총!!'], hurt: ['히익!', '꺄앗!'] },
  rooster: { hit: ['콕!', '콕콕!'], skill: ['꼬끼오오!!', '꼬꼬댁!'], hurt: ['꼬꼭?!', '푸드덕!'] },
  crow: { hit: ['깍!', '툭!'], skill: ['까악까악!', '반짝?!'], hurt: ['깍?!', '푸드득!'] },
  bison: { hit: ['쿵!', '들썩!'], skill: ['두두두두!!', '음머어어!'], hurt: ['흥!', '움찔'] },
  wolf: { hit: ['왕!', '콱!', '으르릉'], skill: ['아우우우~!', '컹컹!!'], hurt: ['깨갱!', '낑…'] },
  eagle: { hit: ['슈욱!', '콱!'], skill: ['끼에에엑!', '휘이잉!!'], hurt: ['끽?!', '휘청'] },
  bighorn: { hit: ['쾅!', '뿔쿵!'], skill: ['메에에엥!', '쿵쾅!!'], hurt: ['메?!', '띠용'] },
  frog: { hit: ['날름!', '찹!'], skill: ['개굴개굴!!', '뿌우웅!'], hurt: ['개굴?!', '꾸엑'] },
  grasshopper: { hit: ['톡!', '찌르~'], skill: ['♪찌르찌르♪', '라라라~!'], hurt: ['찍!', '삐끗'] },
  cheese_thief: { hit: ['슬쩍!', '깍!'], skill: ['냠냠!', '쉿~'], hurt: ['캥깍?!'] },
  bear_tiger: { hit: ['콰광!', '촤악!'], skill: ['우어흥!!', '쾅!!'], hurt: ['크릉!'] },
  wolf_in_sheep: { hit: ['메~콱!', '덥석!'], skill: ['메에…아우우!', '짠!'], hurt: ['메깽!'] },
  bullfrog: { hit: ['철퍽!', '꿀꺽!'], skill: ['우어엉 개굴!!', '뿌웅!!'], hurt: ['꾸에엑'] },
  jackalope: { hit: ['뿔콩!', '탁탁!'], skill: ['깡총깡총!!', '뿅!'], hurt: ['히잉!'] },
  thunderbird: { hit: ['파직!', '콰르릉!'], skill: ['콰콰쾅!!', '번쩍!!'], hurt: ['찌직?!'] },
  phoenix: { hit: ['화르륵!', '휘릭!'], skill: ['화아아악!!', '활활!!'], hurt: ['피융…'] },
  _: { hit: ['퍽!', '팍!'], skill: ['얍!!', '으랏차!'], hurt: ['윽!', '앗!'] },
};
export const ELEM_SOUND = { fire: '화르륵!', water: '철퍽!', wind: '휘잉!', earth: '쿠궁!', thunder: '파지직!', moon: '스르르…', grass: '스르륵!', light: '번쩍!' };
export const pick = (list) => list[Math.floor(Math.random() * list.length)];
export const soundOf = (u, kind) => pick((SOUND[u?.speciesId] ?? SOUND._)[kind] ?? SOUND._[kind]);
