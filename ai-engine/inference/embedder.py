"""
INFERENCE MODULE — Local Embedding Engine
Generates vector embeddings using sentence-transformers.
100% offline — no API key, no internet dependency at runtime.

Model: BAAI/bge-small-en-v1.5
- 33.4M parameters (tiny!)
- 384-dimensional embeddings
- Runs on CPU in ~50ms per document
- State-of-the-art for semantic similarity
- Full offline after first download (~130MB)
"""

import os
import numpy as np
from typing import List, Optional
from loguru import logger
from dotenv import load_dotenv

load_dotenv()

# Lazy import to avoid slow startup
_sentence_transformer = None
_model_name = None


def _get_model():
    """Load embedding model lazily on first use."""
    global _sentence_transformer, _model_name
    if _sentence_transformer is None:
        from sentence_transformers import SentenceTransformer
        _model_name = os.getenv("EMBEDDING_MODEL", "BAAI/bge-small-en-v1.5")
        logger.info(f"Loading embedding model: {_model_name}")
        _sentence_transformer = SentenceTransformer(_model_name)
        logger.info(f"Embedding model loaded. Dims: {_sentence_transformer.get_sentence_embedding_dimension()}")
    return _sentence_transformer


class LocalEmbedder:
    """
    Generates semantic vector embeddings locally.
    Used for:
      1. CV ↔ Job cosine similarity (behavioral score)
      2. Semantic skill matching
      3. Candidate clustering (recruiter analytics)
    """

    def embed(self, text: str, truncate: bool = True) -> List[float]:
        """
        Generate embedding for a single text.

        Args:
            text: Input text (will be truncated to 512 tokens if too long)
            truncate: Whether to truncate long texts

        Returns:
            List of floats (embedding vector)
        """
        model = _get_model()
        if truncate and len(text) > 8000:
            text = text[:8000]

        embedding = model.encode(
            text,
            normalize_embeddings=True,  # L2-normalize for cosine similarity
            show_progress_bar=False,
        )
        return embedding.tolist()

    def embed_batch(self, texts: List[str], batch_size: int = 32) -> List[List[float]]:
        """
        Generate embeddings for multiple texts efficiently.

        Args:
            texts: List of input texts
            batch_size: Process in batches for memory efficiency

        Returns:
            List of embedding vectors
        """
        model = _get_model()
        cleaned = [t[:8000] for t in texts]

        embeddings = model.encode(
            cleaned,
            batch_size=batch_size,
            normalize_embeddings=True,
            show_progress_bar=False,
        )
        return embeddings.tolist()

    def cosine_similarity(self, vec_a: List[float], vec_b: List[float]) -> float:
        """
        Compute cosine similarity between two embeddings.
        Since vectors are L2-normalized, dot product = cosine similarity.
        """
        if not vec_a or not vec_b or len(vec_a) != len(vec_b):
            return 0.0
        a = np.array(vec_a)
        b = np.array(vec_b)
        # Both normalized, so: similarity = a · b
        return float(np.dot(a, b))

    def similarity_matrix(
        self, embeddings_a: List[List[float]], embeddings_b: List[List[float]]
    ) -> np.ndarray:
        """
        Compute pairwise similarity matrix (useful for batch matching).
        Shape: (len(a), len(b))
        """
        a = np.array(embeddings_a)
        b = np.array(embeddings_b)
        return np.dot(a, b.T)

    @property
    def dimensions(self) -> int:
        """Return embedding dimensions."""
        return _get_model().get_sentence_embedding_dimension()

    @property
    def model_name(self) -> str:
        """Return loaded model name."""
        _get_model()
        return _model_name or os.getenv("EMBEDDING_MODEL", "BAAI/bge-small-en-v1.5")


# Module singleton
embedder = LocalEmbedder()
