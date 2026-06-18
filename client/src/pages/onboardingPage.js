import van from 'vanjs-core'
import { cone } from '../router.js'
import { t } from '../lib/i18n.js'

const { div, p, button } = van.tags

// First-run onboarding, reached from the welcome notification. All copy is
// translated to the user's settings language via t().
export const OnboardingPage = () => {
  const step = (text) => p({ class: 'onboarding-step' }, () => t(text))

  return div({ class: 'page-content onboarding' },
    div({ class: 'page-header' },
      div({ class: 'page-title' }, () => t('onboarding.title'))
    ),
    p({ class: 'onboarding-intro' }, () => t('onboarding.intro')),
    step('onboarding.step.give'),
    step('onboarding.step.find'),
    step('onboarding.step.take'),
    step('onboarding.step.privacy'),
    button({ class: 'btn btn-primary', onclick: () => cone.navigate('map', {}) }, () => t('onboarding.cta'))
  )
}
