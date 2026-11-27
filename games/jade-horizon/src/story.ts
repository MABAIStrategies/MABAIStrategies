// Story mode: "The Lantern of Eight Winds" — an original tale in eight chapters.
// Each board you clear paints color back into a realm the Hollow Emperor drained grey.
import type { LevelSpec } from './levels';
import { hashString } from './rng';
import { layoutSize } from './layouts';

export type Speaker = 'wen' | 'kito' | 'emperor' | 'you' | 'narrator';
export interface Line { who: Speaker; text: string }
export interface Character { name: string; glyph: string; color: string; title: string }

export const CAST: Record<Speaker, Character> = {
  wen: { name: 'Grandmother Wen', glyph: '文', color: '#c0392b', title: 'Keeper of the Jade Library' },
  kito: { name: 'Kito', glyph: '狐', color: '#e8742b', title: 'A fox spirit of questionable honesty' },
  emperor: { name: 'The Hollow Emperor', glyph: '虚', color: '#7a6aa8', title: 'He who swallowed the colors' },
  you: { name: 'You', glyph: '旅', color: '#1f7a58', title: 'The Wayfarer' },
  narrator: { name: '', glyph: '', color: '#888', title: '' },
};

export interface BoardDef {
  layout: string; copies: 2 | 4; objective?: 'clear' | 'gold';
  mist?: number; locks?: number; gold?: number; bombs?: number; bombMoves?: number; timeLimit?: number;
  hints?: number; shuffles?: number; undos?: number;
  between?: Line[];
}

export interface Chapter {
  id: number; title: string; subtitle: string; biome: number;
  intro: Line[]; boards: BoardDef[]; outro: Line[];
  fragment: { title: string; text: string };
}

export const CHAPTERS: Chapter[] = [
  {
    id: 0, title: 'The Grey Morning', subtitle: 'Chapter I', biome: 0,
    intro: [
      { who: 'narrator', text: 'For a thousand years the Great Lantern burned atop Mount Yuehua, and its light gave every realm its color.' },
      { who: 'narrator', text: 'Then, on the first morning of spring, it went dark. The blossoms of the valley turned the color of ash.' },
      { who: 'wen', text: 'Wake up, child. Look outside. Even the plum trees have forgotten how to be pink.' },
      { who: 'you', text: 'Grandmother… the whole valley is grey.' },
      { who: 'wen', text: 'The Jade Tiles have been scattered. Every pair you reunite returns a little color to the world. That is the old magic of the Library.' },
      { who: 'wen', text: 'Match two tiles that are alike, and free on one side. Begin here, on the courtyard stones.' },
    ],
    boards: [
      { layout: 'petal', copies: 2, hints: -1, shuffles: -1 },
      {
        layout: 'garden', copies: 2, hints: -1, shuffles: -1, between: [
          { who: 'kito', text: 'Ohh, color! How delicious. Do you mind if I… borrow a few of these?' },
          { who: 'you', text: 'A fox? Give those tiles back!' },
          { who: 'kito', text: 'Catch me in the garden, Wayfarer. Or don’t. I’m very fast and very charming.' },
        ],
      },
    ],
    outro: [
      { who: 'kito', text: 'Fine, fine. You win. You’re surprisingly good at this for someone with no tail.' },
      { who: 'wen', text: 'Kito. I wondered when you would show yourself again.' },
      { who: 'kito', text: 'Old Wen! You look… older. I can help. I know where the Emperor hid the other tiles. Mostly.' },
      { who: 'wen', text: 'Then go together. Eight realms, eight winds. Bring the Lantern back to life.' },
    ],
    fragment: { title: 'The First Wind', text: 'The East Wind woke the blossoms each spring. It was the youngest of the winds, and the most forgetful — so it carved its name onto a tile, so it would never forget who it was.' },
  },
  {
    id: 1, title: 'Whispers in the Mist', subtitle: 'Chapter II', biome: 1,
    intro: [
      { who: 'narrator', text: 'The Bamboo Highlands rustle with voices, but no one is there.' },
      { who: 'kito', text: 'Careful. The Emperor breathes on things he wants hidden. See how some tiles are veiled?' },
      { who: 'you', text: 'I can’t read their faces.' },
      { who: 'kito', text: 'The mist lifts once a tile is free. Plan ahead — clear the ones you can see, and the hidden ones reveal themselves.' },
      { who: 'emperor', text: '…why do you bother, little Wayfarer? Colors fade. Names are forgotten. Everything returns to grey.' },
      { who: 'you', text: 'Who said that?' },
      { who: 'kito', text: 'Ignore him. He talks a lot for someone with no face.' },
    ],
    boards: [{ layout: 'koi', copies: 2, mist: 0.5, hints: 3, shuffles: 2 }],
    outro: [
      { who: 'kito', text: 'The bamboo is green again. Listen — it’s laughing.' },
      { who: 'you', text: 'Kito… how do you know so much about the Emperor?' },
      { who: 'kito', text: 'Foxes know everything. It’s in the contract. Onward!' },
    ],
    fragment: { title: 'Breath of the Mountain', text: 'The South Wind once carried the voices of the bamboo to the sea. When it grew tired, it hid its voice in the mist, and the mist has whispered ever since.' },
  },
  {
    id: 2, title: 'A Thousand Lights', subtitle: 'Chapter III', biome: 2,
    intro: [
      { who: 'narrator', text: 'In Lantern Harbor it is always night now. The festival lanterns float unlit on black water.' },
      { who: 'wen', text: '(a voice on the wind) The golden tiles are the souls of the lanterns, child. Free them and the harbor will remember its festival.' },
      { who: 'kito', text: 'Gold tiles are buried deep. You’ll need to dig. Don’t clear everything — just get every gold pair out.' },
    ],
    boards: [{ layout: 'lantern', copies: 4, objective: 'gold', gold: 4, mist: 0.3, hints: 3, shuffles: 2 }],
    outro: [
      { who: 'narrator', text: 'One by one the lanterns bloom amber. Somewhere a drum begins to play.' },
      { who: 'emperor', text: 'Lights. Always lights. You will see how quickly they go out.' },
      { who: 'kito', text: '(quietly) He used to love the festival, you know.' },
      { who: 'you', text: 'What did you say?' },
      { who: 'kito', text: 'Nothing! I said nothing. Look, a boat!' },
    ],
    fragment: { title: 'The Lantern Souls', text: 'Every lantern set adrift carries a wish. The West Wind collected them, and in the deepest dark it would glow gold with all the hopes it carried.' },
  },
  {
    id: 3, title: 'The Sand Clock', subtitle: 'Chapter IV', biome: 3,
    intro: [
      { who: 'narrator', text: 'The Desert of Echoes repeats everything you say, a little sadder each time.' },
      { who: 'emperor', text: 'Time. Time. Time. It runs out for everyone, Wayfarer.' },
      { who: 'kito', text: 'The sand clock has started. If it empties before the board is clear, the echoes swallow the tiles again.' },
      { who: 'you', text: 'Then I’ll be quick.' },
    ],
    boards: [{ layout: 'pagoda', copies: 4, mist: 0.3, timeLimit: 330, hints: 2, shuffles: 2 }],
    outro: [
      { who: 'narrator', text: 'The dunes turn gold, then rose. The echoes fall silent — except one.' },
      { who: 'emperor', text: '…I was a wind once. Did you know that? I moved the sand. I made the dunes sing.' },
      { who: 'you', text: 'What happened to you?' },
      { who: 'emperor', text: 'Everyone forgot my name.' },
    ],
    fragment: { title: 'The Singing Dunes', text: 'Travelers once heard music in the desert at dusk. They said it was the sand. It was not the sand.' },
  },
  {
    id: 4, title: 'Bells Beneath the Ice', subtitle: 'Chapter V', biome: 4,
    intro: [
      { who: 'narrator', text: 'Frostpeak Monastery. The monks are frozen mid-prayer, their bells silent.' },
      { who: 'kito', text: 'The monks chained the holiest tiles to protect them from the Emperor. Each chain loosens as you make matches.' },
      { who: 'you', text: 'So I need to earn my way to them.' },
      { who: 'kito', text: 'Exactly. Patience. Ugh. My least favorite virtue.' },
    ],
    boards: [{ layout: 'lotus', copies: 4, mist: 0.4, locks: 6, hints: 2, shuffles: 1 }],
    outro: [
      { who: 'narrator', text: 'The ice cracks. A single bell rings out, and then a hundred more.' },
      { who: 'wen', text: '(on the wind) You are halfway, child. The Lantern flickers. I can feel it.' },
      { who: 'kito', text: 'Wayfarer… when we reach the Forge, there’s something I have to tell you.' },
    ],
    fragment: { title: 'The North Bell', text: 'The North Wind rang the monastery bells so the monks would never sleep through dawn. It rang them gently. It was the only gentle thing about the North Wind.' },
  },
  {
    id: 5, title: 'Embers in the Leaves', subtitle: 'Chapter VI', biome: 5,
    intro: [
      { who: 'narrator', text: 'The canyons burn without fire. Embers hide among the maple leaves.' },
      { who: 'emperor', text: 'You are close now. Too close. Let us see how you handle a little heat.' },
      { who: 'kito', text: 'Bomb tiles! Each one has a fuse that burns down with every match you make. Pair them before they hit zero.' },
    ],
    boards: [{ layout: 'butterfly', copies: 4, mist: 0.45, bombs: 2, bombMoves: 14, locks: 3, hints: 2, shuffles: 1 }],
    outro: [
      { who: 'narrator', text: 'The embers cool into copper leaves. The canyon breathes out.' },
      { who: 'you', text: 'He could have hurt me. He didn’t. Every bomb had enough fuse.' },
      { who: 'kito', text: 'Of course it did. He was never cruel. Only lonely.' },
    ],
    fragment: { title: 'Copper and Flame', text: 'Autumn was the Ninth Wind’s favorite season — the one time of year when the world, like him, let go of everything.' },
  },
  {
    id: 6, title: 'The Forge of Names', subtitle: 'Chapter VII', biome: 6,
    intro: [
      { who: 'kito', text: 'Here’s the truth, Wayfarer. There were not eight winds. There were nine.' },
      { who: 'kito', text: 'The Ninth was the wind of stillness — the quiet between breaths. I was his companion. When the world forgot him, I… forgot him too.' },
      { who: 'you', text: 'The Hollow Emperor is the Ninth Wind.' },
      { who: 'kito', text: 'There are 144 Jade Tiles. One for every wind and season and dragon. None for him. We have to forge one.' },
      { who: 'kito', text: 'This board has everything. Mist, chains, bombs, the clock. Stay sharp.' },
    ],
    boards: [{ layout: 'fortress', copies: 4, mist: 0.5, locks: 4, bombs: 2, bombMoves: 12, timeLimit: 330, hints: 1, shuffles: 1, undos: 3 }],
    outro: [
      { who: 'narrator', text: 'In the heart of the Forge, a single blank tile cools on the anvil. It is the 145th.' },
      { who: 'kito', text: 'It needs a name. That’s your job. I’m terrible with names. I named myself after a sneeze.' },
    ],
    fragment: { title: 'The 145th Tile', text: 'No set of Jade Tiles has ever held more than 144. The 145th has no suit and no number. It matches only with remembering.' },
  },
  {
    id: 7, title: 'The Ninth Wind', subtitle: 'Chapter VIII', biome: 7,
    intro: [
      { who: 'narrator', text: 'The Celestial Isles drift in a sky with no stars. At their center sits the Hollow Throne.' },
      { who: 'emperor', text: 'So. The Wayfarer and the fox. Come to take back the last of the color?' },
      { who: 'you', text: 'No. I came to give you something.' },
      { who: 'emperor', text: 'There is nothing you can give a thing that was forgotten.' },
      { who: 'kito', text: 'Clear the throne, Wayfarer. Every tile. Then we’ll show him.' },
    ],
    boards: [{ layout: 'hollow', copies: 4, mist: 0.6, locks: 5, bombs: 2, bombMoves: 14, gold: 3, hints: 1, shuffles: 1, undos: 3 }],
    outro: [
      { who: 'narrator', text: 'The last pair rises and dissolves into light. The throne is empty. In its place lies the 145th tile.' },
      { who: 'you', text: 'This is yours. It has a name on it now.' },
      { who: 'emperor', text: '…{NAME}. That is… that is a good name.' },
      { who: 'narrator', text: 'The Hollow Emperor is hollow no longer. He becomes what he always was: the stillness between moves, the breath before a match.' },
      { who: 'wen', text: 'The Lantern burns, child. Every realm has its color again. And one more wind blows through them.' },
      { who: 'kito', text: 'So… same time next spring?' },
    ],
    fragment: { title: 'The Name of the Ninth', text: 'Players of the Jade Tiles sometimes pause before their final match, for no reason they can explain. That pause is {NAME}. Say hello.' },
  },
];

export function storyLevel(ch: number, board: number): LevelSpec {
  const c = CHAPTERS[ch];
  const b = c.boards[board];
  const tiles = layoutSize(b.layout);
  return {
    key: `s${ch}-${board}`, mode: 'story', name: `${c.title}${c.boards.length > 1 ? ` (${board + 1}/${c.boards.length})` : ''}`,
    layout: b.layout, biome: c.biome, seed: hashString(`story-${ch}-${board}`),
    copies: b.copies, objective: b.objective ?? 'clear', timeLimit: b.timeLimit ?? 0, parTime: Math.round(tiles * 3),
    mist: b.mist ?? 0, locks: b.locks ?? 0, gold: b.gold ?? 0, bombs: b.bombs ?? 0, bombMoves: b.bombMoves ?? 0,
    hints: b.hints ?? 3, shuffles: b.shuffles ?? 2, undos: b.undos ?? -1,
  };
}

export function fillName(text: string, name: string) { return text.replace(/\{NAME\}/g, name || 'Stillness'); }
