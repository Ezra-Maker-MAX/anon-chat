const ADJ = [
  "青柠", "雾屿", "盐粒", "晚舟", "星砂", "薄荷", "拾光", "小满",
  "白鹭", "深蓝", "橘颂", "听海", "南风", "半糖", "木槿", "溪午",
  "既白", "川页", "野渡", "初晴",
];
const NOUN = [
  "旅人", "信使", "游鱼", "飞鸟", "拾荒者", "旁观者", "过客",
  "筑梦人", "摘星人", "摆渡人", "默片", "旧友", "新雪", "远舟",
];

export function randomHandle(): string {
  const a = ADJ[Math.floor(Math.random() * ADJ.length)];
  const n = NOUN[Math.floor(Math.random() * NOUN.length)];
  const num = Math.floor(Math.random() * 900 + 100);
  return `${a}${n}#${num}`;
}
