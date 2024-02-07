import van from "vanjs-core"
const { div, img } = van.tags

import { getStore } from '../store.js'
import wolkImage from '../images/wolk.gif';
import bannerImage from '../images/banner.gif'

const store = getStore()

export const Loading = () => {
    console.log(store)
    return div(
        { class: () => `loading ${store.isLoading ? "visible" : ""}` },
        div(
            div({ class: "content" }, img({ src: bannerImage }), img({ src: wolkImage })
            )
        ))
}
