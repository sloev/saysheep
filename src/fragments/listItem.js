import van from "vanjs-core"
const { div, h4, img, span } = van.tags
import AuditImage  from '../images/audit.png'
import VerifiedImage  from '../images/verified.png'

import { getStore } from '../store.js'

const store = getStore()

export const ListItem = (params) => {
    console.log(store)
    return div({class:"list-item"},
    div({class:"image"},img({src:params.verified ? params.image: AuditImage}), params.verified ? img({class:"verified", src:VerifiedImage}):null),
    div({class:"title"},params.title),
    div({class:"description"},params.description),
    div({class:"messages"}, params.messages),
    div({class:"date"},params.date),
    div({class:"lnglat"},params.lnglat)
    )
}
