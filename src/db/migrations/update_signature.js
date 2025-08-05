"use strict";

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.changeColumn("pumpfun_tokens", "signature", {
      type: Sequelize.STRING(128),
      allowNull: true,
      comment: "The transaction signature for the token creation",
    });

    await queryInterface.removeConstraint(
      "pumpfun_tokens",
      "pumpfun_tokens_signature_key"
    );

    await queryInterface.changeColumn("launchlab_tokens", "signature", {
      type: Sequelize.STRING(128),
      allowNull: true,
      comment: "The transaction signature for the token creation",
    });

    await queryInterface.removeConstraint(
      "launchlab_tokens",
      "launchlab_tokens_signature_key"
    );
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.changeColumn("pumpfun_tokens", "signature", {
      type: Sequelize.STRING(128),
      allowNull: false,
      comment: "The transaction signature for the token creation",
    });

    await queryInterface.addConstraint("pumpfun_tokens", {
      fields: ["signature"],
      type: "unique",
      name: "pumpfun_tokens_signature_key",
    });

    await queryInterface.changeColumn("launchlab_tokens", "signature", {
      type: Sequelize.STRING(128),
      allowNull: true, // Note: LaunchlabTokens already had allowNull: true
      comment: "The transaction signature for the token creation",
    });

    await queryInterface.addConstraint("launchlab_tokens", {
      fields: ["signature"],
      type: "unique",
      name: "launchlab_tokens_signature_key",
    });
  },
};
