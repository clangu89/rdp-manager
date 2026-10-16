const fs = require('fs');
const path = require('path');
const https = require('https');

// Helper to make HTTPS requests
function httpRequest(url, options, bodyData = null) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(parsed);
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${JSON.stringify(parsed)}`));
          }
        } catch (e) {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(data);
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${data}`));
          }
        }
      });
    });

    req.on('error', reject);
    if (bodyData) {
      req.write(bodyData);
    }
    req.end();
  });
}

async function main() {
  try {
    // 1. Read clasprc
    const userProfile = process.env.USERPROFILE || process.env.HOME;
    const clasprcPath = path.join(userProfile, '.clasprc.json');
    const clasprc = JSON.parse(fs.readFileSync(clasprcPath, 'utf8'));
    const t = clasprc.tokens.default;

    console.log('[1/5] Refreshing Google OAuth Token...');
    const refreshBody = new URLSearchParams({
      client_id: t.client_id,
      client_secret: t.client_secret,
      refresh_token: t.refresh_token,
      grant_type: 'refresh_token'
    }).toString();

    const tokenRes = await httpRequest('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(refreshBody)
      }
    }, refreshBody);

    const accessToken = tokenRes.access_token;
    console.log('  -> Token refreshed successfully');

    const scriptId = '1pyiIDx9U53mCSMNcTP_bV_trTw0_KOEUEAca0jKxvRrca3fIqXgEWrn5';

    // 2. Read local code files
    console.log('[2/5] Reading backend code files...');
    const codeGs = fs.readFileSync(path.join(__dirname, 'backend', 'Code.gs'), 'utf8');
    const setupGs = fs.readFileSync(path.join(__dirname, 'backend', 'InitialSetup.gs'), 'utf8');
    const manifest = fs.readFileSync(path.join(__dirname, 'backend', 'appsscript.json'), 'utf8');

    const contentPayload = JSON.stringify({
      files: [
        { name: 'appsscript', type: 'JSON', source: manifest },
        { name: 'Code', type: 'SERVER_JS', source: codeGs },
        { name: 'InitialSetup', type: 'SERVER_JS', source: setupGs }
      ]
    });

    console.log('[3/5] Uploading files to Google Apps Script...');
    const updateRes = await httpRequest(`https://script.googleapis.com/v1/projects/${scriptId}/content`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(contentPayload)
      }
    }, contentPayload);
    console.log(`  -> Uploaded successfully: ${updateRes.files.length} files`);

    // 3. Create version
    console.log('[4/5] Creating version...');
    const verBody = JSON.stringify({ description: 'v1 initial release' });
    const verRes = await httpRequest(`https://script.googleapis.com/v1/projects/${scriptId}/versions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(verBody)
      }
    }, verBody);
    console.log(`  -> Created Version: ${verRes.versionNumber}`);

    // 4. Update existing deployment or create new
    console.log('[5/5] Updating Web App Deployment...');
    const deploymentId = 'AKfycbwCfRzhKre-7Bv41SPhHuGQw2nK0_ResJ4r-_QUsNicl3AlakHyJmNGlvRIneZOVCzn';
    const deployBody = JSON.stringify({
      deploymentConfig: {
        versionNumber: verRes.versionNumber,
        manifestFileName: 'appsscript',
        description: `Production Web App v${verRes.versionNumber}`
      }
    });

    let deployRes;
    try {
      deployRes = await httpRequest(`https://script.googleapis.com/v1/projects/${scriptId}/deployments/${deploymentId}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(deployBody)
        }
      }, deployBody);
      console.log('  -> Deployment updated successfully');
    } catch (e) {
      console.log('  -> Fallback creating new deployment...');
      const createBody = JSON.stringify({
        versionNumber: verRes.versionNumber,
        manifestFileName: 'appsscript',
        description: 'Production Web App'
      });
      deployRes = await httpRequest(`https://script.googleapis.com/v1/projects/${scriptId}/deployments`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(createBody)
        }
      }, createBody);
    }

    let webAppUrl = '';
    if (deployRes.entryPoints) {
      for (const ep of deployRes.entryPoints) {
        if (ep.entryPointType === 'WEB_APP' && ep.webApp && ep.webApp.url) {
          webAppUrl = ep.webApp.url;
          break;
        }
      }
    }
    if (!webAppUrl) {
      webAppUrl = `https://script.google.com/macros/s/${deployRes.deploymentId}/exec`;
    }

    console.log('\n========================================================');
    console.log(`  🎉 SUCCESS! WEB APP URL: ${webAppUrl}`);
    console.log('========================================================\n');

    fs.writeFileSync(path.join(__dirname, 'backend', 'deployed_url.txt'), webAppUrl, 'utf8');

    // Return the URL
    return webAppUrl;
  } catch (err) {
    console.error('Error during deployment:', err.message);
    process.exit(1);
  }
}

main();
