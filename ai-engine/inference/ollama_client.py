"""
INFERENCE MODULE — Ollama Client
Communicates with the local Ollama inference server.
Handles retries, fallbacks, and JSON validation.

Ollama runs models like Mistral, Phi-3, Llama-3 locally with no API key.
"""

import json
import asyncio
import os
from typing import Optional, AsyncGenerator
from loguru import logger
import httpx
from dotenv import load_dotenv

load_dotenv()


class OllamaClient:
    """
    Async HTTP client for the local Ollama server.

    Model choice: mistral:7b-instruct-v0.3-q4_K_M
    - WHY MISTRAL 7B?
      1. 7B params = good capability at manageable size
      2. q4_K_M quantization = ~4.1GB VRAM, runs on 8GB GPU or 16GB RAM CPU
      3. Instruct-tuned = follows JSON output instructions reliably
      4. Apache 2.0 license = commercial use permitted
      5. 8K context window = handles most CVs in one pass
      6. Outperforms GPT-3.5 on many benchmarks at local speed

    Fallback: phi3:mini (3.8B, ~2.3GB VRAM)
    - For machines with <8GB RAM
    - Still capable for structured extraction tasks
    """

    def __init__(self):
        self.base_url = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
        self.primary_model = os.getenv("OLLAMA_MODEL", "mistral:7b-instruct-v0.3-q4_K_M")
        self.fallback_model = os.getenv("OLLAMA_FALLBACK_MODEL", "phi3:mini")
        self.timeout = int(os.getenv("OLLAMA_TIMEOUT", "120"))
        self.max_retries = int(os.getenv("OLLAMA_MAX_RETRIES", "3"))
        self.temperature = float(os.getenv("LLM_TEMPERATURE", "0.1"))
        self.max_tokens = int(os.getenv("LLM_MAX_TOKENS", "4096"))
        self._available: Optional[bool] = None
        self._active_model: Optional[str] = None

    async def is_available(self) -> bool:
        """Check if Ollama server is running."""
        try:
            async with httpx.AsyncClient(timeout=5) as client:
                resp = await client.get(f"{self.base_url}/api/version")
                self._available = resp.status_code == 200
                return self._available
        except Exception:
            self._available = False
            return False

    async def get_active_model(self) -> Optional[str]:
        """Return the first available model (primary → fallback)."""
        if self._active_model:
            return self._active_model

        for model in [self.primary_model, self.fallback_model]:
            if await self._model_exists(model):
                self._active_model = model
                logger.info(f"Using Ollama model: {model}")
                return model

        logger.warning("No Ollama models found. Will attempt to pull on first use.")
        return self.primary_model

    async def _model_exists(self, model: str) -> bool:
        """Check if a model is pulled locally."""
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.post(
                    f"{self.base_url}/api/show",
                    json={"name": model}
                )
                return resp.status_code == 200
        except Exception:
            return False

    async def generate(self, prompt: str, model: Optional[str] = None) -> str:
        """
        Generate text from a prompt using the local Ollama model.

        Args:
            prompt: The full prompt string (including [INST] tags for Mistral)
            model: Override model name

        Returns:
            Generated text string

        Raises:
            RuntimeError: If Ollama is not available and no fallback
        """
        if not await self.is_available():
            raise RuntimeError(
                "Ollama server is not running. "
                "Start it with: ollama serve"
            )

        active_model = model or await self.get_active_model()

        for attempt in range(self.max_retries):
            try:
                async with httpx.AsyncClient(
                    timeout=httpx.Timeout(self.timeout)
                ) as client:
                    payload = {
                        "model": active_model,
                        "prompt": prompt,
                        "stream": False,
                        "options": {
                            "temperature": self.temperature,
                            "num_predict": self.max_tokens,
                            "top_p": 0.9,
                            "repeat_penalty": 1.1,
                        },
                    }
                    resp = await client.post(
                        f"{self.base_url}/api/generate",
                        json=payload
                    )
                    resp.raise_for_status()
                    data = resp.json()
                    return data.get("response", "").strip()

            except httpx.ReadTimeout:
                logger.warning(f"Ollama timeout on attempt {attempt + 1}/{self.max_retries}")
                if attempt < self.max_retries - 1:
                    await asyncio.sleep(2 ** attempt)  # exponential backoff
                else:
                    raise RuntimeError(f"Ollama timed out after {self.max_retries} attempts")

            except httpx.HTTPStatusError as e:
                if e.response.status_code == 404 and model != self.fallback_model:
                    logger.warning(f"Model {active_model} not found, trying fallback")
                    active_model = self.fallback_model
                    self._active_model = self.fallback_model
                else:
                    raise RuntimeError(f"Ollama HTTP error: {e}")

            except Exception as e:
                logger.error(f"Ollama error attempt {attempt + 1}: {e}")
                if attempt == self.max_retries - 1:
                    raise RuntimeError(f"Ollama failed: {e}")
                await asyncio.sleep(1)

        raise RuntimeError("Ollama: all retries exhausted")

    async def generate_json(self, prompt: str, model: Optional[str] = None) -> dict:
        """
        Generate and parse JSON from LLM.
        Includes aggressive JSON extraction from response.
        """
        raw = await self.generate(prompt, model)
        return self._extract_json(raw)

    def _extract_json(self, text: str) -> dict:
        """
        Robustly extract JSON from LLM output.
        Handles: pure JSON, JSON in code fences, JSON with preamble.
        """
        text = text.strip()

        # Try direct parse first
        try:
            return json.loads(text)
        except json.JSONDecodeError:
            pass

        # Extract from markdown code fence
        fence_match = __import__("re").search(
            r"```(?:json)?\s*(\{.*?\})\s*```",
            text,
            __import__("re").DOTALL
        )
        if fence_match:
            try:
                return json.loads(fence_match.group(1))
            except json.JSONDecodeError:
                pass

        # Find the outermost JSON object
        start = text.find("{")
        end = text.rfind("}")
        if start != -1 and end != -1 and end > start:
            try:
                return json.loads(text[start:end + 1])
            except json.JSONDecodeError:
                pass

        # Last resort: try to fix common LLM JSON mistakes
        fixed = self._fix_json(text)
        try:
            return json.loads(fixed)
        except json.JSONDecodeError:
            logger.error(f"Could not parse JSON from LLM: {text[:200]}")
            return {}

    def _fix_json(self, text: str) -> str:
        """Fix common LLM JSON formatting issues."""
        import re
        # Extract JSON portion
        start = text.find("{")
        end = text.rfind("}") + 1
        if start == -1:
            return "{}"
        text = text[start:end]
        # Fix trailing commas before } or ]
        text = re.sub(r",\s*([}\]])", r"\1", text)
        # Fix single quotes to double quotes
        text = re.sub(r"(?<!\w)'(.*?)'(?!\w)", r'"\1"', text)
        return text

    async def pull_model(self, model: str) -> None:
        """Pull a model from Ollama registry (requires internet once)."""
        logger.info(f"Pulling model: {model} (this may take a while...)")
        async with httpx.AsyncClient(timeout=httpx.Timeout(3600)) as client:
            async with client.stream(
                "POST",
                f"{self.base_url}/api/pull",
                json={"name": model}
            ) as resp:
                async for line in resp.aiter_lines():
                    if line:
                        try:
                            data = json.loads(line)
                            if "status" in data:
                                logger.info(f"Pull: {data['status']}")
                        except Exception:
                            pass

    async def list_models(self) -> list:
        """List all locally available models."""
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.get(f"{self.base_url}/api/tags")
                return resp.json().get("models", [])
        except Exception:
            return []


# Module singleton
ollama_client = OllamaClient()
