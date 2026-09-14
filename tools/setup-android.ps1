# Prepara esta máquina para compilar o APK do Dev Hub localmente.
#
# Por que isto não roda sozinho: instalar o Android SDK exige ACEITAR AS
# LICENÇAS DO GOOGLE, que é um acordo legal em seu nome. Essa aceitação
# tem que ser sua, não de uma ferramenta.
#
# Alternativa sem instalar nada: use o EAS Build (nuvem) —
#   cd apps/mobile
#   npx eas login
#   npx eas build --platform android --profile preview
#
# Uso:  powershell -ExecutionPolicy Bypass -File tools/setup-android.ps1

$ErrorActionPreference = 'Stop'

Write-Host "`n=== Dev Hub — preparar build local do Android ===`n" -ForegroundColor Cyan

# ---------------------------------------------------------------- JDK 17
$jdk = Get-ChildItem 'C:\Program Files\Eclipse Adoptium','C:\Program Files\Java' -Directory -ErrorAction SilentlyContinue |
  Where-Object { $_.Name -match 'jdk-?(1[7-9]|2[0-9])' } |
  Select-Object -First 1

if ($jdk) {
  Write-Host "[ok]   JDK encontrado: $($jdk.FullName)" -ForegroundColor Green
} else {
  Write-Host "[falta] JDK 17+ não encontrado." -ForegroundColor Yellow
  Write-Host "        Instale com:  winget install EclipseAdoptium.Temurin.17.JDK"
  Write-Host "        Ou baixe em:  https://adoptium.net/temurin/releases/?version=17"
  $instalar = Read-Host "        Instalar agora via winget? (s/N)"
  if ($instalar -eq 's') {
    winget install --id EclipseAdoptium.Temurin.17.JDK --accept-package-agreements --accept-source-agreements
    $jdk = Get-ChildItem 'C:\Program Files\Eclipse Adoptium' -Directory |
      Where-Object { $_.Name -match 'jdk-?17' } | Select-Object -First 1
  } else {
    Write-Host "`nSem JDK 17 não dá para seguir. Use o EAS Build na nuvem." -ForegroundColor Red
    exit 1
  }
}

$env:JAVA_HOME = $jdk.FullName
Write-Host "[ok]   JAVA_HOME = $env:JAVA_HOME" -ForegroundColor Green

# --------------------------------------------------------- Android SDK
$sdk = if ($env:ANDROID_HOME) { $env:ANDROID_HOME } else { "$env:LOCALAPPDATA\Android\Sdk" }

if (Test-Path "$sdk\platform-tools") {
  Write-Host "[ok]   Android SDK encontrado: $sdk" -ForegroundColor Green
} else {
  Write-Host "[falta] Android SDK não encontrado em $sdk" -ForegroundColor Yellow
  Write-Host @"

        Duas opções:

        A) Android Studio (mais simples, ~10 GB)
           winget install Google.AndroidStudio
           Abra uma vez e deixe ele baixar o SDK.

        B) Só as ferramentas de linha de comando (~3 GB)
           Baixe 'Command line tools only' em
           https://developer.android.com/studio#command-line-tools-only
           Extraia em $sdk\cmdline-tools\latest
           Depois rode:
             & "$sdk\cmdline-tools\latest\bin\sdkmanager.bat" --licenses
             & "$sdk\cmdline-tools\latest\bin\sdkmanager.bat" "platform-tools" "platforms;android-35" "build-tools;35.0.0"

        O comando --licenses vai pedir que VOCÊ aceite os termos do Google.
        É por isso que este script não faz essa parte sozinho.

"@ -ForegroundColor Gray
  exit 1
}

$env:ANDROID_HOME = $sdk
"sdk.dir=$($sdk -replace '\\','\\')" | Set-Content -Encoding utf8 "$PSScriptRoot\..\apps\mobile\android\local.properties"

# ------------------------------------------------------------- compilar
Write-Host "`n=== Compilando o APK ===`n" -ForegroundColor Cyan
Push-Location "$PSScriptRoot\..\apps\mobile\android"
try {
  & .\gradlew.bat assembleRelease --no-daemon
  $apk = "app\build\outputs\apk\release\app-release.apk"
  if (Test-Path $apk) {
    $tam = [math]::Round((Get-Item $apk).Length / 1MB, 1)
    Write-Host "`n[pronto] APK gerado: $((Resolve-Path $apk).Path)  ($tam MB)" -ForegroundColor Green
    Write-Host "         Copie para o celular e instale (habilite 'fontes desconhecidas')."
  }
} finally {
  Pop-Location
}
