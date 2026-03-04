# ─────────────────────────────────────────────────────────────
# NaukriAI — Ollama Setup Script (Windows PowerShell)
# Run as Administrator: powershell -ExecutionPolicy Bypass -File install_ollama.ps1
# ─────────────────────────────────────────────────────────────

Write-Host "=====================================" -ForegroundColor Cyan
Write-Host " NaukriAI Local AI Setup" -ForegroundColor Cyan
Write-Host "=====================================" -ForegroundColor Cyan

# Step 1: Install Ollama
Write-Host "`n[1/4] Installing Ollama..." -ForegroundColor Yellow
$ollamaPath = "$env:LOCALAPPDATA\Programs\Ollama\ollama.exe"

if (Test-Path $ollamaPath) {
    Write-Host "Ollama already installed." -ForegroundColor Green
} else {
    Write-Host "Downloading Ollama installer..."
    $installerUrl = "https://ollama.ai/download/OllamaSetup.exe"
    $installerPath = "$env:TEMP\OllamaSetup.exe"

    try {
        Invoke-WebRequest -Uri $installerUrl -OutFile $installerPath -UseBasicParsing
        Write-Host "Running Ollama installer..."
        Start-Process -FilePath $installerPath -ArgumentList "/S" -Wait
        Write-Host "Ollama installed successfully." -ForegroundColor Green
    } catch {
        Write-Host "ERROR: Could not download Ollama. Install manually from https://ollama.ai" -ForegroundColor Red
        exit 1
    }
}

# Step 2: Start Ollama service
Write-Host "`n[2/4] Starting Ollama service..." -ForegroundColor Yellow
Start-Process -FilePath $ollamaPath -ArgumentList "serve" -WindowStyle Hidden
Start-Sleep -Seconds 3

# Check if Ollama is running
try {
    $response = Invoke-WebRequest -Uri "http://localhost:11434/api/version" -UseBasicParsing -TimeoutSec 5
    Write-Host "Ollama service is running." -ForegroundColor Green
} catch {
    Write-Host "WARNING: Ollama may not be running. Try 'ollama serve' manually." -ForegroundColor Yellow
}

# Step 3: Pull the primary model
Write-Host "`n[3/4] Pulling Mistral 7B Instruct model (~4.1GB)..." -ForegroundColor Yellow
Write-Host "This requires internet ONCE. After download, runs fully offline." -ForegroundColor Gray

# Check available RAM to pick model
$totalRAM = (Get-CimInstance Win32_ComputerSystem).TotalPhysicalMemory / 1GB

Write-Host "Detected RAM: $([math]::Round($totalRAM, 1)) GB" -ForegroundColor Gray

if ($totalRAM -ge 14) {
    $model = "mistral:7b-instruct-v0.3-q4_K_M"
    Write-Host "Using: Mistral 7B (optimal for $([math]::Round($totalRAM,0))GB RAM)" -ForegroundColor Green
} elseif ($totalRAM -ge 7) {
    $model = "mistral:7b-instruct-q2_K"
    Write-Host "Using: Mistral 7B (heavily quantized for $([math]::Round($totalRAM,0))GB RAM)" -ForegroundColor Yellow
} else {
    $model = "phi3:mini"
    Write-Host "Using: Phi-3 Mini (low memory mode for $([math]::Round($totalRAM,0))GB RAM)" -ForegroundColor Yellow
}

& $ollamaPath pull $model

if ($LASTEXITCODE -eq 0) {
    Write-Host "Model '$model' downloaded successfully." -ForegroundColor Green
} else {
    Write-Host "ERROR: Model pull failed." -ForegroundColor Red
}

# Step 4: Also pull fallback model
Write-Host "`n[4/4] Pulling Phi-3 Mini fallback model (~2.3GB)..." -ForegroundColor Yellow
& $ollamaPath pull phi3:mini

# Step 5: Create .env file
Write-Host "`nCreating .env file..." -ForegroundColor Yellow
$envPath = Join-Path $PSScriptRoot "..\\.env"
if (-not (Test-Path $envPath)) {
    Copy-Item (Join-Path $PSScriptRoot "..\\.env.example") $envPath
    Write-Host ".env created from .env.example" -ForegroundColor Green
} else {
    Write-Host ".env already exists, skipping." -ForegroundColor Gray
}

# Done
Write-Host "`n=====================================" -ForegroundColor Cyan
Write-Host " Setup Complete!" -ForegroundColor Green
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Next steps:" -ForegroundColor White
Write-Host "  1. cd ai-engine"
Write-Host "  2. pip install -r requirements.txt"
Write-Host "  3. python -m spacy download en_core_web_sm"
Write-Host "  4. python main.py"
Write-Host ""
Write-Host "AI Engine will run at: http://localhost:8000"
Write-Host "API docs at:           http://localhost:8000/docs"
