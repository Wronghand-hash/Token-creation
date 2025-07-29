import {
  TxVersion,
  DEVNET_PROGRAM_ID,
  printSimulate,
} from "@raydium-io/raydium-sdk-v2";
import { initSdk, owner, connection } from "../config";
import { PublicKey, Transaction, SystemProgram } from "@solana/web3.js";
import {
  createAssociatedTokenAccountInstruction,
  getAssociatedTokenAddress,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import BN from "bn.js";

export const createPlatform = async () => {
  const raydium = await initSdk();
  const ownerPubKey = owner.publicKey;

  console.log(`Using owner public key: ${ownerPubKey.toBase58()}`);

  // The provided cpConfigId should be an already created and owned CPMM pool account.
  const cpConfigId = new PublicKey(
    "5MxLgy9oPdTC3YgkiePHqr3EoCRD9uLVYRQS2ANAs7wy"
  );
  console.log(`Using provided cpConfigId: ${cpConfigId.toBase58()}`);

  // Check if platform config already exists
  const [platformConfigPda] = await PublicKey.findProgramAddress(
    [Buffer.from(ownerPubKey.toBuffer())],
    DEVNET_PROGRAM_ID.LAUNCHPAD_PROGRAM
  );
  const accountInfo = await connection.getAccountInfo(platformConfigPda);
  if (accountInfo) {
    console.error(
      `Platform config already exists for owner at ${platformConfigPda.toBase58()}`
    );
    process.exit(1);
  }

  // Create associated token accounts
  const mint = new PublicKey("So11111111111111111111111111111111111111112"); // Replace with actual token mint address
  let platformClaimFeeWallet = await getAssociatedTokenAddress(
    mint,
    ownerPubKey
  );
  let platformLockNftWallet = await getAssociatedTokenAddress(
    mint,
    ownerPubKey
  );

  // Check if token accounts exist, create if necessary
  const claimFeeWalletInfo = await connection.getAccountInfo(
    platformClaimFeeWallet
  );
  if (!claimFeeWalletInfo) {
    console.log(
      `Creating associated token account for platformClaimFeeWallet: ${platformClaimFeeWallet.toBase58()}`
    );
    const transaction = new Transaction().add(
      createAssociatedTokenAccountInstruction(
        ownerPubKey, // payer
        platformClaimFeeWallet, // associated token account
        ownerPubKey, // owner
        mint, // mint
        TOKEN_2022_PROGRAM_ID // Adjust to TOKEN_2022_PROGRAM_ID if needed
      )
    );
    const { blockhash } = await connection.getLatestBlockhash();
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = ownerPubKey;
    const signature = await connection.sendTransaction(transaction, [owner]);
    await connection.confirmTransaction(signature, "confirmed");
    console.log(`Created platformClaimFeeWallet: ${signature}`);
  }

  const lockNftWalletInfo = await connection.getAccountInfo(
    platformLockNftWallet
  );
  if (!lockNftWalletInfo) {
    console.log(
      `Creating associated token account for platformLockNftWallet: ${platformLockNftWallet.toBase58()}`
    );
    const transaction = new Transaction().add(
      createAssociatedTokenAccountInstruction(
        ownerPubKey, // payer
        platformLockNftWallet, // associated token account
        ownerPubKey, // owner
        mint, // mint
        TOKEN_2022_PROGRAM_ID // Adjust to TOKEN_2022_PROGRAM_ID if needed
      )
    );
    const { blockhash } = await connection.getLatestBlockhash();
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = ownerPubKey;
    const signature = await connection.sendTransaction(transaction, [owner]);
    await connection.confirmTransaction(signature, "confirmed");
    console.log(`Created platformLockNftWallet: ${signature}`);
  }

  // Create platform config
  const { transaction, extInfo, execute } =
    await raydium.launchpad.createPlatformConfig({
      programId: DEVNET_PROGRAM_ID.LAUNCHPAD_PROGRAM,
      platformAdmin: ownerPubKey,
      platformClaimFeeWallet, // Use associated token account
      platformLockNftWallet, // Use associated token account
      cpConfigId, // Use derived PDA
      transferFeeExtensionAuth: ownerPubKey,
      creatorFeeRate: new BN("1000"), // 10% (1000 / 10000)
      migrateCpLockNftScale: {
        platformScale: new BN(400000), // 40%
        creatorScale: new BN(500000), // 50%
        burnScale: new BN(100000), // 10%
      },
      feeRate: new BN(1000), // 10% (1000 / 10000)
      name: "Your Platform Name",
      web: "https://your.platform.org",
      img: "https://your.platform.org/img",
      txVersion: TxVersion.V0,
      computeBudgetConfig: {
        units: 600000,
        microLamports: 600000,
      },
    });

  // Simulate transaction for debugging
  console.log("Simulating transaction...");
  const simResult = await connection.simulateTransaction(transaction);
  console.log("Simulation Logs:", simResult.value.logs);
  if (simResult.value.err) {
    console.error("Simulation failed:", simResult.value.err);
    process.exit(1);
  }

  // Execute transaction
  try {
    const sentInfo = await execute({ sendAndConfirm: true });
    console.log(
      `Transaction successful: ${
        sentInfo.txId
      }, Platform ID: ${extInfo.platformId.toBase58()}`
    );
  } catch (e: any) {
    console.error("Transaction failed:", e);
    if (e.logs) {
      console.error("Transaction logs:", e.logs);
    }
    process.exit(1);
  }

  process.exit();
};

// Execute the function
createPlatform();
