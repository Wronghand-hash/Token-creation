import {
  TxVersion,
  DEVNET_PROGRAM_ID,
  printSimulate,
  getPdaLaunchpadConfigId,
  LaunchpadConfig,
  LAUNCHPAD_PROGRAM,
  LaunchpadPoolInitParam,
} from "@raydium-io/raydium-sdk-v2";
import { initSdk } from "../config";
import BN from "bn.js";
import { Keypair, PublicKey } from "@solana/web3.js"; // Import PublicKey
import { NATIVE_MINT } from "@solana/spl-token";

export const createMint = async () => {
  const raydium = await initSdk();

  const programId = DEVNET_PROGRAM_ID.LAUNCHPAD_PROGRAM; // devent: DEVNET_PROGRAM_ID.LAUNCHPAD_PROGRAM

  const pair = Keypair.generate();
  // const pair = generateSpecificKeypair() // generate xxxxend mint address
  const mintA = pair.publicKey;

  // Add debug log for programId
  console.log("Using Launchpad Program ID:", programId.toBase58());

  const configId = getPdaLaunchpadConfigId(
    programId,
    NATIVE_MINT,
    0,
    0
  ).publicKey;

  // Add debug log for configId
  console.log("Calculated Config ID:", configId.toBase58());

  const configData = await raydium.connection.getAccountInfo(configId);
  if (!configData) {
    console.error("Config not found for ID:", configId.toBase58());
    throw new Error("config not found");
  }
  const configInfo = LaunchpadConfig.decode(configData.data);
  // Add debug log for configInfo.mintB
  console.log("Config Info Mint B:", configInfo.mintB.toBase58());

  const mintBInfo = await raydium.token.getTokenInfo(configInfo.mintB);
  // Add debug log for mintBInfo.decimals
  console.log("Mint B Decimals:", mintBInfo.decimals);

  const inAmount = new BN(1000);

  // Define the Devnet Platform ID
  const devnetPlatformId = new PublicKey(
    "9zSzfkYy6awexsHvmggeH36pfVUdDGyCcwmjT3AQPBj6"
  ); // As per Raydium docs

  // Rayidum UI usage: https://github.com/raydium-io/raydium-ui-v3-public/blob/master/src/store/useLaunchpadStore.ts#L329
  const { execute, transactions, extInfo } =
    await raydium.launchpad.createLaunchpad({
      programId,
      mintA,
      decimals: 6,
      name: "getShwifty",
      symbol: "NLP",
      migrateType: "amm",
      uri: "https://google.com",

      configId,
      configInfo, // optional, sdk will get data by configId if not provided
      mintBDecimals: mintBInfo.decimals, // default 9
      /** default platformId is Raydium platform, you can create your platform config in ./createPlatform.ts script */

      platformId: devnetPlatformId, // <--- **ADD THIS LINE**
      txVersion: TxVersion.V0,
      slippage: new BN(100), // means 1%
      buyAmount: inAmount,
      createOnly: true, // true means create mint only, false will "create and buy together"
      extraSigners: [pair],

      // supply: new BN(1_000_000_000_000_000), // lauchpad mint supply amount, default: LaunchpadPoolInitParam.supply
      // totalSellA: new BN(793_100_000_000_000),  // lauchpad mint sell amount, default: LaunchpadPoolInitParam.totalSellA
      // totalFundRaisingB: new BN(85_000_000_000),  // if mintB = SOL, means 85 SOL, default: LaunchpadPoolInitParam.totalFundRaisingB
      // totalLockedAmount: new BN(0),  // total locked amount, default 0
      // cliffPeriod: new BN(0),  // unit: seconds, default 0
      // unlockPeriod: new BN(0),  // unit: seconds, default 0

      // shareFeeReceiver: new PublicKey('your share wallet'), // only works when createOnly=false
      // shareFeeRate: new BN(1000), // only works when createOnly=false

      // computeBudgetConfig: {
      //   units: 600000,
      //   microLamports: 46591500,
      // },
    });

  printSimulate(transactions);

  try {
    const sentInfo = await execute({ sequentially: true });
    console.log("poolId: ", extInfo);
    console.log(sentInfo);
  } catch (e: any) {
    console.log(e);
  }

  process.exit(); // if you don't want to end up node execution, comment this line
};

/** uncomment code below to execute */
// createMint()
