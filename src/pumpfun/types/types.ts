export interface TokenCreationRequest {
  name: string; // Max 32 characters
  symbol: string; // Max 8 characters
  creatorKeypair: string; // Base58-encoded private key
  imagePath: string; // Path to image file (e.g., ./image.png)
  description?: string; // Optional description
  external_url?: string; // Optional website, Twitter, Telegram, etc.
  attributes?: Array<{ trait_type: string; value: string }>; // Optional attributes
  uri?: string; // Optional pre-generated URI (if provided, skips metadata upload)
}
