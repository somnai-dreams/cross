import { describe, expect, test } from 'bun:test'
import { answerFree, attemptField, namespace, readIpuz, readIpuzBytes, verificationField, writeIpuz } from '../src/ipuz'
import { canonical, parseJson, type JsonObject } from '../src/json'
import { entries, entryCells, type Document, type Result } from '../src/model'
import { assess, hash, matches, revision, solutionDigest } from '../src/verification'
import vectors from '../fixtures/vectors.json'

function value<T>(result: Result<T>): T {
  if (!result.ok) throw new Error(JSON.stringify(result.issue))
  return result.value
}
function source(name: string): Promise<string> { return Bun.file(`${import.meta.dir}/../fixtures/${name}.ipuz`).text() }
async function fixture(name = 'ordinary'): Promise<Document> { return value(await readIpuz(await source(name))) }
async function changed(edit: (raw: JsonObject) => void, name = 'ordinary'): Promise<Result<Document>> {
  // Trusted test fixture; all production input goes through readIpuz.
  const raw = JSON.parse(await source(name)) as JsonObject
  edit(raw)
  return readIpuz(JSON.stringify(raw))
}

describe('published profile and conversions', () => {
  for (const name of ['ordinary', 'circled', 'blocked', 'barred', 'rebus', 'authored-labels', 'linked', 'unverified', 'legacy-checksum', 'answer-free', 'in-progress']) {
    test(`${name}: exact normalized round trip`, async () => {
      const document = await fixture(name)
      expect(value(await readIpuz(value(await writeIpuz(document))))).toEqual(document)
    })
  }
  test('membership comes from geometry; crossing cells share one answer', async () => {
    const document = await fixture()
    expect(entryCells(document.puzzle, {start: 0, direction: 'across'})).toEqual([0, 1, 2])
    expect(entryCells(document.puzzle, {start: 1, direction: 'down'})).toEqual([1, 4, 7])
    expect(document.key!.values).toHaveLength(9)
    expect(document.puzzle.clues[0]!.entry).toEqual({start: 0, direction: 'across'})
  })
  test('circles, rebus values and authored labels are independent facts', async () => {
    expect((await fixture('circled')).puzzle.cells[0]).toEqual({kind:'open',label:1,circled:true,rightBar:false,bottomBar:false})
    expect((await fixture('rebus')).key!.values.slice(0,3)).toEqual(['CA','T','S'])
    const labels = await fixture('authored-labels')
    expect(labels.puzzle.cells[0]).toMatchObject({label:'A'})
    expect(labels.puzzle.clues[1]!.entry).toEqual({start:3,direction:'across'})
  })
  test('linked clues resolve structurally while display wording is preserved', async () => {
    const document = await fixture('linked')
    expect(document.puzzle.clues[0]).toMatchObject({displayLabel:'1, 4',enumeration:'3,3',hints:['A feline, then a mined rock'],continued:[{start:3,direction:'across'}]})
    expect(document.puzzle.clues[1]!.text).toBe('See 1-Across')
  })
  test('bars from either side normalize to one edge owner', async () => {
    const left = await fixture('barred')
    const right = value(await changed(raw => {
      raw['puzzle'] = [[1,2,{cell:3,style:{barred:'L'}},4],[5,0,{cell:6,style:{barred:'L'}},0]]
    }, 'barred'))
    expect(right).toEqual(left)
    expect(entries(left.puzzle).filter(entry => entry.direction === 'across').map(entry => entryCells(left.puzzle, entry))).toEqual([[0,1],[2,3],[4,5],[6,7]])
  })
  test('wire shorthands and clue ordering normalize before identity', async () => {
    const a = await fixture()
    const b = value(await changed(raw => {
      raw['puzzle'] = [[{cell:'1'},'2','3'],['4','0',{}],['5',0,0]]
      raw['clues'] = { Down: [['3','Five doubled'],['2','You ___ here'],['1','Fish often battered']], Across: [['5','A fox’s home'],['4','Rock containing metal'],['1','Pet that purrs']] }
    }))
    expect(b).toEqual(a)
    expect(await revision(b.puzzle)).toBe(await revision(a.puzzle))
  })
  test('HTML-field entities become plain text once and are escaped on export', async () => {
    const document = value(await changed(raw => { raw['title'] = 'A &amp; B &lt; 3 &#x1F600; &amp;lt;b&amp;gt;' }))
    expect(document.puzzle.title).toBe('A & B < 3 😀 &lt;b&gt;')
    expect(value(await readIpuz(value(await writeIpuz(document))))).toEqual(document)
    expect((await changed(raw => {raw['title']='A & B'})).ok).toBe(false)
    expect((await changed(raw => {raw['title']='&#xD800;'})).ok).toBe(false)
  })
})

describe('canonical identity and completion checks', () => {
  test('matches frozen preimages and SHA vectors independently computed with Python hashlib', async () => {
    const document = await fixture()
    expect(canonical(['cross/0.1/puzzle',document.puzzle])).toBe(vectors.revisionPreimage)
    expect(await revision(document.puzzle)).toBe(vectors.revision)
    expect(canonical(['cross/0.1/solution',vectors.revision,vectors.salt,document.key!.values])).toBe(vectors.solutionPreimage)
    expect(await solutionDigest(document.puzzle, document.key!.values, vectors.salt)).toBe(vectors.digest)
    expect(await hash('SHA-1', 'AB#CDE#FGdraft-salt')).toBe(vectors.blockedLegacyDigest)
  })
  test('every authored public change changes revision, including a title used as a clue', async () => {
    const document = await fixture()
    const original = await revision(document.puzzle)
    for (const edit of [
      (doc: Document) => { doc.puzzle.title = 'Read the corners' },
      (doc: Document) => { doc.puzzle.author = 'Corrected credit' },
      (doc: Document) => { doc.puzzle.copyright = '2026' },
      (doc: Document) => { doc.puzzle.intro = 'Read backwards' },
      (doc: Document) => { doc.puzzle.clues[0]!.text += '?' },
      (doc: Document) => { doc.puzzle.clues[0]!.hints.push('Meow') },
      (doc: Document) => { doc.puzzle.clues[0]!.enumeration = '3' },
      (doc: Document) => { const cell = doc.puzzle.cells[0]!; if (cell.kind === 'open') cell.circled = true }
    ]) {
      const edited = structuredClone(document); edit(edited)
      expect(await revision(edited.puzzle)).not.toBe(original)
    }
  })
  test('SHA-1 keeps legacy concatenation ambiguity; structured verifier keeps cell boundaries', async () => {
    const document = await fixture('rebus')
    const a = document.key!.values, b = ['C','AT',...a.slice(2)]
    expect(a.join('')).toBe(b.join(''))
    const legacy = {kind:'ipuz-sha1',salt:'test',digests:[await hash('SHA-1',a.join('')+'test')]} as const
    expect(await matches(document.puzzle, {...legacy,digests:[...legacy.digests]}, b)).toBe(true)
    expect(await solutionDigest(document.puzzle,a,vectors.salt)).not.toBe(await solutionDigest(document.puzzle,b,vectors.salt))
  })
  test('standard checksum imports verify a blocked complete grid', async () => {
    const document = await fixture('legacy-checksum'), keyed = await fixture('blocked')
    expect(document.key).toBeNull()
    expect(await matches(document.puzzle,document.verifier,keyed.key!.values)).toBe(true)
    expect(await matches(document.puzzle,document.verifier,keyed.key!.values.map(()=>'X'))).toBe(false)
  })
  test('incomplete, unverified, correct and incorrect are distinct', async () => {
    const document = await fixture('unverified')
    const attempt = {revision:await revision(document.puzzle),values:Array<string>(9).fill(''),elapsedMs:0}
    expect(value(await assess(document,attempt))).toBe('incomplete')
    attempt.values.fill('X')
    expect(value(await assess(document,attempt))).toBe('complete-unverified')
    const checked = await fixture('answer-free')
    expect(value(await assess(checked,attempt))).toBe('incorrect')
    attempt.values = (await fixture()).key!.values
    expect(value(await assess(checked,attempt))).toBe('correct')
  })
  test('answer correction keeps public revision and recomputes correctness', async () => {
    const document = await fixture()
    const attempt = {revision:await revision(document.puzzle),values:[...document.key!.values],elapsedMs:12}
    expect(value(await assess(document,attempt))).toBe('correct')
    document.key!.values[0] = 'X'
    expect(await revision(document.puzzle)).toBe(attempt.revision)
    expect(value(await assess(document,attempt))).toBe('incorrect')
  })
  test('stale attempts and invalid fill/time fail at the boundary', async () => {
    const document = await fixture('in-progress')
    const attempt = document.attempt!
    expect(value(await assess(document,attempt))).toBe('incomplete')
    expect((await assess(document,{...attempt,revision:'sha256:wrong'})).ok).toBe(false)
    expect((await assess(document,{...attempt,values:['A']})).ok).toBe(false)
    expect((await assess(document,{...attempt,elapsedMs:NaN})).ok).toBe(false)
    expect((await changed(raw => { raw['intro'] = 'Different challenge' }, 'in-progress')).ok).toBe(false)
  })
  test('key/verifier disagreement is rejected', async () => {
    expect((await changed(raw => { raw[verificationField]={version:'0.1',salt:vectors.salt,digest:'0'.repeat(64)} })).ok).toBe(false)
  })
})

describe('answer-free projection', () => {
  test('export contains no answer key, private explanation, or default attempt', async () => {
    const document = await fixture()
    document.attempt = {revision:await revision(document.puzzle),values:[...document.key!.values],elapsedMs:999}
    const exported = value(await answerFree(document))
    const parsed = value(await readIpuz(exported))
    expect(parsed.key).toBeNull(); expect(parsed.attempt).toBeNull()
    for (const field of ['"solution":','"explanation":','"saved":','Private explanation sentinel',attemptField]) expect(exported).not.toContain(field)
    expect(await revision(parsed.puzzle)).toBe(await revision(document.puzzle))
    expect(value(await assess(parsed,document.attempt))).toBe('correct')
  })
  test('including progress is explicit and retains the solver’s entered values', async () => {
    const document = await fixture('in-progress')
    const parsed = value(await readIpuz(value(await answerFree(document,true))))
    expect(parsed.attempt).toEqual(document.attempt)
    expect(parsed.key).toBeNull()
  })
  test('unverified export fails; bad keys are validated before they can be removed', async () => {
    expect((await answerFree(await fixture('unverified'))).ok).toBe(false)
    const document = await fixture()
    document.key!.values.push('SECRET')
    expect((await writeIpuz(document)).ok).toBe(false)
    expect((await answerFree(document)).ok).toBe(false)
  })
})

describe('explicit unsupported/invalid boundaries', () => {
  test('byte import rejects malformed UTF-8 rather than substituting text', async () => {
    expect((await readIpuzBytes(new Uint8Array([0x7b,0x22,0xc0,0xaf,0x22,0x3a,0x30,0x7d]))).ok).toBe(false)
    expect(value(await readIpuzBytes(new TextEncoder().encode(await source('ordinary'))))).toEqual(await fixture())
  })
  for (const [name,edit] of [
    ['unknown extension', (raw: JsonObject) => {raw['example.org:secret'] = 'answer'}],
    ['private clue answer', (raw: JsonObject) => {raw['clues'] = {Across:[{number:1,clue:'A',answer:'CAT'}]}}],
    ['directional solution', (raw: JsonObject) => {raw['solution'] = [[{Across:'A',Down:'B'},'A','T'],['O','R','E'],['D','E','N']]}],
    ['HTML clue', (raw: JsonObject) => {raw['clues'] = {Across:[[1,'<b>Pet</b>']]}}],
    ['void cell', (raw: JsonObject) => {raw['puzzle'] = [[1,2,null],[4,0,0],[5,0,0]]}],
    ['unresolved clue', (raw: JsonObject) => {raw['clues'] = {Across:[[99,'Missing']]}}],
    ['duplicate label', (raw: JsonObject) => {raw['puzzle'] = [[1,2,3],[1,0,0],[5,0,0]]}],
    ['bad width', (raw: JsonObject) => {raw['dimensions']={width:0,height:3}}],
    ['missing clue', (raw: JsonObject) => {raw['clues']={Across:[],Down:[]}}],
    ['orphan attempt', (raw: JsonObject) => {raw[attemptField]={version:'0.1',revision:vectors.revision,elapsedMs:0}}],
    ['unsafe extension retention', (raw: JsonObject) => {raw['volatile']={[namespace]:[]}}]
  ] as const) {
    test(`${name} is rejected without producing a partial document`, async () => {
      const result = await changed(edit)
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.issue.path.length).toBeGreaterThan(0)
    })
  }
  test('invalid JSON cannot hide duplicate properties or nonrepresentable values', () => {
    for (const input of ['{"a":1,"a":2}','{"a":1,"\\u0061":2}','{"n":1e400}','{"s":"\\ud800"}','[1,]','[true,false,null,{"x":undefined}]','['.repeat(66)+'0'+']'.repeat(66)]) expect(parseJson(input).ok).toBe(false)
    const nested = ' { "a": [ true, false, null, {}, [], "\\\"", { "b": 1 } ], "x": 2 } '
    expect(value(parseJson(nested))).toEqual(JSON.parse(nested) as JsonObject)
  })
  test('canonicalization uses UTF-16 key ordering, finite JSON numbers and exact Unicode', () => {
    expect(canonical({z:-0,a:1e30,b:0.002,c:'\n'})).toBe('{"a":1e+30,"b":0.002,"c":"\\n","z":0}')
    expect(canonical({'\ue000':1,'😀':2})).toBe('{"😀":2,"":1}')
    expect(canonical('é')).not.toBe(canonical('e\u0301'))
  })
})
