import { parsePuzzle } from '../../src/player/puzzle'
// Original minis from the player, used only by its extracted tests.
export const puzzleFiles = [
  {
    slug: 'a-little-culture', version: 1 as const, id: 'a-little-culture', title: 'A little culture', author: 'Cross Composer',
    description: 'A small puzzle for a fresh start.',
    grid: ['#AND#', 'IDEAS', 'MOVIE', 'OPERA', '#TRY#'],
    across: [
      { text: 'The middle of “rock ___ roll”', hint: 'A three-letter joining word.' },
      { text: 'Light-bulb moments', hint: 'Things you might jot in a brainstorming session.' },
      { text: 'A reason to buy popcorn', hint: 'It plays on the big screen.' },
      { text: 'Drama with a high note?', hint: 'A theatrical work sung throughout.' },
      { text: 'Give it a go', hint: 'Make an attempt.' },
    ],
    down: [
      { text: 'Give a shelter pet a home', hint: 'Take it into your family.' },
      { text: 'Not even once', hint: 'The opposite of “always.”' },
      { text: 'Milk, cheese, and yogurt department', hint: 'A supermarket section that needs refrigeration.' },
      { text: '“If you ask me,” in a text', hint: 'Short for “in my opinion.”' },
      { text: 'Where a sailor spends time', hint: 'A large body of salt water.' },
    ],
  },
  {
    slug: 'early-bird', version: 1 as const, id: 'early-bird', title: 'Early bird', author: 'Cross Composer',
    description: 'Another five-minute diversion.',
    grid: ['#THE#', 'AHEAD', 'BERRY', 'STOLE', '#ANY#'],
    across: [
      { text: '“___ end”', hint: 'The definite article.' },
      { text: 'In front, on the scoreboard', hint: 'Leading the other team.' },
      { text: 'A blueberry is one', hint: 'A small, juicy fruit.' },
      { text: 'Took without asking', hint: 'The past tense of “steal.”' },
      { text: '“Pick a card, ___ card”', hint: 'It makes no difference which one.' },
    ],
    down: [
      { text: 'Greek letter often used for an angle', hint: 'It comes after eta.' },
      { text: 'Long-legged bird at the water’s edge', hint: 'A wading bird with a long neck.' },
      { text: 'Before the appointed time', hint: 'The opposite of “late.”' },
      { text: 'Muscles worked by crunches', hint: 'Short for abdominals.' },
      { text: 'Change the color of, as fabric', hint: 'Use a coloring substance.' },
    ],
  },
]
export const library = puzzleFiles.map(file => { const parsed = parsePuzzle(file); if (!parsed.ok) throw new Error(parsed.error); return { slug: file.slug, puzzle: parsed.value } })
