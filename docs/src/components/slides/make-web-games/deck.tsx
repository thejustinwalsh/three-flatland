import { Presentation } from '../../deck/Presentation'
import { Slides } from './slides'
import { DeckScene } from './scene/DeckScene'

export default function MakeWebGamesDeck() {
  return <Presentation slides={<Slides />} scene={<DeckScene />} />
}
