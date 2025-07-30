export interface TokenCreationRequest {
  name: string;
  symbol: string;
  creatorKeypair: string;
  imagePath: string;
  description?: string;
  imageFileName?: string;
  imageBuffer?: Buffer;
  external_url?: string;
  attributes?: Array<{ trait_type: string; value: string }>;
  uri?: string; // pre genrated uri
  buyAmount?: number;
}
