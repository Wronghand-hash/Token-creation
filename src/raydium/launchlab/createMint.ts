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
import { initSdk } from "../config";
import { JitoTransactionExecutor } from "./executer";
import dotenv from "dotenv";
import { LaunchpadRequest } from "../types/types";

dotenv.config();

const JITO_FEE = 0.001;
const BONK_PLATFROM_ID = new PublicKey(
  "FfYek5vEz23cMkWsdJwG2oa6EphsvXSHrGpdALN4g6W1"
);
const commitment = "confirmed";

const connection = new Connection(process.env.RPC_URL || "", {
  commitment,
});

const jitoExecutor = new JitoTransactionExecutor(
  JITO_FEE.toString(),
  connection,
  process.env.JITO_RPC_URL || ""
);

const createImageMetadata = async (imageData: Buffer) => {
  const formData = new FormData();
  try {
    formData.append("image", new Blob([imageData]), "token-image.png");

    const uploadResponse = await fetch(
      "https://storage.letsbonk.fun/upload/img",
      {
        method: "POST",
        body: formData,
      }
    );

    if (!uploadResponse.ok) {
      throw new Error(`Failed to upload image: ${uploadResponse.statusText}`);
    }

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
    createdOn: create.createdOn || "https://bonk.fun",
    platformId: create.platformId,
    image: create.image,
    website: create.website || "https://bonk.fun",
    twitter: create.twitter || "https://x.com/bonkfun",
    telegram: create.telegram || "https://t.me/bonkfun",
    showName: create.showName,
  };

  console.log("Metadata:", metadata);

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

export const createBonkFunTokenMetadata = async (
  tokenData: LaunchpadRequest
) => {
  // Validate required fields
  if (!tokenData.name || !tokenData.symbol || !tokenData.image) {
    throw new Error(
      "Missing required fields: name, symbol, and image are required"
    );
  }

  if (tokenData.name.length > 32) {
    throw new Error("Name must be 32 characters or less");
  }

  if (tokenData.symbol.length > 8) {
    throw new Error("Symbol must be 8 characters or less");
  }

  if (tokenData.description && tokenData.description.length > 200) {
    throw new Error("Description must be 200 characters or less");
  }

  if (tokenData.platformId) {
    try {
      new PublicKey(tokenData.platformId);
    } catch {
      throw new Error("platformId must be a valid Solana public key");
    }
  }

  const imageMetadata = await createImageMetadata(tokenData.image);
  console.log("imageMetadata:", imageMetadata);

  const tokenInfo = {
    name: tokenData.name,
    symbol: tokenData.symbol,
    description: tokenData.description,
    createdOn: tokenData.createdOn,
    platformId: BONK_PLATFROM_ID.toBase58(),
    image: imageMetadata,
    website: tokenData.website,
    twitter: tokenData.twitter,
    telegram: tokenData.telegram,
    showName: tokenData.showName || tokenData.name,
  };

  const tokenMetadata = await createBonkTokenMetadata(tokenInfo);
  console.log("tokenMetadata:", tokenMetadata);
  return tokenMetadata;
};

export const createBonkTokenTx = async (
  connection: Connection,
  mainKp: Keypair,
  mintKp: Keypair,
  tokenData: LaunchpadRequest
) => {
  try {
    // Validate required fields
    if (!tokenData.name || !tokenData.symbol || !tokenData.image) {
      throw new Error(
        "Missing required fields: name, symbol, and image are required"
      );
    }

    if (tokenData.name.length > 32) {
      throw new Error("Name must be 32 characters or less");
    }

    if (tokenData.symbol.length > 8) {
      throw new Error("Symbol must be 8 characters or less");
    }

    if (tokenData.description && tokenData.description.length > 200) {
      throw new Error("Description must be 200 characters or less");
    }

    const urlPattern = /^(https?:\/\/)/;
    if (tokenData.createdOn && !urlPattern.test(tokenData.createdOn)) {
      throw new Error("createdOn must be a valid URL");
    }
    if (tokenData.website && !urlPattern.test(tokenData.website)) {
      throw new Error("website must be a valid URL");
    }
    if (tokenData.twitter && !urlPattern.test(tokenData.twitter)) {
      throw new Error("twitter must be a valid URL");
    }
    if (tokenData.telegram && !urlPattern.test(tokenData.telegram)) {
      throw new Error("telegram must be a valid URL");
    }

    if (
      tokenData.decimals &&
      (isNaN(tokenData.decimals) ||
        tokenData.decimals < 0 ||
        tokenData.decimals > 9)
    ) {
      throw new Error("Decimals must be a number between 0 and 9");
    }

    if (tokenData.migrateType && !["amm"].includes(tokenData.migrateType)) {
      throw new Error("Invalid migrateType");
    }

    const uri = await createBonkFunTokenMetadata(tokenData);
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

    const slippage = new BN(tokenData.slippage || 100);

    const { transactions } = await raydium.launchpad.createLaunchpad({
      programId: LAUNCHPAD_PROGRAM,
      mintA: mintKp.publicKey,
      decimals: tokenData.decimals || 6,
      name: tokenData.name,
      symbol: tokenData.symbol,
      migrateType: tokenData.migrateType || "amm",
      uri,
      configId,
      configInfo,
      mintBDecimals: mintBInfo.decimals,
      slippage,
      platformId: tokenData.platformId
        ? new PublicKey(tokenData.platformId)
        : BONK_PLATFROM_ID,
      txVersion: TxVersion.LEGACY,
      buyAmount: new BN(tokenData.buyAmount || 0),
      feePayer: mainKp.publicKey,
      createOnly: true,
      extraSigners: [mintKp],
      computeBudgetConfig: {
        units: 1_200_000,
        microLamports: 100_000,
      },
    });

    const ixs = [...transactions[0].instructions];

    // Only add buy instruction if buyAmount is provided
    if (tokenData.buyAmount && tokenData.buyAmount > 0) {
      const buyInstruction = await makeBuyIx(
        mainKp,
        tokenData.buyAmount * LAMPORTS_PER_SOL,
        mintKp.publicKey
      );
      ixs.push(...buyInstruction);
    }

    const { blockhash } = await connection.getLatestBlockhash();
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
  console.log("🚀 ~ makeBuyTx ~ requiredBalance:", requiredBalance);

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
