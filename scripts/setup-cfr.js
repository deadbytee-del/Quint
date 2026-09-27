// Downloads the CFR decompiler (single jar, MIT licensed) from Maven Central
// into server/tools/cfr.jar if it isn't already present.
const fs = require('fs');
const path = require('path');
const https = require('https');

const CFR_VERSION = '0.152';
const CFR_URL = `https://repo1.maven.org/maven2/org/benf/cfr/${CFR_VERSION}/cfr-${CFR_VERSION}.jar`;
const DEST = path.join(__dirname, '..', 'server', 'tools', 'cfr.jar');

function download(url, dest, redirectsLeft = 5) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https
      .get(url, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirectsLeft > 0) {
          file.close();
          fs.unlinkSync(dest);
          resolve(download(res.headers.location, dest, redirectsLeft - 1));
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error(`Failed to download CFR: HTTP ${res.statusCode}`));
          return;
        }
        res.pipe(file);
        file.on('finish', () => file.close(resolve));
      })
      .on('error', reject);
  });
}

async function ensureCfr() {
  if (fs.existsSync(DEST) && fs.statSync(DEST).size > 0) {
    return DEST;
  }
  fs.mkdirSync(path.dirname(DEST), { recursive: true });
  await download(CFR_URL, DEST);
  return DEST;
}

if (require.main === module) {
  ensureCfr()
    .then((dest) => console.log(`CFR decompiler ready at ${dest}`))
    .catch((err) => {
      console.error('Failed to set up CFR decompiler:', err.message);
      process.exit(1);
    });
}

module.exports = { ensureCfr, DEST };
