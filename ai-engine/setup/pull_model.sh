#!/bin/bash
# ─────────────────────────────────────────────────────────────
# NaukriAI — Model Setup Script (Linux/Mac)
# Run: chmod +x setup/pull_model.sh && ./setup/pull_model.sh
# ─────────────────────────────────────────────────────────────

set -e

echo "=================================="
echo " NaukriAI Local AI Setup (Linux)"
echo "=================================="

# Install Ollama
if ! command -v ollama &> /dev/null; then
    echo "[1/4] Installing Ollama..."
    curl -fsSL https://ollama.ai/install.sh | sh
else
    echo "[1/4] Ollama already installed: $(ollama --version)"
fi

# Start Ollama in background
echo "[2/4] Starting Ollama service..."
ollama serve &>/dev/null &
sleep 3

# Detect RAM and choose model
TOTAL_RAM_GB=$(free -g | awk '/^Mem:/{print $2}')
echo "Detected RAM: ${TOTAL_RAM_GB}GB"

if [ "$TOTAL_RAM_GB" -ge 14 ]; then
    MODEL="mistral:7b-instruct-v0.3-q4_K_M"
    echo "Using: Mistral 7B Q4_K_M (optimal)"
elif [ "$TOTAL_RAM_GB" -ge 7 ]; then
    MODEL="mistral:7b-instruct-q2_K"
    echo "Using: Mistral 7B Q2_K (memory-optimized)"
else
    MODEL="phi3:mini"
    echo "Using: Phi-3 Mini (low-memory mode)"
fi

# Pull models
echo "[3/4] Pulling primary model: $MODEL (~4.1GB, one-time download)..."
ollama pull $MODEL

echo "[4/4] Pulling fallback model: phi3:mini..."
ollama pull phi3:mini

# Create custom model variant
echo "Creating NaukriAI custom model..."
ollama create naukri-cv-parser -f ./setup/Modelfile || true

# Setup .env
if [ ! -f ".env" ]; then
    cp .env.example .env
    echo ".env created."
fi

echo ""
echo "=================================="
echo " Setup Complete!"
echo "=================================="
echo "Run the AI engine:"
echo "  pip install -r requirements.txt"
echo "  python -m spacy download en_core_web_sm"
echo "  python main.py"
echo ""
echo "Docs: http://localhost:8000/docs"
