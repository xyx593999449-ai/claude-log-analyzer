const fs = require('fs');

function patchSqlite() {
  let content = fs.readFileSync('server/repository.ts', 'utf-8');
  content = content.replace(
    /FROM poi_verified\n      `\)\n      \.get\(\) as \{ manual_count: number \| null; verified_total: number \| null \};/g,
    `FROM poi_verified v\n      \${buildWhere("v.").sql}\n      \`)\n      .get(buildWhere("v.").params) as { manual_count: number | null; verified_total: number | null };`
  );
  content = content.replace(
    /LEFT JOIN poi_verified v ON v\.task_id = q\.task_id\n      `\)\n      \.get\(\) as \{ matched_count: number \| null; qc_total: number \| null \};/g,
    `LEFT JOIN poi_verified v ON v.task_id = q.task_id\n        \${buildWhere("q.").sql}\n      \`)\n      .get(buildWhere("q.").params) as { matched_count: number | null; qc_total: number | null };`
  );

  const findStrSQLite = `const vrStarted = row.vr_started as string | null;
      const qrStarted = row.qr_started as string | null;
      const vrEnded = row.vr_ended as string | null;
      const qrEnded = row.qr_ended as string | null;

      if (vrStarted) {
        item.anyTaskStarted = true;
        if (!item.minStarted || (new Date(vrStarted) < new Date(item.minStarted))) item.minStarted = String(vrStarted);
      }
      if (qrStarted) {
        item.anyTaskStarted = true;
        if (!item.minStarted || (new Date(qrStarted) < new Date(item.minStarted))) item.minStarted = String(qrStarted);
      }

      if (vrEnded) {
        if (!item.maxEnded || (new Date(vrEnded) > new Date(item.maxEnded))) item.maxEnded = String(vrEnded);
      }
      if (qrEnded) {
        if (!item.maxEnded || (new Date(qrEnded) > new Date(item.maxEnded))) item.maxEnded = String(qrEnded);
      }

      if (!vrStarted && !qrStarted) {
        item.allTasksCompleted = false;
      } else {
        const isVrRunning = row.vr_status === 'running' || row.vr_status === 'pending';
        const isQrRunning = row.qr_status === 'running' || row.qr_status === 'pending';
        if (isVrRunning || isQrRunning) {
          item.allTasksCompleted = false;
        }
      }`;

  const replaceStrSQLite = `const isVerified = row.bus_vr != null || row.bus_vs != null;
      const isQcDone = row.is_qualified != null || row.bus_qs != null || row.bus_qys != null;
      const startedVrTime = row.vr_started as string | null;
      const startedQrTime = row.qr_started as string | null;
      
      if (startedVrTime || startedQrTime || isVerified || isQcDone) {
        item.anyTaskStarted = true;
      }

      if (startedVrTime && (!item.minStarted || (new Date(startedVrTime) < new Date(item.minStarted)))) item.minStarted = String(startedVrTime);
      if (startedQrTime && (!item.minStarted || (new Date(startedQrTime) < new Date(item.minStarted)))) item.minStarted = String(startedQrTime);

      const vrEnded = row.vr_ended as string | null;
      const qrEnded = row.qr_ended as string | null;
      if (vrEnded && (!item.maxEnded || (new Date(vrEnded) > new Date(item.maxEnded)))) item.maxEnded = String(vrEnded);
      if (qrEnded && (!item.maxEnded || (new Date(qrEnded) > new Date(item.maxEnded)))) item.maxEnded = String(qrEnded);

      const isTaskUnstarted = !startedVrTime && !startedQrTime && !isVerified && !isQcDone;
      const isVrRunning = row.vr_status === 'running' || row.vr_status === 'pending';
      const isQrRunning = row.qr_status === 'running' || row.qr_status === 'pending';
      
      if (isTaskUnstarted || isVrRunning || isQrRunning) {
        item.allTasksCompleted = false;
      }`;
  content = content.replace(findStrSQLite, replaceStrSQLite);

  content = content.replace(
    /v\.verify_result,\n\s+q\.is_qualified,/g,
    `v.verify_status AS bus_vs,\n          v.verify_result AS bus_vr,\n          q.qc_status AS bus_qs,\n          q.quality_status as bus_qys,\n          q.is_qualified,`
  );

  fs.writeFileSync('server/repository.ts', content);
  console.log('Patched server/repository.ts');
}

function patchPg() {
  let content = fs.readFileSync('server/repository.pg.ts', 'utf-8');
  
  content = content.replace(
    /v\.verify_result,\n\s+q\.is_qualified,/g,
    `v.verify_status AS bus_vs,\n          v.verify_result AS bus_vr,\n          q.qc_status AS bus_qs,\n          q.quality_status as bus_qys,\n          q.is_qualified,`
  );

  const findStrSQLite = `const vrStarted = row.vr_started as string | null;
      const qrStarted = row.qr_started as string | null;
      const vrEnded = row.vr_ended as string | null;
      const qrEnded = row.qr_ended as string | null;

      if (vrStarted) {
        item.anyTaskStarted = true;
        if (!item.minStarted || (new Date(vrStarted) < new Date(item.minStarted))) item.minStarted = String(vrStarted);
      }
      if (qrStarted) {
        item.anyTaskStarted = true;
        if (!item.minStarted || (new Date(qrStarted) < new Date(item.minStarted))) item.minStarted = String(qrStarted);
      }

      if (vrEnded) {
        if (!item.maxEnded || (new Date(vrEnded) > new Date(item.maxEnded))) item.maxEnded = String(vrEnded);
      }
      if (qrEnded) {
        if (!item.maxEnded || (new Date(qrEnded) > new Date(item.maxEnded))) item.maxEnded = String(qrEnded);
      }

      if (!vrStarted && !qrStarted) {
        item.allTasksCompleted = false;
      } else {
        const isVrRunning = row.vr_status === 'running' || row.vr_status === 'pending';
        const isQrRunning = row.qr_status === 'running' || row.qr_status === 'pending';
        if (isVrRunning || isQrRunning) {
          item.allTasksCompleted = false;
        }
      }`;

  const replaceStrSQLite = `const isVerified = row.bus_vr != null || row.bus_vs != null;
      const isQcDone = row.is_qualified != null || row.bus_qs != null || row.bus_qys != null;
      const startedVrTime = row.vr_started as string | null;
      const startedQrTime = row.qr_started as string | null;
      
      if (startedVrTime || startedQrTime || isVerified || isQcDone) {
        item.anyTaskStarted = true;
      }

      if (startedVrTime && (!item.minStarted || (new Date(startedVrTime) < new Date(item.minStarted)))) item.minStarted = String(startedVrTime);
      if (startedQrTime && (!item.minStarted || (new Date(startedQrTime) < new Date(item.minStarted)))) item.minStarted = String(startedQrTime);

      const vrEnded = row.vr_ended as string | null;
      const qrEnded = row.qr_ended as string | null;
      if (vrEnded && (!item.maxEnded || (new Date(vrEnded) > new Date(item.maxEnded)))) item.maxEnded = String(vrEnded);
      if (qrEnded && (!item.maxEnded || (new Date(qrEnded) > new Date(item.maxEnded)))) item.maxEnded = String(qrEnded);

      const isTaskUnstarted = !startedVrTime && !startedQrTime && !isVerified && !isQcDone;
      const isVrRunning = row.vr_status === 'running' || row.vr_status === 'pending';
      const isQrRunning = row.qr_status === 'running' || row.qr_status === 'pending';
      
      if (isTaskUnstarted || isVrRunning || isQrRunning) {
        item.allTasksCompleted = false;
      }`;

  content = content.replace(findStrSQLite, replaceStrSQLite);

  fs.writeFileSync('server/repository.pg.ts', content);
  console.log('Patched server/repository.pg.ts');
}

patchSqlite();
patchPg();
