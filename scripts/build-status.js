// Used by the "Build status" workflow: lists the latest Android builds (from builds.json, written by
// `eas build:list --json`) and, when the newest one failed, prints the part of its log that says why.
const fs = require('fs');

async function main() {
  const builds = JSON.parse(fs.readFileSync('builds.json', 'utf8'));
  for (const b of builds) {
    console.log([b.id, b.status, b.createdAt, b.error ? JSON.stringify(b.error) : '', b.artifacts?.buildUrl ?? ''].join('  '));
  }
  const newest = builds[0];
  if (!newest || newest.status !== 'ERRORED') {
    console.log(`\nNewest build did not fail (${newest ? newest.status : 'no builds'}).`);
    return;
  }
  // EAS logs are one JSON object per line, with the text in "msg"
  const lines = [];
  for (const url of newest.logFiles ?? []) {
    const text = await (await fetch(url)).text();
    for (const l of text.split('\n')) {
      if (!l.trim()) continue;
      try {
        lines.push(String(JSON.parse(l).msg ?? ''));
      } catch {
        lines.push(l);
      }
    }
  }
  const hit = lines.findIndex((l) => /FAILURE: Build failed|What went wrong|Execution failed for task/i.test(l));
  const from = Math.max(0, (hit < 0 ? lines.length : hit) - 60);
  console.log(`\n--- Log of failed build ${newest.id} (${lines.length} lines; showing ${from}–${from + 160}) ---`);
  console.log(lines.slice(from, from + 160).join('\n'));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
