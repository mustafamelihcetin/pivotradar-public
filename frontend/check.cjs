const { NodeSSH } = require('node-ssh');
const ssh = new NodeSSH();
async function check() {
  await ssh.connect({ host: '46.62.141.179', username: 'root', password: '@Aezakmi2125' });
  const result = await ssh.execCommand('ls -la /opt/pivotradar/backend/app/static/react/assets | grep index');
  console.log('STDOUT:', result.stdout);
  console.log('STDERR:', result.stderr);
  ssh.dispose();
}
check();
