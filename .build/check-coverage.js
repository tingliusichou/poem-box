/* 体检：常用古诗词字在四表的覆盖情况 */
'use strict';
const fs = require('fs');
const path = require('path');
const OUT = path.join(__dirname, 'out');
const ps = JSON.parse(fs.readFileSync(path.join(OUT, 'zibiao-pingshui.json'), 'utf8'));
const cl = JSON.parse(fs.readFileSync(path.join(OUT, 'zibiao-cilin.json'), 'utf8'));
const ty = JSON.parse(fs.readFileSync(path.join(OUT, 'zibiao-tongyun.json'), 'utf8'));
const xy = JSON.parse(fs.readFileSync(path.join(OUT, 'zibiao-xinyun.json'), 'utf8'));

const SAMPLE = `
啼鹅曲斜涯花家茶车遮蛇些爷椰夜月雪竹石白独一七十国发别时节长鸣蝉残看难寒干官欢端弯关还山间颜斑攀班蛮删闲
餐兰单丹滩弹坛盘桓完丸宽原园猿轩喧冤言门尊存温魂痕昏婚恩根吞坤孙村盆奔论敦荪昆樽
天眠船乡愁秋风流云归飞深林声色香山江行知春风雨雪梅柳草宿客星台海舟楼钟南北方高清明月夜来去住看取次惊
疑是地上霜举头望明日思故乡晓眠不觉闻啼鸟落知多少红不是花经眼觉今逢军酒泉入州凉词曲杨柳岸晓风残_issue
`;

const uniq = [...new Set((SAMPLE.match(/[\u4e00-\u9fff]/g) || []))];
const missPs = uniq.filter(c => !ps[c]);
const missCl = uniq.filter(c => !cl[c]);
const missTy = uniq.filter(c => !ty[c]);
const missXy = uniq.filter(c => !xy[c]);
console.log('样本字数:', uniq.length);
console.log('平水缺:', missPs.join(''));
console.log('词林缺:', missCl.join(''));
console.log('通韵缺:', missTy.join(''));
console.log('新韵缺:', missXy.join(''));
