// -----------------------------------------------------------------------------
// Runtime texts shown in Gladys (connection status, button, errors). Errors
// thrown to Gladys are English (one language per message, like the core's);
// the statuses and button answers are { en, fr }. No text ever holds the
// password, the session cookie, the MAC nor an entry typed by the user; the
// certificate fingerprint met is shown (not a secret: the radio shows it to
// anyone), so that the user can compare it with the one of the radio.
// -----------------------------------------------------------------------------

import { CODES } from './airos/errors.js';

const plural = (n, one, many) => (n === 1 ? one : many);
/** French: 0 and 1 take the singular. */
const pluralFr = (n, one, many) => (n <= 1 ? one : many);

/** A delay in words: seconds under a minute, then whole minutes (59.9 s is "1 min"). */
export function delayOf(ms) {
  const seconds = Math.ceil(Math.max(0, ms) / 1000);
  if (seconds < 60) return { en: `${seconds} s`, fr: `${seconds} s` };
  const minutes = Math.round(seconds / 60);
  if (minutes < 120) return { en: `${minutes} min`, fr: `${minutes} min` };
  const hours = Math.round(minutes / 60);
  return { en: `${hours} h`, fr: `${hours} h` };
}

/** Why the radio failed, in a few words. */
export function reasonOf(err) {
  switch (err?.code) {
    case CODES.UNREACHABLE:
      return { en: 'no connection', fr: 'pas de connexion' };
    case CODES.TIMEOUT:
      return { en: 'no answer in time', fr: 'pas de réponse à temps' };
    case CODES.LATE:
      return { en: 'too late to send', fr: 'trop tard pour envoyer' };
    case CODES.HTTP:
      return { en: `HTTP error ${err.status}`, fr: `erreur HTTP ${err.status}` };
    case CODES.BAD_ANSWER:
      return { en: 'unexpected answer', fr: 'réponse inattendue' };
    case CODES.TOO_LARGE:
      return { en: 'answer too large', fr: 'réponse trop grande' };
    case CODES.UNSUPPORTED:
      return { en: 'not airOS 8', fr: 'pas airOS 8' };
    case CODES.CREDENTIALS:
      return { en: 'user name or password refused', fr: 'identifiants refusés' };
    case CODES.ACCESS:
      return { en: 'access refused to the status', fr: 'accès refusé à l’état' };
    case CODES.REDIRECT:
      return { en: 'redirection', fr: 'redirection' };
    case CODES.CERTIFICATE:
    case CODES.CERTIFICATE_TYPED:
      return { en: 'another HTTPS certificate', fr: 'autre certificat HTTPS' };
    case CODES.PIN_UNAVAILABLE:
      return { en: 'certificate cannot be kept', fr: 'certificat impossible à garder' };
    case CODES.TLS:
      return { en: 'TLS refused', fr: 'TLS refusé' };
    default:
      return { en: 'error', fr: 'erreur' };
  }
}

export const join = (...parts) => ({
  en: parts
    .map((p) => p.en)
    .filter(Boolean)
    .join(' '),
  fr: parts
    .map((p) => p.fr)
    .filter(Boolean)
    .join(' '),
});

const retry = (delay) => ({
  en: `Retried in ${delayOf(delay).en}.`,
  fr: `Nouvel essai dans ${delayOf(delay).fr}.`,
});

const SAVE_TO_RETRY = {
  en: 'Nothing is sent to the radio until the configuration changes.',
  fr: 'Plus rien n’est envoyé à la radio tant que la configuration ne change pas.',
};

export const T = {
  status: {
    ok: ({ model, stations }) => ({
      en: `${model ?? 'The radio'} answers: ${stations ?? '?'} ${plural(stations, 'station', 'stations')} connected.`,
      fr: `${model ?? 'La radio'} répond : ${stations ?? '?'} ${pluralFr(stations, 'station connectée', 'stations connectées')}.`,
    }),
    waiting: (delay) => ({
      en: `Started: the radio is read in ${delayOf(delay).en} (never sooner than the refresh interval).`,
      fr: `Démarré : la radio est lue dans ${delayOf(delay).fr} (jamais avant l’intervalle de rafraîchissement).`,
    }),
    hostMissing: {
      en: 'Enter the address of the radio.',
      fr: 'Saisissez l’adresse de la radio.',
    },
    hostInvalid: {
      en: 'The address of the radio is not valid (an IP address or a host name, with an optional port).',
      fr: 'L’adresse de la radio n’est pas valide (une adresse IP ou un nom d’hôte, avec un port facultatif).',
    },
    hostHttp: {
      en: 'Plain HTTP is not supported: airOS 8 serves its interface in HTTPS. Enter the address without http://.',
      fr: 'Le HTTP simple n’est pas pris en charge : airOS 8 sert son interface en HTTPS. Saisissez l’adresse sans http://.',
    },
    usernameInvalid: {
      en: 'The user name is not valid (printable characters, no space).',
      fr: 'Le nom d’utilisateur n’est pas valide (caractères imprimables, sans espace).',
    },
    missingPassword: {
      en: 'Enter the password of the radio.',
      fr: 'Saisissez le mot de passe de la radio.',
    },
    passwordInvalid: {
      en: 'The password holds a line break or a control character (pasted by mistake?): it was not sent.',
      fr: 'Le mot de passe contient un retour à la ligne ou un caractère de contrôle (collé par erreur ?) : il n’a pas été envoyé.',
    },
    fingerprintInvalid: {
      en: 'The certificate fingerprint is not a SHA-256 fingerprint (64 hexadecimal digits, colons allowed).',
      fr: 'L’empreinte du certificat n’est pas une empreinte SHA-256 (64 chiffres hexadécimaux, deux-points permis).',
    },
    credentialsRefused: join(
      {
        en: 'The radio refused the user name or the password.',
        fr: 'La radio a refusé le nom d’utilisateur ou le mot de passe.',
      },
      SAVE_TO_RETRY,
      {
        en: 'The "Test the connection" button tries once more.',
        fr: 'Le bouton « Tester la connexion » essaie une fois de plus.',
      },
    ),
    certificateChanged: (fingerprint) => ({
      en: `The radio presents another HTTPS certificate than the one learned (SHA-256 ${fingerprint}). Nothing was sent. If you replaced or reset the radio, check this fingerprint in its web interface and type it in the "Certificate fingerprint" field.`,
      fr: `La radio présente un autre certificat HTTPS que celui appris (SHA-256 ${fingerprint}). Rien n’a été envoyé. Si vous avez remplacé ou réinitialisé la radio, vérifiez cette empreinte dans son interface web et saisissez-la dans le champ « Empreinte du certificat ».`,
    }),
    certificateTyped: (fingerprint) => ({
      en: `The HTTPS certificate of the radio is not the fingerprint you typed (it presents SHA-256 ${fingerprint}). Nothing was sent.`,
      fr: `Le certificat HTTPS de la radio n’est pas l’empreinte saisie (elle présente SHA-256 ${fingerprint}). Rien n’a été envoyé.`,
    }),
    pinUnavailable: (reason, fingerprint) =>
      reason === 'unreadable'
        ? {
            en: `The storage of the integration (/data) cannot be read: its certificate is not learned again blindly. Nothing was sent. Type the fingerprint of the radio (SHA-256 ${fingerprint}, check it in its web interface) in the "Certificate fingerprint" field.`,
            fr: `Le stockage de l’intégration (/data) est illisible : son certificat n’est pas réappris à l’aveugle. Rien n’a été envoyé. Saisissez l’empreinte de la radio (SHA-256 ${fingerprint}, à vérifier dans son interface web) dans le champ « Empreinte du certificat ».`,
          }
        : {
            en: `The certificate of the radio cannot be kept (/data cannot be written): nothing was sent. Type its fingerprint (SHA-256 ${fingerprint}, check it in its web interface) in the "Certificate fingerprint" field.`,
            fr: `Le certificat de la radio ne peut pas être gardé (/data non inscriptible) : rien n’a été envoyé. Saisissez son empreinte (SHA-256 ${fingerprint}, à vérifier dans son interface web) dans le champ « Empreinte du certificat ».`,
          },
    otherRadio: {
      en: 'Another radio answers at this address (not the one read before): nothing is published nor commanded. Save the configuration to take this radio as the new one.',
      fr: 'Une autre radio répond à cette adresse (pas celle lue avant) : rien n’est publié ni commandé. Enregistrez la configuration pour prendre cette radio comme la nouvelle.',
    },
    paused: (status, delay) => ({
      en: `The radio asked to wait (HTTP ${status}): no request for ${delayOf(delay).en}.`,
      fr: `La radio a demandé d’attendre (HTTP ${status}) : aucune requête pendant ${delayOf(delay).fr}.`,
    }),
    unsupported: (delay) =>
      join(
        {
          en: 'No airOS 8 login page at this address (airOS 6 and older are not supported).',
          fr: 'Pas de page de connexion airOS 8 à cette adresse (airOS 6 et antérieurs ne sont pas pris en charge).',
        },
        retry(delay),
      ),
    tls: (delay) =>
      join(
        {
          en: 'The radio refused the TLS handshake (firmware too old?).',
          fr: 'La radio a refusé la négociation TLS (firmware trop ancien ?).',
        },
        retry(delay),
      ),
    rebooting: (delay) =>
      join(
        {
          en: 'The radio is rebooting (reboot sent from Gladys).',
          fr: 'La radio redémarre (redémarrage envoyé depuis Gladys).',
        },
        retry(delay),
      ),
    failure: (err, delay) =>
      join(
        { en: 'The radio cannot be read:', fr: 'La radio ne peut pas être lue :' },
        { en: `${reasonOf(err).en}.`, fr: `${reasonOf(err).fr}.` },
        retry(delay),
      ),
    configNotRead: (delay) => ({
      en: `Gladys did not give the configuration: asked again in ${delayOf(delay).en}.`,
      fr: `Gladys n’a pas donné la configuration : nouvelle demande dans ${delayOf(delay).fr}.`,
    }),
  },
  test: {
    ok: (status) =>
      join(status, {
        en: 'Connection working.',
        fr: 'Connexion fonctionnelle.',
      }),
  },
  errors: {
    unknownDevice: 'Unknown device or feature',
    readOnly: 'This value is read only: only the reboot button acts',
    badValue: 'The reboot button only takes the value 1',
    rebootDisabled:
      'Rebooting the radio is disabled: turn on "Allow rebooting the radio" in the configuration',
    stillRunning: 'A reboot is already being sent',
    notConnected: 'The radio is not connected',
    otherRadio: 'Another radio answers at this address: nothing sent',
    identityUnknown: 'The identity of the radio (its MAC) is not checked yet: nothing sent',
    paused: (delay) => `The radio asked to wait: nothing sent for ${delayOf(delay).en}`,
    cooldown: (delay) =>
      `A reboot was sent less than 10 min ago: nothing sent, try again in ${delayOf(delay).en}`,
    tooSlow: 'The radio did not answer in time: nothing sent',
    cooldownNotKept: 'The 10 min delay between two reboots cannot be kept in /data: nothing sent',
    unknownState: (reason) => `The radio could not be read just before (${reason}): nothing sent`,
    notSent: (reason) => `Reboot not sent (${reason})`,
    refused: (reason) => `The radio refused the reboot (${reason})`,
    sentUnconfirmed: (reason) =>
      `Reboot sent, without an answer from the radio (${reason}): it may be rebooting`,
    testTooLong: 'The test took too long',
  },
};
