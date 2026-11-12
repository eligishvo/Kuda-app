// First-run helper for CI: after `eas init` has written the project id into app.json,
// point expo-updates at that project.
const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '..', 'app.json');
const app = JSON.parse(fs.readFileSync(file, 'utf8'));
const id = app.expo?.extra?.eas?.projectId;
if (!id) {
  console.error('No EAS project id in app.json — did `eas init` run?');
  process.exit(1);
}
app.expo.updates = { ...(app.expo.updates ?? {}), url: `https://u.expo.dev/${id}` };
fs.writeFileSync(file, JSON.stringify(app, null, 2) + '\n');
console.log(`Linked to EAS project ${id}`);
