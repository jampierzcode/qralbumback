const { DataTypes } = require("sequelize");

// Sistema de referidos: cuentas que crean regalos y te los pagan (Yape) antes de compartirlos.
//   Users        → rol "referido", cuenta activable, teléfono de contacto
//   Customers    → quién lo registró
//   Gifts        → quién lo creó, estado de revisión, precio a pagar y comprobante
//   TemplateList → precio que paga el referido por cada plantilla
module.exports = {
  async up({ context: { queryInterface } }) {
    await queryInterface.changeColumn("Users", "role", {
      type: DataTypes.ENUM("superadmin", "admin", "cliente", "referido"),
      allowNull: false,
      defaultValue: "cliente",
    });
    await queryInterface.addColumn("Users", "isActive", { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true });
    await queryInterface.addColumn("Users", "phone", { type: DataTypes.STRING(40), allowNull: true });

    const owner = {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: "Users", key: "id" },
      onUpdate: "CASCADE",
      onDelete: "SET NULL",
    };
    await queryInterface.addColumn("Customers", "createdById", owner);
    await queryInterface.addColumn("Gifts", "createdById", owner);
    await queryInterface.addColumn("Gifts", "reviewedById", owner);

    await queryInterface.addColumn("Gifts", "reviewStatus", {
      type: DataTypes.ENUM("none", "pending", "approved", "rejected"),
      allowNull: false,
      defaultValue: "none",
    });
    await queryInterface.addColumn("Gifts", "submittedAt", { type: DataTypes.DATE, allowNull: true });
    await queryInterface.addColumn("Gifts", "reviewedAt", { type: DataTypes.DATE, allowNull: true });
    await queryInterface.addColumn("Gifts", "reviewNote", { type: DataTypes.STRING(300), allowNull: true });
    await queryInterface.addColumn("Gifts", "price", { type: DataTypes.DECIMAL(10, 2), allowNull: true });
    await queryInterface.addColumn("Gifts", "currency", { type: DataTypes.STRING(3), allowNull: false, defaultValue: "PEN" });
    await queryInterface.addColumn("Gifts", "paidAt", { type: DataTypes.DATE, allowNull: true });
    await queryInterface.addColumn("Gifts", "paymentProofAssetId", { type: DataTypes.UUID, allowNull: true });

    await queryInterface.changeColumn("MediaAssets", "uploadedBy", {
      type: DataTypes.ENUM("admin", "customer", "referral"),
      allowNull: false,
      defaultValue: "admin",
    });

    await queryInterface.addColumn("TemplateListings", "referralPrice", { type: DataTypes.DECIMAL(10, 2), allowNull: true });

    await queryInterface.addIndex("Gifts", ["createdById", "reviewStatus"]);
  },

  async down({ context: { queryInterface } }) {
    await queryInterface.removeIndex("Gifts", ["createdById", "reviewStatus"]);
    for (const column of ["createdById", "reviewedById", "reviewStatus", "submittedAt", "reviewedAt", "reviewNote", "price", "currency", "paidAt", "paymentProofAssetId"]) {
      await queryInterface.removeColumn("Gifts", column);
    }
    await queryInterface.removeColumn("Customers", "createdById");
    await queryInterface.removeColumn("TemplateListings", "referralPrice");
    await queryInterface.changeColumn("MediaAssets", "uploadedBy", {
      type: DataTypes.ENUM("admin", "customer"),
      allowNull: false,
      defaultValue: "admin",
    });
    await queryInterface.removeColumn("Users", "isActive");
    await queryInterface.removeColumn("Users", "phone");
    await queryInterface.changeColumn("Users", "role", {
      type: DataTypes.ENUM("superadmin", "admin", "cliente"),
      allowNull: false,
      defaultValue: "cliente",
    });
  },
};
