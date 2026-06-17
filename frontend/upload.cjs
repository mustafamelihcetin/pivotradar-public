const { NodeSSH } = require('node-ssh');
const path = require('path');
const fs = require('fs');

const ssh = new NodeSSH();

async function deploy() {
  try {
    await ssh.connect({
      host: '46.62.141.179',
      username: 'root',
      password: '@Aezakmi2125'
    });

    console.log('Connected to server via SSH');

    const localDist = path.join(__dirname, 'dist');
    const remoteRoot = '/opt/pivotradar/backend/app/static/react';
    const remoteAssets = '/opt/pivotradar/backend/app/static/react/assets';

    // Upload index.html
    console.log('Uploading index.html...');
    await ssh.putFile(path.join(localDist, 'index.html'), path.join(remoteRoot, 'index.html'));

    // Get list of new assets
    const localAssetsPath = path.join(localDist, 'assets');
    const localAssets = fs.readdirSync(localAssetsPath);

    console.log(`Uploading ${localAssets.length} assets...`);
    await ssh.putDirectory(localAssetsPath, remoteAssets);

    // Clean up old assets
    console.log('Cleaning up old assets...');
    const result = await ssh.execCommand('ls', { cwd: remoteAssets });
    const remoteFiles = result.stdout.split('\n').filter(Boolean);
    
    let deletedCount = 0;
    for (const f of remoteFiles) {
      if (!localAssets.includes(f)) {
        await ssh.execCommand(`rm -f "${f}"`, { cwd: remoteAssets });
        deletedCount++;
      }
    }
    
    console.log(`Deleted ${deletedCount} old files`);
    console.log('Deployment complete!');
  } catch (error) {
    console.error('Deployment failed:', error);
  } finally {
    ssh.dispose();
  }
}

deploy();
