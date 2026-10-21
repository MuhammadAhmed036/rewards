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
} from "drizzle-orm/pg-core";

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
    marketingOptIn: boolean("marketing_opt_in").default(false).notNull(),
  },
  (table) => [
    uniqueIndex("memberships_tenant_user_idx").on(table.tenantId, table.userId),
    index("memberships_tenant_member_number_idx").on(table.tenantId, table.memberNumber),
    index("memberships_public_id_idx").on(table.publicId),
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
