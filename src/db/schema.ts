import {
  AnyPgColumn,
  boolean,
  date,
  integer,
  numeric,
  pgSchema,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

export const openrabSchema = pgSchema('openrab');

export const resourceTypeEnum = openrabSchema.enum('resource_type', [
  'MATERIAL',
  'LABOR',
  'EQUIPMENT',
]);

export const projectStatusEnum = openrabSchema.enum('project_status', [
  'DRAFT',
  'FINALIZED',
]);

export const regions = openrabSchema.table('regions', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const masterResources = openrabSchema.table('master_resources', {
  id: uuid('id').defaultRandom().primaryKey(),
  code: text('code').notNull().unique(),
  name: text('name').notNull(),
  type: resourceTypeEnum('type').notNull(),
  unit: text('unit').notNull(),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const resourcePrices = openrabSchema.table(
  'resource_prices',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    resourceId: uuid('resource_id')
      .notNull()
      .references(() => masterResources.id, { onDelete: 'restrict' }),
    regionId: uuid('region_id')
      .notNull()
      .references(() => regions.id, { onDelete: 'restrict' }),
    basePrice: numeric('base_price', { precision: 15, scale: 2 }).notNull(),
    effectiveDate: date('effective_date', { mode: 'string' }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('resource_prices_res_reg_date_idx').on(
      table.resourceId,
      table.regionId,
      table.effectiveDate
    ),
  ]
);

export const masterAhsp = openrabSchema.table('master_ahsp', {
  id: uuid('id').defaultRandom().primaryKey(),
  code: text('code').notNull().unique(),
  name: text('name').notNull(),
  unit: text('unit').notNull(),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const ahspCompositions = openrabSchema.table(
  'ahsp_compositions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    ahspId: uuid('ahsp_id')
      .notNull()
      .references(() => masterAhsp.id, { onDelete: 'restrict' }),
    resourceId: uuid('resource_id')
      .notNull()
      .references(() => masterResources.id, { onDelete: 'restrict' }),
    coefficient: numeric('coefficient', { precision: 10, scale: 4 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('ahsp_compositions_ahsp_res_idx').on(table.ahspId, table.resourceId),
  ]
);

export const projects = openrabSchema.table('projects', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  regionId: uuid('region_id')
    .notNull()
    .references(() => regions.id, { onDelete: 'restrict' }),
  status: projectStatusEnum('status').notNull().default('DRAFT'),
  priceDate: date('price_date', { mode: 'string' }).defaultNow().notNull(),
  overheadProfitMargin: numeric('overhead_profit_margin', {
    precision: 5,
    scale: 2,
  })
    .notNull()
    .default('10.00'),
  taxRatePpn: numeric('tax_rate_ppn', { precision: 5, scale: 2 })
    .notNull()
    .default('11.00'),
  regionNameFrozen: text('region_name_frozen'),
  finalizedAt: timestamp('finalized_at', { withTimezone: true }),
  sourceProjectId: uuid('source_project_id'),
  clientName: text('client_name'),
  projectLocation: text('project_location'),
  architectName: text('architect_name'),
  buildingAreaM2: numeric('building_area_m2', { precision: 12, scale: 2 }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const projectWbs = openrabSchema.table('project_wbs', {
  id: uuid('id').defaultRandom().primaryKey(),
  projectId: uuid('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  parentId: uuid('parent_id').references((): AnyPgColumn => projectWbs.id, {
    onDelete: 'restrict',
  }),
  name: text('name').notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
  startWeek: integer('start_week').notNull().default(1),
  durationWeeks: integer('duration_weeks').notNull().default(1),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const projectTakeoffs = openrabSchema.table('project_takeoffs', {
  id: uuid('id').defaultRandom().primaryKey(),
  wbsId: uuid('wbs_id')
    .notNull()
    .references(() => projectWbs.id, { onDelete: 'cascade' }),
  ahspId: uuid('ahsp_id')
    .notNull()
    .references(() => masterAhsp.id, { onDelete: 'restrict' }),
  description: text('description').notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
  length: numeric('length', { precision: 12, scale: 4 }),
  width: numeric('width', { precision: 12, scale: 4 }),
  height: numeric('height', { precision: 12, scale: 4 }),
  count: integer('count'),
  deductionVolume: numeric('deduction_volume', { precision: 12, scale: 4 })
    .notNull()
    .default('0.0000'),
  calculatedVolume: numeric('calculated_volume', {
    precision: 12,
    scale: 4,
  }).notNull(),
  subItemsJson: text('sub_items_json'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const takeoffSnapshots = openrabSchema.table('takeoff_snapshots', {
  id: uuid('id').defaultRandom().primaryKey(),
  takeoffId: uuid('takeoff_id')
    .notNull()
    .references(() => projectTakeoffs.id, { onDelete: 'restrict' }),
  wbsPath: text('wbs_path').notNull(),
  description: text('description').notNull(),
  sortOrder: integer('sort_order').notNull(),
  volume: numeric('volume', { precision: 12, scale: 4 }).notNull(),
  ahspCode: text('ahsp_code').notNull(),
  ahspName: text('ahsp_name').notNull(),
  ahspUnit: text('ahsp_unit').notNull(),
  resourceCode: text('resource_code').notNull(),
  resourceName: text('resource_name').notNull(),
  resourceUnit: text('resource_unit').notNull(),
  resourceType: resourceTypeEnum('resource_type').notNull(),
  coefficient: numeric('coefficient', { precision: 10, scale: 4 }).notNull(),
  frozenPrice: numeric('frozen_price', { precision: 15, scale: 2 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});
