import subprocess
import sys

def run_ssh_command(password, host, cmd):
    # Use plink if available, otherwise try to use a pipe with ssh
    # Since we are on Windows, we'll try to use a simple pipe first
    # However, ssh often bypasses stdin for password.
    # We'll try to use powershell to run it if possible.
    
    ps_cmd = f'$p = ConvertTo-SecureString "{password}" -AsPlainText -Force; $c = New-Object System.Management.Automation.PSCredential ("root", $p); ssh root@{host} "{cmd}"'
    # Actually, PowerShell ssh doesn't support PSCredential directly.
    
    # Let's try the simplest:
    try:
        proc = subprocess.Popen(
            ["ssh", f"root@{host}", cmd],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True
        )
        # Most SSH clients won't take password from stdin.
        # But let's try.
        stdout, stderr = proc.communicate(input=password + "\n", timeout=15)
        print("STDOUT:", stdout)
        print("STDERR:", stderr)
    except Exception as e:
        print("ERROR:", e)

if __name__ == "__main__":
    run_ssh_command("@Aezakmi2125", "46.62.141.179", "docker logs pivot-radar-terminal --tail 100")
