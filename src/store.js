import * as vanX from "vanjs-ext"

import MiniSearch from 'minisearch'


import demodata from './demoData.js'

let store;
let search;
export const getStore = () => {
    if (!store) {
        search = new MiniSearch({
            fields: ['title', 'description'], // fields to index for full-text search
            storeFields: ['id'], // fields to return with search results
            searchOptions: {
                prefix: true,
                fuzzy: 0.2
            }
        })

        store = vanX.reactive({
            items: {},
            matchedIds: [],
            dbIsLoading: false,
            mapIsLoading: false,
            searchIsLoading: false,
            currentPosition: {
                lng: 74,
                lat: 40
            },
            query: "",
            warnings:[]
        })
        store.isLoading = vanX.calc(() => [store.dbIsLoading, store.mapIsLoading].some(x => !!x))
        addItems(demodata.items).then(() => { console.log("done indexing") })
    }
    return store
}
const filterByQuery =()=>{
    if (!store.query.length){
        vanX.replace(store.matchedIds, l =>  Object.keys(store.items))
    }else{
        vanX.replace(store.matchedIds, l=> search.search(store.query).map(res=>res.id))
    }
    console.log("matched ids", store.matchedIds )
    console.log("matched items", store.items )
    // let newMatchedItems = ids.map(id => store.items[id])
    // console.log(store.matchedItems)
    // console.log(newMatchedItems)
    // vanX.replace(store.matchedItems, l => newMatchedItems)
    // console.log(store.matchedItems)
}
export const updateQuery = async (query) =>{
    store.query = query
    filterByQuery()
}

export const addItems = async (items) => {
    store.searchIsLoading = true
    try {
        await search.addAllAsync(items)
        items.map((item) => {
            store.items[item.id] = item
        })
        filterByQuery()
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
        search.discardAll(ids)
        filterByQuery()
    } catch (e) {
        console.error(e)
    }
    finally {
        store.searchIsLoading = false
    }


};

export const addWarning=(warning)=>{
    store.warnings.push(warning)
    
}

