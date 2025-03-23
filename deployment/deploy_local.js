const { Connection, Keypair, BpfLoader, BPF_LOADER_PROGRAM_ID } = require('@solana/web3.js');
const fs = require('fs');
const path = require('path');

async function main() {
  // Connect to the Solana Devnet
  const connection = new Connection('https://api.devnet.solana.com', 'confirmed');
  
  // Load the payer keypair (this should be the same as your Solana CLI keypair)
  const payerKeyPath = path.join(process.env.HOME, '.config/solana/id.json');
  const payerKeypair = Keypair.fromSecretKey(
    Buffer.from(JSON.parse(fs.readFileSync(payerKeyPath, 'utf8')))
  );
  
  // Load the program keypair
  const programKeyPath = path.join(__dirname, '../program/target/deploy/vcoin-program-keypair.json');
  const programKeypair = Keypair.fromSecretKey(
    Buffer.from(JSON.parse(fs.readFileSync(programKeyPath, 'utf8')))
  );
  
  console.log(`Program ID: ${programKeypair.publicKey.toBase58()}`);
  
  try {
    // Check payer balance
    const balance = await connection.getBalance(payerKeypair.publicKey);
    console.log(`Payer balance: ${balance / 1000000000} SOL`);
    
    if (balance === 0) {
      console.log('Please airdrop some SOL to your Devnet wallet:');
      console.log(`solana airdrop 1 ${payerKeypair.publicKey.toBase58()} --url devnet`);
      return;
    }
    
    // Load the program
    const programPath = path.join(__dirname, '../program/target/deploy/vcoin_program.so');
    const program = fs.readFileSync(programPath);
    
    console.log('Deploying program to Devnet...');
    const programId = await BpfLoader.load(
      connection,
      payerKeypair,
      programKeypair,
      program,
      BPF_LOADER_PROGRAM_ID,
    );
    
    console.log(`Program deployed successfully with ID: ${programId.toBase58()}`);
    console.log(`You can view this program on Solana Explorer: https://explorer.solana.com/address/${programId.toBase58()}?cluster=devnet`);
    
  } catch (error) {
    console.error('Error deploying program:', error);
  }
}

main().then(
  () => process.exit(),
  (err) => {
    console.error(err);
    process.exit(-1);
  },
); 