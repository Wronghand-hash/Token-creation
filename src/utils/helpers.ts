import { PublicKey } from "@solana/web3.js";

export async function derivePda(
  seeds: (string | Buffer)[],
  programId: PublicKey
): Promise<PublicKey> {
  const seedBuffers = seeds.map((seed) =>
    typeof seed === "string" ? Buffer.from(seed) : seed
  );
  return (await PublicKey.findProgramAddress(seedBuffers, programId))[0];
}
