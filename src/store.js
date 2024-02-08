import * as vanX from "vanjs-ext"

import MiniSearch from 'minisearch'


import demodata from './demoData.js'

let store;
let search;
export const getStore = () => {
    if (!store) {
        search =  new MiniSearch({
            fields: ['title', 'description'], // fields to index for full-text search
            storeFields: ['id'] // fields to return with search results
          })

        store = vanX.reactive({
            items: {},
            dbIsLoading: false,
            mapIsLoading: false,
            searchIsLoading: false,
            currentPosition: {
                lng: 74,
                lat: 40
            }
        })
        store.isLoading = vanX.calc(() => [store.dbIsLoading, store.mapIsLoading].some(x => !!x))
        addItems(demodata.items).then(()=>{console.log("done indexing")})
    }
    return store
}

export const addItems = async (items) => {
    store.searchIsLoading = true
    try {
        await search.addAllAsync(items)
        items.map((item) => {
            store.items[item.id] = item
        })
    } catch (e) {
        console.error(e)
    }
    finally {
        store.searchIsLoading = false
    }


};

export const removeItems = async (ids) => {
    store.searchIsLoading = true
    try {
        search.discardAll(items.map(item => item.id))
    } catch (e) {
        console.error(e)
    }
    finally {
        store.searchIsLoading = false
    }


};


