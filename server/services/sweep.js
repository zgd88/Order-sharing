const { sweepOnce } = require('./tier-engine');

let timer = null;

function startSweep(intervalMs = 60 * 1000) {
  if (timer) return;
  timer = setInterval(() => {
    try {
      const r = sweepOnce();
      if (r.failed || r.finished) {
        console.log(`[sweep] 本轮处理：流局 ${r.failed} 门，完成 ${r.finished} 门`);
      }
    } catch (e) {
      console.error('[sweep] 扫描出错:', e.message);
    }
  }, intervalMs);
  console.log('[sweep] 定时扫描已启动（每分钟）');
}

module.exports = { startSweep };
