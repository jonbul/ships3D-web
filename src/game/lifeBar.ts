/**
 * The life bar, the same as the 3DS client's (cmd/ships3ds/hud.go): a capsule
 * with stepped corners, a pixel heart, and ten charges lit as far as life
 * reaches, the last one partly, each with a shine along its top. Low, the
 * charges turn red and the heart beats. Drawn in SVG in the 3DS's pixels, and
 * scaled up by CSS.
 */

const SVG = 'http://www.w3.org/2000/svg'

// The 3DS's measures, in its pixels.
const MOST_SEGMENTS = 10
const SEGMENT_WIDTH = 10
const SEGMENT_HEIGHT = 10
const SEGMENT_GAP = 2
const HEART_ROOM = 24 // the heart's place at the bar's left
const CORNER_STEP = 2
const SHADOW_DROP = 2
const HEART_PIXEL = 2
const SHINE_HEIGHT = 2
/** Below this share of life the charges turn red. */
export const LOW_SHARE = 0.3

const COLOURS = {
  edge: '#9cc8f2',
  box: '#0e1c42',
  shadow: '#02060f',
  spent: '#1c2a48',
  shine: 'rgb(255 255 255 / 0.44)',
  cells: ['#7fe8ff', '#3d8fe0'],
  cellsLow: ['#ff9aa8', '#e0405a'],
  heart: '#ff6f91',
  heartLight: '#ffd6e0',
}

const HEART = ['.##.##.', '#*#####', '#######', '.#####.', '..###..', '...#...']

/**
 * How full each charge is, from 0 to 1, for life out of most: one charge for
 * each tenth of the most life (fewer when the most is under ten).
 */
export function chargeFills(life: number, most: number): number[] {
  if (most <= 0) {
    return []
  }
  const segments = Math.min(Math.ceil(most), MOST_SEGMENTS)
  const share = Math.max(life, 0) / most
  return Array.from({ length: segments }, (_, segment) =>
    Math.min(Math.max(share * segments - segment, 0), 1),
  )
}

/** The life bar's element, which `update` redraws. */
export class LifeBar {
  readonly element: SVGSVGElement
  private segments = 0
  private fills: SVGRectElement[] = []
  private shines: SVGRectElement[] = []

  constructor(parent: HTMLElement) {
    this.element = document.createElementNS(SVG, 'svg')
    this.element.setAttribute('class', 'hud-lifebar')
    this.element.setAttribute('shape-rendering', 'crispEdges')
    this.element.setAttribute('role', 'img')
    parent.append(this.element)
  }

  /** Shows life out of most. */
  update(life: number, most: number): void {
    const fills = chargeFills(life, most)
    if (fills.length !== this.segments) {
      this.build(fills.length)
    }
    const low = life / Math.max(most, 1) < LOW_SHARE
    const [light, deep] = low ? COLOURS.cellsLow : COLOURS.cells
    fills.forEach((fill, segment) => {
      const width = fill * SEGMENT_WIDTH
      const colour = mix(light!, deep!, segment / Math.max(fills.length - 1, 1))
      this.fills[segment]!.setAttribute('width', String(width))
      this.fills[segment]!.setAttribute('fill', colour)
      this.shines[segment]!.setAttribute('width', String(width))
    })
    this.element.classList.toggle('low', low)
    this.element.setAttribute('aria-label', `${Math.round(life)} / ${Math.round(most)}`)
  }

  /** Lays the bar out for a number of charges. */
  private build(segments: number): void {
    this.segments = segments
    this.element.replaceChildren()
    const width = HEART_ROOM + segments * (SEGMENT_WIDTH + SEGMENT_GAP) + SEGMENT_GAP + 2
    const height = SEGMENT_HEIGHT + 8
    this.element.setAttribute('viewBox', `0 0 ${width + SHADOW_DROP} ${height + SHADOW_DROP}`)
    this.element.style.setProperty('--bar-width', String(width + SHADOW_DROP))
    this.stepped(SHADOW_DROP, SHADOW_DROP, width, height, COLOURS.shadow)
    this.stepped(0, 0, width, height, COLOURS.edge)
    this.stepped(2, 2, width - 4, height - 4, COLOURS.box)
    const heart = this.group('hud-lifebar-heart')
    HEART.forEach((line, row) => {
      ;[...line].forEach((letter, column) => {
        if (letter === '.') {
          return
        }
        this.rect(
          heart,
          7 + column * HEART_PIXEL,
          (height - HEART.length * HEART_PIXEL) / 2 + row * HEART_PIXEL,
          HEART_PIXEL,
          HEART_PIXEL,
          letter === '*' ? COLOURS.heartLight : COLOURS.heart,
        )
      })
    })
    this.fills = []
    this.shines = []
    for (let segment = 0; segment < segments; segment++) {
      const x = HEART_ROOM + segment * (SEGMENT_WIDTH + SEGMENT_GAP)
      this.rect(this.element, x, 4, SEGMENT_WIDTH, SEGMENT_HEIGHT, COLOURS.spent)
      this.fills.push(this.rect(this.element, x, 4, 0, SEGMENT_HEIGHT, COLOURS.cells[0]!))
      this.shines.push(this.rect(this.element, x, 4, 0, SHINE_HEIGHT, COLOURS.shine))
    }
  }

  /** A rectangle with its corners cut in two steps, as the 3DS draws its windows. */
  private stepped(x: number, y: number, width: number, height: number, colour: string): void {
    for (let step = 0; step <= 2; step++) {
      const inset = (2 - step) * CORNER_STEP
      const side = step * CORNER_STEP
      this.rect(this.element, x + side, y + inset, width - 2 * side, height - 2 * inset, colour)
    }
  }

  private group(className: string): SVGGElement {
    const group = document.createElementNS(SVG, 'g')
    group.setAttribute('class', className)
    this.element.append(group)
    return group
  }

  private rect(
    parent: Element,
    x: number,
    y: number,
    width: number,
    height: number,
    fill: string,
  ): SVGRectElement {
    const rect = document.createElementNS(SVG, 'rect')
    rect.setAttribute('x', String(x))
    rect.setAttribute('y', String(y))
    rect.setAttribute('width', String(width))
    rect.setAttribute('height', String(height))
    rect.setAttribute('fill', fill)
    parent.append(rect)
    return rect
  }
}

/** A colour between two `#rrggbb` ones, share of the way. */
function mix(first: string, second: string, share: number): string {
  const channel = (colour: string, index: number) =>
    parseInt(colour.slice(1 + index * 2, 3 + index * 2), 16)
  const mixed = [0, 1, 2].map((index) =>
    Math.round(channel(first, index) + (channel(second, index) - channel(first, index)) * share),
  )
  return `rgb(${mixed.join(' ')})`
}
