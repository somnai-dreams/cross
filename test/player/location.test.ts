import { expect, test } from 'bun:test'
import { createNavigation } from '../../src/player/location'
import { library } from './fixtures'

test('collection links preserve the hosted document path and validate missing routes', () => {
  const navigation = createNavigation(library, library[0]!.puzzle, '/games/crossword.html')
  expect(navigation.puzzlePath(library[1]!.puzzle)).toBe('/games/crossword.html?puzzle=early-bird')
  expect(navigation.resolvePuzzleLocation('?puzzle=early-bird', null, null).puzzle).toBe(library[1]!.puzzle)
  expect(navigation.resolvePuzzleLocation('?puzzle=missing', null, null).missing).toBe(true)
  const imported = { ...library[0]!.puzzle, id: 'local-puzzle' }
  const saved = navigation.puzzleHistory(imported)
  expect(saved.path).toBe('/games/crossword.html')
  expect(navigation.resolvePuzzleLocation('', saved.state, null).puzzle).toEqual(imported)
})
