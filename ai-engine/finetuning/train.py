"""
FINE-TUNING SCRIPT — QLoRA on Mistral 7B
Uses Unsloth for 2x faster training on consumer GPUs.

HARDWARE REQUIRED:
  Minimum: NVIDIA GPU with 8GB VRAM (RTX 3070/4060 Ti)
  Recommended: RTX 4090 or A100 (24GB VRAM)

WHAT THIS DOES:
  Trains a LoRA adapter on top of Mistral 7B using your CV parsing dataset.
  This does NOT retrain the full model — only ~1% of parameters are updated.
  Result: Much better JSON structure and CV-domain knowledge.

RUN:
  pip install unsloth trl peft bitsandbytes datasets transformers
  python finetuning/train.py
"""

import os
import json
from pathlib import Path
from datasets import Dataset

# ─── Config ──────────────────────────────────────────────────────────────────

MODEL_NAME = "unsloth/mistral-7b-instruct-v0.3-bnb-4bit"  # Pre-quantized for fast loading
OUTPUT_DIR = "./models/naukri-cv-parser-lora"
DATASET_PATH = "./finetuning/dataset_examples.jsonl"
MAX_SEQ_LENGTH = 4096
BATCH_SIZE = 2
GRAD_ACCUMULATION = 4  # Effective batch size = 2 * 4 = 8
LEARNING_RATE = 2e-4
MAX_STEPS = 200  # ~1-2 hours on RTX 4090
WARMUP_STEPS = 10

# LoRA config — affects which layers are fine-tuned
LORA_R = 16          # Rank — higher = more capacity, more memory
LORA_ALPHA = 32      # Scaling factor
LORA_DROPOUT = 0.05
LORA_TARGET_MODULES = [
    "q_proj", "k_proj", "v_proj", "o_proj",
    "gate_proj", "up_proj", "down_proj",
]


def load_dataset(path: str) -> Dataset:
    """Load JSONL dataset and format as instruction-response pairs."""
    examples = []
    with open(path) as f:
        for line in f:
            line = line.strip()
            if line:
                example = json.loads(line)
                examples.append({
                    "instruction": example["instruction"],
                    "input": example.get("input", ""),
                    "output": example["output"],
                })

    print(f"Loaded {len(examples)} training examples")
    return Dataset.from_list(examples)


def format_prompt(example: dict) -> str:
    """Format a training example into Mistral instruct format."""
    instruction = example["instruction"]
    input_text = example.get("input", "")
    output = example["output"]

    if input_text:
        prompt = f"[INST] {instruction}\n\n{input_text} [/INST] {output}"
    else:
        prompt = f"[INST] {instruction} [/INST] {output}"

    return {"text": prompt}


def train():
    """Main fine-tuning pipeline using Unsloth + TRL."""
    try:
        from unsloth import FastLanguageModel
        from trl import SFTTrainer
        from transformers import TrainingArguments
    except ImportError:
        raise ImportError(
            "Install fine-tuning dependencies:\n"
            "pip install unsloth trl peft bitsandbytes datasets transformers"
        )

    # ── Load model with 4-bit quantization ───────────────────────────────────
    print(f"Loading {MODEL_NAME} with 4-bit quantization...")
    model, tokenizer = FastLanguageModel.from_pretrained(
        model_name=MODEL_NAME,
        max_seq_length=MAX_SEQ_LENGTH,
        dtype=None,        # Auto-detect: float16 for Ampere+, bfloat16 for older
        load_in_4bit=True, # QLoRA: 4-bit base model
    )

    # ── Add LoRA adapters ─────────────────────────────────────────────────────
    print("Adding LoRA adapters...")
    model = FastLanguageModel.get_peft_model(
        model,
        r=LORA_R,
        target_modules=LORA_TARGET_MODULES,
        lora_alpha=LORA_ALPHA,
        lora_dropout=LORA_DROPOUT,
        bias="none",
        use_gradient_checkpointing="unsloth",  # 2x memory savings
        random_state=42,
    )

    trainable_params = sum(p.numel() for p in model.parameters() if p.requires_grad)
    total_params = sum(p.numel() for p in model.parameters())
    print(f"Trainable params: {trainable_params:,} / {total_params:,} "
          f"({100 * trainable_params / total_params:.2f}%)")

    # ── Load and format dataset ───────────────────────────────────────────────
    raw_dataset = load_dataset(DATASET_PATH)
    formatted_dataset = raw_dataset.map(format_prompt, batched=False)

    # ── Training arguments ────────────────────────────────────────────────────
    training_args = TrainingArguments(
        output_dir=OUTPUT_DIR,
        per_device_train_batch_size=BATCH_SIZE,
        gradient_accumulation_steps=GRAD_ACCUMULATION,
        num_train_epochs=3,
        max_steps=MAX_STEPS,
        learning_rate=LEARNING_RATE,
        warmup_steps=WARMUP_STEPS,
        lr_scheduler_type="cosine",
        fp16=True,
        logging_steps=10,
        save_steps=50,
        save_total_limit=2,
        optim="adamw_8bit",     # Memory-efficient optimizer
        weight_decay=0.01,
        report_to="none",       # Disable W&B/MLflow for offline training
        seed=42,
    )

    # ── Trainer ───────────────────────────────────────────────────────────────
    trainer = SFTTrainer(
        model=model,
        tokenizer=tokenizer,
        train_dataset=formatted_dataset,
        dataset_text_field="text",
        max_seq_length=MAX_SEQ_LENGTH,
        args=training_args,
    )

    # ── Train ─────────────────────────────────────────────────────────────────
    print("Starting QLoRA fine-tuning...")
    trainer.train()

    # ── Save ─────────────────────────────────────────────────────────────────
    print(f"Saving LoRA adapter to {OUTPUT_DIR}...")
    model.save_pretrained(OUTPUT_DIR)
    tokenizer.save_pretrained(OUTPUT_DIR)

    # ── Export to Ollama-compatible GGUF format ───────────────────────────────
    gguf_path = f"{OUTPUT_DIR}/model.gguf"
    print(f"Exporting to GGUF format for Ollama: {gguf_path}")
    model.save_pretrained_gguf(OUTPUT_DIR, tokenizer, quantization_method="q4_k_m")

    print("=" * 50)
    print("Fine-tuning complete!")
    print(f"LoRA adapter: {OUTPUT_DIR}")
    print(f"GGUF model:   {gguf_path}")
    print()
    print("To use in Ollama:")
    print(f"  ollama create naukri-cv-parser -f setup/Modelfile")
    print("  # Then update Modelfile FROM to point to your GGUF file")
    print("=" * 50)


if __name__ == "__main__":
    train()
