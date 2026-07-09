/**
 * Data layer barrel (§4). ALL database access goes through these repositories — screens and
 * components never import Drizzle directly. Every function takes an injected `AppDatabase`.
 */
export * from './categoriesRepo'
export * from './entriesRepo'
export * from './statsRepo'
export * from './tagsRepo'
export * from './settingsRepo'
export * from './wipe'
export type { AppDatabase } from '@/db/types'
