const { NodeSSH } = require('node-ssh');
const ssh = new NodeSSH();
async function check() {
  await ssh.connect({ host: '46.62.141.179', username: 'root', password: '@Aezakmi2125' });
  const result = await ssh.execCommand('curl -s -I http://localhost:8051/assets/index-DTgxGSIO.js');
  console.log('STDOUT:\n', result.stdout);
  ssh.dispose();
}
check();
