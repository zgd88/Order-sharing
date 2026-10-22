// 生成 miniprogram/utils/regions.js：全国省/市/区县三级数据（数据源 china-division）
// 用法：npm install --no-save china-division && node scripts/gen-regions.js
const fs = require('fs');
const path = require('path');
const pca = require('china-division/dist/pca.json');

const MUNICIPALITIES = ['北京市', '上海市', '天津市', '重庆市'];

const provinces = Object.entries(pca).map(([provinceName, cityMap]) => {
  let cities;
  if (MUNICIPALITIES.includes(provinceName)) {
    // 直辖市：城市层直接为直辖市名，区县合并
    const areas = Object.values(cityMap).flat();
    cities = [{ name: provinceName, areas }];
  } else {
    cities = Object.entries(cityMap || {}).map(([cityName, areas]) => ({
      name: cityName,
      areas: areas || [],
    }));
  }
  return { name: provinceName, cities };
});

const outPath = path.join(__dirname, '..', '..', 'miniprogram', 'utils', 'regions.js');
const content = `// 全国省/市/区县三级数据（由 server/scripts/gen-regions.js 生成，数据源 china-division）
module.exports = ${JSON.stringify(provinces)};
`;
fs.writeFileSync(outPath, content, 'utf8');
const stat = fs.statSync(outPath);
console.log(`[gen-regions] 已生成 ${outPath}`);
console.log(`  省级 ${provinces.length} 个，市级 ${provinces.reduce((s, p) => s + p.cities.length, 0)} 个`);
console.log(`  文件大小 ${(stat.size / 1024).toFixed(1)} KB`);
