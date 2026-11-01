# 実機映像の導入手順（公開前に必須）

仕様書v1.0のMEDIA-01〜03、MEDIA-05に沿って、現行のMozkey実機で動画とポスターを撮影してください。

| ファイル | 必須内容 |
|---|---|
| `hero.webm` | 入力→ライブ変換→必要に応じてZenz補正。短尺・無音・16:10推奨 |
| `hero.webp` | hero動画の実機フレームから作成したポスター |
| `learning.webm` | 実機で再現した表記選択→再入力→学習結果の比較 |
| `learning.webp` | 学習動画から作った実機ポスター |
| `customization.webm` | 実際にテーマを切り替える映像 |
| `customization.webp` | 外観の実機ポスター |

1. 個人情報、辞書に含まれる個人語、APIキー等が映らないように収録してください。
2. Zenzの出力・学習の効果を架空の候補UIや合成映像で偽装しないでください。
3. 上記のファイル名で保存し、`src/data/mozkey.ts` の `media.*.available` を `true` に変更してください。
4. その後 `npm run check`, `npm run build`, `node scripts/prepublish-check.mjs` を実行してください。

動画がない間、サイトには「実機デモを準備中」と正直に表示します。仕様書v1.0のP0公開ゲートを満たすには実機素材が必要です。

映像サイズは例として 1200×750 / WebM VP9、ポスターは 1200×750 / WebP。

Safari等での互換性を強める場合は、同じデモの`*.mp4`（H.264）も作成し、`src/data/mozkey.ts`の各メディア設定に`mp4: "/mozkey/media/xxx.mp4"`を追加できます。
