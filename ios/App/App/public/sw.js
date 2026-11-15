/**
 * Copyright 2018 Google Inc. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *     http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// If the loader is already loaded, just stop.
if (!self.define) {
  let registry = {};

  // Used for `eval` and `importScripts` where we can't get script URL by other means.
  // In both cases, it's safe to use a global var because those functions are synchronous.
  let nextDefineUri;

  const singleRequire = (uri, parentUri) => {
    uri = new URL(uri + ".js", parentUri).href;
    return registry[uri] || (
      
        new Promise(resolve => {
          if ("document" in self) {
            const script = document.createElement("script");
            script.src = uri;
            script.onload = resolve;
            document.head.appendChild(script);
          } else {
            nextDefineUri = uri;
            importScripts(uri);
            resolve();
          }
        })
      
      .then(() => {
        let promise = registry[uri];
        if (!promise) {
          throw new Error(`Module ${uri} didn’t register its module`);
        }
        return promise;
      })
    );
  };

  self.define = (depsNames, factory) => {
    const uri = nextDefineUri || ("document" in self ? document.currentScript.src : "") || location.href;
    if (registry[uri]) {
      // Module is already loading or loaded.
      return;
    }
    let exports = {};
    const require = depUri => singleRequire(depUri, uri);
    const specialDeps = {
      module: { uri },
      exports,
      require
    };
    registry[uri] = Promise.all(depsNames.map(
      depName => specialDeps[depName] || require(depName)
    )).then(deps => {
      factory(...deps);
      return exports;
    });
  };
}
define(['./workbox-afac4cd2'], (function (workbox) { 'use strict';

  self.skipWaiting();
  workbox.clientsClaim();
  /**
   * The precacheAndRoute() method efficiently caches and responds to
   * requests for URLs in the manifest.
   * See https://goo.gl/S9QRab
   */
  workbox.precacheAndRoute([{
    "url": "registerSW.js",
    "revision": "1872c500de691dce40960bb85481de07"
  }, {
    "url": "pwa-maskable-512x512.png",
    "revision": "2d5d1918e4d3e74247f1d1b3e94f8735"
  }, {
    "url": "pwa-512x512.png",
    "revision": "8dfcdafda8daf4a4af0de83c6eca1289"
  }, {
    "url": "pwa-192x192.png",
    "revision": "25f121ed31ebfd9dbf21f6cfa4002ccb"
  }, {
    "url": "index.html",
    "revision": "3aaed05f04529143521486315e286d08"
  }, {
    "url": "icon.svg",
    "revision": "308afaed9cff7dff5b76c30ef81c0b55"
  }, {
    "url": "apple-touch-icon.png",
    "revision": "aa21fc6985382392d78a7bb79b42a87a"
  }, {
    "url": "icons/ios-1024x1024.png",
    "revision": "b10b99085ca927f7943ff82c077a45ac"
  }, {
    "url": "assets/index-Dp7Eqgch.css",
    "revision": null
  }, {
    "url": "assets/index-Cymuen4q.js",
    "revision": null
  }, {
    "url": "apple-touch-icon.png",
    "revision": "aa21fc6985382392d78a7bb79b42a87a"
  }, {
    "url": "icon.svg",
    "revision": "308afaed9cff7dff5b76c30ef81c0b55"
  }, {
    "url": "pwa-192x192.png",
    "revision": "25f121ed31ebfd9dbf21f6cfa4002ccb"
  }, {
    "url": "pwa-512x512.png",
    "revision": "8dfcdafda8daf4a4af0de83c6eca1289"
  }, {
    "url": "pwa-maskable-512x512.png",
    "revision": "2d5d1918e4d3e74247f1d1b3e94f8735"
  }, {
    "url": "manifest.webmanifest",
    "revision": "18cf14e56b8f177c47a20b3ead835797"
  }], {});
  workbox.cleanupOutdatedCaches();
  workbox.registerRoute(new workbox.NavigationRoute(workbox.createHandlerBoundToURL("/index.html"), {
    denylist: [/^\/api\//, /\/downloads\//, /\.ipa$/i]
  }));
  workbox.registerRoute(/^https:\/\/fonts\.googleapis\.com\/.*/i, new workbox.CacheFirst({
    "cacheName": "google-fonts-cache",
    plugins: [new workbox.ExpirationPlugin({
      maxEntries: 10,
      maxAgeSeconds: 31536000
    }), new workbox.CacheableResponsePlugin({
      statuses: [0, 200]
    })]
  }), 'GET');
  workbox.registerRoute(/^https:\/\/fonts\.gstatic\.com\/.*/i, new workbox.CacheFirst({
    "cacheName": "gstatic-fonts-cache",
    plugins: [new workbox.ExpirationPlugin({
      maxEntries: 10,
      maxAgeSeconds: 31536000
    }), new workbox.CacheableResponsePlugin({
      statuses: [0, 200]
    })]
  }), 'GET');

}));
