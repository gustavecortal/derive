# /// script
# requires-python = ">=3.10"
# dependencies = ["numpy", "sentence-transformers==6.2.0", "transformers==5.22.1", "torch>=2.8"]
# ///
"""Embed dérive's concepts with Qwen3-Embedding-4B and write the vectors the recommender reads.

    uv run embed.py                                   # data/concepts.json -> data/vectors.bin
    uv run embed.py --concepts mine.json --out mine.bin

Each concept is embedded from its term and one-sentence description. The vectors are cut to the
corpus's dimensions, centred on the corpus mean, which keeps a few concepts from being near most
others, and quantized to int8 (src/corpus.ts reads them back). The mean is not kept, so after
any change to the concepts, embed the whole corpus again.
"""

import argparse
import json
import time
from pathlib import Path

import numpy as np
import torch
from sentence_transformers import SentenceTransformer

MODEL = "Qwen/Qwen3-Embedding-4B"
REVISION = "5cf2132abc99cad020ac570b19d031efec650f2b"
# The model card asks for a one-sentence instruction written for the task. Similarity between
# concepts is symmetric, so every concept takes it, as a query would.
INSTRUCTION = "Instruct: Given a concept and its description, retrieve concepts that share its underlying idea\nQuery:"


def device():
    if torch.cuda.is_available():
        return "cuda"
    if hasattr(torch, "xpu") and torch.xpu.is_available():
        return "xpu"
    if torch.backends.mps.is_available():
        return "mps"
    return "cpu"


def unit(vectors):
    return vectors / np.linalg.norm(vectors, axis=1, keepdims=True)


def embed(texts, dimensions):
    """Unit vectors of `texts`, cut to `dimensions` and centred on their mean."""
    # bfloat16, the precision the model was trained in: float16 overflows in its hidden states.
    # Last-token pooling needs the padding on the left.
    model = SentenceTransformer(
        MODEL,
        revision=REVISION,
        device=device(),
        model_kwargs={"torch_dtype": torch.bfloat16},
        processor_kwargs={"padding_side": "left"},
    )
    started = time.perf_counter()
    # bfloat16 sums depend on each batch's padding, so the batch size is part of the recipe.
    vectors = model.encode(texts, prompt=INSTRUCTION, batch_size=64, convert_to_numpy=True).astype(np.float32)
    print(f"{len(texts)} concepts in {time.perf_counter() - started:.0f} s on {model.device}")
    if not np.isfinite(vectors).all():
        raise ValueError("the model returned a vector that is not finite")
    # Matryoshka: the leading dimensions, renormalized.
    vectors = unit(vectors[:, :dimensions])
    return unit(vectors - vectors.mean(axis=0))


def quantize(vectors):
    """One float32 scale per row, then every row as int8, scaled to its largest value."""
    scales = np.abs(vectors).max(axis=1) / 127
    scales[scales == 0] = 1
    values = np.floor(vectors / scales[:, None] + 0.5).astype(np.int8)
    return scales.astype("<f4").tobytes() + values.tobytes()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--concepts", type=Path, default=Path("data/concepts.json"))
    parser.add_argument("--out", type=Path, default=Path("data/vectors.bin"))
    args = parser.parse_args()

    corpus = json.loads(args.concepts.read_text(encoding="utf-8"))
    texts = [f"Term: {c['term']}\nHook: {c['hook']}" for c in corpus["concepts"]]
    args.out.write_bytes(quantize(embed(texts, corpus["dimensions"])))
