export interface HeroDefinition {
  slug: string;
  roleNameZhTw: string;
  displayNameZhTw: string;
  storyZhTw: string;
  boardImageUrl: string;
  initialLayoutImageUrl: string;
}

export const heroDefinitions: HeroDefinition[] = [
  ['brawler','鬥者','弗蘭齊斯卡·馮·特克','儘管有一個貴族名字，但除了珠寶攤之外，你還經常光顧最低劣的酒吧、酒館，參與非法角鬥，並因此臭名遠揚。你沒有弱點，能夠應付任何情況。'],
  ['crossbowman','弩手','吉多·托雷里','你的工作是與弓弩火器打交道。身為職業獵人，你無論如何都會完成合約。遇到近戰時，你傾向於依賴自己的隊友。但你的獨門絕技往往決定了戰鬥的勝負。'],
  ['cutthroat','割喉者','西格弗里德','你是個游手好閒的懶漢，卻也是雙持武器的專家，總是隨身攜帶飛刀、匕首和可疑的藥瓶。你的同伴們喜歡遊走在法律的邊緣，而你毫無疑問更喜歡越過它。'],
  ['huntress','獵人','埃琳娜·沃爾夫','你靈敏且自信，喜歡用弓或投石索，能安全地引領同伴穿過原始森林、荒廢的墓地以及霧海。你還擅長追蹤野獸和怪物，沒幾個人比你更了解牠們的習性。'],
  ['landsknecht','傭兵','威廉·施瓦茨','你強壯的肌肉和鋼鐵般的意志促使你成為了一名職業獵人。你擅長使用重武器，例如雙手劍和斧頭。遇見道德困境時，你喜歡把它們留給同伴思考。'],
  ['man-at-arms','騎士','恩斯特·伯格曼','身為一名職業騎士，你服務過許多願意出些小錢的領主。你對近戰了如指掌，懂得使用長矛和斧頭，但劍與盾才是你的最愛。'],
  ['medic','醫師','弗雷德里希·鮑曼','救助他人是你的使命。你懂得如何接骨、配製解藥和減輕病人的痛苦。每個人都很喜歡你，即使是最難進的大門也會為你而開。'],
  ['sorceress','術士','米萊娜·馮·克萊沃','你是一個不斷尋求知識的年輕女巫，渴望了解周圍的世界，但也因此招引了平民的懷疑和恐懼，以及有心人的敬畏和尊重。你擅長快速施展致命的兇殘法術。'],
  ['witch','巫師','克洛伊','你遵循著經驗與知識的指引，使用的力量如同河神、山靈一般古老。你能夠增幅同伴、詛咒敵人，甚至扭曲自然法則。沒什麼能逃過你的感知。'],
].map(([slug,roleNameZhTw,displayNameZhTw,storyZhTw]) => ({
  slug, roleNameZhTw, displayNameZhTw, storyZhTw,
  boardImageUrl: `/images/campaign/characters/${slug}-board-v2.webp`,
  initialLayoutImageUrl: `/images/campaign/characters/${slug}-initial-layout.webp`,
}));

export const heroDefinitionBySlug = Object.fromEntries(heroDefinitions.map(hero => [hero.slug, hero])) as Record<string, HeroDefinition>;
