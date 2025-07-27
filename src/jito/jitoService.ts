import axios, { AxiosError } from "axios";
import bs58 from "bs58";
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionMessage,
  VersionedTransaction,
  BlockhashWithExpiryBlockHeight,
} from "@solana/web3.js";

export class JitoBundler {
  private JitoFeeWallet: PublicKey;
  private jitpTipAccounts: string[] = [
    "96gYZGLnJYVFmbjz256MhJNURt7z49g9aR3ouWHuFNUC",
    "Cw8CFyM9FkoMi7K7Cr9B2W6uW7V8KB8g4WPQJ2mu2mB",
  ];

  constructor(
    private readonly jitoFee: string,
    private readonly connection: Connection
  ) {
    this.JitoFeeWallet = this.getRandomValidatorKey();
  }

  private getRandomValidatorKey(): PublicKey {
    const randomValidator =
      this.jitpTipAccounts[
        Math.floor(Math.random() * this.jitpTipAccounts.length)
      ];
    return new PublicKey(randomValidator);
  }

  public async executeAndConfirm(
    transaction: Transaction,
    feePayer: Keypair,
    latestBlockhash: BlockhashWithExpiryBlockHeight
  ): Promise<{ confirmed: boolean; signature?: string; error?: string }> {
    this.JitoFeeWallet = this.getRandomValidatorKey();

    try {
      const jitTipTxFeeMessage = new TransactionMessage({
        payerKey: feePayer.publicKey,
        recentBlockhash: latestBlockhash.blockhash,
        instructions: [
          SystemProgram.transfer({
            fromPubkey: feePayer.publicKey,
            toPubkey: this.JitoFeeWallet,
            lamports: BigInt(this.jitoFee),
          }),
        ],
      }).compileToV0Message();

      const jitoFeeTx = new VersionedTransaction(jitTipTxFeeMessage);
      jitoFeeTx.sign([feePayer]);
      const jitoTxsignature = bs58.encode(jitoFeeTx.signatures[0]);

      const serializedjitoFeeTx = bs58.encode(jitoFeeTx.serialize());
      const serializedTransaction0 = bs58.encode(transaction.serialize());

      console.log({
        jitoTxsignature,
        txSign: bs58.encode(transaction.signatures[0].signature!),
      });

      const serializedTransactions = [
        serializedjitoFeeTx,
        serializedTransaction0,
      ];

      const endpoints = [
        "https://necessary-wiser-mound.solana-mainnet.quiknode.pro/cc41531c946ca6662a805973099e2cf5778007f8",
      ];

      const requests = endpoints.map((url) =>
        axios.post(url, {
          jsonrpc: "2.0",
          id: 1,
          method: "sendBundle",
          params: [serializedTransactions],
        })
      );

      const results = await Promise.all(requests.map((p) => p.catch((e) => e)));
      const successfulResults = results.filter(
        (result) => !(result instanceof Error)
      );

      if (successfulResults.length > 0) {
        return await this.confirm(jitoTxsignature);
      } else {
        console.debug("No successful responses received for jito");
      }

      return { confirmed: false };
    } catch (error) {
      if (error instanceof AxiosError) {
        console.log(
          { error: error.response?.data },
          "Failed to execute jito transaction"
        );
      }
      console.error("Error during transaction execution", error);
      return { confirmed: false };
    }
  }

  private async confirm(signature: string) {
    await new Promise((resolve) => setTimeout(resolve, 10000));
    const confirmation = await this.connection.getSignatureStatus(signature);
    console.log(confirmation);

    if (confirmation.value?.confirmationStatus)
      return { confirmed: true, signature };
    else {
      return { confirmed: false, error: "Transaction not confirmed" };
    }
  }
}
