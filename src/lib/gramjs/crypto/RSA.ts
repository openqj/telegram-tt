import { concat } from '../../../util/encoding/buffer';

import {
  generateRandomBytes,
  modExp,
  readBigIntFromBuffer,
  readBufferFromBigInt,
  sha1,
} from '../Helpers';

export const SERVER_KEYS = [
  {
    fingerprint: BigInt('-3414540481677951611'),
    n: BigInt(
      '2937959817066933702298617714945612856538843112005886376816255642404751219133084745514657634448776440866'
      + '1701890505066208632169112269581063774293102577308490531282748465986139880977280302242772832972539403531'
      + '3160108704012876427630091361567343395380424193887227773571344877461690935390938502512438971889287359033'
      + '8945177273024525306296338410881284207988753897636046529094613963869149149606209957083647645485599631919'
      + '2747663615955633778034897140982517446405334423701359108810182097749467210509584293428076654573384828809'
      + '574217079944388301239431309115013843331317877374435868468779972014486325557807783825502498215169806323',
    ),
    e: 65537,
  },
  {
    fingerprint: BigInt('-5595554452916591101'),
    n: BigInt(
      '2534288944884041556497168959071347320689884775908477905258202659454602246385394058588521595116849196570'
      + '8222649399180603818074200620463776135424884632162512403163793083921641631564740959529419359595852941166'
      + '8489405859523376133330223960965841179548922160312292373029437018775884567383353986024616752250817918203'
      + '9315375750495263623495132323782003654358104782690612092797248736680529211579223142368426126233039432475'
      + '0785450942589751755390156647751460719351439969059949569615302809050721500330239005077889855323917509948'
      + '255722081644689442127297605422579707142646660768825302832201908302295573257427896031830742328565032949',
    ),
    e: 65537,
  },
].reduce((acc, { fingerprint, ...keyInfo }) => {
  acc.set(fingerprint, keyInfo);
  return acc;
}, new Map<bigint, { n: bigint; e: number }>());

export async function registerServerPublicKey(pem: string) {
  const match = /^\s*-----BEGIN RSA PUBLIC KEY-----\s*([\s\S]+?)\s*-----END RSA PUBLIC KEY-----\s*$/.exec(pem);
  if (!match) throw new Error('Gramsrv server-info did not return an RSA public key');

  const der = Uint8Array.from(atob(match[1].replace(/\s/g, '')), (char) => char.charCodeAt(0));
  const sequence = readDerElement(der, 0, 0x30);
  if (sequence.nextOffset !== der.length) throw new Error('Invalid Gramsrv RSA public key');

  const modulus = readDerElement(sequence.value, 0, 0x02);
  const exponent = readDerElement(sequence.value, modulus.nextOffset, 0x02);
  if (exponent.nextOffset !== sequence.value.length) throw new Error('Invalid Gramsrv RSA public key');

  const modulusBytes = readPositiveInteger(modulus.value);
  const exponentBytes = readPositiveInteger(exponent.value);
  const n = readBigIntFromBuffer(modulusBytes, false);
  const e = readBigIntFromBuffer(exponentBytes, false);
  if (n.toString(2).length !== 2048 || e <= 0n || e > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error('Unsupported Gramsrv RSA public key');
  }

  const fingerprintHash = await sha1(concat(serializeTlBytes(modulusBytes), serializeTlBytes(exponentBytes)));
  const fingerprint = readBigIntFromBuffer(fingerprintHash.slice(-8), true, true);
  SERVER_KEYS.set(fingerprint, { n, e: Number(e) });
  return fingerprint;
}

function readDerElement(data: Uint8Array, offset: number, expectedTag: number) {
  if (offset < 0 || offset + 1 >= data.length || data[offset] !== expectedTag) {
    throw new Error('Invalid Gramsrv RSA public key');
  }

  let cursor = offset + 1;
  const firstLengthByte = data[cursor++];
  let length = firstLengthByte;
  if (firstLengthByte & 0x80) {
    const lengthBytes = firstLengthByte & 0x7F;
    if (lengthBytes === 0 || lengthBytes > 4 || cursor + lengthBytes > data.length) {
      throw new Error('Invalid Gramsrv RSA public key');
    }

    length = 0;
    for (let i = 0; i < lengthBytes; i++) {
      length = (length * 0x100) + data[cursor++];
    }
    if (length < 0x80) throw new Error('Invalid Gramsrv RSA public key');
  }

  const end = cursor + length;
  if (end > data.length) throw new Error('Invalid Gramsrv RSA public key');

  return {
    value: data.subarray(cursor, end),
    nextOffset: end,
  };
}

function readPositiveInteger(value: Uint8Array) {
  if (value.length === 0 || (value[0] & 0x80) !== 0) throw new Error('Invalid Gramsrv RSA public key');
  return value[0] === 0 ? value.subarray(1) : value;
}

function serializeTlBytes(value: Uint8Array) {
  const header = value.length < 254
    ? Uint8Array.of(value.length)
    : Uint8Array.of(254, value.length & 0xFF, (value.length >> 8) & 0xFF, (value.length >> 16) & 0xFF);
  const encoded = concat(header, value);
  const paddingLength = (4 - (encoded.length % 4)) % 4;
  return paddingLength ? concat(encoded, new Uint8Array(paddingLength)) : encoded;
}

/**
 * Encrypts the given data known the fingerprint to be used
 * in the way Telegram requires us to do so (sha1(data) + data + padding)

 * @param fingerprint the fingerprint of the RSA key.
 * @param data the data to be encrypted.
 * @returns the cipher text, or undefined if no key matching this fingerprint is found.
 */
export async function encrypt(fingerprint: bigint, data: Uint8Array): Promise<Uint8Array | undefined> {
  const key = SERVER_KEYS.get(fingerprint);
  if (!key) {
    return undefined;
  }

  // len(sha1.digest) is always 20, so we're left with 255 - 20 - x padding
  const rand = generateRandomBytes(235 - data.length);

  const toEncrypt = concat(await sha1(data), data, rand);

  // rsa module rsa.encrypt adds 11 bits for padding which we don't want
  // rsa module uses rsa.transform.bytes2int(to_encrypt), easier way:
  const payload = readBigIntFromBuffer(toEncrypt, false);
  const encrypted = modExp(payload, BigInt(key.e), key.n);
  // rsa module uses transform.int2bytes(encrypted, keylength), easier:
  return readBufferFromBigInt(encrypted, 256, false);
}
