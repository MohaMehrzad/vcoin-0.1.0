#!/bin/bash

# Set the working directory to the program directory
cd $(dirname $0)/../program

# Try to install Solana tools if not available
if ! command -v solana-install &> /dev/null; then
    echo "Solana tools not found, attempting to install..."
    sh -c "$(curl -sSfL https://release.solana.com/v1.16.13/install)"
    export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"
fi

# Create deploy directory if it doesn't exist
mkdir -p target/deploy

# Generate program keypair if it doesn't exist
if [ ! -f target/deploy/vcoin-program-keypair.json ]; then
    solana-keygen new -o target/deploy/vcoin-program-keypair.json --no-bip39-passphrase
    echo "Generated new program keypair"
fi

# Try to build the program
echo "Attempting to build the program..."
cargo build-sbf || cargo build-bpf || echo "Failed to build with BPF tools, falling back to native build"

# If BPF build fails, use the native build (not ideal but allows testing the deployment script)
if [ ! -f target/deploy/vcoin_program.so ]; then
    cp target/release/libvcoin_program.dylib target/deploy/vcoin_program.so
    echo "WARNING: Using native build instead of BPF build. This will not work on Solana blockchain."
fi

echo "Build process completed" 