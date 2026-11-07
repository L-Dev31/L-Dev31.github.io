import { loadScript } from './utils.js';

const CDN = 'https://cdn.jsdelivr.net/npm/intl-tel-input@25.11.2/build/js/';

let lib;
async function loadLib() {
  lib ??= Promise.all([loadScript(CDN + 'intlTelInput.min.js'), import(CDN + 'i18n/fr/index.js')]);
  const [, fr] = await lib;
  return fr.default;
}

export async function attachPhoneInput(input) {
  const i18n = await loadLib();
  input._iti = window.intlTelInput(input, {
    initialCountry: 'fr',
    countryOrder: ['fr'],
    separateDialCode: true,
    i18n,
    loadUtils: () => import(CDN + 'utils.js')
  });
}

export function getPhoneValue(input) {
  const iti = input._iti, fmt = window.intlTelInput?.utils?.numberFormat?.INTERNATIONAL;
  return (iti && fmt != null && iti.getNumber(fmt)) || input.value.trim();
}

export function setPhoneValue(input, value = '') {
  if (input._iti) input._iti.setNumber(value);
  else input.value = value;
}
