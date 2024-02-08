/**
 * The target language. [Browser support is good][1] but "en-US" is a safe default.
 *
 * [1]: https://developer.mozilla.org/en-US/docs/Web/API/NavigatorLanguage/language
 *
 * @type {string}
 */
// const { language = "en-US" } = navigator;
const language = "en-US" 

/**
 * Instance of the relative time format object for the target language. [Browser
 * support for this][2] is less good, though [polyfills][3] are available.
 *
 * [2]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/RelativeTimeFormat
 * [3]: https://github.com/tc39/proposal-intl-relative-time#polyfills
 * @type {Intl.RelativeTimeFormat}
 */
const formatter = new Intl.RelativeTimeFormat(language, {
  numeric: "auto",
  style: "short",
});

/**
 * Mapping from a Intl.RelativeTimeFormat unit string to the equivalent value
 * in milliseconds.
 *
 * @type {{[unit: string]: number}}
 */
const units = {
  year: 31_557_600_000, // Approx. 86,400 seconds per day * 365.25 days.
  month: 2_629_800_000, // Approx. 31,557,600 seconds per year / 12 months.
  day: 86_400_000,
  hour: 3_600_000,
  minute: 60_000,
  second: 1_000,
};



export function formatRelative(when) {
  const ms = when - Date.now();
  for (const [unit, value] of Object.entries(units)) {
    const amount = Math.ceil(ms / value);
    if (amount || unit === 'second') {
      return formatter.format(amount, unit);
    }
  }
}

export function formatDistance(distanceInMeters){
  if (distanceInMeters >= 1000) {
    return Math.round(distanceInMeters / 1000.0) + " km"
  } else if (distanceInMeters >= 100) {
    return Math.round(distanceInMeters) + " m"
  } else {
    return distanceInMeters.toFixed(1) + " m"
  }
};