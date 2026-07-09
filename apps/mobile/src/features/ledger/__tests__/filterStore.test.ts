import {
  filterSignature,
  hasActiveFilters,
  toListFilters,
  useLedgerFilterStore,
  type LedgerFilterSelection,
} from '../filterStore'

/** Reset the singleton store between tests (it persists by design — that's the point). */
function resetStore() {
  useLedgerFilterStore.setState({ categoryId: null, tags: [], search: '' })
}

describe('ledger filter store (§8 Phase 5)', () => {
  beforeEach(resetStore)

  describe('actions', () => {
    it('sets and clears the single-select category', () => {
      useLedgerFilterStore.getState().setCategoryId('cat-1')
      expect(useLedgerFilterStore.getState().categoryId).toBe('cat-1')
      useLedgerFilterStore.getState().setCategoryId(null)
      expect(useLedgerFilterStore.getState().categoryId).toBeNull()
    })

    it('toggleTag adds when absent and removes when present (AND set)', () => {
      const { toggleTag } = useLedgerFilterStore.getState()
      toggleTag('coffee')
      toggleTag('work')
      expect(useLedgerFilterStore.getState().tags).toEqual(['coffee', 'work'])
      toggleTag('coffee')
      expect(useLedgerFilterStore.getState().tags).toEqual(['work'])
    })

    it('removeTag drops one tag; setSearch stores the term', () => {
      useLedgerFilterStore.setState({ tags: ['a', 'b'] })
      useLedgerFilterStore.getState().removeTag('a')
      expect(useLedgerFilterStore.getState().tags).toEqual(['b'])
      useLedgerFilterStore.getState().setSearch('lunch')
      expect(useLedgerFilterStore.getState().search).toBe('lunch')
    })

    it('clear resets every dimension', () => {
      useLedgerFilterStore.setState({ categoryId: 'c', tags: ['x'], search: 'q' })
      useLedgerFilterStore.getState().clear()
      expect(useLedgerFilterStore.getState()).toMatchObject({
        categoryId: null,
        tags: [],
        search: '',
      })
    })
  })

  describe('hasActiveFilters', () => {
    const base: LedgerFilterSelection = { categoryId: null, tags: [], search: '' }
    it('is false with no dimensions set (blank/whitespace search does not count)', () => {
      expect(hasActiveFilters(base)).toBe(false)
      expect(hasActiveFilters({ ...base, search: '   ' })).toBe(false)
    })
    it('is true when any dimension is active', () => {
      expect(hasActiveFilters({ ...base, categoryId: 'c' })).toBe(true)
      expect(hasActiveFilters({ ...base, tags: ['x'] })).toBe(true)
      expect(hasActiveFilters({ ...base, search: 'q' })).toBe(true)
    })
  })

  describe('toListFilters', () => {
    it('omits empty dimensions and trims the search', () => {
      expect(toListFilters({ categoryId: null, tags: [], search: '  ' })).toEqual({})
      expect(toListFilters({ categoryId: 'c', tags: ['a'], search: '  lunch ' })).toEqual({
        categoryId: 'c',
        tags: ['a'],
        search: 'lunch',
      })
    })
  })

  describe('filterSignature', () => {
    it('is stable regardless of tag order and changes when a dimension changes', () => {
      const a = filterSignature({ categoryId: 'c', tags: ['a', 'b'], search: 'x' })
      const b = filterSignature({ categoryId: 'c', tags: ['b', 'a'], search: 'x' })
      expect(a).toBe(b)
      expect(a).not.toBe(filterSignature({ categoryId: 'c', tags: ['a'], search: 'x' }))
      expect(a).not.toBe(filterSignature({ categoryId: 'd', tags: ['a', 'b'], search: 'x' }))
    })
    it('does not let search text collide with a different selection', () => {
      const withTag = filterSignature({ categoryId: null, tags: ['work'], search: '' })
      const forged = filterSignature({ categoryId: null, tags: [], search: 'work' })
      expect(withTag).not.toBe(forged)
    })
  })
})
