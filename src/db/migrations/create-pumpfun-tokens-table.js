"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("pumpfun_tokens", {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER,
      },
      tokenMint: {
        type: Sequelize.STRING(64),
        allowNull: false,
        unique: true,
        comment: "The unique public key of the created token mint",
      },
      tokenName: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      tokenSymbol: {
        type: Sequelize.STRING(8),
        allowNull: false,
      },
      creatorAddress: {
        type: Sequelize.STRING(64),
        allowNull: false,
        comment: "The public key of the wallet that created the token",
      },
      metadataUri: {
        type: Sequelize.STRING(255),
        allowNull: false,
        comment:
          "The URI pointing to the token's metadata file (e.g., on Arweave or IPFS)",
      },
      imageUri: {
        type: Sequelize.STRING(255),
        allowNull: true,
        comment: "Direct URI for the token's image",
      },
      description: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      socialMedia: {
        type: Sequelize.JSON,
        allowNull: true,
        comment:
          "JSON object for social media links (e.g., { 'twitter': '...', 'telegram': '...' })",
      },
      initialMarketCap: {
        type: Sequelize.DECIMAL(20, 10),
        allowNull: true,
        comment: "The initial market cap of the token at creation",
      },
      currentMarketCap: {
        type: Sequelize.DECIMAL(20, 10),
        allowNull: true,
        comment: "The current market cap of the token",
      },
      initialSupply: {
        type: Sequelize.DECIMAL(20, 0),
        allowNull: true,
        comment: "The initial total supply of the token",
      },
      currentSupply: {
        type: Sequelize.DECIMAL(20, 0),
        allowNull: true,
        comment: "The current total supply of the token",
      },
      bondingCurveAddress: {
        type: Sequelize.STRING(64),
        allowNull: false,
        comment: "The public key of the bonding curve program address",
      },
      associatedBondingCurveAddress: {
        type: Sequelize.STRING(64),
        allowNull: false,
        comment: "The public key of the associated bonding curve token account",
      },
      signature: {
        type: Sequelize.STRING(128),
        allowNull: true,
        comment: "The transaction signature for the token creation",
      },
      status: {
        type: Sequelize.ENUM("bonding", "graduated", "failed"),
        allowNull: false,
        defaultValue: "bonding",
        comment:
          "The current status of the token (on bonding curve, graduated to DEX, or failed)",
      },
      initialBuyAmount: {
        type: Sequelize.BIGINT,
        allowNull: true,
        comment:
          "The amount of SOL in lamports used for the initial buy, if any",
      },
      createdAt: {
        type: Sequelize.DATE,
        allowNull: false,
      },
      updatedAt: {
        type: Sequelize.DATE,
        allowNull: false,
      },
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable("pumpfun_tokens");
  },
};
