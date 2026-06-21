import van from 'vanjs-core'
import { cone } from '../router.js'
import { t } from '../lib/i18n.js'
import { installAvailable, promptInstall, isIOS, isStandalone, isCapacitorNative, ANDROID_APK_URL } from '../lib/pwaInstall.js'

const { div, p, button, a } = van.tags

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
    // The composite filter is the one non-obvious concept, so it gets its own step.
    step('onboarding.step.filter'),
    step('onboarding.step.agents'),
    step('onboarding.step.take'),
    step('onboarding.step.privacy'),

    // Install section — same PWA prompt + Android APK link as settings, hidden
    // when already running as an installed app.
    (isStandalone() || isCapacitorNative()) ? '' : div({ class: 'onboarding-install' },
      div({ class: 'onboarding-install-title' }, () => t('onboarding.install.title')),
      () => installAvailable.val
        ? button({ class: 'btn btn-primary', style: 'width:100%', onclick: promptInstall }, () => t('settings.install.pwa'))
        : (isIOS()
            ? div({ style: 'font-size:13px;color:var(--muted);line-height:1.5' }, () => t('settings.install.ios_hint'))
            : ''),
      a({
        class: 'btn',
        style: 'width:100%;display:block;text-align:center;margin-top:8px;text-decoration:none;box-sizing:border-box',
        href: ANDROID_APK_URL,
        rel: 'noopener',
      }, () => t('settings.install.android'))
    ),

    button({ class: 'btn btn-primary', style: 'width:100%;margin-top:16px', onclick: () => cone.navigate('map', {}) }, () => t('onboarding.cta'))
  )
}
