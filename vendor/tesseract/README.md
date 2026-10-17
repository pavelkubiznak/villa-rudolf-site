# vendor/tesseract — čtení textu z obrazu v prohlížeči

Používá jen čtečka dokladu v `/registrace/` (`registrace/ctecka.js`). Načítá se až po klepnutí
na tlačítko čtečky, běžný host z toho nestáhne nic.

| Soubor | Co to je | Odkud | Licence |
|---|---|---|---|
| `tesseract.min.js` | Tesseract.js 5.1.1, rozhraní | npm `tesseract.js@5.1.1`, `dist/` | Apache-2.0 (`LICENSE-tesseract.js.md`, části `LICENSE-bundled.txt`) |
| `worker.min.js` | Tesseract.js 5.1.1, worker | npm `tesseract.js@5.1.1`, `dist/` | Apache-2.0 |
| `tesseract-core-simd-lstm.wasm.js` | jádro Tesseract (WebAssembly, SIMD, jen LSTM) | npm `tesseract.js-core@5.1.1` | Apache-2.0 (`LICENSE-tesseract.js-core.txt`) |
| `mrz.traineddata` | model natrénovaný na písmo OCR-B strojově čitelné zóny | `DoubangoTelecom/tesseractMRZ`, `tessdata_fast/mrz.traineddata`, commit `0f039b6` | BSD-3-Clause (`LICENSE-mrz.traineddata.txt`) |

Velikost stažení (gzip, jak ji posílá GitHub Pages): 10 + 35 + 1 468 kB kód, model 1 313 kB
(skoro se nekomprimuje) — dohromady asi **2,8 MB**.

SHA-256 (13. 10. 2026):

```
a8e29918d098b2b06e1012bdaeffb4aec0445c5d5654709023e0bd1f442a80e8  tesseract.min.js
aca1229639fc9907d86f96e825955a2b7c5716d17f3bc3acd71f9c7ab66181fc  worker.min.js
ce20eda9533cbed1e6c2b4276fbae1e0adc61b6754b5513084be601787b457cf  tesseract-core-simd-lstm.wasm.js
ece2a54f125a73792f9cec74e6f8e62f6e5e00c7f19153ba865af689be5b5f01  mrz.traineddata
```

**Pozor při aktualizaci:** knihovna má v sobě výchozí adresy na `cdn.jsdelivr.net`. Použije je
jen tehdy, když jí `ctecka.js` nepředá `workerPath`, `corePath` a `langPath` — to hlídá
`tools/test-mrz.mjs`. Na zařízení bez WebAssembly SIMD (starší telefony) se čtečka nenabídne;
jádro bez SIMD tu schválně není (další 4 MB).
