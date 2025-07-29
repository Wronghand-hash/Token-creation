import { Keypair, PublicKey } from "@solana/web3.js";

export async function derivePda(
  seeds: (string | Buffer)[],
  programId: PublicKey
): Promise<PublicKey> {
  const seedBuffers = seeds.map((seed) =>
    typeof seed === "string" ? Buffer.from(seed) : seed
  );
  return (await PublicKey.findProgramAddress(seedBuffers, programId))[0];
}

export function generateSpecificKeypair() {
  let targetPair: Keypair;

  /** note: if set up more characters, if will cost more time */
  const target = "dmo"; // set up desire mint ends, e.g. demo
  let i = 0;
  while (true) {
    if (i % 10000 === 0) console.log("loop count: ", i);
    const pair = Keypair.generate();
    if (pair.publicKey.toBase58().endsWith(target)) {
      targetPair = pair;
      console.log("found:", pair.publicKey.toBase58());
      break;
    }
    i++;
  }

  return targetPair;
}

export function generateChunkSpecificKeypair() {
  const pairList: Keypair[] = [];
  const targetAmount = 100;
  /** note: if set up more characters, if will cost more time */
  const target = "dmo"; // set up desire mint ends, e.g. demo

  let i = 0;
  while (true) {
    if (i % 10000 === 0) console.log("loop count: ", i);
    const pair = Keypair.generate();
    if (pair.publicKey.toBase58().endsWith(target)) {
      pairList.push(pair);
      console.log(`found ${pairList.length}:`, pair.publicKey.toBase58());
      if (pairList.length === targetAmount) break;
    }
    i++;
  }

  return pairList;
}
