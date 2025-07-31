import {
  VersionedTransaction,
  Keypair,
  SystemProgram,
  LAMPORTS_PER_SOL,
  Connection,
  TransactionInstruction,
  TransactionMessage,
  PublicKey,
} from "@solana/web3.js";

import {
  createAssociatedTokenAccountIdempotentInstruction,
  createSyncNativeInstruction,
  getAssociatedTokenAddress,
  getAssociatedTokenAddressSync,
  NATIVE_MINT,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";

import { BN } from "bn.js";
import {
  getATAAddress,
  buyExactInInstruction,
  getPdaLaunchpadAuth,
  getPdaLaunchpadConfigId,
  getPdaLaunchpadPoolId,
  getPdaLaunchpadVaultId,
  TxVersion,
  LAUNCHPAD_PROGRAM,
  LaunchpadConfig,
} from "@raydium-io/raydium-sdk-v2";
import { initSdk, owner } from "../config";
import { JitoTransactionExecutor } from "./executer";
import dotenv from "dotenv";
dotenv.config();

const buyAmountOnCreate = 0.0001;
const JITO_FEE = 0.001;
const TOKEN_NAME = "SHWIGS";
const TOKEN_SYMBOL = "SHWIGS";
const TOKEN_SHOW_NAME = "SHWIGS";
const DESCRIPTION = "A fun token for the SHWIGS platform";
const TOKEN_CREATE_ON = "https://bonk.fun";
const TWITTER = "https://x.com/bonkfun";
const TELEGRAM = "https://t.me/bonkfun";
const WEBSITE = "https://bonk.fun";
const RPC_ENDPOINT = "https://api.mainnet-beta.solana.com";
const RPC_WEBSOCKET_ENDPOINT = "wss://api.mainnet-beta.solana.com";
const FILE =
  "https://fuchsia-odd-lynx-135.mypinata.cloud/ipfs/bafybeighewl32sgjko2a2wk2rn772gjosvro3izwe56wg6carrtozcmpci";
const BONK_PLATFROM_ID = new PublicKey(
  "FfYek5vEz23cMkWsdJwG2oa6EphsvXSHrGpdALN4g6W1"
);

const commitment = "confirmed";
const connection = new Connection(RPC_ENDPOINT, {
  wsEndpoint: RPC_WEBSOCKET_ENDPOINT,
  commitment,
});

const jitoExecutor = new JitoTransactionExecutor(
  JITO_FEE.toString(),
  connection,
  process.env.JITO_RPC_URL || ""
);

let kps: Keypair[] = [];

const createImageMetadata = async (imageUrl: string) => {
  const formData = new FormData();
  try {
    const response = await fetch(imageUrl);
    if (!response.ok)
      throw new Error(`Failed to fetch image: ${response.statusText}`);
    const blob = await response.blob();
    formData.append("image", blob, "token-image.png");

    const uploadResponse = await fetch(
      "https://storage.letsbonk.fun/upload/img",
      {
        method: "POST",
        body: formData,
      }
    );

    const resultText = await uploadResponse.text();
    console.log("Uploaded image link:", resultText);
    return resultText;
  } catch (error) {
    console.error("Image upload failed:", error);
    throw error;
  }
};

const createBonkTokenMetadata = async (create: any) => {
  const metadata = {
    name: create.name,
    symbol: create.symbol,
    description: create.description,
    createdOn: create.createdOn,
    platformId: create.platformId,
    image: create.image,
    website: create.website,
    twitter: create.twitter,
    telegram: create.telegram,
    showName: create.showName,
  };

  try {
    const response = await fetch("https://storage.letsbonk.fun/upload/meta", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(metadata),
    });

    const resultText = await response.text();
    console.log("Metadata IPFS link:", resultText);
    return resultText;
  } catch (error) {
    console.error("Metadata upload failed:", error);
    throw error;
  }
};

export const createBonkFunTokenMetadata = async () => {
  const imageInfo = {
    file: FILE,
  };

  const imageMetadata = await createImageMetadata(imageInfo.file);
  console.log("imageMetadata:", imageMetadata);

  const tokenInfo = {
    name: TOKEN_NAME,
    symbol: TOKEN_SYMBOL,
    description: DESCRIPTION,
    createdOn: TOKEN_CREATE_ON,
    platformId: BONK_PLATFROM_ID.toBase58(),
    image: imageMetadata,
    website: WEBSITE,
    twitter: TWITTER,
    telegram: TELEGRAM,
    showName: TOKEN_SHOW_NAME,
  };

  const tokenMetadata = await createBonkTokenMetadata(tokenInfo);
  console.log("tokenMetadata:", tokenMetadata);
  return tokenMetadata;
};

export const createBonkTokenTx = async (
  connection: Connection,
  mainKp: Keypair,
  mintKp: Keypair
) => {
  try {
    const uri = await createBonkFunTokenMetadata();
    if (!uri) {
      throw new Error("Token metadata URI is undefined");
    }

    const raydium = await initSdk({ loadToken: true });
    const configId = getPdaLaunchpadConfigId(
      LAUNCHPAD_PROGRAM,
      NATIVE_MINT,
      0,
      0
    ).publicKey;
    const configData = await connection.getAccountInfo(configId);
    if (!configData) {
      throw new Error("Config not found");
    }

    const configInfo = LaunchpadConfig.decode(configData.data);
    const mintBInfo = await raydium.token.getTokenInfo(configInfo.mintB);
    const solBuyAmount = 0.01;
    const buyAmount = new BN(solBuyAmount * 10 ** 9);
    const slippageAmount = 0.1;
    const slippage = new BN(slippageAmount * 100);

    const { transactions } = await raydium.launchpad.createLaunchpad({
      programId: LAUNCHPAD_PROGRAM,
      mintA: mintKp.publicKey,
      decimals: 6,
      name: TOKEN_NAME,
      symbol: TOKEN_SYMBOL,
      migrateType: "amm",
      uri,
      configId,
      configInfo,
      mintBDecimals: mintBInfo.decimals,
      slippage,
      platformId: BONK_PLATFROM_ID,
      txVersion: TxVersion.LEGACY,
      buyAmount,
      feePayer: mainKp.publicKey,
      createOnly: true,
      extraSigners: [mintKp],
      computeBudgetConfig: {
        units: 1_200_000,
        microLamports: 100_000,
      },
    });

    // Add buy instruction for a small amount
    const buyInstruction = await makeBuyIx(
      mainKp,
      buyAmountOnCreate * LAMPORTS_PER_SOL,
      mintKp.publicKey
    );

    const { blockhash } = await connection.getLatestBlockhash();
    const ixs = [...transactions[0].instructions, ...buyInstruction];

    const messageV0 = new TransactionMessage({
      payerKey: mainKp.publicKey,
      recentBlockhash: blockhash,
      instructions: ixs,
    }).compileToV0Message();

    const transaction = new VersionedTransaction(messageV0);
    transaction.sign([mainKp, mintKp]);

    const sim = await connection.simulateTransaction(transaction, {
      sigVerify: true,
    });

    console.log(
      "create token transaction simulate ==>",
      JSON.stringify(sim, null, 2)
    );

    return transaction;
  } catch (error) {
    console.error("createBonkTokenTx error:", error);
    throw error;
  }
};

export const makeBuyIx = async (
  kp: Keypair,
  buyAmount: number,
  mintAddress: PublicKey
) => {
  const buyInstruction: TransactionInstruction[] = [];
  const lamports = buyAmount;
  console.log("launchpad programId:", LAUNCHPAD_PROGRAM.toBase58());
  const programId = LAUNCHPAD_PROGRAM;
  const configId = getPdaLaunchpadConfigId(
    programId,
    NATIVE_MINT,
    0,
    0
  ).publicKey;
  const poolId = getPdaLaunchpadPoolId(
    programId,
    mintAddress,
    NATIVE_MINT
  ).publicKey;
  console.log("🚀 ~ makeBuyTx ~ poolId:", poolId);

  const userTokenAccountA = getAssociatedTokenAddressSync(
    mintAddress,
    kp.publicKey
  );
  console.log("🚀 ~ makeBuyTx ~ userTokenAccountA:", userTokenAccountA);
  const userTokenAccountB = getAssociatedTokenAddressSync(
    NATIVE_MINT,
    kp.publicKey
  );
  console.log("🚀 ~ makeBuyTx ~ userTokenAccountB:", userTokenAccountB);

  const rentExemptionAmount =
    await connection.getMinimumBalanceForRentExemption(165);
  console.log("🚀 ~ makeBuyTx ~ rentExemptionAmount:", rentExemptionAmount);

  const buyerBalance = await connection.getBalance(kp.publicKey);
  console.log("🚀 ~ makeBuyTx ~ buyerBalance:", buyerBalance);
  const requiredBalance = rentExemptionAmount * 2 + lamports;
  console.log("🚀 ~ makeBuyTx ~ requiredBalanc :", requiredBalance);

  const vaultA = getPdaLaunchpadVaultId(
    programId,
    poolId,
    mintAddress
  ).publicKey;
  console.log("🚀 ~ makeBuyTx ~ vaultA:", vaultA);
  const vaultB = getPdaLaunchpadVaultId(
    programId,
    poolId,
    NATIVE_MINT
  ).publicKey;
  console.log("🚀 ~ makeBuyTx ~ vaultB:", vaultB);

  const shareATA = getATAAddress(kp.publicKey, NATIVE_MINT).publicKey;
  console.log("🚀 ~ makeBuyTx ~ shareATA:", shareATA);
  const authProgramId = getPdaLaunchpadAuth(programId).publicKey;
  console.log("🚀 ~ makeBuyTx ~ authProgramId:", authProgramId);
  const minmintAmount = new BN(1);

  const tokenAta = await getAssociatedTokenAddress(mintAddress, kp.publicKey);
  console.log("🚀 ~ makeBuyTx ~ tokenAta:", tokenAta);
  const wsolAta = await getAssociatedTokenAddress(NATIVE_MINT, kp.publicKey);
  console.log("🚀 ~ makeBuyTx ~ wsolAta:", wsolAta);
  buyInstruction.push(
    createAssociatedTokenAccountIdempotentInstruction(
      kp.publicKey,
      tokenAta,
      kp.publicKey,
      mintAddress
    ),
    createAssociatedTokenAccountIdempotentInstruction(
      kp.publicKey,
      wsolAta,
      kp.publicKey,
      NATIVE_MINT
    ),
    SystemProgram.transfer({
      fromPubkey: kp.publicKey,
      toPubkey: wsolAta,
      lamports,
    }),
    createSyncNativeInstruction(wsolAta)
  );

  const instruction = buyExactInInstruction(
    programId,
    kp.publicKey,
    authProgramId,
    configId,
    BONK_PLATFROM_ID,
    poolId,
    userTokenAccountA,
    userTokenAccountB,
    vaultA,
    vaultB,
    mintAddress,
    NATIVE_MINT,
    TOKEN_PROGRAM_ID,
    TOKEN_PROGRAM_ID,
    kp.publicKey,
    kp.publicKey,
    new BN(lamports),
    minmintAmount,
    new BN(10000),
    shareATA
  );

  console.log("🚀 ~ makeBuyTx ~ instruction:", instruction);

  buyInstruction.push(instruction);
  console.log("🚀 ~ makeBuyTx ~ buyInstruction:", buyInstruction);

  return buyInstruction;
};

// (async () => {
//   const mainKp = owner;
//   const mintKp = Keypair.generate();

//   console.log("Main Wallet Public Key:", mainKp.publicKey.toBase58());
//   console.log("New Mint Public Key:", mintKp.publicKey.toBase58());

//   try {
//     const transaction = await createBonkTokenTx(connection, mainKp, mintKp);

//     if (transaction) {
//       console.log("Sending token creation transaction...");

//       const latestBlockhash = await connection.getLatestBlockhash();
//       const signature = await jitoExecutor.executeAndConfirm(
//         transaction,
//         mainKp,
//         latestBlockhash
//       );

//       if (signature) {
//         console.log("Transaction successfully created and simulated!");
//       }
//     } else {
//       console.error("Failed to create the token transaction.");
//     }
//   } catch (error) {
//     console.error("Error during token creation process:", error);
//   }
// })();
