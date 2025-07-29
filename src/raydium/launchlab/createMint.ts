import {
  TxVersion,
  DEVNET_PROGRAM_ID,
  getPdaLaunchpadConfigId,
  LaunchpadConfig,
  LAUNCHPAD_PROGRAM,
  LaunchpadPoolInitParam,
} from "@raydium-io/raydium-sdk-v2";
import { initSdk } from "../config";
import BN from "bn.js";
import {
  Keypair,
  PublicKey,
  VersionedTransaction,
  Connection,
  TransactionInstruction,
  AccountMeta,
} from "@solana/web3.js";
import { NATIVE_MINT } from "@solana/spl-token";
import { PinataService } from "../../pinata/index";

const pinataService = new PinataService();

interface LaunchpadRequest {
  name: string;
  symbol: string;
  uri?: string;
  decimals?: number;
  migrateType?: "amm" | "cpmm";
  txVersion?: TxVersion;
  slippage?: BN;
  createOnly?: boolean;
  extraSigners?: Keypair[];
  buyAmount?: BN;
}

// Custom function to simulate and print transaction details in a human-readable format
async function customPrintSimulate(
  connection: Connection,
  transactions: VersionedTransaction[],
  signers: Keypair[]
) {
  console.log("\n=== Transaction Simulation ===");
  for (let i = 0; i < transactions.length; i++) {
    const tx = transactions[i];
    console.log(`\nTransaction ${i + 1}:`);

    // Extract accounts
    const message = tx.message;
    console.log("Accounts Involved:");
    message.staticAccountKeys.forEach((account, index) => {
      console.log(
        `  ${index + 1}. ${account?.toBase58()} ${
          index === 0 ? "(Fee Payer)" : ""
        }`
      );
      // Check if account exists
      connection.getAccountInfo(account).then((info) => {
        if (!info) {
          console.warn(
            `    Warning: Account ${account?.toBase58()} does not exist on-chain`
          );
        }
      });
    });

    // Decode instructions (if possible)
    console.log("\nInstructions:");
    const compiledInstructions = message.compiledInstructions;
    for (let j = 0; j < compiledInstructions.length; j++) {
      const instr = compiledInstructions[j];
      const programId = message.staticAccountKeys[instr.programIdIndex];
      console.log(`  Instruction ${j + 1}:`);
      console.log(`    Program: ${programId?.toBase58()}`);
      console.log(`    Accounts:`);
      instr.accountKeyIndexes.forEach((keyIndex) => {
        const account = message.staticAccountKeys[keyIndex];
        console.log(`      - ${account?.toBase58()}`);
      });
      // Note: Decoding instruction data requires knowledge of the program's instruction format
      console.log(
        `    Data (raw, base64): ${Buffer.from(instr.data).toString("base64")}`
      );
    }

    // Simulate the transaction
    try {
      const simulation = await connection.simulateTransaction(tx, {
        sigVerify: false,
        commitment: "confirmed",
      });

      console.log("\nSimulation Result:");
      if (simulation.value.err) {
        console.error("  Status: Failed");
        console.error("  Error:", simulation.value.err);
        console.log("  Logs:");
        simulation.value.logs?.forEach((log, index) => {
          console.log(`    ${index + 1}. ${log}`);
        });
      } else {
        console.log("  Status: Succeeded");
        console.log(
          "  Compute Units Consumed:",
          simulation.value.unitsConsumed
        );
        console.log("  Logs:");
        simulation.value.logs?.forEach((log, index) => {
          console.log(`    ${index + 1}. ${log}`);
        });
      }
    } catch (error: any) {
      console.error("  Simulation Error:", error.message || error);
    }
  }
}

export const createLaunchlabToken = async (tokenData: LaunchpadRequest) => {
  const raydium = await initSdk();
  console.log("RPC Endpoint:", raydium.connection.rpcEndpoint);
  const programId = LAUNCHPAD_PROGRAM;
  console.log("Program ID:", programId.toBase58());

  const pair = Keypair.generate();
  const mintA = pair.publicKey;
  console.log("Mint A:", mintA.toBase58());

  const configId = getPdaLaunchpadConfigId(
    programId,
    NATIVE_MINT,
    0,
    0
  ).publicKey;
  console.log("Config ID:", configId.toBase58());

  const configData = await raydium.connection.getAccountInfo(configId);
  if (!configData) {
    console.error("Config not found for configId:", configId.toBase58());
    throw new Error("config not found");
  }

  const uri = await pinataService.uploadMetadata({
    ...tokenData,
    owner: raydium.ownerPubKey,
  });

  const configInfo = LaunchpadConfig.decode(configData.data);
  console.log(
    "Config Info:",
    JSON.stringify(
      configInfo,
      (key, value) =>
        value instanceof PublicKey
          ? value.toBase58()
          : value instanceof BN
          ? value.toString(16).padStart(2, "0")
          : value,
      2
    )
  );

  const mintBInfo = await raydium.token.getTokenInfo(configInfo.mintB);
  console.log("Mint B Info:", JSON.stringify(mintBInfo, null, 2));

  const inAmount = new BN(1000);
  const { execute, transactions, extInfo } =
    await raydium.launchpad.createLaunchpad({
      programId,
      mintA,
      decimals: tokenData.decimals || 6,
      name: tokenData.name,
      symbol: tokenData.symbol,
      migrateType: tokenData.migrateType || "amm",
      uri: uri,
      configId,
      configInfo,
      mintBDecimals: mintBInfo.decimals,
      txVersion: TxVersion.V0,
      slippage: tokenData.slippage || new BN(100),
      buyAmount: tokenData.buyAmount || new BN(1000),
      createOnly: true,
      extraSigners: [pair],
    });

  console.log("Number of Transactions:", transactions.length);

  // Simulate transactions
  await customPrintSimulate(raydium.connection, transactions, [pair]);

  try {
    const sentInfo = await execute({ sequentially: true });
    console.log(
      "poolId:",
      JSON.stringify(
        extInfo,
        (key, value) => (value instanceof PublicKey ? value.toBase58() : value),
        2
      )
    );
    console.log("Transaction Result:", JSON.stringify(sentInfo, null, 2));
  } catch (e: any) {
    console.error("Execution error:", e.message || e);
    if (e.logs) {
      console.log("Transaction Logs:");
      e.logs.forEach((log: string, index: number) => {
        console.log(`  ${index + 1}. ${log}`);
      });
    }
  }

  process.exit();
};
