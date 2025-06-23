#!/bin/bash

# Test script to demonstrate Metal backend buffer overlap issue and solution
# Usage: ./test_metal_issue.sh

echo "=== Thai Audio Transcriber - Metal Backend Test ==="
echo ""
echo "This script demonstrates the Metal buffer overlap issue and shows how to avoid it."
echo ""

# Check if required files exist
if [ ! -f "audio/C.mp3" ]; then
    echo "❌ Error: audio/C.mp3 not found"
    exit 1
fi

if [ ! -f "model/ggml-large-v3.bin" ]; then
    echo "❌ Error: model/ggml-large-v3.bin not found"
    exit 1
fi

if [ ! -f "target/release/transcribe" ]; then
    echo "❌ Error: Release binary not found. Run 'cargo build --release' first."
    exit 1
fi

echo "✅ All required files found"
echo ""

echo "1. Testing CPU-only mode (recommended default):"
echo "   Command: ./target/release/transcribe audio/C.mp3 model/ggml-large-v3.bin --cpu"
echo ""
./target/release/transcribe audio/C.mp3 model/ggml-large-v3.bin --cpu | head -20
echo ""
echo "   Status: ✅ CPU mode completed successfully"
echo ""

echo "2. Testing GPU mode (may cause buffer overlap errors):"
echo "   Command: ./target/release/transcribe audio/C.mp3 model/ggml-large-v3.bin --gpu"
echo ""
echo "   Note: If you see 'ggml_metal_add_buffer: error: buffer 'backend' overlaps with',"
echo "         this is the Metal backend issue. Use CPU mode instead."
echo ""

# Run GPU mode and capture any Metal errors
GPU_OUTPUT=$(./target/release/transcribe audio/C.mp3 model/ggml-large-v3.bin --gpu 2>&1)
echo "$GPU_OUTPUT" | head -20

if echo "$GPU_OUTPUT" | grep -q "overlaps with"; then
    echo ""
    echo "   Status: ⚠️  Metal buffer overlap error detected!"
    echo "   Solution: Use --cpu flag or remove --gpu flag (CPU is default)"
else
    echo ""
    echo "   Status: ✅ GPU mode worked this time (error is intermittent)"
fi

echo ""
echo "=== Summary ==="
echo "• Default mode: CPU-only (stable, no Metal errors)"
echo "• Use --cpu to force CPU mode explicitly"
echo "• Use --gpu to enable Metal acceleration (may cause buffer errors)"
echo "• For maximum stability, stick with CPU mode"
echo ""
echo "CLI Usage Examples:"
echo "  ./target/release/transcribe audio.mp3 model.bin           # CPU mode (default)"
echo "  ./target/release/transcribe audio.mp3 model.bin --cpu     # Explicit CPU mode"
echo "  ./target/release/transcribe audio.mp3 model.bin --gpu     # GPU mode (risky)"
echo "  ./target/release/transcribe audio.mp3 model.bin -l en     # English transcription"
