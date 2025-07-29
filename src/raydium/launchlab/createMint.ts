import {
  TxVersion,
  printSimulate,
  getPdaLaunchpadConfigId,
} from "@raydium-io/raydium-sdk-v2";
import { initSdk } from "../config";
import BN from "bn.js";
import { Keypair, PublicKey } from "@solana/web3.js";
import { NATIVE_MINT } from "@solana/spl-token";
import { generateSpecificKeypair } from "../../utils/helpers";

export const createMint = async () => {
  const raydium = await initSdk();
  const programId = new PublicKey(
    "LanD8FpTBBvzZFXjTxsAoipkFsxPUCDB4qAqKxYDiNP"
  );
  const pair = Keypair.generate();
  const mintA = pair.publicKey;

  console.log("Using Launchpad Program ID:", programId.toBase58());

  const configId = getPdaLaunchpadConfigId(
    programId,
    NATIVE_MINT,
    0,
    0
  ).publicKey;
  console.log("Calculated Config ID:", configId.toBase58());

  // Use getRpcPoolInfo for Devnet
  let configInfo;
  try {
    const poolInfo = await raydium.launchpad.getRpcPoolInfo({
      poolId: configId,
    });
    configInfo = poolInfo.configInfo;
    if (!configInfo) {
      throw new Error("Config info not found");
    }
    console.log("Config Info Mint B:", configInfo.mintB.toBase58());
  } catch (e) {
    console.error("Failed to fetch pool info:", e);
    throw e;
  }

  const mintBInfo = await raydium.token.getTokenInfo(configInfo.mintB);
  console.log("Mint B Decimals:", mintBInfo.decimals);

  const devnetPlatformId = new PublicKey(
    "9zSzfkYy6awexsHvmggeH36pfVUdDGyCcwmjT3AQPBj6"
  );

  const { execute, transactions, extInfo } =
    await raydium.launchpad.createLaunchpad({
      programId,
      mintA,
      decimals: 6,
      name: "getShwifty",
      symbol: "NLP",
      uri: "https://google.com",
      migrateType: "amm",
      configId,
      configInfo,
      mintBDecimals: mintBInfo.decimals,
      platformId: devnetPlatformId,
      txVersion: TxVersion.V0,
      createOnly: true,
      extraSigners: [pair],
      buyAmount: new BN(1000),

      // supply: new BN(1_000_000_000_000_000), // lauchpad mint supply amount, default: LaunchpadPoolInitParam.supply
      // totalSellA: new BN(793_100_000_000_000),  // lauchpad mint sell amount, default: LaunchpadPoolInitParam.totalSellA
      // totalFundRaisingB: new BN(85_000_000_000),  // if mintB = SOL, means 85 SOL, default: LaunchpadPoolInitParam.totalFundRaisingB
      // totalLockedAmount: new BN(0),  // total locked amount, default 0
      // cliffPeriod: new BN(0),  // unit: seconds, default 0
      // unlockPeriod: new BN(0),  // unit: seconds, default 0

      // shareFeeReceiver: new PublicKey('your share wallet'), // only works when createOnly=false
      // shareFeeRate: new BN(1000), // only works when createOnly=false

      // computeBudgetConfig: {
      //   units: 600000,
      //   microLamports: 46591500,
      // },
    });

  printSimulate(transactions);

  try {
    const sentInfo = await execute({ sequentially: true });
    console.log("poolId: ", extInfo);
    console.log(sentInfo);
  } catch (e: any) {
    console.error("Execution failed:", e);
  }

  process.exit();
};

// createMint();
