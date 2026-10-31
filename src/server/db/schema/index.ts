import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  timestamp,
  integer,
  jsonb,
  uniqueIndex,
  index,
  primaryKey,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// ==========================================
// 1. Identity & Auth
// ==========================================
export const users = pgTable(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    email: varchar("email", { length: 255 }).notNull().unique(),
    name: varchar("name", { length: 255 }),
    passwordHash: text("password_hash"),
    image: text("image"),
    isPlatformAdmin: boolean("is_platform_admin").default(false).notNull(),
    emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
    // Sign-in asks for a code emailed to this address after the password (FR-008). Opt-in.
    mfaEmailEnabled: boolean("mfa_email_enabled").default(false).notNull(),
    // Works for the platform's support team: can look at a business only while its owner has allowed it (FR, section 4)
    isSupportAgent: boolean("is_support_agent").default(false).notNull(),
    // Optional, for birthday treats; no year is stored (data minimisation)
    birthMonth: integer("birth_month"),
    birthDay: integer("birth_day"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    index("users_email_idx").on(table.email),
  ]
);

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    token: text("token").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    // Last time this session re-confirmed its password or an emailed code, for sensitive actions
    reauthedAt: timestamp("reauthed_at", { withTimezone: true }),
    ipAddress: varchar("ip_address", { length: 45 }),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("sessions_user_id_idx").on(table.userId),
    index("sessions_token_idx").on(table.token),
  ]
);

export const verifications = pgTable(
  "verifications",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    identifier: varchar("identifier", { length: 255 }).notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("verifications_identifier_idx").on(table.identifier),
  ]
);

// ==========================================
// 2. Tenancy & Locations
// ==========================================
export const tenants = pgTable(
  "tenants",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    slug: varchar("slug", { length: 64 }).notNull().unique(),
    name: varchar("name", { length: 255 }).notNull(),
    status: varchar("status", { length: 32 }).default("active").notNull(), // active, suspended, closed
    industry: varchar("industry", { length: 64 }),
    timezone: varchar("timezone", { length: 64 }).default("Europe/London").notNull(),
    currency: varchar("currency", { length: 8 }).default("GBP").notNull(),
    locale: varchar("locale", { length: 16 }).default("en-GB").notNull(),
    brandPrimaryHex: varchar("brand_primary_hex", { length: 16 }).default("#000000"),
    logoUrl: text("logo_url"),
    plan: varchar("plan", { length: 32 }).default("free").notNull(), // free, pro
    // trialing, active, past_due, canceled. Overdue never deletes loyalty records (FR-113)
    billingStatus: varchar("billing_status", { length: 24 }).default("active").notNull(),
    trialEndsAt: timestamp("trial_ends_at", { withTimezone: true }),
    pastDueSince: timestamp("past_due_since", { withTimezone: true }),
    // FR-014: the shop's own web address (shop.example.com), proved with a DNS record before it is used
    customDomain: varchar("custom_domain", { length: 255 }).unique(),
    customDomainToken: varchar("custom_domain_token", { length: 64 }),
    customDomainVerifiedAt: timestamp("custom_domain_verified_at", { withTimezone: true }),
    features: jsonb("features").default({}).notNull(),
    limits: jsonb("limits").default({}).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("tenants_slug_idx").on(table.slug),
    index("tenants_status_idx").on(table.status),
  ]
);

export const locations = pgTable(
  "locations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    publicId: varchar("public_id", { length: 32 }).notNull().unique(),
    name: varchar("name", { length: 255 }).notNull(),
    address: jsonb("address").default({}).notNull(),
    timezone: varchar("timezone", { length: 64 }),
    status: varchar("status", { length: 32 }).default("active").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("locations_tenant_id_idx").on(table.tenantId),
    index("locations_public_id_idx").on(table.publicId),
  ]
);

export const staffMembers = pgTable(
  "staff_members",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: varchar("role", { length: 32 }).notNull(), // owner, manager, staff, marketing
    status: varchar("status", { length: 32 }).default("active").notNull(), // invited, active, revoked
    invitedBy: uuid("invited_by").references(() => users.id),
    invitedAt: timestamp("invited_at", { withTimezone: true }),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("staff_members_tenant_user_idx").on(table.tenantId, table.userId),
    index("staff_members_user_id_idx").on(table.userId),
  ]
);

export const staffLocationScopes = pgTable(
  "staff_location_scopes",
  {
    staffMemberId: uuid("staff_member_id")
      .notNull()
      .references(() => staffMembers.id, { onDelete: "cascade" }),
    locationId: uuid("location_id")
      .notNull()
      .references(() => locations.id, { onDelete: "cascade" }),
  },
  (table) => [
    primaryKey({ columns: [table.staffMemberId, table.locationId] }),
  ]
);

export const staffInvitations = pgTable(
  "staff_invitations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    email: varchar("email", { length: 255 }).notNull(),
    role: varchar("role", { length: 32 }).notNull(),
    tokenHash: varchar("token_hash", { length: 255 }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("staff_invitations_tenant_idx").on(table.tenantId),
    index("staff_invitations_token_hash_idx").on(table.tokenHash),
  ]
);

// ==========================================
// 3. Customers & Memberships
// ==========================================
export const memberships = pgTable(
  "memberships",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    memberNumber: varchar("member_number", { length: 32 }).notNull(),
    publicId: varchar("public_id", { length: 64 }).notNull().unique(),
    qrVersion: integer("qr_version").default(1).notNull(),
    status: varchar("status", { length: 32 }).default("active").notNull(), // active, suspended, deleted
    joinedAt: timestamp("joined_at", { withTimezone: true }).defaultNow().notNull(),
    joinedLocationId: uuid("joined_location_id").references(() => locations.id),
    // The friend who invited this customer (their member number was the referral code)
    referredByMembershipId: uuid("referred_by_membership_id").references((): AnyPgColumn => memberships.id, { onDelete: "set null" }),
    marketingOptIn: boolean("marketing_opt_in").default(false).notNull(),
    // Service emails about this card (welcome, reward unlocked, receipts); customers can switch them off
    emailNotifications: boolean("email_notifications").default(true).notNull(),
  },
  (table) => [
    uniqueIndex("memberships_tenant_user_idx").on(table.tenantId, table.userId),
    index("memberships_tenant_member_number_idx").on(table.tenantId, table.memberNumber),
    index("memberships_public_id_idx").on(table.publicId),
  ]
);

/** Emails a business has barred from joining its programme (FR-083). Per business, not platform-wide. */
export const blockedEmails = pgTable(
  "blocked_emails",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    email: varchar("email", { length: 255 }).notNull(),
    reason: text("reason").notNull(),
    blockedBy: uuid("blocked_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("blocked_emails_tenant_email_idx").on(table.tenantId, table.email),
  ]
);

export const consentRecords = pgTable(
  "consent_records",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    membershipId: uuid("membership_id")
      .notNull()
      .references(() => memberships.id, { onDelete: "cascade" }),
    purpose: varchar("purpose", { length: 64 }).notNull(), // programme_terms, marketing_email
    granted: boolean("granted").notNull(),
    textVersion: varchar("text_version", { length: 32 }).notNull(),
    source: varchar("source", { length: 64 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("consent_records_tenant_membership_idx").on(table.tenantId, table.membershipId),
  ]
);

export const membershipBalances = pgTable(
  "membership_balances",
  {
    membershipId: uuid("membership_id")
      .primaryKey()
      .references(() => memberships.id, { onDelete: "cascade" }),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    balance: integer("balance").default(0).notNull(),
    lifetimeEarned: integer("lifetime_earned").default(0).notNull(),
    lifetimeRedeemed: integer("lifetime_redeemed").default(0).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("membership_balances_tenant_idx").on(table.tenantId),
  ]
);

// ==========================================
// 4. Programmes & Rules
// ==========================================
export const programmes = pgTable(
  "programmes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull(),
    type: varchar("type", { length: 32 }).default("points").notNull(), // points, stamps
    status: varchar("status", { length: 32 }).default("draft").notNull(), // draft, published, paused, archived
    currentRuleVersionId: uuid("current_rule_version_id"),
    termsVersion: varchar("terms_version", { length: 32 }).default("1.0").notNull(),
    termsText: text("terms_text"),
    // Terms in other languages, keyed by language code: { "es": "...", "ur": "..." } (localisation)
    termsTranslations: jsonb("terms_translations").default({}).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("programmes_tenant_idx").on(table.tenantId),
  ]
);

export const ruleVersions = pgTable(
  "rule_versions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    programmeId: uuid("programme_id")
      .notNull()
      .references(() => programmes.id, { onDelete: "cascade" }),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    effectiveFrom: timestamp("effective_from", { withTimezone: true }).defaultNow().notNull(),
    config: jsonb("config").notNull(),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("rule_versions_prog_ver_idx").on(table.programmeId, table.version),
    index("rule_versions_tenant_idx").on(table.tenantId),
  ]
);

// ==========================================
// 5. Rewards & Redemptions
// ==========================================
export const rewards = pgTable(
  "rewards",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    programmeId: uuid("programme_id")
      .notNull()
      .references(() => programmes.id, { onDelete: "cascade" }),
    version: integer("version").default(1).notNull(),
    title: varchar("title", { length: 255 }).notNull(),
    description: text("description"),
    imageUrl: text("image_url"),
    // Optional menu item this reward hands out (e.g. "Free Tea" for 100 points)
    productId: uuid("product_id").references((): AnyPgColumn => products.id, { onDelete: "set null" }),
    type: varchar("type", { length: 32 }).default("free_item").notNull(), // free_item, discount, upgrade, fixed_value, custom
    costPoints: integer("cost_points").notNull(),
    startsAt: timestamp("starts_at", { withTimezone: true }),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    quantityTotal: integer("quantity_total"),
    quantityRedeemed: integer("quantity_redeemed").default(0).notNull(),
    perMemberLimit: integer("per_member_limit"),
    status: varchar("status", { length: 32 }).default("active").notNull(), // active, paused, archived
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("rewards_tenant_idx").on(table.tenantId),
    index("rewards_programme_idx").on(table.programmeId),
  ]
);

export const rewardLocations = pgTable(
  "reward_locations",
  {
    rewardId: uuid("reward_id")
      .notNull()
      .references(() => rewards.id, { onDelete: "cascade" }),
    locationId: uuid("location_id")
      .notNull()
      .references(() => locations.id, { onDelete: "cascade" }),
  },
  (table) => [
    primaryKey({ columns: [table.rewardId, table.locationId] }),
  ]
);

export const redemptions = pgTable(
  "redemptions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    membershipId: uuid("membership_id")
      .notNull()
      .references(() => memberships.id, { onDelete: "cascade" }),
    rewardId: uuid("reward_id")
      .notNull()
      .references(() => rewards.id, { onDelete: "cascade" }),
    rewardVersion: integer("reward_version").notNull(),
    costPoints: integer("cost_points").notNull(),
    status: varchar("status", { length: 32 }).default("pending").notNull(), // pending, confirmed, expired, cancelled, voided
    codeHash: varchar("code_hash", { length: 255 }).notNull(),
    codeLast4: varchar("code_last4", { length: 8 }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    locationId: uuid("location_id").references(() => locations.id),
    confirmedBy: uuid("confirmed_by").references(() => users.id),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    ledgerEntryId: uuid("ledger_entry_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("redemptions_tenant_status_expires_idx").on(table.tenantId, table.status, table.expiresAt),
    index("redemptions_code_hash_idx").on(table.codeHash),
    index("redemptions_membership_idx").on(table.membershipId),
  ]
);

// ==========================================
// 6. Ledger (Append-Only Core)
// ==========================================
export const ledgerEntries = pgTable(
  "ledger_entries",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    membershipId: uuid("membership_id")
      .notNull()
      .references(() => memberships.id, { onDelete: "cascade" }),
    type: varchar("type", { length: 32 }).notNull(), // earn, redeem, adjust, reverse, expire
    pointsDelta: integer("points_delta").notNull(),
    basisAmountMinor: integer("basis_amount_minor"),
    ruleVersionId: uuid("rule_version_id").references(() => ruleVersions.id),
    rewardId: uuid("reward_id").references(() => rewards.id),
    redemptionId: uuid("redemption_id"),
    relatedEntryId: uuid("related_entry_id"),
    locationId: uuid("location_id").references(() => locations.id),
    actorUserId: uuid("actor_user_id").references(() => users.id),
    reasonCode: varchar("reason_code", { length: 64 }), // goodwill, correction, fraud_removal, other
    note: text("note"),
    idempotencyKey: varchar("idempotency_key", { length: 255 }).notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).defaultNow().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("ledger_entries_tenant_idempotency_idx").on(table.tenantId, table.idempotencyKey),
    index("ledger_entries_tenant_member_occurred_idx").on(table.tenantId, table.membershipId, table.occurredAt),
    index("ledger_entries_tenant_occurred_idx").on(table.tenantId, table.occurredAt),
  ]
);

// ==========================================
// 7. Links, Feedback, Analytics (No Rating Gating)
// ==========================================
export const businessLinks = pgTable(
  "business_links",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    locationId: uuid("location_id").references(() => locations.id),
    type: varchar("type", { length: 32 }).notNull(), // google_review, instagram, facebook, website, other
    label: varchar("label", { length: 128 }).notNull(),
    url: text("url").notNull(),
    enabled: boolean("enabled").default(true).notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
    updatedBy: uuid("updated_by").references(() => users.id),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("business_links_tenant_idx").on(table.tenantId, table.sortOrder),
  ]
);

export const linkClickEvents = pgTable(
  "link_click_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    linkId: uuid("link_id")
      .notNull()
      .references(() => businessLinks.id, { onDelete: "cascade" }),
    membershipId: uuid("membership_id").references(() => memberships.id),
    locationId: uuid("location_id").references(() => locations.id),
    clickedAt: timestamp("clicked_at", { withTimezone: true }).defaultNow().notNull(),
    source: varchar("source", { length: 32 }).default("hub").notNull(), // hub, receipt, other
    userAgentFamily: varchar("user_agent_family", { length: 64 }), // Sanitised, no IP, no raw UA
  },
  (table) => [
    index("link_clicks_tenant_clicked_idx").on(table.tenantId, table.clickedAt),
    index("link_clicks_link_clicked_idx").on(table.linkId, table.clickedAt),
  ]
);

export const feedbackMessages = pgTable(
  "feedback_messages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    membershipId: uuid("membership_id").references(() => memberships.id),
    locationId: uuid("location_id").references(() => locations.id),
    message: text("message").notNull(), // Max 2000 chars, NO RATING COLUMN BY DESIGN
    contactBackOk: boolean("contact_back_ok").default(false).notNull(),
    status: varchar("status", { length: 32 }).default("new").notNull(), // new, read, resolved
    handledBy: uuid("handled_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("feedback_messages_tenant_status_created_idx").on(table.tenantId, table.status, table.createdAt),
  ]
);

/**
 * Customer <-> business chat. A customer has at most one open conversation per shop;
 * staff and owners reply but only the customer can end it. Messages are never edited or
 * deleted through the app, so the full record stays visible to the business afterwards.
 */
export const conversations = pgTable(
  "conversations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    membershipId: uuid("membership_id")
      .notNull()
      .references(() => memberships.id, { onDelete: "cascade" }),
    status: varchar("status", { length: 16 }).default("open").notNull(), // open, closed
    lastMessageAt: timestamp("last_message_at", { withTimezone: true }).defaultNow().notNull(),
    lastMessageBy: varchar("last_message_by", { length: 16 }).default("customer").notNull(), // customer, business
    customerLastReadAt: timestamp("customer_last_read_at", { withTimezone: true }),
    businessLastReadAt: timestamp("business_last_read_at", { withTimezone: true }),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    closedBy: uuid("closed_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("conversations_tenant_status_last_idx").on(table.tenantId, table.status, table.lastMessageAt),
    index("conversations_membership_idx").on(table.membershipId, table.status),
    uniqueIndex("conversations_one_open_per_member_idx")
      .on(table.membershipId)
      .where(sql`status = 'open'`),
  ]
);

export const conversationMessages = pgTable(
  "conversation_messages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    senderType: varchar("sender_type", { length: 16 }).notNull(), // customer, owner, manager, staff
    senderUserId: uuid("sender_user_id").references(() => users.id, { onDelete: "set null" }),
    senderName: varchar("sender_name", { length: 255 }),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("conversation_messages_conversation_idx").on(table.conversationId, table.createdAt)]
);

// Email offers an owner sends to a chosen group of customers who agreed to marketing (FR-090, FR-091)
export const campaigns = pgTable(
  "campaigns",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    subject: varchar("subject", { length: 150 }).notNull(),
    body: text("body").notNull(),
    // { lastVisit?: { olderThanDays?: number; withinDays?: number }; minBalance?: number }
    audience: jsonb("audience").default({}).notNull(),
    status: varchar("status", { length: 32 }).default("sent").notNull(),
    recipientCount: integer("recipient_count").default(0).notNull(),
    // draft -> scheduled -> sending -> sent, or cancelled; "sent" with no scheduledAt means it went out at once
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
    // A ceiling on how many people one offer may reach (a simple budget)
    maxRecipients: integer("max_recipients"),
    createdBy: uuid("created_by").references(() => users.id),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("campaigns_tenant_created_idx").on(table.tenantId, table.createdAt)]
);

export const supportReports = pgTable(
  "support_reports",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    membershipId: uuid("membership_id").references(() => memberships.id),
    ledgerEntryId: uuid("ledger_entry_id").references(() => ledgerEntries.id),
    message: text("message").notNull(),
    contactInfo: text("contact_info"),
    status: varchar("status", { length: 32 }).default("open").notNull(), // open, resolved
    resolvedBy: uuid("resolved_by").references(() => users.id),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("support_reports_tenant_status_created_idx").on(table.tenantId, table.status, table.createdAt),
  ]
);

export const products = pgTable(
  "products",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull(),
    category: varchar("category", { length: 128 }).default("General").notNull(),
    priceMinor: integer("price_minor").default(0).notNull(), // In pence (e.g. 450 = £4.50)
    pointsAwarded: integer("points_awarded").default(1).notNull(),
    discountPercent: integer("discount_percent").default(0).notNull(), // 0-100%
    isActive: boolean("is_active").default(true).notNull(),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("products_tenant_active_idx").on(table.tenantId, table.isActive),
  ]
);

export const promoQrCodes = pgTable(
  "promo_qr_codes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    locationId: uuid("location_id").references(() => locations.id, { onDelete: "set null" }),
    code: varchar("code", { length: 64 }).notNull().unique(),
    title: varchar("title", { length: 255 }).notNull(),
    offerType: varchar("offer_type", { length: 32 }).default("points_bonus").notNull(), // points_bonus, stamps_bonus, free_product, discount_promo
    pointsToAward: integer("points_to_award").default(0).notNull(),
    requiredVisits: integer("required_visits").default(1).notNull(), // e.g. 3 for "Buy 3 get 1 free"
    productId: uuid("product_id").references(() => products.id, { onDelete: "set null" }),
    productRewardName: varchar("product_reward_name", { length: 255 }),
    discountPercent: integer("discount_percent").default(0).notNull(),
    status: varchar("status", { length: 32 }).default("active").notNull(), // active, expired, deactivated
    validityDays: integer("validity_days").default(30).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    totalScans: integer("total_scans").default(0).notNull(),
    totalClaims: integer("total_claims").default(0).notNull(),
    qrDataUrl: text("qr_data_url").notNull(),
    scanUrl: text("scan_url").notNull(),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("promo_qr_tenant_status_idx").on(table.tenantId, table.status),
    index("promo_qr_code_idx").on(table.code),
    index("promo_qr_expires_idx").on(table.expiresAt),
  ]
);

export const promoQrScans = pgTable(
  "promo_qr_scans",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    campaignQrId: uuid("campaign_qr_id")
      .notNull()
      .references(() => promoQrCodes.id, { onDelete: "cascade" }),
    membershipId: uuid("membership_id").references(() => memberships.id, { onDelete: "set null" }),
    memberNumber: varchar("member_number", { length: 64 }),
    memberName: varchar("member_name", { length: 255 }),
    scannedAt: timestamp("scanned_at", { withTimezone: true }).defaultNow().notNull(),
    pointsAwarded: integer("points_awarded").default(0).notNull(),
    visitNumber: integer("visit_number").default(1).notNull(),
    requiredVisits: integer("required_visits").default(1).notNull(),
    status: varchar("status", { length: 32 }).default("recorded").notNull(), // recorded, visit_logged, pending_claim, approved, discarded
    approvedBy: uuid("approved_by").references(() => users.id),
    approvedByName: varchar("approved_by_name", { length: 255 }),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
  },
  (table) => [
    index("promo_qr_scans_tenant_idx").on(table.tenantId, table.scannedAt),
    index("promo_qr_scans_campaign_idx").on(table.campaignQrId),
  ]
);

// ==========================================
// 8. Operations & Security
// ==========================================
export const auditEvents = pgTable(
  "audit_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "set null" }),
    actorUserId: uuid("actor_user_id").references(() => users.id),
    action: varchar("action", { length: 128 }).notNull(),
    targetType: varchar("target_type", { length: 64 }).notNull(),
    targetId: varchar("target_id", { length: 64 }).notNull(),
    reason: text("reason"),
    metadata: jsonb("metadata").default({}).notNull(),
    requestId: varchar("request_id", { length: 64 }),
    ipHash: varchar("ip_hash", { length: 64 }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("audit_events_tenant_created_idx").on(table.tenantId, table.createdAt),
  ]
);

export const emailOutbox = pgTable(
  "email_outbox",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "set null" }),
    toEmail: varchar("to_email", { length: 255 }).notNull(),
    template: varchar("template", { length: 64 }).notNull(),
    payload: jsonb("payload").default({}).notNull(),
    kind: varchar("kind", { length: 32 }).default("transactional").notNull(), // transactional, marketing
    status: varchar("status", { length: 32 }).default("queued").notNull(), // queued, sent, failed, dead
    attempts: integer("attempts").default(0).notNull(),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).defaultNow().notNull(),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
  },
  (table) => [
    index("email_outbox_status_next_attempt_idx").on(table.status, table.nextAttemptAt),
  ]
);

/** Things that happen to an email after it is sent: a click, a bounce, a complaint, an opt-out (FR-094). */
export const emailEvents = pgTable(
  "email_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "cascade" }),
    outboxId: uuid("outbox_id").references(() => emailOutbox.id, { onDelete: "set null" }),
    campaignId: uuid("campaign_id").references(() => campaigns.id, { onDelete: "cascade" }),
    type: varchar("type", { length: 24 }).notNull(), // click, bounce, complaint, optout
    detail: text("detail"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("email_events_campaign_type_idx").on(table.campaignId, table.type),
    index("email_events_tenant_created_idx").on(table.tenantId, table.createdAt),
  ]
);

/** Addresses that can't be reached (or complained); offers are never sent to them again (FR-093). */
export const emailSuppressions = pgTable(
  "email_suppressions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    email: varchar("email", { length: 255 }).notNull().unique(),
    reason: varchar("reason", { length: 32 }).notNull(), // bounce, complaint
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  }
);

export const idempotencyKeys = pgTable(
  "idempotency_keys",
  {
    tenantId: uuid("tenant_id").notNull(),
    key: varchar("key", { length: 255 }).notNull(),
    scope: varchar("scope", { length: 64 }).notNull(),
    requestHash: varchar("request_hash", { length: 64 }).notNull(),
    response: jsonb("response"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.tenantId, table.key, table.scope] }),
  ]
);

// ==========================================
// 9. Events, integrations, notes, support, billing
// ==========================================

/** Things that happened in a business, named as in the spec (Appendix B). Feeds webhooks and the events API. */
export const domainEvents = pgTable(
  "domain_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 64 }).notNull(), // e.g. points.earned
    payload: jsonb("payload").default({}).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("domain_events_tenant_created_idx").on(table.tenantId, table.createdAt)]
);

/** Where a business wants to be told about events (FR-121). The signing secret is kept encrypted. */
export const webhookEndpoints = pgTable(
  "webhook_endpoints",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    secretEncrypted: text("secret_encrypted").notNull(),
    events: jsonb("events").default([]).notNull(), // empty means every event
    active: boolean("active").default(true).notNull(),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("webhook_endpoints_tenant_idx").on(table.tenantId)]
);

export const webhookDeliveries = pgTable(
  "webhook_deliveries",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    endpointId: uuid("endpoint_id")
      .notNull()
      .references(() => webhookEndpoints.id, { onDelete: "cascade" }),
    eventId: uuid("event_id")
      .notNull()
      .references(() => domainEvents.id, { onDelete: "cascade" }),
    status: varchar("status", { length: 16 }).default("queued").notNull(), // queued, sent, failed, dead
    attempts: integer("attempts").default(0).notNull(),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).defaultNow().notNull(),
    lastStatusCode: integer("last_status_code"),
    lastError: text("last_error"),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("webhook_deliveries_due_idx").on(table.status, table.nextAttemptAt),
    index("webhook_deliveries_endpoint_idx").on(table.endpointId, table.createdAt),
  ]
);

/** Keys a business's own systems (a till, a POS) use to talk to the API (FR-124). Only a hash is kept. */
export const apiKeys = pgTable(
  "api_keys",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 80 }).notNull(),
    prefix: varchar("prefix", { length: 16 }).notNull(), // first characters, to recognise the key in a list
    keyHash: varchar("key_hash", { length: 64 }).notNull().unique(),
    scopes: jsonb("scopes").default([]).notNull(), // earn:write, events:read
    createdBy: uuid("created_by").references(() => users.id),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("api_keys_tenant_idx").on(table.tenantId)]
);

/** A purchase reported by a till or POS, so the same sale can never earn twice (FR-040, UC-17). */
export const externalTransactions = pgTable(
  "external_transactions",
  {
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    source: varchar("source", { length: 80 }).notNull(), // the key's name
    externalRef: varchar("external_ref", { length: 120 }).notNull(),
    ledgerEntryId: uuid("ledger_entry_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [primaryKey({ columns: [table.tenantId, table.source, table.externalRef] })]
);

/** Private notes a business keeps about a customer (FR-086). Deleted after the retention period. */
export const memberNotes = pgTable(
  "member_notes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    membershipId: uuid("membership_id")
      .notNull()
      .references(() => memberships.id, { onDelete: "cascade" }),
    authorUserId: uuid("author_user_id").references(() => users.id, { onDelete: "set null" }),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("member_notes_membership_idx").on(table.tenantId, table.membershipId, table.createdAt)]
);

/** A business owner letting the platform's support team look at their account for a limited time. */
export const supportGrants = pgTable(
  "support_grants",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    reason: text("reason").notNull(),
    grantedBy: uuid("granted_by").references(() => users.id),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("support_grants_tenant_idx").on(table.tenantId, table.expiresAt)]
);

/** Invoices for a business's plan (FR-112). Payment is recorded by the platform admin. */
export const invoices = pgTable(
  "invoices",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    number: varchar("number", { length: 32 }).notNull().unique(),
    description: varchar("description", { length: 255 }).notNull(),
    amountMinor: integer("amount_minor").notNull(),
    currency: varchar("currency", { length: 8 }).default("GBP").notNull(),
    status: varchar("status", { length: 16 }).default("open").notNull(), // open, paid, void
    issuedAt: timestamp("issued_at", { withTimezone: true }).defaultNow().notNull(),
    dueAt: timestamp("due_at", { withTimezone: true }).notNull(),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    createdBy: uuid("created_by").references(() => users.id),
  },
  (table) => [index("invoices_tenant_idx").on(table.tenantId, table.issuedAt)]
);

/** One-time use of a rotating QR code, so a photographed code can't be replayed (FR-039). */
export const qrTokenUses = pgTable(
  "qr_token_uses",
  {
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    membershipId: uuid("membership_id")
      .notNull()
      .references(() => memberships.id, { onDelete: "cascade" }),
    windowStart: integer("window_start").notNull(), // the 30-second slot number (time / 30 s)
    usedAt: timestamp("used_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [primaryKey({ columns: [table.tenantId, table.membershipId, table.windowStart] })]
);
