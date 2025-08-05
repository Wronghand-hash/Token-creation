"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("launchlab_tokens", {
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
        comment: "The URI pointing to the token's metadata file",
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
          "JSON object for social media links (e.g., { website: '...', twitter: '...', telegram: '...' })",
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
      platformId: {
        type: Sequelize.STRING(64),
        allowNull: false,
        comment: "The platform ID (e.g., BONK_PLATFROM_ID)",
      },
      configId: {
        type: Sequelize.STRING(64),
        allowNull: false,
        comment: "The configuration ID for the launchpad",
      },
      poolId: {
        type: Sequelize.STRING(64),
        allowNull: false,
        comment: "The pool ID for the launchpad",
      },
      vaultA: {
        type: Sequelize.STRING(64),
        allowNull: false,
        comment: "The vault address for the token mint",
      },
      vaultB: {
        type: Sequelize.STRING(64),
        allowNull: false,
        comment: "The vault address for the native mint (SOL)",
      },
      signature: {
        type: Sequelize.STRING(128),
        allowNull: true,
        unique: true,
        comment: "The transaction signature for the token creation",
      },
      status: {
        type: Sequelize.ENUM("active", "migrated", "failed"),
        allowNull: false,
        defaultValue: "active",
        comment:
          "The current status of the token (active, migrated to AMM, or failed)",
      },
      initialBuyAmount: {
        type: Sequelize.BIGINT,
        allowNull: true,
        comment:
          "The amount of SOL in lamports used for the initial buy, if any",
      },
      decimals: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 6,
        comment: "The number of decimals for the token",
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
    await queryInterface.dropTable("launchlab_tokens");
  },
};
