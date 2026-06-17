# ============================================================
# hotfix.ps1 - PivotRadar Deploy & Operations Tool
# ============================================================
param([string]$Choice = "")

# Sunucu bilgileri deploy.config.ps1 dosyasından okunur (gitignore'lanmış).
# Örnek için: deploy.config.example.ps1
$configFile = Join-Path $PSScriptRoot "deploy.config.ps1"
if (Test-Path $configFile) {
    . $configFile
} else {
    Write-Host "  XX deploy.config.ps1 bulunamadi! deploy.config.example.ps1'i kopyalayip doldurun." -ForegroundColor Red
    exit 1
}

# $SERVER_IP, $SERVER_USER, $SERVER_PATH yukaridaki config'den gelir.
$CONTAINER   = "pivot-radar-terminal"
$BUNDLE      = "hotfix_bundle.tar.gz"
$SSH_KEY     = "$env:USERPROFILE\.ssh\id_ed25519"

$ErrorActionPreference = "Stop"

function Info  ($m) { Write-Host "  >> $m" -ForegroundColor Cyan }
function Ok    ($m) { Write-Host "  OK $m" -ForegroundColor Green }
function Warn  ($m) { Write-Host "  !! $m" -ForegroundColor Yellow }
function Err   ($m) { Write-Host "  XX $m" -ForegroundColor Red }
function Title ($m) { Write-Host "`n=== $m ===" -ForegroundColor Magenta }

# ---- SSH KEY SETUP (ilk calismada otomatik) ---------------------
if (-not (Test-Path $SSH_KEY)) {
    Title "SSH KEY KURULUMU"
    Info "SSH anahtari bulunamadi. Otomatik olusturuluyor..."
    # cmd uzerinden cagir — PowerShell bos string gecirme sorunu olmasin
    & cmd /c "ssh-keygen -t ed25519 -f `"$SSH_KEY`" -N `"`" -q 2>&1"
    if (-not (Test-Path $SSH_KEY)) { Err "Key olusturulamadi!"; exit 1 }
    Ok "Anahtar olusturuldu: $SSH_KEY"

    $pubKey = (Get-Content "$SSH_KEY.pub").Trim()
    Info "Sunucuya yukleniyor (son kez sifre gerekecek)..."
    & ssh -o StrictHostKeyChecking=no -o ConnectTimeout=15 `
        "${SERVER_USER}@${SERVER_IP}" `
        "mkdir -p ~/.ssh && chmod 700 ~/.ssh && grep -qxF '$pubKey' ~/.ssh/authorized_keys 2>/dev/null || echo '$pubKey' >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys && echo DONE"
    Ok "SSH key yuklendi. Artik sifre sorulmayacak."
    Write-Host ""
}

function Invoke-Remote ($cmd) {
    $out = & ssh -i $SSH_KEY -o ServerAliveInterval=30 -o ConnectTimeout=15 -o StrictHostKeyChecking=no `
        "$SERVER_USER@$SERVER_IP" $cmd
    return $out
}

function Send-File ($local, $remote) {
    & scp -i $SSH_KEY -o ServerAliveInterval=30 -o ConnectTimeout=15 -o StrictHostKeyChecking=no `
        $local "${SERVER_USER}@${SERVER_IP}:${remote}"
}

# ---- MENU -------------------------------------------------------
Write-Host ""
Write-Host "  PivotRadar - Deploy & Operations" -ForegroundColor White
Write-Host ""
Write-Host "  [1]  Backend Only          (hizli ~15sn)"
Write-Host "  [2]  Frontend Only         (build ~1dk)"
Write-Host "  [3]  Full Hotfix           (backend + frontend)"
Write-Host "  [4]  Env Sync              (sunucu .env guncelle)"
Write-Host "  [5]  Models Sync           (models/ dizini gonder)"
Write-Host "  [6]  Full Rebuild          (docker build --no-cache)"
Write-Host "  [7]  Health Check          (sunucu durumu)"
Write-Host "  [8]  Logs                  (container log)"
Write-Host ""

if (-not $Choice) {
    try { $Choice = Read-Host "Seciminiz (varsayilan: 3)" } catch { $Choice = "3" }
}
$choice = if ($Choice) { $Choice } else { "3" }

# ---- [7] HEALTH CHECK -------------------------------------------
if ($choice -eq "7") {
    Title "HEALTH CHECK"

    $ps = Invoke-Remote "cd $SERVER_PATH && docker compose ps --format 'table {{.Name}}\t{{.Status}}\t{{.Ports}}'"
    Write-Host $ps

    $http = Invoke-Remote "curl -s -o /dev/null -w '%{http_code}' http://localhost/ --max-time 8 2>/dev/null || echo ERR"
    if ($http -match "200|301|302") {
        Ok "API HTTP $http"
    } else {
        Warn "API HTTP $http"
    }

    $envOut = Invoke-Remote "missing=''; for key in TURNSTILE_ENABLED TURNSTILE_SITE_KEY TURNSTILE_SECRET_KEY MLFLOW_EXTERNAL_URL SECRET_KEY GOOGLE_CLIENT_ID SMTP_HOST; do grep -q `"^\$key=`" $SERVER_PATH/.env 2>/dev/null || missing=`"`$missing `$key`"; done; echo `$missing"
    if ($envOut -and $envOut.Trim() -ne "") {
        Warn ".env eksik anahtarlar:$envOut"
    } else {
        Ok ".env - tum kritik anahtarlar mevcut"
    }
    exit 0
}

# ---- [8] LOGS ---------------------------------------------------
if ($choice -eq "8") {
    Title "CONTAINER LOGS"
    $logs = Invoke-Remote "docker logs --tail 80 $CONTAINER 2>&1"
    Write-Host $logs
    exit 0
}

# ---- [4] ENV SYNC -----------------------------------------------
if ($choice -eq "4") {
    Title "ENV SYNC"
    if (-not (Test-Path ".env")) { Err ".env bulunamadi!"; exit 1 }

    $localLines = Get-Content ".env" | Where-Object { $_ -match "^[A-Z_]+=." -and $_ -notmatch "^#" }
    $remoteKeys = Invoke-Remote "grep -oP '^[A-Z_]+(?==)' $SERVER_PATH/.env 2>/dev/null || true"

    $added = 0
    $updated = 0
    foreach ($line in $localLines) {
        $key = ($line -split "=")[0].Trim()
        $val = $line.Substring($key.Length + 1)
        if ($remoteKeys -notcontains $key) {
            Info "Ekleniyor: $key"
            $escaped = $line -replace '"', '\"'
            Invoke-Remote "echo `"$escaped`" >> $SERVER_PATH/.env" | Out-Null
            $added++
        } else {
            # Mevcut degerle karsilastir, farkli ise guncelle
            $remoteVal = Invoke-Remote "grep -m1 '^${key}=' $SERVER_PATH/.env | cut -d= -f2-"
            if ($remoteVal -ne $val) {
                Info "Guncelleniyor: $key"
                Invoke-Remote "sed -i 's|^${key}=.*|${key}=${val}|' $SERVER_PATH/.env" | Out-Null
                $updated++
            }
        }
    }

    if ($added -eq 0 -and $updated -eq 0) {
        Ok "Sunucu .env guncel, degisiklik yok."
    } else {
        Ok "$added eklendi, $updated guncellendi. Container yeniden baslatiliyor..."
        Invoke-Remote "cd $SERVER_PATH && docker compose restart pivot-radar" | Out-Null
        Start-Sleep -Seconds 8
        $http = Invoke-Remote "curl -s -o /dev/null -w '%{http_code}' http://localhost/ --max-time 8 2>/dev/null || echo ERR"
        if ($http -match "200|301|302") {
            Ok "Uygulama ayakta ($http)"
        } else {
            Warn "HTTP yaniti: $http - logları kontrol et"
        }
    }
    exit 0
}

# ---- [5] MODELS SYNC --------------------------------------------
if ($choice -eq "5") {
    Title "MODELS SYNC"
    if (-not (Test-Path "models")) { Err "models/ dizini bulunamadi!"; exit 1 }

    $tmpTar = "models_bundle.tar.gz"
    tar -czf $tmpTar -C models .
    Info "models/ paketlendi, gonderiliyor..."
    Send-File $tmpTar "$SERVER_PATH/$tmpTar"
    Remove-Item $tmpTar

    Invoke-Remote "cd $SERVER_PATH && mkdir -p models && tar -xzf $tmpTar -C models && rm $tmpTar" | Out-Null
    Ok "models/ senkronize edildi."
    exit 0
}

# ---- [6] FULL REBUILD -------------------------------------------
$doRebuild = $false
if ($choice -eq "6") {
    Warn "Bu islem 5-10 dakika surebilir. Devam? (E/h)"
    $confirm = Read-Host
    if ($confirm -eq "h" -or $confirm -eq "H") { exit 0 }
    $doRebuild = $true
    $choice = "3"
}

# ---- [1] [2] [3] PREPARE ----------------------------------------
Title "HAZIRLANIYOR"

if (Test-Path "hotfix_temp") { Remove-Item -Recurse -Force "hotfix_temp" }
New-Item -ItemType Directory -Path "hotfix_temp" | Out-Null

if ($choice -eq "1" -or $choice -eq "3") {
    Info "Backend kopyalaniyor..."
    New-Item -ItemType Directory -Path "hotfix_temp\backend" | Out-Null
    Copy-Item -Path "backend\app" -Destination "hotfix_temp\backend\" -Recurse
    # static/react build artifacts'i paketten cikar — frontend deploy ayrı gönderir (~68MB tasarruf)
    if (Test-Path "hotfix_temp\backend\app\static\react") {
        Remove-Item -Recurse -Force "hotfix_temp\backend\app\static\react"
    }
    Get-ChildItem "hotfix_temp" -Recurse -Directory -Filter "__pycache__" |
        Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
    Ok "Backend hazir."
}

if ($choice -eq "2" -or $choice -eq "3") {
    Info "Frontend derleniyor..."
    $buildOut = & cmd /c "cd frontend && npm run build 2>&1"
    $buildExit = $LASTEXITCODE
    $buildOut | Where-Object { $_ -match "built in|error|ERROR|warn" } | ForEach-Object { Write-Host "    $_" }

    if ($buildExit -ne 0 -or -not (Test-Path "frontend\dist")) {
        Err "Frontend build basarisiz!"
        Remove-Item -Recurse -Force "hotfix_temp" -ErrorAction SilentlyContinue
        exit 1
    }

    Copy-Item -Path "frontend\dist\*" -Destination "static\react\" -Recurse -Force
    # backend/app/static/react/ senkronize et — backend deploy bunu sunucuya gönderir
    Copy-Item -Path "frontend\dist\*" -Destination "backend\app\static\react\" -Recurse -Force
    Copy-Item -Path "frontend\dist" -Destination "hotfix_temp\" -Recurse
    Ok "Frontend hazir."
}

# Bundle
if (Test-Path $BUNDLE) { Remove-Item $BUNDLE }
tar -czf $BUNDLE -C hotfix_temp .
Remove-Item -Recurse -Force "hotfix_temp"
$sizeMB = [math]::Round((Get-Item $BUNDLE).Length / 1MB, 2)
Ok "Paket olusturuldu: $BUNDLE ($sizeMB MB)"

# ---- SEND -------------------------------------------------------
Title "SUNUCUYA GONDERILIYOR"
Send-File $BUNDLE "$SERVER_PATH/$BUNDLE"
Ok "Transfer tamamlandi."

# ---- INJECT & RESTART -------------------------------------------
Title "ENJEKTE EDILIYOR"

$remoteCmd = "set -e; cd $SERVER_PATH; tar -xzf $BUNDLE;"

if ($choice -eq "1" -or $choice -eq "3") {
    # Volume mount: ./backend/app → /app/backend/app — tar extraction yeterli, docker cp gerekmez.
    # __pycache__ dosyalarini sil (stale bytecode'u temizle)
    $remoteCmd += " find backend/app -name '__pycache__' -type d -exec rm -rf {} + 2>/dev/null || true;"
}
if ($choice -eq "2" -or $choice -eq "3") {
    # Frontend: ./backend/app/static/react volume mount araciligiyla sunulur
    $remoteCmd += " mkdir -p backend/app/static/react && cp -r dist/. backend/app/static/react/;"
}

# backend/ TUTULUR — volume mount kaynagi. Sadece tarball ve dist temizlenir.
$remoteCmd += " rm -f $BUNDLE; rm -rf dist;"

if ($doRebuild) {
    $remoteCmd += " docker compose build --no-cache pivot-radar && docker compose up -d pivot-radar;"
} else {
    $remoteCmd += " docker compose restart pivot-radar;"
}

$remoteCmd += " sleep 10; docker logs --tail 60 $CONTAINER 2>&1"

$logs = Invoke-Remote $remoteCmd
$hasError = $false
$errorLines = @()

foreach ($line in $logs) {
    Write-Host $line
    if ($line -match "ModuleNotFoundError|ImportError|SyntaxError|Cannot start") {
        $hasError = $true
        $errorLines += $line
    }
}

# ---- RESULT -----------------------------------------------------
Title "SONUC"

if ($hasError) {
    Err "Container baslatilirken hata tespit edildi:"
    foreach ($l in $errorLines) { Warn "  $l" }
    Warn "Log icin secim [8]'i kullanin."
} else {
    $http = Invoke-Remote "curl -s -o /dev/null -w '%{http_code}' http://localhost/ --max-time 10 2>/dev/null || echo ERR"
    if ($http -match "200|301|302") {
        Ok "Deploy basarili! HTTP $http"
    } else {
        Warn "Deploy tamamlandi fakat HTTP yaniti: $http"
    }
}

# .env eksik anahtar kontrolu — for loop yerine dogrudan grep
$missingKeys = @()
foreach ($k in @("TURNSTILE_ENABLED","TURNSTILE_SITE_KEY","TURNSTILE_SECRET_KEY","MLFLOW_EXTERNAL_URL","SECRET_KEY")) {
    $found = Invoke-Remote "grep -c '^${k}=' $SERVER_PATH/.env 2>/dev/null || echo 0"
    if (-not $found -or $found.ToString().Trim() -eq "0") { $missingKeys += $k }
}
if ($missingKeys.Count -gt 0) {
    Warn "Sunucu .env eksik anahtarlar: $($missingKeys -join ', ')"
    Warn "Cozum: .\hotfix.ps1 secim [4] Env Sync"
} else {
    Ok ".env - tum kritik anahtarlar mevcut."
}

if (Test-Path $BUNDLE) { Remove-Item $BUNDLE }
Write-Host ""
