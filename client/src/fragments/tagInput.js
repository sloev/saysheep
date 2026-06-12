import van from 'vanjs-core'
import { searchTags, getCategoryForTag, getTagColor, translateTag, UNIQUE_TAGS } from '../lib/categories.js'
import { t } from '../lib/i18n.js'
const { div, input, button, span } = van.tags

export const TagInput = ({ tags, onTagsChange }) => {
  const inputVal = van.state('')
  const suggestions = van.state([])
  const activeIdx = van.state(-1)

  const addTag = (tag) => {
    tag = tag.trim().toLowerCase()
    // Find if this tag matches any tag ID or localized name in the taxonomy
    const matchedTag = UNIQUE_TAGS.find(t => {
      if (t === tag) return true
      const localized = translateTag(t).toLowerCase()
      return localized === tag
    })

    if (!matchedTag) {
      const sugg = suggestions.val
      if (sugg.length > 0) {
        const firstSugg = sugg[0]
        if (!tags.val.includes(firstSugg)) {
          tags.val = [...tags.val, firstSugg]
          onTagsChange?.(tags.val)
        }
      }
      inputVal.val = ''
      suggestions.val = []
      return
    }

    if (tags.val.includes(matchedTag)) {
      inputVal.val = ''
      suggestions.val = []
      return
    }

    tags.val = [...tags.val, matchedTag]
    onTagsChange?.(tags.val)
    inputVal.val = ''
    suggestions.val = []
  }

  const removeTag = (tag) => {
    tags.val = tags.val.filter(t => t !== tag)
    onTagsChange?.(tags.val)
  }

  const onInput = (e) => {
    const v = e.target.value
    inputVal.val = v
    suggestions.val = v.trim() ? searchTags(v) : []
    activeIdx.val = -1
  }

  const onKeyDown = (e) => {
    const sugg = suggestions.val
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      const active = activeIdx.val >= 0 ? sugg[activeIdx.val] : inputVal.val
      if (active) addTag(active)
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      activeIdx.val = Math.min(activeIdx.val + 1, sugg.length - 1)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      activeIdx.val = Math.max(activeIdx.val - 1, -1)
    } else if (e.key === 'Escape') {
      suggestions.val = []
    } else if (e.key === 'Backspace' && !inputVal.val && tags.val.length) {
      removeTag(tags.val[tags.val.length - 1])
    }
  }

  return div({ class: 'tag-input-container' },
    // Current tags
    () => {
      const currentTags = tags.val
      if (!currentTags.length) return div()
      return div({ class: 'tag-list' },
        ...currentTags.map(tag => {
          const color = getTagColor(tag)
          return div({ class: 'tag-removable', style: `background:${color}` },
            span(translateTag(tag)),
            button({ class: 'tag-remove', type: 'button', onclick: () => removeTag(tag) }, '×')
          )
        })
      )
    },
    // Input
    input({
      class: 'form-input',
      type: 'text',
      placeholder: t('new.tags.placeholder'),
      value: inputVal,
      oninput: onInput,
      onkeydown: onKeyDown,
    }),
    // Suggestions dropdown
    () => {
      const sugg = suggestions.val
      if (!sugg.length) return div()
      return div({ class: 'tag-suggestions' },
        ...sugg.map((s, i) => {
          const cat = getCategoryForTag(s)
          return div({
            class: () => `tag-suggestion ${activeIdx.val === i ? 'active' : ''}`,
            onmousedown: (e) => { e.preventDefault(); addTag(s) },
          }, span(cat.emoji), span(translateTag(s)))
        })
      )
    }
  )
}
