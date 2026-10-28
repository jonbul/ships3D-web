/**
 * The Play page's icons, drawn by hand in pixels as the 3DS client's are: each
 * row a line of the picture, '#' its colour, '+' a lighter one, '.' nothing.
 */
export type PixelPicture = readonly string[]

/** Free for all: two ships passing each other, shooting. */
export const freeForAllIcon: PixelPicture = [
  '................',
  '.##.............',
  '.###............',
  '..#++#..........',
  '..######..+.+.+.',
  '..#++#..........',
  '.###............',
  '.##.............',
  '.............##.',
  '............###.',
  '..........#++#..',
  '.+.+.+..######..',
  '..........#++#..',
  '............###.',
  '.............##.',
  '................',
]

/** Assault: the mothership, with its turrets. */
export const assaultIcon: PixelPicture = [
  '................',
  '......#..#......',
  '.....######.....',
  '....##++++##....',
  '..############..',
  '.##+##+##+##+##.',
  '################',
  '#++############+',
  '################',
  '.##############.',
  '..##.##..##.##..',
  '...#..#..#..#...',
  '................',
  '..+..........+..',
  '................',
  '................',
]

/** Settings: a gear. */
export const settingsIcon: PixelPicture = [
  '.....##.....',
  '..#.####.#..',
  '.##########.',
  '..###++###..',
  '.###+..+###.',
  '####+..+####',
  '.###+..+###.',
  '..###++###..',
  '.##########.',
  '..#.####.#..',
  '.....##.....',
  '............',
]

/** Back: an arrow pointing left. */
export const backIcon: PixelPicture = [
  '............',
  '....#.......',
  '...##.......',
  '..###.......',
  '.##########.',
  '###########.',
  '.##########.',
  '..###.......',
  '...##.......',
  '....#.......',
  '............',
  '............',
]

/** Pause: two bars. */
export const pauseIcon: PixelPicture = [
  '............',
  '..###..###..',
  '..###..###..',
  '..###..###..',
  '..###..###..',
  '..###..###..',
  '..###..###..',
  '..###..###..',
  '..###..###..',
  '..###..###..',
  '............',
  '............',
]

/** The cursor: a little four-pointed star beside what is chosen. */
export const starIcon: PixelPicture = [
  '...#...',
  '...#...',
  '..#+#..',
  '##+++##',
  '..#+#..',
  '...#...',
  '...#...',
]

/**
 * The rectangles that draw a picture: one for each run of the same letter
 * along a row, which keeps an SVG of it small.
 */
export function pixelRuns(
  picture: PixelPicture,
): Array<{ x: number; y: number; width: number; light: boolean }> {
  const runs: Array<{ x: number; y: number; width: number; light: boolean }> = []
  picture.forEach((line, y) => {
    for (let x = 0; x < line.length; ) {
      const letter = line[x]
      let end = x + 1
      while (end < line.length && line[end] === letter) {
        end++
      }
      if (letter !== '.') {
        runs.push({ x, y, width: end - x, light: letter === '+' })
      }
      x = end
    }
  })
  return runs
}
