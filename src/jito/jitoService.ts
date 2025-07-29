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
  // Updated list of Jito tip accounts from JitoTransactionExecutor
  private jitpTipAccounts: string[] = [
    "Cw8CFyM9FkoMi7K7Crf6HNQqf4uEMzpKw6QNghXLvLkY",
    "DttWaMuVvTiduZRnguLF7jNxTgiMBZ1hyAumKUiL2KRL",
    "96gYZGLnJYVFmbjzopPSU6QiEV5fGqZNyN9nmNhvrZU5",
    "3AVi9Tg9Uo68tJfuvoKvqKNWKkC5wPdSSdeBnizKZ6jT",
    "HFqU5x63VTqvQss8hp11i4wVV8bD44PvwucfZ2bU7gRe",
    "ADaUMid9yfUytqMBgopwjb2DTLSokTSzL1zt6iGPaS49",
    "ADuUkR4vqLUMWXxW9gh6D6L8pMSawimctcNZ5pGwDcEt",
    "DfXygSm4jCyNCybVYYK6DwvWqjKee8pbDmJGcLWNDXjh",
  ];

  private JitoFeeWallet: PublicKey;

  constructor(
    private readonly jitoFee: string = "5000000", // 0.005 SOL
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
    latestBlockhash: BlockhashWithExpiryBlockHeight,
    additionalSigners: Keypair[] = []
  ): Promise<{ confirmed: boolean; signature?: string; error?: string }> {
    this.JitoFeeWallet = this.getRandomValidatorKey();

    try {
      // Convert legacy transaction to VersionedTransaction
      const messageV0 = new TransactionMessage({
        payerKey: feePayer.publicKey,
        recentBlockhash: latestBlockhash.blockhash,
        instructions: transaction.instructions,
      }).compileToV0Message();
      const mainTx = new VersionedTransaction(messageV0);
      mainTx.sign([feePayer, ...additionalSigners]);

      // Create Jito fee transaction
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

      const jitoTxSignature = bs58.encode(jitoFeeTx.signatures[0]);
      const mainTxSignature = bs58.encode(mainTx.signatures[0]);

      console.log({
        jitoTxSignature,
        mainTxSignature,
      });

      const serializedJitoFeeTx = bs58.encode(jitoFeeTx.serialize());
      const serializedMainTx = bs58.encode(mainTx.serialize());
      const serializedTransactions = [serializedJitoFeeTx, serializedMainTx];

      const endpoints = [
        process.env.JITO_RPC_URL || "https://api.devnet.solana.com",
      ];
      const maxRetries = 3;
      const retryDelay = (attempt: number) =>
        Math.min(1000 * 2 ** attempt, 5000);
      let bundleId: string | undefined;

      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          const requests = endpoints.map((url) =>
            axios.post(url, {
              jsonrpc: "2.0",
              id: 1,
              method: "sendBundle",
              params: [serializedTransactions],
            })
          );
          const results = await Promise.all(
            requests.map((p) => p.catch((e) => e))
          );

          const successfulResults = results.filter(
            (result) => !(result instanceof Error) && result.data.result
          );
          const failedResults = results.filter(
            (result) => result instanceof Error
          );

          if (failedResults.length > 0) {
            console.error(
              `Jito bundle errors (attempt ${attempt}/${maxRetries}):`,
              failedResults.map((result) => (result as Error).message)
            );
          }

          if (successfulResults.length > 0) {
            bundleId = successfulResults[0].data.result;
            console.log("Bundle ID:", bundleId);
            break;
          } else {
            console.debug(
              `No successful responses in attempt ${attempt}/${maxRetries}`
            );
            if (attempt < maxRetries) {
              await new Promise((resolve) =>
                setTimeout(resolve, retryDelay(attempt))
              );
            }
          }
        } catch (e) {
          console.error(`Attempt ${attempt} failed:`, e);
          if (attempt < maxRetries) {
            await new Promise((resolve) =>
              setTimeout(resolve, retryDelay(attempt))
            );
          }
        }
      }

      if (bundleId) {
        // Check bundle status
        const statusResponse = await axios.post(endpoints[0], {
          jsonrpc: "2.0",
          id: 1,
          method: "getBundleStatuses",
          params: [[bundleId]],
        });
        console.log("Bundle Status:", statusResponse.data);

        const [jitoResult, mainResult] = await Promise.all([
          this.confirm(jitoTxSignature, 5, 10000),
          this.confirm(mainTxSignature, 5, 10000),
        ]);

        if (mainResult.confirmed) {
          return {
            confirmed: true,
            signature: mainTxSignature,
            error: undefined,
          };
        }
        return {
          confirmed: false,
          signature: mainTxSignature,
          error: "Main transaction not confirmed",
        };
      } else {
        console.debug("No successful responses received for Jito bundle");
        return {
          confirmed: false,
          error: "No successful Jito bundle responses",
        };
      }
    } catch (error) {
      if (error instanceof AxiosError) {
        console.log(
          { error: error.response?.data },
          "Failed to execute Jito transaction"
        );
      }
      console.error("Error during transaction execution", error);
      return {
        confirmed: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  private async confirm(
    signature: string,
    maxRetries: number = 5,
    retryInterval: number = 10000
  ): Promise<{ confirmed: boolean; signature?: string; error?: string }> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, retryInterval));

      const confirmation = await this.connection.getSignatureStatus(signature, {
        searchTransactionHistory: true,
      });

      console.log(
        `Confirmation attempt ${attempt}/${maxRetries} for signature ${signature}:`,
        confirmation
      );

      if (
        confirmation.value?.confirmationStatus === "confirmed" ||
        confirmation.value?.confirmationStatus === "finalized"
      ) {
        return { confirmed: true, signature };
      }
    }

    return {
      confirmed: false,
      signature,
      error: "Transaction not confirmed after retries",
    };
  }
}
