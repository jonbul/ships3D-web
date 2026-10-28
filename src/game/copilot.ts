const SVG = 'http://www.w3.org/2000/svg'

/**
 * The copilot: a little round robot in the HUD, with a speech bubble. It
 * speaks up near the world's edge and while it steers the ship back.
 */
export class Copilot {
  readonly element: HTMLDivElement
  private readonly words: HTMLSpanElement

  constructor(parent: HTMLElement) {
    this.element = document.createElement('div')
    this.element.className = 'hud-copilot'
    this.element.append(robot())
    this.words = document.createElement('span')
    this.words.className = 'hud-copilot-words'
    this.element.append(this.words)
    this.element.hidden = true
    parent.append(this.element)
  }

  /** Says words, or nothing (and hides) with null. */
  say(words: string | null): void {
    this.element.hidden = words === null
    if (words !== null && this.words.textContent !== words) {
      this.words.textContent = words
    }
  }
}

/** The robot's face, drawn in SVG: a round shell, a dark screen, big eyes that shine, blushing cheeks and an antenna. */
function robot(): SVGSVGElement {
  const picture = document.createElementNS(SVG, 'svg')
  picture.setAttribute('viewBox', '0 0 48 48')
  picture.setAttribute('class', 'hud-copilot-face')
  picture.setAttribute('aria-hidden', 'true')
  const shapes: Array<[string, Record<string, string | number>]> = [
    ['line', { x1: 24, y1: 4, x2: 24, y2: 11, stroke: '#dfe9f8', 'stroke-width': 2 }],
    ['circle', { cx: 24, cy: 4, r: 3, fill: '#ff8fb8', class: 'hud-copilot-light' }],
    ['rect', { x: 5, y: 10, width: 38, height: 32, rx: 14, fill: '#dfe9f8' }],
    ['rect', { x: 10, y: 15, width: 28, height: 22, rx: 9, fill: '#16233f' }],
    ['circle', { cx: 18, cy: 25, r: 4, fill: '#5ee0ff' }],
    ['circle', { cx: 30, cy: 25, r: 4, fill: '#5ee0ff' }],
    ['circle', { cx: 19.5, cy: 23.5, r: 1.3, fill: '#ffffff' }],
    ['circle', { cx: 31.5, cy: 23.5, r: 1.3, fill: '#ffffff' }],
    ['ellipse', { cx: 13, cy: 32, rx: 2.5, ry: 1.5, fill: '#ff8fb8', opacity: 0.8 }],
    ['ellipse', { cx: 35, cy: 32, rx: 2.5, ry: 1.5, fill: '#ff8fb8', opacity: 0.8 }],
    ['path', { d: 'M20 32 Q24 35 28 32', stroke: '#5ee0ff', 'stroke-width': 1.6, fill: 'none' }],
  ]
  for (const [name, attributes] of shapes) {
    const shape = document.createElementNS(SVG, name)
    for (const [attribute, value] of Object.entries(attributes)) {
      shape.setAttribute(attribute, String(value))
    }
    picture.append(shape)
  }
  return picture
}
