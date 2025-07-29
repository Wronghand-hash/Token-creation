import {
  CREATE_CPMM_POOL_PROGRAM,
  CREATE_CPMM_POOL_FEE_ACC,
  DEVNET_PROGRAM_ID,
  getCpmmPdaAmmConfigId,
  printSimulate,
} from "@raydium-io/raydium-sdk-v2";
import BN from "bn.js";
import {
  createAssociatedTokenAccountInstruction,
  getAssociatedTokenAddress,
  getAccount,
  TOKEN_PROGRAM_ID,
  createMint,
  mintTo,
  NATIVE_MINT,
  createSyncNativeInstruction,
} from "@solana/spl-token";
import {
  Keypair,
  Connection,
  Transaction,
  sendAndConfirmTransaction,
  clusterApiUrl,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
} from "@solana/web3.js";
import { initSdk, txVersion } from "../config";
import { bs58 } from "@coral-xyz/anchor/dist/cjs/utils/bytes";

const owner: Keypair = Keypair.fromSecretKey(
  bs58.decode(
    process.env.CREATOR_PRIVATE_KEY2 ||
      (() => {
        throw new Error("CREATOR_PRIVATE_KEY not set in .env");
      })()
  )
);

const connection = new Connection(
  process.env.RPC_URL || clusterApiUrl("devnet"),
  { commitment: "confirmed" }
);

export const createNewSPLToken = async () => {
  console.log(
    `Creating new SPL Token mint for owner: ${owner.publicKey.toBase58()}`
  );
  const newMint = await createMint(connection, owner, owner.publicKey, null, 9);
  console.log(`Successfully created new token mint: ${newMint.toBase58()}`);

  const ownerNewTokenATA = await getAssociatedTokenAddress(
    newMint,
    owner.publicKey,
    false,
    TOKEN_PROGRAM_ID
  );
  console.log(`Owner's new token ATA: ${ownerNewTokenATA.toBase58()}`);

  let ataInfo;
  try {
    ataInfo = await getAccount(connection, ownerNewTokenATA);
    console.log(`Owner's new token ATA already exists.`);
  } catch (error) {
    console.log(`Creating owner's ATA for new token...`);
    const createAtaTx = new Transaction().add(
      createAssociatedTokenAccountInstruction(
        owner.publicKey,
        ownerNewTokenATA,
        owner.publicKey,
        newMint,
        TOKEN_PROGRAM_ID
      )
    );
    const signature = await sendAndConfirmTransaction(connection, createAtaTx, [
      owner,
    ]);
    console.log(`Created owner's new token ATA: ${signature}`);
  }

  const mintAmount = new BN(1_000_000).mul(new BN(10).pow(new BN(9))); // 1,000,000 tokens with 9 decimals
  console.log(`Minting ${mintAmount.toString()} raw tokens to owner's ATA...`);
  const mintToTxSig = await mintTo(
    connection,
    owner,
    newMint,
    ownerNewTokenATA,
    owner,
    mintAmount.toNumber(),
    [owner]
  );
  console.log(`Minted tokens: ${mintToTxSig}`);

  await new Promise((resolve) => setTimeout(resolve, 5000)); // Increased delay
  return newMint;
};

export const createPool = async () => {
  const raydium = await initSdk({ loadToken: true });
  console.log(`Wallet Public Key being used: ${owner.publicKey.toBase58()}`);

  // Create new token mint for mintA
  const newMint = await createNewSPLToken();
  const mintA = await raydium.token.getTokenInfo(newMint.toBase58());
  // Use WSOL as mintB
  const mintB = await raydium.token.getTokenInfo(NATIVE_MINT.toBase58());

  // Get owner's ATAs for mintA and mintB
  const ownerMintA_ATA = await getAssociatedTokenAddress(
    new PublicKey(mintA.address),
    owner.publicKey,
    false,
    TOKEN_PROGRAM_ID
  );
  const ownerMintB_ATA = await getAssociatedTokenAddress(
    new PublicKey(mintB.address),
    owner.publicKey,
    false,
    TOKEN_PROGRAM_ID
  );

  // Check and create ATA for mintA
  let mintA_AccountInfo;
  try {
    mintA_AccountInfo = await getAccount(connection, ownerMintA_ATA);
    console.log(
      `Owner's ${
        mintA.symbol || "new token"
      } ATA exists: ${ownerMintA_ATA.toBase58()}`
    );
  } catch (error) {
    console.log(`Creating owner's ${mintA.symbol || "new token"} ATA...`);
    const createAtaTx = new Transaction().add(
      createAssociatedTokenAccountInstruction(
        owner.publicKey,
        ownerMintA_ATA,
        owner.publicKey,
        new PublicKey(mintA.address),
        TOKEN_PROGRAM_ID
      )
    );
    const signature = await sendAndConfirmTransaction(connection, createAtaTx, [
      owner,
    ]);
    console.log(
      `Created owner's ${mintA.symbol || "new token"} ATA: ${signature}`
    );
    mintA_AccountInfo = await getAccount(connection, ownerMintA_ATA);
  }

  // Check and create ATA for mintB (WSOL)
  let mintB_AccountInfo;
  try {
    mintB_AccountInfo = await getAccount(connection, ownerMintB_ATA);
    console.log(`Owner's WSOL ATA exists: ${ownerMintB_ATA.toBase58()}`);
  } catch (error) {
    console.log(`Creating owner's WSOL ATA...`);
    const createAtaTx = new Transaction().add(
      createAssociatedTokenAccountInstruction(
        owner.publicKey,
        ownerMintB_ATA,
        owner.publicKey,
        new PublicKey(mintB.address),
        TOKEN_PROGRAM_ID
      )
    );
    const signature = await sendAndConfirmTransaction(connection, createAtaTx, [
      owner,
    ]);
    console.log(`Created owner's WSOL ATA: ${signature}`);
    mintB_AccountInfo = await getAccount(connection, ownerMintB_ATA);
  }

  // Verify token balances for mintA
  const requiredMintAAmount = new BN(1).mul(
    new BN(10).pow(new BN(mintA.decimals || 9))
  ); // 1 token
  const currentMintABalance = new BN(mintA_AccountInfo.amount.toString());
  console.log(
    `Current ${
      mintA.symbol || "new token"
    } balance in ATA: ${currentMintABalance.toString()}`
  );
  if (currentMintABalance.lt(requiredMintAAmount)) {
    console.error(
      `ERROR: Insufficient ${
        mintA.symbol || "new token"
      } balance. Required: ${requiredMintAAmount.toString()}, Actual: ${currentMintABalance.toString()}`
    );
    throw new Error(`Insufficient ${mintA.symbol || "new token"} balance.`);
  }

  // Verify and fund WSOL balance for mintB
  const requiredMintBAmount = new BN(1).mul(
    new BN(10).pow(new BN(mintB.decimals || 9))
  ); // 1 WSOL
  let currentMintBBalance = new BN(mintB_AccountInfo.amount.toString());
  console.log(
    `Current WSOL balance in ATA (pre-check): ${currentMintBBalance.toString()}`
  );

  if (currentMintBBalance.lt(requiredMintBAmount)) {
    console.log(
      `Insufficient WSOL. Required: ${requiredMintBAmount.toString()}, Current: ${currentMintBBalance.toString()}`
    );
    const solToWrap = requiredMintBAmount
      .sub(currentMintBBalance)
      .add(new BN(LAMPORTS_PER_SOL * 0.01)); // Buffer
    console.log(
      `Transferring ${solToWrap
        .div(new BN(10).pow(new BN(9)))
        .toString()} SOL to WSOL ATA...`
    );
    const transferSolTx = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: owner.publicKey,
        toPubkey: ownerMintB_ATA,
        lamports: solToWrap.toNumber(),
      })
    );
    await sendAndConfirmTransaction(connection, transferSolTx, [owner]);
    console.log(`SOL transferred to WSOL ATA.`);

    console.log(`Syncing native SOL to WSOL...`);
    const syncNativeTx = new Transaction().add(
      createSyncNativeInstruction(ownerMintB_ATA, TOKEN_PROGRAM_ID)
    );
    await sendAndConfirmTransaction(connection, syncNativeTx, [owner]);
    console.log(`SOL wrapped to WSOL.`);

    mintB_AccountInfo = await getAccount(connection, ownerMintB_ATA);
    currentMintBBalance = new BN(mintB_AccountInfo.amount.toString());
    console.log(
      `Current WSOL balance in ATA (post-wrap): ${currentMintBBalance.toString()}`
    );

    if (currentMintBBalance.lt(requiredMintBAmount)) {
      console.error(
        `ERROR: WSOL balance is still insufficient. Required: ${requiredMintBAmount.toString()}, Actual: ${currentMintBBalance.toString()}`
      );
      throw new Error("Insufficient WSOL balance after wrapping.");
    }
  }

  // Ensure sufficient SOL for transaction fees
  const ownerSolBalance = await connection.getBalance(owner.publicKey);
  const requiredSol = LAMPORTS_PER_SOL * 0.05; // Buffer for fees
  if (ownerSolBalance < requiredSol) {
    console.error(
      `ERROR: Insufficient SOL balance. Required: ${
        requiredSol / LAMPORTS_PER_SOL
      } SOL, Actual: ${ownerSolBalance / LAMPORTS_PER_SOL} SOL`
    );
    throw new Error("Insufficient SOL balance for transaction fees.");
  }

  // Wait to ensure RPC consistency
  console.log("Waiting to ensure RPC data consistency...");
  await new Promise((resolve) => setTimeout(resolve, 20000)); // Increased to 20 seconds

  // Re-validate ATAs before pool creation
  console.log("Re-validating token accounts before pool creation...");
  try {
    mintA_AccountInfo = await getAccount(connection, ownerMintA_ATA);
    console.log(
      `New token ATA balance: ${mintA_AccountInfo.amount.toString()}`
    );
  } catch (e) {
    console.error("New token ATA does not exist or is invalid:", e);
    throw new Error("New token ATA validation failed.");
  }
  try {
    mintB_AccountInfo = await getAccount(connection, ownerMintB_ATA);
    console.log(`WSOL ATA balance: ${mintB_AccountInfo.amount.toString()}`);
  } catch (e) {
    console.error("WSOL ATA does not exist or is invalid:", e);
    throw new Error("WSOL ATA validation failed.");
  }

  // Fetch fee configurations
  const feeConfigs = await raydium.api.getCpmmConfigs();
  console.log("Available fee configurations:", feeConfigs);
  if (!feeConfigs || feeConfigs.length === 0) {
    throw new Error("No fee configurations available from Raydium API.");
  }

  if (raydium.cluster === "devnet") {
    feeConfigs.forEach((config) => {
      config.id = getCpmmPdaAmmConfigId(
        DEVNET_PROGRAM_ID.CREATE_CPMM_POOL_PROGRAM,
        config.index
      ).publicKey.toBase58();
    });
  }

  // Create pool
  let extInfo: any;
  try {
    const {
      execute,
      extInfo: poolExtInfo,
      transaction,
    } = await raydium.cpmm.createPool({
      programId: DEVNET_PROGRAM_ID.CREATE_CPMM_POOL_PROGRAM,
      poolFeeAccount: DEVNET_PROGRAM_ID.CREATE_CPMM_POOL_FEE_ACC,
      mintA,
      mintB,
      mintAAmount: requiredMintAAmount,
      mintBAmount: requiredMintBAmount,
      startTime: new BN(0),
      feeConfig: feeConfigs[0],
      associatedOnly: false,
      ownerInfo: {
        useSOLBalance: false, // Changed to false to avoid potential issues
      },
      txVersion,
    });
    extInfo = poolExtInfo;

    // Log expected accounts
    console.log(
      "Expected pool accounts:",
      Object.keys(extInfo.address).reduce(
        (acc, cur) => ({
          ...acc,
          [cur]:
            extInfo.address[cur as keyof typeof extInfo.address].toString(),
        }),
        {}
      )
    );

    // Simulate transaction
    const simulationResult = await connection.simulateTransaction(transaction);
    console.log(
      "Transaction simulation result:",
      JSON.stringify(simulationResult, null, 2)
    );
    printSimulate([transaction]);

    // Execute transaction
    const { txId } = await execute({ sendAndConfirm: true });
    console.log("Pool created", {
      txId,
      poolKeys: Object.keys(extInfo.address).reduce(
        (acc, cur) => ({
          ...acc,
          [cur]:
            extInfo.address[cur as keyof typeof extInfo.address].toString(),
        }),
        {}
      ),
    });
  } catch (error) {
    console.error("Pool creation failed:", error);
    console.log(
      "Expected pool accounts:",
      extInfo
        ? Object.keys(extInfo.address).reduce(
            (acc, cur) => ({
              ...acc,
              [cur]:
                extInfo.address[cur as keyof typeof extInfo.address].toString(),
            }),
            {}
          )
        : "Not available"
    );
    throw error;
  }

  process.exit();
};
