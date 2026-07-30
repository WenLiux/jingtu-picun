const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function fakeElement() {
  return {
    style: {},
    setAttribute() {},
    addEventListener() {},
    appendChild() {},
    remove() {},
  };
}

function fakeImage(attributes = {}, currentSrc = '') {
  return {
    getAttribute(name) {
      return Object.prototype.hasOwnProperty.call(attributes, name) ? attributes[name] : null;
    },
    currentSrc,
    src: attributes.src || currentSrc,
  };
}

const detailImages = [
  fakeImage({ 'data-src': '//img.alicdn.com/detail/first_!!633308262.jpg' }),
  fakeImage({ src: 'https://img.alicdn.com/detail/first_!!633308262.jpg?duplicate=1' }),
  fakeImage({ src: 'https://img.alicdn.com/detail/animated_!!633308262.gif' }),
  fakeImage({ src: 'https://img.alicdn.com/platform/notice_!!6000000002284-2-tps-1125-1446.png' }),
  fakeImage({ src: 'data:image/png;base64,ignored' }),
];

const detailRoot = {
  querySelectorAll(selector) {
    return selector === 'img' ? detailImages : [];
  },
};

const documentStub = {
  readyState: 'loading',
  head: { appendChild() {} },
  body: fakeElement(),
  createElement: fakeElement,
  createTextNode(text) {
    return { text };
  },
  addEventListener() {},
  querySelector(selector) {
    return selector === '#imageTextInfo-content' ? detailRoot : null;
  },
  querySelectorAll() {
    return [];
  },
};

const scriptPath = path.join(__dirname, '..', 'shangtu-picun.user.js');
let source = fs.readFileSync(scriptPath, 'utf8');
assert.match(source, /@name\s+商图批存（京东\/天猫\/淘宝）/);
assert.match(source, /@version\s+1\.5\.3/);
assert.match(source, /@connect\s+img10\.360buyimg\.com/);
assert.match(source, /@connect\s+img14\.360buyimg\.com/);
assert.match(source, /@connect\s+img30\.360buyimg\.com/);
assert.match(source, /@connect\s+img\.alicdn\.com/);
assert.match(source, /@connect\s+gw\.alicdn\.com/);
source = source.replace(
  /\}\)\(\);\s*$/,
  `globalThis.__shangtuTest = {
    PLATFORM,
    PRODUCT_ID,
    normalizeImageUrl,
    inferImageExtension,
    buildImageInfos,
    detectImageExtension,
    filterTmallPlatformAssets,
    fetchTmallImageUrls,
  };
})();`,
);

const context = {
  console: { log() {}, error() {} },
  document: documentStub,
  location: {
    hostname: 'detail.tmall.com',
    pathname: '/item.htm',
    search: '?id=730408164255',
    href: 'https://detail.tmall.com/item.htm?id=730408164255',
    origin: 'https://detail.tmall.com',
  },
  URL,
  URLSearchParams,
  Blob,
  setTimeout,
  clearTimeout,
  GM_xmlhttpRequest() {},
  unsafeWindow: {},
};
context.globalThis = context;
context.window = context;

vm.runInNewContext(source, context, { filename: scriptPath });
const api = context.__shangtuTest;

assert.equal(api.PLATFORM, 'tmall');
assert.equal(api.PRODUCT_ID, '730408164255');
assert.equal(api.normalizeImageUrl('//img.alicdn.com/a.jpg'), 'https://img.alicdn.com/a.jpg');
assert.equal(api.normalizeImageUrl('data:image/png;base64,a'), null);
assert.equal(api.inferImageExtension('https://img.alicdn.com/a.jpg_.webp'), 'webp');
assert.equal(api.inferImageExtension('https://img.alicdn.com/a.jpeg'), 'jpg');
assert.equal(api.inferImageExtension('https://img10.360buyimg.com/img/jfs/a.jpg.dpg'), 'jpg');
assert.deepEqual(
  Array.from(api.filterTmallPlatformAssets([
    'https://img.alicdn.com/a_!!633308262.jpg',
    'https://img.alicdn.com/b_!!633308262.jpg',
    'https://img.alicdn.com/notice_!!6000000002284-2-tps-1125-1446.png',
  ])),
  [
    'https://img.alicdn.com/a_!!633308262.jpg',
    'https://img.alicdn.com/b_!!633308262.jpg',
  ],
);

assert.equal(api.detectImageExtension(Uint8Array.from([0xff, 0xd8, 0xff]).buffer), 'jpg');
assert.equal(
  api.detectImageExtension(Uint8Array.from([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]).buffer),
  'webp',
);
assert.equal(
  api.detectImageExtension(Uint8Array.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]).buffer),
  'gif',
);
assert.equal(
  api.detectImageExtension(Uint8Array.from([0, 0, 0, 0, 0x66, 0x74, 0x79, 0x70, 0x61, 0x76, 0x69, 0x66]).buffer),
  'avif',
);

(async () => {
  const images = await api.fetchTmallImageUrls();
  assert.equal(images.length, 2);
  assert.equal(images[0].name, '730408164255_detail_01.jpg');
  assert.equal(images[1].name, '730408164255_detail_02.gif');
  console.log('userscript tests passed');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
