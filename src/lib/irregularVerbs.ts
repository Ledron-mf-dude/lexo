/**
 * Irregular verbs: base, past simple (V2), past participle (V3). Alternatives are separated by «/», the first one is
 * the common British form; both are accepted as answers.
 */
const TABLE = `
arise arose arisen|awake awoke awoken|be was/were been|bear bore borne|beat beat beaten|become became become
begin began begun|bend bent bent|bet bet bet|bind bound bound|bite bit bitten|bleed bled bled|blow blew blown
break broke broken|breed bred bred|bring brought brought|broadcast broadcast broadcast|build built built
burn burnt/burned burnt/burned|burst burst burst|buy bought bought|catch caught caught|choose chose chosen
cling clung clung|come came come|cost cost cost|creep crept crept|cut cut cut|deal dealt dealt|dig dug dug
do did done|draw drew drawn|dream dreamt/dreamed dreamt/dreamed|drink drank drunk|drive drove driven
eat ate eaten|fall fell fallen|feed fed fed|feel felt felt|fight fought fought|find found found|flee fled fled
fly flew flown|forbid forbade forbidden|forecast forecast forecast|forget forgot forgotten|forgive forgave forgiven
freeze froze frozen|get got got/gotten|give gave given|go went gone|grind ground ground|grow grew grown
hang hung hung|have had had|hear heard heard|hide hid hidden|hit hit hit|hold held held|hurt hurt hurt
keep kept kept|kneel knelt/kneeled knelt/kneeled|know knew known|lay laid laid|lead led led|lean leant/leaned leant/leaned
leap leapt/leaped leapt/leaped|learn learnt/learned learnt/learned|leave left left|lend lent lent|let let let
lie lay lain|light lit/lighted lit/lighted|lose lost lost|make made made|mean meant meant|meet met met
mislead misled misled|mistake mistook mistaken|misunderstand misunderstood misunderstood|overcome overcame overcome
oversee oversaw overseen|overtake overtook overtaken|overthrow overthrew overthrown|pay paid paid|prove proved proven/proved
put put put|quit quit quit|read read read|rid rid rid|ride rode ridden|ring rang rung|rise rose risen|run ran run
say said said|see saw seen|seek sought sought|sell sold sold|send sent sent|set set set|sew sewed sewn/sewed
shake shook shaken|shed shed shed|shine shone shone|shoot shot shot|show showed shown/showed|shrink shrank shrunk
shut shut shut|sing sang sung|sink sank sunk|sit sat sat|sleep slept slept|slide slid slid|smell smelt/smelled smelt/smelled
speak spoke spoken|speed sped sped|spell spelt/spelled spelt/spelled|spend spent spent|spill spilt/spilled spilt/spilled
spin spun spun|spit spat spat|split split split|spoil spoilt/spoiled spoilt/spoiled|spread spread spread|spring sprang sprung
stand stood stood|steal stole stolen|stick stuck stuck|sting stung stung|stink stank stunk|strike struck struck
strive strove striven|swear swore sworn|sweep swept swept|swell swelled swollen|swim swam swum|swing swung swung
take took taken|teach taught taught|tear tore torn|tell told told|think thought thought|throw threw thrown
thrust thrust thrust|tread trod trodden|undergo underwent undergone|understand understood understood
undertake undertook undertaken|undo undid undone|upset upset upset|wake woke woken|wear wore worn|weave wove woven
weep wept wept|win won won|wind wound wound|withdraw withdrew withdrawn|withhold withheld withheld
withstand withstood withstood|write wrote written|outgrow outgrew outgrown|outdo outdid outdone|foresee foresaw foreseen
`

export interface IrregularVerb {
  base: string
  past: string[]
  participle: string[]
}

export const IRREGULAR = new Map<string, IrregularVerb>(
  TABLE.trim()
    .split(/[|\n]/)
    .map((entry) => entry.trim().split(/\s+/))
    .filter((parts) => parts.length === 3)
    .map(([base, past, participle]) => [base, { base, past: past.split('/'), participle: participle.split('/') }]),
)

/** The irregular verb a form belongs to (gave → give, written → write); the base form itself too. */
export const IRREGULAR_BY_FORM = new Map<string, IrregularVerb>()
for (const v of IRREGULAR.values()) for (const f of [v.base, ...v.past, ...v.participle]) if (!IRREGULAR_BY_FORM.has(f)) IRREGULAR_BY_FORM.set(f, v)
