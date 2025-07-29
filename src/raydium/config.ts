import {
  Raydium,
  TxVersion,
  parseTokenAccountResp,
} from "@raydium-io/raydium-sdk-v2";
import { Connection, Keypair, clusterApiUrl } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";
import bs58 from "bs58";
import dotenv from "dotenv";

dotenv.config();

export const owner: Keypair = Keypair.fromSecretKey(
  bs58.decode(
    process.env.CREATOR_PRIVATE_KEY2 ||
      (() => {
        throw new Error("CREATOR_PRIVATE_KEY not set in .env");
      })()
  )
);

export const connection = new Connection(
  process.env.RPC_URL || clusterApiUrl("devnet"),
  { commitment: "confirmed" }
);

export const txVersion = TxVersion.V0;

const cluster = "devnet";
let raydium: Raydium | undefined;

export const initSdk = async (params?: { loadToken?: boolean }) => {
  if (raydium) return raydium;

  if (connection.rpcEndpoint === clusterApiUrl("devnet")) {
    console.warn(
      "Using free RPC node might cause unexpected errors. Strongly recommend using a paid RPC node."
    );
  }

  console.log(`Connecting to RPC ${connection.rpcEndpoint} in ${cluster}`);

  try {
    raydium = await Raydium.load({
      owner,
      connection,
      cluster,
      disableFeatureCheck: true,
      disableLoadToken: !params?.loadToken,
      blockhashCommitment: "finalized",
    });
  } catch (e) {
    console.error("Failed to initialize Raydium SDK:", e);
    throw e;
  }

  return raydium;
};

export const fetchTokenAccountData = async () => {
  try {
    const solAccountResp = await connection.getAccountInfo(owner.publicKey);
    const tokenAccountResp = await connection.getTokenAccountsByOwner(
      owner.publicKey,
      { programId: TOKEN_PROGRAM_ID }
    );
    const token2022Req = await connection.getTokenAccountsByOwner(
      owner.publicKey,
      { programId: TOKEN_2022_PROGRAM_ID }
    );

    const tokenAccountData = parseTokenAccountResp({
      owner: owner.publicKey,
      solAccountResp,
      tokenAccountResp: {
        context: tokenAccountResp.context,
        value: [...tokenAccountResp.value, ...token2022Req.value],
      },
    });

    return tokenAccountData;
  } catch (e) {
    console.error("Failed to fetch token account data:", e);
    throw e;
  }
};
