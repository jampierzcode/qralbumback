const sequelize = require("../config/db");
const User = require("./User");
const Multimedia = require("./Multimedia");
const Customer = require("./Customer");
const Gift = require("./Gift");
const MediaAsset = require("./MediaAsset");
const ContentRequest = require("./ContentRequest");
const GiftEvent = require("./GiftEvent");
const Collection = require("./Collection");
const GiftResponse = require("./GiftResponse");
const { TemplateListing, CollectionTemplate } = require("./TemplateListing");

// Legado (sólo lectura tras la migración al nuevo modelo)
User.hasMany(Multimedia, { foreignKey: "userId" });
Multimedia.belongsTo(User, { foreignKey: "userId" });

// Nuevo modelo
Customer.hasMany(Gift, { foreignKey: "customerId", as: "gifts" });
Gift.belongsTo(Customer, { foreignKey: "customerId", as: "customer" });

User.hasMany(Gift, { foreignKey: "createdById", as: "createdGifts" });
Gift.belongsTo(User, { foreignKey: "createdById", as: "createdBy" });
Gift.belongsTo(User, { foreignKey: "reviewedById", as: "reviewedBy" });
User.hasMany(Customer, { foreignKey: "createdById", as: "createdCustomers" });
Customer.belongsTo(User, { foreignKey: "createdById", as: "createdBy" });

Gift.hasMany(MediaAsset, { foreignKey: "giftId", as: "media" });
MediaAsset.belongsTo(Gift, { foreignKey: "giftId", as: "gift" });

Gift.hasMany(ContentRequest, { foreignKey: "giftId", as: "contentRequests" });
ContentRequest.belongsTo(Gift, { foreignKey: "giftId", as: "gift" });

Gift.hasMany(GiftEvent, { foreignKey: "giftId", as: "events" });
GiftEvent.belongsTo(Gift, { foreignKey: "giftId", as: "gift" });

// Catálogo comercial
Collection.belongsToMany(TemplateListing, {
  through: CollectionTemplate,
  foreignKey: "collectionId",
  otherKey: "templateListingId",
  as: "templates",
});
TemplateListing.belongsToMany(Collection, {
  through: CollectionTemplate,
  foreignKey: "templateListingId",
  otherKey: "collectionId",
  as: "collections",
});

CollectionTemplate.belongsTo(TemplateListing, { foreignKey: "templateListingId", as: "listing" });
CollectionTemplate.belongsTo(Collection, { foreignKey: "collectionId", as: "collection" });

Gift.hasMany(GiftResponse, { foreignKey: "giftId", as: "responses" });
GiftResponse.belongsTo(Gift, { foreignKey: "giftId", as: "gift" });

module.exports = {
  GiftResponse,
  Collection,
  TemplateListing,
  CollectionTemplate,
  sequelize,
  User,
  Multimedia,
  Customer,
  Gift,
  MediaAsset,
  ContentRequest,
  GiftEvent,
};
