import van from "vanjs-core"
const { div, h4, img, span } = van.tags
import AuditImage from '../images/audit.png'
import VerifiedImage from '../images/verified.png'
import SpeechImage from '../images/speech.png'
import TimeImage from '../images/time.png'
import LocationImage from '../images/location.png'
import {formatRelative, formatDistance} from '../helpers/format.js'
import {distance} from '../helpers/geo.js'

import { getStore } from '../store.js'

const store = getStore()

export const ListItem = (params) => {
    console.log(store)
    return div({ class: "list-item" },
        div({ class: "image" }, img({ src: params.verified ? params.image : AuditImage })),
        div({ class: "title" }, params.title),
        div({ class: "description" }, params.description),
        div({ class: "pills" },
            params.messages ? div({ class: "pill" }, params.messages, img({ src: SpeechImage })) : null,
            div({ class: "pill" }, formatRelative(params.date), img({src:TimeImage})),
            div({ class: "pill" }, formatDistance(distance(params.geo.lat, params.geo.lng, store.currentPosition.lat, store.currentPosition.lng)), img({src:LocationImage}))
        )
    )
}
