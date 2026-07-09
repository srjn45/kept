import { useEffect, useMemo, useRef, useState } from 'react'
import { Pressable, ScrollView, Text, View } from 'react-native'

import { Chip, Input } from '@/components'
import { listCategories, searchTagSuggestions, type AppDatabase } from '@/data'

import { hasActiveFilters, useLedgerFilterStore } from './filterStore'

/** Debounce before a keystroke becomes a query (§8 Phase 5: debounce input → query). */
const SEARCH_DEBOUNCE_MS = 250

export type FilterBarProps = {
  /** Injected DB — read-only here (active categories + tag-suggestion autocomplete). */
  db: AppDatabase
  testID?: string
}

/**
 * Sticky ledger filter bar (§7.2 · Phase 5). Three AND-combined dimensions, each built only
 * from the primitives kit (§7.7): a single-select category selector (chips, "All" default), a
 * multi-tag filter (AND — an entry must have ALL selected tags, §6.2/§6.3), and a debounced
 * free-text search over title/description. All selections live in {@link useLedgerFilterStore}
 * so they persist across navigation; this component never touches `listEntries` — the route
 * reads the store and re-runs the query.
 */
export function FilterBar({ db, testID }: FilterBarProps) {
  const categoryId = useLedgerFilterStore((s) => s.categoryId)
  const tags = useLedgerFilterStore((s) => s.tags)
  const search = useLedgerFilterStore((s) => s.search)
  const setCategoryId = useLedgerFilterStore((s) => s.setCategoryId)
  const toggleTag = useLedgerFilterStore((s) => s.toggleTag)
  const setSearch = useLedgerFilterStore((s) => s.setSearch)
  const clear = useLedgerFilterStore((s) => s.clear)

  const active = hasActiveFilters({ categoryId, tags, search })

  // Active categories for the single-select row (re-read each render so new ones appear).
  const categories = useMemo(() => listCategories(db), [db])

  // ---- Debounced search: local text is responsive; the store (→ query) lags by the debounce.
  const [searchText, setSearchText] = useState(search)
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Keep the local field in sync when the store's search changes elsewhere (e.g. a Clear from
  // the empty-state CTA, or a value restored on mount) — adjust-state-during-render, no effect.
  const [prevSearch, setPrevSearch] = useState(search)
  if (search !== prevSearch) {
    setPrevSearch(search)
    setSearchText(search)
  }

  useEffect(
    () => () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current)
    },
    []
  )

  function handleSearchChange(next: string) {
    setSearchText(next)
    if (debounceTimer.current) clearTimeout(debounceTimer.current)
    debounceTimer.current = setTimeout(() => setSearch(next), SEARCH_DEBOUNCE_MS)
  }

  // ---- Tag filter autocomplete: suggestions from tag_suggestions, minus already-selected.
  const [tagQuery, setTagQuery] = useState('')
  const tagSuggestions = useMemo(() => {
    const selected = new Set(tags)
    return searchTagSuggestions(db, tagQuery, { mode: 'prefix', limit: 8 }).filter(
      (t) => !selected.has(t)
    )
  }, [db, tagQuery, tags])

  return (
    <View className="gap-3 border-b border-border bg-bg px-4 pb-3 pt-1" testID={testID}>
      {/* Free-text search */}
      <Input
        value={searchText}
        onChangeText={handleSearchChange}
        placeholder="Search title or description"
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
        accessibilityLabel="Search expenses"
        testID="filter-search-input"
        rightAdornment={
          searchText.length > 0 ? (
            <Pressable
              onPress={() => handleSearchChange('')}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Clear search"
              testID="filter-search-clear"
            >
              <Text className="text-base text-muted">×</Text>
            </Pressable>
          ) : undefined
        }
      />

      {/* Category — single select, "All" default */}
      <View className="gap-1">
        <Text className="text-xs font-medium text-muted">Category</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ gap: 8, paddingRight: 8 }}
        >
          <Chip
            label="All"
            selected={categoryId === null}
            onPress={() => setCategoryId(null)}
            accessibilityLabel="All categories"
            testID="filter-category-all"
          />
          {categories.map((c) => (
            <Chip
              key={c.id}
              label={c.name}
              color={c.color ?? undefined}
              selected={categoryId === c.id}
              onPress={() => setCategoryId(categoryId === c.id ? null : c.id)}
              accessibilityLabel={`Category ${c.name}`}
              testID={`filter-category-${c.id}`}
            />
          ))}
        </ScrollView>
      </View>

      {/* Tags — multi-select, AND semantics */}
      <View className="gap-2">
        <Text className="text-xs font-medium text-muted">Tags (match all)</Text>
        {tags.length > 0 ? (
          <View className="flex-row flex-wrap gap-2" testID="filter-tags-selected">
            {tags.map((tag) => (
              <Chip
                key={tag}
                label={tag}
                selected
                onRemove={() => toggleTag(tag)}
                testID={`filter-tag-chip-${tag}`}
              />
            ))}
          </View>
        ) : null}

        <Input
          value={tagQuery}
          onChangeText={(next) => setTagQuery(next.replace(/\s/g, ''))}
          onSubmitEditing={() => {
            const t = tagQuery.trim().toLowerCase()
            if (t) {
              toggleTag(t)
              setTagQuery('')
            }
          }}
          placeholder="Filter by tag"
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="done"
          blurOnSubmit={false}
          accessibilityLabel="Filter by tag"
          testID="filter-tag-input"
        />

        {tagSuggestions.length > 0 ? (
          <View className="flex-row flex-wrap gap-2" testID="filter-tag-suggestions">
            {tagSuggestions.map((tag) => (
              <Pressable
                key={tag}
                onPress={() => {
                  toggleTag(tag)
                  setTagQuery('')
                }}
                accessibilityRole="button"
                accessibilityLabel={`Add tag filter ${tag}`}
                testID={`filter-tag-suggestion-${tag}`}
              >
                <Chip label={`+ ${tag}`} size="sm" />
              </Pressable>
            ))}
          </View>
        ) : null}
      </View>

      {/* Clear — only when something is active */}
      {active ? (
        <Pressable
          onPress={() => {
            clear()
            setSearchText('')
            setTagQuery('')
          }}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Clear all filters"
          testID="filter-clear"
          className="self-start"
        >
          <Text className="text-sm font-medium text-primary">Clear filters</Text>
        </Pressable>
      ) : null}
    </View>
  )
}
